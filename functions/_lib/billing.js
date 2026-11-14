// Monthly Overleaf-style plans, per-plan cloud quotas, Stripe Checkout, Customer Portal and Webhook verification.
// Uses Web Crypto and fetch only so it runs natively on Cloudflare Pages Functions / Workers without extra packages.
import { json, now, safeEqual, HttpError } from './util.js';

const enc = new TextEncoder();

export const PLANS = {
  free: {
    id: 'free',
    name: 'Gratuit',
    priceMonthly: 0,
    currency: 'EUR',
    defaultQuota: 200_000_000, // 200 MB
    serverCompile: false,
    compileTimeoutSec: 30,
    features: [
      '200 Mo de sauvegarde cloud synchronisée',
      'Projets locaux illimités dans le navigateur',
      'Compilation PDF dans le navigateur (WebAssembly)',
      'Assistant IA local Bea & sauvegarde ZIP',
    ],
  },
  standard: {
    id: 'standard',
    name: 'Standard',
    priceMonthly: 9,
    currency: 'EUR',
    defaultQuota: 2_000_000_000, // 2 GB
    serverCompile: true,
    compileTimeoutSec: 120,
    features: [
      '2 Go de sauvegarde cloud synchronisée (10× plus)',
      'Compilation serveur rapide (XeLaTeX, LuaLaTeX, Biber)',
      'Suivi des modifications (Révisions) & Historique étendu',
      'Import bibliographique DOI / arXiv / Crossref illimité',
    ],
  },
  pro: {
    id: 'pro',
    name: 'Professionnel',
    priceMonthly: 19,
    currency: 'EUR',
    defaultQuota: 10_000_000_000, // 10 GB
    serverCompile: true,
    compileTimeoutSec: 240,
    features: [
      '10 Go de sauvegarde cloud synchronisée (50× plus)',
      'Compilation serveur prioritaire longue durée (thèses & livres TikZ)',
      'Toutes les fonctions Standard + collaboration avancée',
      'Support prioritaire TeXBea',
    ],
  },
};

export function planQuota(env, planId = 'free') {
  if (planId === 'pro') return Number(env.QUOTA_PRO_BYTES) || PLANS.pro.defaultQuota;
  if (planId === 'standard') return Number(env.QUOTA_STANDARD_BYTES) || PLANS.standard.defaultQuota;
  return Number(env.QUOTA_BYTES) || PLANS.free.defaultQuota;
}

export function priceIdForPlan(env, planId) {
  if (planId === 'standard') return env.STRIPE_PRICE_STANDARD || '';
  if (planId === 'pro') return env.STRIPE_PRICE_PRO || '';
  return '';
}

export function planFromPriceId(env, priceId) {
  if (!priceId) return null;
  if (env.STRIPE_PRICE_PRO && priceId === env.STRIPE_PRICE_PRO) return 'pro';
  if (env.STRIPE_PRICE_STANDARD && priceId === env.STRIPE_PRICE_STANDARD) return 'standard';
  return null;
}

export function stripeEnabled(env) {
  return Boolean(env.STRIPE_SECRET_KEY && (env.STRIPE_PRICE_STANDARD || env.STRIPE_PRICE_PRO));
}

const ACTIVE_STATUSES = new Set(['active', 'trialing', 'past_due']);
const ready = new WeakSet();

