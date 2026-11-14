import test from 'node:test';
import assert from 'node:assert/strict';
import { handle } from '../functions/_lib/app.js';
import { hmacSha256Hex } from '../functions/_lib/billing.js';
import { fakeD1 } from './d1-shim.js';

const ORIGIN = 'https://texbea.test';

function setup(extra = {}) {
  const env = {
    DB: fakeD1(),
    AUTH_SECRET: 'secret-test',
    STRIPE_SECRET_KEY: 'sk_test_123',
    STRIPE_WEBHOOK_SECRET: 'whsec_test_123',
    STRIPE_PRICE_STANDARD: 'price_std_monthly',
    STRIPE_PRICE_PRO: 'price_pro_monthly',
    QUOTA_BYTES: '100',
    QUOTA_STANDARD_BYTES: '500',
    QUOTA_PRO_BYTES: '2000',
    ...extra,
  };
  const jar = {};
  const call = async (method, path, { body, raw, headers = {}, noGuard } = {}) => {
    const h = { ...headers };
    if (method !== 'GET' && !noGuard) h['x-texbea'] = '1';
    const cookie = Object.entries(jar)
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
    if (cookie) h.cookie = cookie;
    let payload = raw;
    if (body !== undefined) {
      payload = JSON.stringify(body);
      h['content-type'] = 'application/json';
    }
    const res = await handle(
      new Request(ORIGIN + path, { method, headers: h, body: payload, redirect: 'manual' }),
      env,
    );
    for (const c of res.headers.getSetCookie?.() || []) {
      const [pair] = c.split(';');
      const i = pair.indexOf('=');
      if (/Max-Age=0/.test(c)) delete jar[pair.slice(0, i)];
      else jar[pair.slice(0, i)] = pair.slice(i + 1);
    }
    return res;
  };
  return { env, call, jar };
}

async function signIn(s, email = 'user@texbea.com') {
  const sent = [];
  s.env.EMAIL = { send: async (m) => sent.push(m) };
  await s.call('POST', '/api/auth/email/request', { body: { email } });
  const code = sent.at(-1).text.match(/\d{6}/)[0];
  await s.call('POST', '/api/auth/email/verify', { body: { email, code } });
  return s.env.DB.raw.prepare('SELECT id FROM users WHERE email = ?').get(email).id;
}

async function sendWebhook(
  s,
  eventObj,
  { secret = s.env.STRIPE_WEBHOOK_SECRET, ts = Math.floor(Date.now() / 1000) } = {},
) {
  const raw = JSON.stringify(eventObj);
  const sig = await hmacSha256Hex(secret, `${ts}.${raw}`);
  return s.call('POST', '/api/billing/webhook', {
    raw,
    noGuard: true,
    headers: {
      'content-type': 'application/json',
      'stripe-signature': `t=${ts},v1=${sig}`,
    },
  });
}

test('billing plans endpoint lists monthly Overleaf-like plans and current user subscription', async () => {
  const s = setup();
  let res = await (await s.call('GET', '/api/billing/plans')).json();
  assert.equal(res.enabled, true);
  assert.equal(res.plans.length, 3);
  assert.deepEqual(
    res.plans.map((p) => [p.id, p.priceMonthly, p.quota]),
    [
      ['free', 0, 100],
      ['standard', 9, 500],
      ['pro', 19, 2000],
    ],
  );
  assert.equal(res.subscription, null);

  await signIn(s);
  res = await (await s.call('GET', '/api/billing/plans')).json();
  assert.equal(res.subscription.plan, 'free');
  assert.equal(res.subscription.quota, 100);
});

