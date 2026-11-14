// Sessions and account creation. Nobody has a password: accounts exist through GitHub, Google or an e-mail code.
import { randomToken, sha256, now, cookie, parseCookies, HttpError } from './util.js';

export const SESSION_COOKIE = 'tb_session';
export const SESSION_DAYS = 30;

export async function createSession(env, userId) {
  const token = randomToken();
  const t = now();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sessions WHERE user_id = ? AND expires_at < ?').bind(userId, t),
    env.DB.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').bind(
      await sha256(token),
      userId,
      t,
      t + SESSION_DAYS * 86400_000,
    ),
  ]);
  return token;
}
export const sessionCookie = (token, secure) => cookie(SESSION_COOKIE, token, { maxAge: SESSION_DAYS * 86400, secure });
export const clearSessionCookie = (secure) => cookie(SESSION_COOKIE, '', { maxAge: 0, secure });

export async function currentUser(env, request) {
  const token = parseCookies(request)[SESSION_COOKIE];
  if (!token || token.length > 100) return null;
  return env.DB.prepare(
    `SELECT u.id, u.email, u.name, u.avatar FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > ?`,
  )
    .bind(await sha256(token), now())
    .first();
}
export async function requireUser(env, request) {
  const user = await currentUser(env, request);
  if (!user) throw new HttpError(401, 'Connexion requise.');
  return user;
}
export async function destroySession(env, request) {
  const token = parseCookies(request)[SESSION_COOKIE];
  if (token)
    await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?')
      .bind(await sha256(token))
      .run();
}

// The identity (provider + subject) wins; otherwise a verified e-mail joins an existing account, else a new one is made.
export async function findOrCreateUser(env, { provider, subject, email, name, avatar }) {
  email = String(email || '')
    .trim()
    .toLowerCase();
  if (!email) throw new HttpError(400, 'Adresse e-mail introuvable.');
  const known = await env.DB.prepare(
    'SELECT u.id FROM identities i JOIN users u ON u.id = i.user_id WHERE i.provider = ? AND i.subject = ?',
  )
    .bind(provider, String(subject))
    .first();
  if (known) return known.id;
  let user = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
  const stmts = [];
  if (!user) {
    user = { id: crypto.randomUUID() };
    stmts.push(
      env.DB.prepare('INSERT INTO users (id, email, name, avatar, created_at) VALUES (?, ?, ?, ?, ?)').bind(
        user.id,
        email,
        name || null,
        avatar || null,
        now(),
      ),
    );
  } else if (name || avatar) {
    stmts.push(
      env.DB.prepare('UPDATE users SET name = COALESCE(name, ?), avatar = COALESCE(avatar, ?) WHERE id = ?').bind(
        name || null,
        avatar || null,
        user.id,
      ),
    );
  }
  stmts.push(
    env.DB.prepare('INSERT OR IGNORE INTO identities (provider, subject, user_id) VALUES (?, ?, ?)').bind(
      provider,
      String(subject),
      user.id,
    ),
  );
  await env.DB.batch(stmts);
  return user.id;
}

export async function deleteAccount(env, userId) {
  await env.DB.batch(
    ['chunks', 'projects', 'sessions', 'identities']
      .map((t) => env.DB.prepare(`DELETE FROM ${t} WHERE user_id = ?`).bind(userId))
      .concat([env.DB.prepare('DELETE FROM users WHERE id = ?').bind(userId)]),
  );
}
