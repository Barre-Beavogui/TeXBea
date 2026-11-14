// Request router for /api/* (one Pages Function; the tests call `handle` directly with a fake D1).
import { json, HttpError, HEADERS } from './util.js';
import {
  currentUser,
  requireUser,
  createSession,
  sessionCookie,
  clearSessionCookie,
  destroySession,
  findOrCreateUser,
  deleteAccount,
} from './auth.js';
import { providerEnabled, startOAuth, finishOAuth, clearStateCookie } from './oauth.js';
import { emailEnabled, requestCode, checkCode } from './email.js';
import * as sync from './sync.js';

const clientIp = (request) => request.headers.get('cf-connecting-ip') || 'unknown';

function guardWrite(request, url) {
  // Cross-site forms cannot set a custom header, and a browser always tells the real Origin.
  const origin = request.headers.get('origin');
  if (request.headers.get('x-texbea') !== '1' || (origin && origin !== url.origin))
    throw new HttpError(403, 'Requête refusée.');
}

async function route(request, env, url, parts) {
  const method = request.method;
  const secure = url.protocol === 'https:';
  if (!env.DB) throw new HttpError(503, 'Le cloud TeXBea n’est pas configuré.');
  if (method !== 'GET' && method !== 'HEAD' && !(parts[0] === 'auth' && parts[2] === 'callback'))
    guardWrite(request, url);

  if (parts[0] === 'auth') {
    if (parts[1] === 'providers' && method === 'GET')
      return json({
        github: providerEnabled(env, 'github'),
        google: providerEnabled(env, 'google'),
        email: emailEnabled(env),
      });
    if (parts[1] === 'me' && method === 'GET') {
      const user = await currentUser(env, request);
      return json({ user: user ? { email: user.email, name: user.name, avatar: user.avatar } : null });
    }
    if ((parts[1] === 'github' || parts[1] === 'google') && parts[2] === 'start' && method === 'GET')
      return startOAuth(env, url, parts[1]);
    if ((parts[1] === 'github' || parts[1] === 'google') && parts[2] === 'callback' && method === 'GET') {
      const back = (ok) =>
        new Response(null, {
          status: 302,
          headers: new Headers({ location: `/?connexion=${ok ? 'ok' : 'erreur'}`, 'cache-control': 'no-store' }),
        });
      try {
        if (url.searchParams.get('error')) throw new HttpError(400, 'Connexion annulée.');
        const profile = await finishOAuth(env, request, url, parts[1]);
        const token = await createSession(env, await findOrCreateUser(env, profile));
        const res = back(true);
        res.headers.append('set-cookie', sessionCookie(token, secure));
        res.headers.append('set-cookie', clearStateCookie(secure));
        return res;
      } catch {
        const res = back(false);
        res.headers.append('set-cookie', clearStateCookie(secure));
        return res;
      }
    }
    if (parts[1] === 'email' && parts[2] === 'request' && method === 'POST') {
      await requestCode(env, (await readBody(request)).email, clientIp(request));
      return json({ ok: true });
    }
    if (parts[1] === 'email' && parts[2] === 'verify' && method === 'POST') {
      const body = await readBody(request);
      const email = await checkCode(env, body.email, body.code, clientIp(request));
      const token = await createSession(env, await findOrCreateUser(env, { provider: 'email', subject: email, email }));
      return json({ ok: true }, 200, { 'set-cookie': sessionCookie(token, secure) });
    }
    if (parts[1] === 'logout' && method === 'POST') {
      await destroySession(env, request);
      return json({ ok: true }, 200, { 'set-cookie': clearSessionCookie(secure) });
    }
    if (parts[1] === 'account' && method === 'DELETE') {
      const user = await requireUser(env, request);
      await deleteAccount(env, user.id);
      return json({ ok: true }, 200, { 'set-cookie': clearSessionCookie(secure) });
    }
  }

  if (parts[0] === 'sync') {
    const user = await requireUser(env, request);
    if (parts[1] === 'index' && method === 'GET') return sync.index(env, user);
    if (parts[1] === 'projects' && parts[2]) {
      const id = parts[2];
      if (parts[3] === 'uploads' && parts[4] && parts[5]) {
        if (method === 'PUT') return sync.putChunk(env, user, request, id, parts[4], parts[5]);
        if (method === 'GET') return sync.getChunk(env, user, id, parts[4], parts[5]);
      }
      if (parts[3] === 'commit' && method === 'POST') return sync.commit(env, user, id, await readBody(request));
      if (parts[3] === 'remove' && method === 'POST') return sync.remove(env, user, id, await readBody(request));
    }
  }
  throw new HttpError(404, 'Introuvable.');
}

async function readBody(request) {
  try {
    const text = await request.text();
    if (text.length > 10_000) throw 0;
    const v = JSON.parse(text || '{}');
    return v && typeof v === 'object' ? v : {};
  } catch {
    throw new HttpError(400, 'Requête invalide.');
  }
}

export async function handle(request, env) {
  const url = new URL(request.url);
  const parts = url.pathname
    .replace(/^\/api\/?/, '')
    .split('/')
    .filter(Boolean)
    .map(decodeURIComponent);
  try {
    return await route(request, env, url, parts);
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message, ...e.extra }, e.status);
    console.error('api error', e?.message);
    return new Response(JSON.stringify({ error: 'Erreur du serveur.' }), {
      status: 500,
      headers: { ...HEADERS, 'content-type': 'application/json; charset=utf-8' },
    });
  }
}