test('checkout session creation, webhook signature verification, plan upgrade and quota increase', async () => {
  const s = setup();
  // Unauthenticated checkout is rejected.
  assert.equal((await s.call('POST', '/api/billing/checkout', { body: { plan: 'standard' } })).status, 401);

  const userId = await signIn(s, 'marie@curie.fr');
  assert.equal((await s.call('POST', '/api/billing/checkout', { body: { plan: 'unknown' } })).status, 400);

  // Mock Stripe API for checkout and billing portal.
  const realFetch = globalThis.fetch;
  const stripeCalls = [];
  globalThis.fetch = async (url, init = {}) => {
    stripeCalls.push({ url: String(url), body: init.body });
    if (String(url).endsWith('/v1/checkout/sessions')) {
      return new Response(JSON.stringify({ id: 'cs_test_1', url: 'https://checkout.stripe.com/pay/cs_test_1' }));
    }
    if (String(url).endsWith('/v1/billing_portal/sessions')) {
      return new Response(JSON.stringify({ url: 'https://billing.stripe.com/p/session_1' }));
    }
    throw new Error('Unexpected fetch: ' + url);
  };

  try {
    const chk = await s.call('POST', '/api/billing/checkout', { body: { plan: 'standard' } });
    assert.equal(chk.status, 200);
    const chkData = await chk.json();
    assert.equal(chkData.url, 'https://checkout.stripe.com/pay/cs_test_1');
    const params = new URLSearchParams(stripeCalls[0].body);
    assert.equal(params.get('mode'), 'subscription');
    assert.equal(params.get('line_items[0][price]'), 'price_std_monthly');
    assert.equal(params.get('client_reference_id'), userId);
    assert.equal(params.get('customer_email'), 'marie@curie.fr');

    // Before webhook: user is on free plan (quota = 100 bytes), so 150 bytes upload is refused (413).
    const chunk150 = new Uint8Array(150).fill(7);
    assert.equal((await s.call('PUT', '/api/sync/projects/p1/uploads/u1/0', { raw: chunk150 })).status, 413);

    // Webhook with bad signature or old timestamp is refused.
    const badSig = await sendWebhook(s, { type: 'checkout.session.completed' }, { secret: 'wrong_secret' });
    assert.equal(badSig.status, 400);
    const expiredSig = await sendWebhook(
      s,
      { type: 'checkout.session.completed' },
      { ts: Math.floor(Date.now() / 1000) - 999 },
    );
    assert.equal(expiredSig.status, 400);

    // Valid checkout.session.completed upgrades user to Standard (quota = 500 bytes).
    const okHook = await sendWebhook(s, {
      type: 'checkout.session.completed',
      data: {
        object: {
          client_reference_id: userId,
          customer: 'cus_marie_1',
          subscription: 'sub_marie_1',
          metadata: { user_id: userId, plan: 'standard' },
        },
      },
    });
    assert.equal(okHook.status, 200);

    // Now the 150-byte upload succeeds!
    assert.equal((await s.call('PUT', '/api/sync/projects/p1/uploads/u1/0', { raw: chunk150 })).status, 200);
    const idx = await (await s.call('GET', '/api/sync/index')).json();
    assert.equal(idx.usage.plan, 'standard');
    assert.equal(idx.usage.quota, 500);

    // Upgrade to Pro via customer.subscription.updated (quota = 2000 bytes).
    const futureSec = Math.floor(Date.now() / 1000) + 30 * 86400;
    await sendWebhook(s, {
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_marie_1',
          customer: 'cus_marie_1',
          status: 'active',
          current_period_end: futureSec,
          cancel_at_period_end: false,
          items: { data: [{ price: { id: 'price_pro_monthly' } }] },
        },
      },
    });
    const idxPro = await (await s.call('GET', '/api/sync/index')).json();
    assert.equal(idxPro.usage.plan, 'pro');
    assert.equal(idxPro.usage.quota, 2000);

    // Customer portal works now that cus_marie_1 is linked.
    const portal = await s.call('POST', '/api/billing/portal', { body: {} });
    assert.equal(portal.status, 200);
    assert.equal((await portal.json()).url, 'https://billing.stripe.com/p/session_1');

    // Subscription deletion downgrades back to Free (quota = 100 bytes).
    await sendWebhook(s, {
      type: 'customer.subscription.deleted',
      data: {
        object: {
          id: 'sub_marie_1',
          customer: 'cus_marie_1',
          status: 'canceled',
        },
      },
    });
    const idxAfter = await (await s.call('GET', '/api/sync/index')).json();
    assert.equal(idxAfter.usage.plan, 'free');
    assert.equal(idxAfter.usage.quota, 100);
  } finally {
    globalThis.fetch = realFetch;
  }
});
