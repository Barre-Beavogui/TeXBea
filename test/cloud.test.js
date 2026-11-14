import test from 'node:test';
import assert from 'node:assert/strict';
import { handle } from '../functions/_lib/app.js';
import { fakeD1 } from './d1-shim.js';

const ORIGIN = 'https://texbea.test';
function setup(extra = {}) {
  const env = {
    DB: fakeD1(),
    GITHUB_CLIENT_ID: 'gid',
    GITHUB_CLIENT_SECRET: 'gsecret',
    GOOGLE_CLIENT_ID: 'oid',
    GOOGLE_CLIENT_SECRET: 'osecret',
    AUTH_SECRET: 's',
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
// Signs in through the e-mail code with a fake mail sender and returns the user's session.
async function signIn(s, email = 'a@example.com') {
  const sent = [];
  s.env.EMAIL = { send: async (m) => sent.push(m) };
  assert.equal((await s.call('POST', '/api/auth/email/request', { body: { email } })).status, 200);
  const code = sent.at(-1).text.match(/\d{6}/)[0];
  const res = await s.call('POST', '/api/auth/email/verify', { body: { email, code } });
  assert.equal(res.status, 200);
  return sent;
}

test('providers only list what is configured', async () => {
  const s = setup({ GOOGLE_CLIENT_ID: undefined });
  const p = await (await s.call('GET', '/api/auth/providers')).json();
  assert.deepEqual(p, { github: true, google: false, email: false });
});
test('without D1 the api says it is not configured', async () => {
  const res = await handle(new Request(ORIGIN + '/api/auth/me'), {});
  assert.equal(res.status, 503);
});
test('writes need the custom header and a matching origin', async () => {
  const s = setup();
  assert.equal((await s.call('POST', '/api/auth/logout', { noGuard: true })).status, 403);
  assert.equal((await s.call('POST', '/api/auth/logout', { headers: { origin: 'https://evil.test' } })).status, 403);
  assert.equal((await s.call('POST', '/api/auth/logout', { headers: { origin: ORIGIN } })).status, 200);
});
test('email code: sign in, session, logout', async () => {
  const s = setup();
  assert.equal((await (await s.call('GET', '/api/auth/me')).json()).user, null);
  await signIn(s);
  const me = await (await s.call('GET', '/api/auth/me')).json();
  assert.equal(me.user.email, 'a@example.com');
  assert.ok(s.jar.tb_session);
  assert.equal(s.env.DB.raw.prepare('SELECT COUNT(*) c FROM sessions').get().c, 1);
  // The raw token is never stored.
  assert.notEqual(s.env.DB.raw.prepare('SELECT token_hash h FROM sessions').get().h, s.jar.tb_session);
  await s.call('POST', '/api/auth/logout');
  assert.equal((await (await s.call('GET', '/api/auth/me')).json()).user, null);
});
test('email code: wrong code is refused, 5 tries burn it, a code works once', async () => {
  const s = setup();
  const sent = [];
  s.env.EMAIL = { send: async (m) => sent.push(m) };
  await s.call('POST', '/api/auth/email/request', { body: { email: 'b@example.com' } });
  const code = sent[0].text.match(/\d{6}/)[0];
  const wrong = code === '000000' ? '111111' : '000000';
  for (let i = 0; i < 5; i++)
    assert.equal(
      (await s.call('POST', '/api/auth/email/verify', { body: { email: 'b@example.com', code: wrong } })).status,
      400,
    );
  assert.equal(
    (await s.call('POST', '/api/auth/email/verify', { body: { email: 'b@example.com', code } })).status,
    400,
  );
  await s.call('POST', '/api/auth/email/request', { body: { email: 'b@example.com' } });
  const code2 = sent[1].text.match(/\d{6}/)[0];
  assert.equal(
    (await s.call('POST', '/api/auth/email/verify', { body: { email: 'b@example.com', code: code2 } })).status,
    200,
  );
  assert.equal(
    (await s.call('POST', '/api/auth/email/verify', { body: { email: 'b@example.com', code: code2 } })).status,
    400,
  );
});
test('email code: invalid address, unavailable method and rate limit', async () => {
  const s = setup();
  assert.equal((await s.call('POST', '/api/auth/email/request', { body: { email: 'x@example.com' } })).status, 404);
  s.env.EMAIL = { send: async () => {} };
  assert.equal((await s.call('POST', '/api/auth/email/request', { body: { email: 'not-an-email' } })).status, 400);
  for (let i = 0; i < 3; i++)
    assert.equal((await s.call('POST', '/api/auth/email/request', { body: { email: 'r@example.com' } })).status, 200);
  assert.equal((await s.call('POST', '/api/auth/email/request', { body: { email: 'r@example.com' } })).status, 429);
});
test('the same verified e-mail reaches the same account through different methods', async () => {
  const s = setup();
  await signIn(s, 'same@example.com');
  const { findOrCreateUser } = await import('../functions/_lib/auth.js');
  const a = await findOrCreateUser(s.env, { provider: 'github', subject: 42, email: 'Same@Example.com', name: 'Gh' });
  const b = await findOrCreateUser(s.env, { provider: 'google', subject: 'g1', email: 'same@example.com' });
  assert.equal(a, b);
  assert.equal(s.env.DB.raw.prepare('SELECT COUNT(*) c FROM users').get().c, 1);
  assert.equal(s.env.DB.raw.prepare('SELECT COUNT(*) c FROM identities').get().c, 3);
  assert.equal(await findOrCreateUser(s.env, { provider: 'github', subject: 42, email: 'other@example.com' }), a);
});

function fakeGithub(fetchLog) {
  return async (url, init = {}) => {
    fetchLog.push(String(url));
    const u = String(url);
    const j = (v, status = 200) => new Response(JSON.stringify(v), { status });
    if (u.includes('/login/oauth/access_token'))
      return j(JSON.parse(init.body).code === 'good' ? { access_token: 'tok' } : { error: 'bad' });
    if (u === 'https://api.github.com/user')
      return j({ id: 7, login: 'octo', name: 'Octo Cat', avatar_url: 'https://a/b.png' });
    if (u.endsWith('/user/emails'))
      return j([
        { email: 'x@y.z', verified: false, primary: false },
        { email: 'octo@example.com', verified: true, primary: true },
      ]);
    throw Error('unexpected ' + u);
  };
}
test('github flow: state is checked, verified primary e-mail is used', async () => {
  const s = setup();
  const start = await s.call('GET', '/api/auth/github/start');
  assert.equal(start.status, 302);
  const loc = new URL(start.headers.get('location'));
  assert.equal(loc.origin + loc.pathname, 'https://github.com/login/oauth/authorize');
  assert.equal(loc.searchParams.get('redirect_uri'), ORIGIN + '/api/auth/github/callback');
  const state = loc.searchParams.get('state');
  const real = globalThis.fetch;
  const log = [];
  globalThis.fetch = fakeGithub(log);
  try {
    // Wrong state: refused, no session.
    let res = await s.call('GET', '/api/auth/github/callback?code=good&state=nope');
    assert.equal(res.headers.get('location'), '/?connexion=erreur');
    assert.equal(s.env.DB.raw.prepare('SELECT COUNT(*) c FROM sessions').get().c, 0);
    // The failed attempt cleared the state cookie: start again.
    const again = await s.call('GET', '/api/auth/github/start');
    const state2 = new URL(again.headers.get('location')).searchParams.get('state');
    res = await s.call('GET', `/api/auth/github/callback?code=good&state=${state2}`);
    assert.equal(res.headers.get('location'), '/?connexion=ok');
    assert.ok(s.jar.tb_session);
    assert.notEqual(state, state2);
  } finally {
    globalThis.fetch = real;
  }
  const me = await (await s.call('GET', '/api/auth/me')).json();
  assert.equal(me.user.email, 'octo@example.com');
  assert.equal(me.user.name, 'Octo Cat');
});
test('google flow sends a PKCE challenge and refuses unverified addresses', async () => {
  const s = setup();
  const start = await s.call('GET', '/api/auth/google/start');
  const loc = new URL(start.headers.get('location'));
  assert.equal(loc.searchParams.get('code_challenge_method'), 'S256');
  assert.ok(loc.searchParams.get('code_challenge'));
  const state = loc.searchParams.get('state');
  const real = globalThis.fetch;
  let verified = false;
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    if (u.includes('oauth2.googleapis.com/token')) {
      assert.ok(new URLSearchParams(init.body).get('code_verifier'));
      return new Response(JSON.stringify({ access_token: 't' }));
    }
    return new Response(JSON.stringify({ sub: 'g9', email: 'g@example.com', email_verified: verified, name: 'G' }));
  };
  try {
    const res = await s.call('GET', `/api/auth/google/callback?code=c&state=${state}`);
    assert.equal(res.headers.get('location'), '/?connexion=erreur');
    verified = true;
    const start2 = await s.call('GET', '/api/auth/google/start');
    const st = new URL(start2.headers.get('location')).searchParams.get('state');
    const ok = await s.call('GET', `/api/auth/google/callback?code=c&state=${st}`);
    assert.equal(ok.headers.get('location'), '/?connexion=ok');
  } finally {
    globalThis.fetch = real;
  }
});

const bytes = (n, fill = 1) => new Uint8Array(n).fill(fill);
async function upload(s, id, chunks, base, extra = {}) {
  const uploadId = 'up' + Math.random().toString(36).slice(2, 10);
  for (let i = 0; i < chunks.length; i++) {
    const r = await s.call('PUT', `/api/sync/projects/${id}/uploads/${uploadId}/${i}`, { raw: chunks[i] });
    if (r.status !== 200) return r;
  }
  return s.call('POST', `/api/sync/projects/${id}/commit`, {
    body: { uploadId, chunks: chunks.length, base, name: 'Thèse', updatedAt: '2026-01-01T00:00:00.000Z', ...extra },
  });
}
test('sync requires a session', async () => {
  const s = setup();
  assert.equal((await s.call('GET', '/api/sync/index')).status, 401);
});
test('sync: upload, list, download, update, conflict, remove', async () => {
  const s = setup();
  await signIn(s);
  let res = await upload(s, 'p1', [bytes(10, 1), bytes(5, 2)], 0);
  assert.equal(res.status, 200);
  assert.equal((await res.json()).version, 1);
  let idx = await (await s.call('GET', '/api/sync/index')).json();
  assert.equal(idx.projects.length, 1);
  const p = idx.projects[0];
  assert.deepEqual([p.id, p.version, p.name, p.chunks, p.bytes, p.removed], ['p1', 1, 'Thèse', 2, 15, false]);
  const c1 = new Uint8Array(await (await s.call('GET', `/api/sync/projects/p1/uploads/${p.uploadId}/1`)).arrayBuffer());
  assert.deepEqual([...c1], [2, 2, 2, 2, 2]);
  // Creating it again as new loses (someone else made it first).
  res = await upload(s, 'p1', [bytes(3)], 0);
  assert.equal(res.status, 409);
  assert.equal((await res.json()).version, 1);
  // Update from the right base.
  res = await upload(s, 'p1', [bytes(7, 9)], 1, { deleted: true });
  assert.equal((await res.json()).version, 2);
  // A device still on version 1 is refused and nothing of its data stays.
  res = await upload(s, 'p1', [bytes(4)], 1);
  assert.equal(res.status, 409);
  assert.equal((await res.json()).version, 2);
  assert.equal(s.env.DB.raw.prepare('SELECT COUNT(*) c FROM chunks').get().c, 1);
  idx = await (await s.call('GET', '/api/sync/index')).json();
  assert.equal(idx.projects[0].deleted, true);
  assert.equal(idx.usage.bytes, 7);
  // Old copy is gone for download.
  assert.equal((await s.call('GET', `/api/sync/projects/p1/uploads/${p.uploadId}/0`)).status, 404);
  // Remove needs the right base, then leaves a tombstone.
  assert.equal((await s.call('POST', '/api/sync/projects/p1/remove', { body: { base: 1 } })).status, 409);
  res = await s.call('POST', '/api/sync/projects/p1/remove', { body: { base: 2 } });
  assert.equal((await res.json()).version, 3);
  idx = await (await s.call('GET', '/api/sync/index')).json();
  assert.equal(idx.projects[0].removed, true);
  assert.equal(s.env.DB.raw.prepare('SELECT COUNT(*) c FROM chunks').get().c, 0);
  // A project can come back over its tombstone.
  assert.equal((await (await upload(s, 'p1', [bytes(2)], 3)).json()).version, 4);
});
test('sync: incomplete uploads, bad ids, oversize chunks and quota', async () => {
  const s = setup({ QUOTA_BYTES: '100' });
  await signIn(s);
  const put = (id, up, seq, n) => s.call('PUT', `/api/sync/projects/${id}/uploads/${up}/${seq}`, { raw: bytes(n) });
  assert.equal((await put('p1', 'u1', 0, 10)).status, 200);
  const commit = (id, body) => s.call('POST', `/api/sync/projects/${id}/commit`, { body });
  assert.equal((await commit('p1', { uploadId: 'u1', chunks: 2, base: 0 })).status, 400);
  assert.equal((await commit('p1', { uploadId: 'u1', chunks: 1, base: 0 })).status, 200);
  assert.equal((await put('../x', 'u2', 0, 1)).status, 404);
  assert.equal((await put('p%20x', 'u2', 0, 1)).status, 400);
  assert.equal((await put('p1', 'u2', 0, 1_000_001)).status, 413);
  assert.equal((await put('p1', 'u2', 500, 1)).status, 400);
  // Quota: another project cannot exceed it, the same project replacing itself can.
  assert.equal((await put('p2', 'u3', 0, 95)).status, 413);
  assert.equal((await put('p2', 'u3', 0, 90)).status, 200);
  assert.equal((await put('p1', 'u4', 0, 10)).status, 200);
});
test('sync: users never see each other’s projects', async () => {
  const a = setup();
  await signIn(a, 'a@example.com');
  assert.equal((await upload(a, 'p1', [bytes(3)], 0)).status, 200);
  const s2 = setup();
  s2.env.DB = a.env.DB;
  await signIn(s2, 'b@example.com');
  const idx = await (await s2.call('GET', '/api/sync/index')).json();
  assert.equal(idx.projects.length, 0);
  const upId = a.env.DB.raw.prepare('SELECT upload_id u FROM projects').get().u;
  assert.equal((await s2.call('GET', `/api/sync/projects/p1/uploads/${upId}/0`)).status, 404);
  assert.equal((await s2.call('POST', '/api/sync/projects/p1/remove', { body: { base: 1 } })).status, 404);
});
test('deleting the account erases everything', async () => {
  const s = setup();
  await signIn(s);
  await upload(s, 'p1', [bytes(3)], 0);
  assert.equal((await s.call('DELETE', '/api/auth/account')).status, 200);
  for (const t of ['users', 'identities', 'sessions', 'projects', 'chunks'])
    assert.equal(s.env.DB.raw.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c, 0, t);
  assert.equal((await s.call('GET', '/api/sync/index')).status, 401);
});