async function ensure(env) {
  if (!env.DB || ready.has(env.DB)) return;
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS subscriptions (
       user_id TEXT PRIMARY KEY,
       plan TEXT NOT NULL DEFAULT 'free',
       status TEXT NOT NULL DEFAULT 'active',
       stripe_customer_id TEXT UNIQUE,
       stripe_subscription_id TEXT UNIQUE,
       price_id TEXT,
       current_period_end INTEGER,
       cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
       updated_at INTEGER NOT NULL)`,
  ).run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS subscriptions_customer ON subscriptions (stripe_customer_id)').run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS subscriptions_sub ON subscriptions (stripe_subscription_id)').run();
  ready.add(env.DB);
}

export async function dropForAccount(env, userId) {
  await ensure(env);
  await env.DB.prepare('DELETE FROM subscriptions WHERE user_id = ?').bind(userId).run();
}

export async function getSubscription(env, userId) {
  let row = null;
  if (userId && env.DB) {
    try {
      await ensure(env);
      row = await env.DB.prepare(
        `SELECT plan, status, stripe_customer_id AS customerId, stripe_subscription_id AS subscriptionId,
                price_id AS priceId, current_period_end AS currentPeriodEnd, cancel_at_period_end AS cancelAtPeriodEnd
         FROM subscriptions WHERE user_id = ?`,
      )
        .bind(userId)
        .first();
    } catch {
      row = null;
    }
  }
  const rawPlan = row?.plan && PLANS[row.plan] ? row.plan : 'free';
  const status = row?.status || 'active';
  const notExpired = !row?.currentPeriodEnd || row.currentPeriodEnd > now();
  const effectivePlan = rawPlan !== 'free' && ACTIVE_STATUSES.has(status) && notExpired ? rawPlan : 'free';
  const info = PLANS[effectivePlan];
  return {
    plan: effectivePlan,
    planName: info.name,
    status,
    quota: planQuota(env, effectivePlan),
    serverCompile: info.serverCompile,
    compileTimeoutSec: info.compileTimeoutSec,
    currentPeriodEnd: row?.currentPeriodEnd || null,
    cancelAtPeriodEnd: Boolean(row?.cancelAtPeriodEnd),
    hasCustomer: Boolean(row?.customerId),
  };
}

export async function userQuota(env, userId) {
  const sub = await getSubscription(env, userId);
  return sub.quota;
}

export async function listPlans(env, user) {
  const plans = Object.values(PLANS).map((p) => ({
    id: p.id,
    name: p.name,
    priceMonthly: p.priceMonthly,
    currency: p.currency,
    quota: planQuota(env, p.id),
    serverCompile: p.serverCompile,
    compileTimeoutSec: p.compileTimeoutSec,
    features: p.features,
    available: p.id === 'free' || Boolean(priceIdForPlan(env, p.id) && env.STRIPE_SECRET_KEY),
  }));
  const subscription = user ? await getSubscription(env, user.id) : null;
  return json({
    enabled: stripeEnabled(env),
    plans,
    subscription,
  });
}

async function stripePost(env, path, params) {
  if (!env.STRIPE_SECRET_KEY) throw new HttpError(503, 'Le paiement Stripe n’est pas configuré.');
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') body.set(k, String(v));
  }
  const res = await fetch('https://api.stripe.com/v1' + path, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new HttpError(502, data?.error?.message || 'Erreur lors de la communication avec Stripe.');
  }
  return data;
}

export async function createCheckout(env, user, url, body) {
  await ensure(env);
  const plan = String(body.plan || '').toLowerCase();
  if (plan !== 'standard' && plan !== 'pro') throw new HttpError(400, 'Offre invalide.');
  const priceId = priceIdForPlan(env, plan);
  if (!priceId || !env.STRIPE_SECRET_KEY) throw new HttpError(503, 'Cette offre n’est pas encore activée sur Stripe.');

  const existing = await env.DB.prepare('SELECT stripe_customer_id AS cid FROM subscriptions WHERE user_id = ?')
    .bind(user.id)
    .first()
    .catch(() => null);

  const params = {
    mode: 'subscription',
    'line_items[0][price]': priceId,
    'line_items[0][quantity]': '1',
    success_url: `${url.origin}/?abonnement=ok`,
    cancel_url: `${url.origin}/?abonnement=annule`,
    client_reference_id: user.id,
    'metadata[user_id]': user.id,
    'metadata[plan]': plan,
    'subscription_data[metadata][user_id]': user.id,
    'subscription_data[metadata][plan]': plan,
    allow_promotion_codes: 'true',
  };
  if (existing?.cid) params.customer = existing.cid;
  else params.customer_email = user.email;

  const session = await stripePost(env, '/checkout/sessions', params);
  if (!session.url) throw new HttpError(502, 'Lien de paiement Stripe introuvable.');
  return json({ url: session.url, id: session.id });
}

export async function createPortal(env, user, url) {
  await ensure(env);
  if (!env.STRIPE_SECRET_KEY) throw new HttpError(503, 'Le portail Stripe n’est pas configuré.');
  const existing = await env.DB.prepare('SELECT stripe_customer_id AS cid FROM subscriptions WHERE user_id = ?')
    .bind(user.id)
    .first()
    .catch(() => null);
  if (!existing?.cid) throw new HttpError(400, 'Aucun abonnement Stripe actif associé à ce compte.');

  const session = await stripePost(env, '/billing_portal/sessions', {
    customer: existing.cid,
    return_url: `${url.origin}/`,
  });
  if (!session.url) throw new HttpError(502, 'Portail client Stripe indisponible.');
  return json({ url: session.url });
}

export async function hmacSha256Hex(secret, message) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(message)));
  return [...sig].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function verifyStripeSignature(rawBody, header, secret, toleranceSec = 300) {
  if (!header || !secret) return false;
  let timestamp = '';
  const signatures = [];
  for (const part of header.split(',')) {
    const [k, v] = part.trim().split('=');
    if (k === 't') timestamp = v;
    if (k === 'v1' && v) signatures.push(v);
  }
  const ts = Number(timestamp);
  if (!Number.isInteger(ts) || !signatures.length) return false;
  if (toleranceSec > 0 && Math.abs(Math.floor(now() / 1000) - ts) > toleranceSec) return false;
  const expected = await hmacSha256Hex(secret, `${ts}.${rawBody}`);
  return signatures.some((sig) => safeEqual(sig, expected));
}

async function resolveUserId(env, { userId, customerId, subscriptionId, email }) {
  if (userId) {
    const u = await env.DB.prepare('SELECT id FROM users WHERE id = ?').bind(userId).first();
    if (u) return u.id;
  }
  if (subscriptionId) {
    const s = await env.DB.prepare('SELECT user_id FROM subscriptions WHERE stripe_subscription_id = ?')
      .bind(subscriptionId)
      .first();
    if (s) return s.user_id;
  }
  if (customerId) {
    const s = await env.DB.prepare('SELECT user_id FROM subscriptions WHERE stripe_customer_id = ?')
      .bind(customerId)
      .first();
    if (s) return s.user_id;
  }
  if (email) {
    const u = await env.DB.prepare('SELECT id FROM users WHERE email = ?')
      .bind(String(email).trim().toLowerCase())
      .first();
    if (u) return u.id;
  }
  return null;
}

async function upsertSubscription(
  env,
  { userId, plan, status, customerId, subscriptionId, priceId, currentPeriodEnd, cancelAtPeriodEnd },
) {
  const cur = await env.DB.prepare('SELECT * FROM subscriptions WHERE user_id = ?').bind(userId).first();
  const nextPlan = plan || cur?.plan || 'free';
  const nextStatus = status || cur?.status || 'active';
  const nextCust = customerId !== undefined ? customerId : (cur?.stripe_customer_id ?? null);
  const nextSub = subscriptionId !== undefined ? subscriptionId : (cur?.stripe_subscription_id ?? null);
  const nextPrice = priceId !== undefined ? priceId : (cur?.price_id ?? null);
  const nextEnd = currentPeriodEnd !== undefined ? currentPeriodEnd : (cur?.current_period_end ?? null);
  const nextCancel = cancelAtPeriodEnd !== undefined ? (cancelAtPeriodEnd ? 1 : 0) : (cur?.cancel_at_period_end ?? 0);

  await env.DB.prepare(
    `INSERT INTO subscriptions (user_id, plan, status, stripe_customer_id, stripe_subscription_id, price_id, current_period_end, cancel_at_period_end, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (user_id) DO UPDATE SET
       plan = excluded.plan,
       status = excluded.status,
       stripe_customer_id = excluded.stripe_customer_id,
       stripe_subscription_id = excluded.stripe_subscription_id,
       price_id = excluded.price_id,
       current_period_end = excluded.current_period_end,
       cancel_at_period_end = excluded.cancel_at_period_end,
       updated_at = excluded.updated_at`,
  )
    .bind(userId, nextPlan, nextStatus, nextCust, nextSub, nextPrice, nextEnd, nextCancel, now())
    .run();
}

export async function handleWebhook(env, request) {
  await ensure(env);
  if (!env.STRIPE_WEBHOOK_SECRET) throw new HttpError(503, 'Webhook Stripe non configuré.');
  const rawBody = await request.text();
  const sig = request.headers.get('stripe-signature') || '';
  if (!(await verifyStripeSignature(rawBody, sig, env.STRIPE_WEBHOOK_SECRET)))
    throw new HttpError(400, 'Signature Stripe invalide.');

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    throw new HttpError(400, 'Payload Stripe invalide.');
  }

  const type = event?.type || '';
  const obj = event?.data?.object || {};

  if (type === 'checkout.session.completed') {
    const plan =
      obj.metadata?.plan && PLANS[obj.metadata.plan]
        ? obj.metadata.plan
        : planFromPriceId(env, obj.price_id) || 'standard';
    const userId = await resolveUserId(env, {
      userId: obj.metadata?.user_id || obj.client_reference_id,
      customerId: obj.customer,
      subscriptionId: obj.subscription,
      email: obj.customer_details?.email || obj.customer_email,
    });
    if (userId) {
      await upsertSubscription(env, {
        userId,
        plan,
        status: 'active',
        customerId: obj.customer || null,
        subscriptionId: obj.subscription || null,
      });
    }
  } else if (type === 'customer.subscription.created' || type === 'customer.subscription.updated') {
    const priceId = obj.items?.data?.[0]?.price?.id || obj.plan?.id || null;
    const mappedPlan =
      planFromPriceId(env, priceId) || (obj.metadata?.plan && PLANS[obj.metadata.plan] ? obj.metadata.plan : null);
    const userId = await resolveUserId(env, {
      userId: obj.metadata?.user_id,
      subscriptionId: obj.id,
      customerId: obj.customer,
    });
    if (userId) {
      const status = String(obj.status || 'active');
      const isCanceled = status === 'canceled' || status === 'unpaid' || status === 'incomplete_expired';
      await upsertSubscription(env, {
        userId,
        plan: isCanceled ? 'free' : mappedPlan || 'standard',
        status,
        customerId: obj.customer || null,
        subscriptionId: obj.id || null,
        priceId,
        currentPeriodEnd: obj.current_period_end ? Number(obj.current_period_end) * 1000 : null,
        cancelAtPeriodEnd: Boolean(obj.cancel_at_period_end),
      });
    }
  } else if (type === 'customer.subscription.deleted') {
    const userId = await resolveUserId(env, {
      userId: obj.metadata?.user_id,
      subscriptionId: obj.id,
      customerId: obj.customer,
    });
    if (userId) {
      await upsertSubscription(env, {
        userId,
        plan: 'free',
        status: 'canceled',
        customerId: obj.customer || undefined,
        subscriptionId: obj.id || undefined,
        cancelAtPeriodEnd: false,
      });
    }
  } else if (type === 'invoice.payment_failed') {
    const userId = await resolveUserId(env, {
      subscriptionId: obj.subscription,
      customerId: obj.customer,
      email: obj.customer_email,
    });
    if (userId) {
      await upsertSubscription(env, {
        userId,
        status: 'past_due',
      });
    }
  }

  return json({ received: true });
}
