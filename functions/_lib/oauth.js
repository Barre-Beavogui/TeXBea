// "Sign in with GitHub / Google": authorization code flow, state cookie (+ PKCE for Google).
// Only the verified e-mail, the display name and the avatar are read; no access token is kept.
import { randomToken, b64url, sha256Bytes, cookie, parseCookies, safeEqual, HttpError } from './util.js';

const STATE_COOKIE = 'tb_oauth';
const UA = { 'user-agent': 'TeXBea', accept: 'application/json' };

export const providerEnabled = (env, p) =>
  !!(env[p.toUpperCase() + '_CLIENT_ID'] && env[p.toUpperCase() + '_CLIENT_SECRET']);

const redirectUri = (url, p) => `${url.origin}/api/auth/${p}/callback`;

export async function startOAuth(env, url, provider) {
  if (!providerEnabled(env, provider)) throw new HttpError(404, 'Connexion indisponible.');
  const state = randomToken(24);
  const verifier = randomToken(48);
  const secure = url.protocol === 'https:';
  let location;
  if (provider === 'github') {
    location =
      'https://github.com/login/oauth/authorize?' +
      new URLSearchParams({
        client_id: env.GITHUB_CLIENT_ID,
        redirect_uri: redirectUri(url, provider),
        scope: 'read:user user:email',
        state,
        allow_signup: 'true',
      });
  } else {
    location =
      'https://accounts.google.com/o/oauth2/v2/auth?' +
      new URLSearchParams({
        client_id: env.GOOGLE_CLIENT_ID,
        redirect_uri: redirectUri(url, provider),
        response_type: 'code',
        scope: 'openid email profile',
        state,
        code_challenge: b64url(await sha256Bytes(verifier)),
        code_challenge_method: 'S256',
        prompt: 'select_account',
      });
  }
  return new Response(null, {
    status: 302,
    headers: {
      location,
      'cache-control': 'no-store',
      'set-cookie': cookie(STATE_COOKIE, `${state}.${verifier}`, { maxAge: 600, secure, path: '/api/auth' }),
    },
  });
}

async function readJson(res, what) {
  if (!res.ok) throw new HttpError(502, `${what} a refusé la demande.`);
  return res.json();
}

// Returns { provider, subject, email, name, avatar } for the person who just authorized.
export async function finishOAuth(env, request, url, provider) {
  if (!providerEnabled(env, provider)) throw new HttpError(404, 'Connexion indisponible.');
  const [state, verifier] = (parseCookies(request)[STATE_COOKIE] || '').split('.');
  const code = url.searchParams.get('code');
  const given = url.searchParams.get('state') || '';
  if (!state || !code || !safeEqual(state, given)) throw new HttpError(400, 'Connexion expirée, réessaie.');
  if (provider === 'github') {
    const token = await readJson(
      await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: { ...UA, 'content-type': 'application/json' },
        body: JSON.stringify({
          client_id: env.GITHUB_CLIENT_ID,
          client_secret: env.GITHUB_CLIENT_SECRET,
          code,
          redirect_uri: redirectUri(url, provider),
        }),
      }),
      'GitHub',
    );
    if (!token.access_token) throw new HttpError(400, 'Connexion refusée par GitHub.');
    const auth = { ...UA, authorization: `Bearer ${token.access_token}` };
    const me = await readJson(await fetch('https://api.github.com/user', { headers: auth }), 'GitHub');
    const emails = await readJson(await fetch('https://api.github.com/user/emails', { headers: auth }), 'GitHub');
    const ok = (Array.isArray(emails) ? emails : []).filter((e) => e.verified);
    const email = (ok.find((e) => e.primary) || ok[0])?.email;
    if (!email) throw new HttpError(400, 'Ton compte GitHub n’a aucune adresse e-mail vérifiée.');
    return { provider, subject: me.id, email, name: me.name || me.login, avatar: me.avatar_url };
  }
  const token = await readJson(
    await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { ...UA, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri(url, provider),
        grant_type: 'authorization_code',
        code_verifier: verifier || '',
      }),
    }),
    'Google',
  );
  if (!token.access_token) throw new HttpError(400, 'Connexion refusée par Google.');
  const me = await readJson(
    await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { ...UA, authorization: `Bearer ${token.access_token}` },
    }),
    'Google',
  );
  if (!me.email || me.email_verified !== true) throw new HttpError(400, 'Ton adresse Google n’est pas vérifiée.');
  return { provider, subject: me.sub, email: me.email, name: me.name, avatar: me.picture };
}
export const clearStateCookie = (secure) => cookie(STATE_COOKIE, '', { maxAge: 0, secure, path: '/api/auth' });
