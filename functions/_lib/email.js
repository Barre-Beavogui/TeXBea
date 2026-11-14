// Sign-in code by e-mail: the fallback for people with neither GitHub nor Google.
// Sending needs a provider: Resend (RESEND_API_KEY) or Cloudflare Email Sending (an `EMAIL` binding).
// Without either, the method is simply not offered.
import { sha256, safeEqual, now, rateLimit, HttpError } from './util.js';

const CODE_TTL = 10 * 60_000;
const MAX_ATTEMPTS = 5;
export const emailEnabled = (env) => !!(env.RESEND_API_KEY || env.EMAIL?.send);
const from = (env) => env.MAIL_FROM || 'TeXBea <connexion@texbea.com>';
const hash = (env, email, code) => sha256(`${env.AUTH_SECRET || ''}:${email}:${code}`);

export async function sendEmail(env, { to, subject, text }) {
  if (env.RESEND_API_KEY) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: from(env), to: [to], subject, text }),
    });
    if (!res.ok) throw new Error('send failed ' + res.status);
  } else if (env.EMAIL?.send) {
    await env.EMAIL.send({ to, from: from(env), subject, text });
  } else throw new Error('no mail provider');
}

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

export async function requestCode(env, rawEmail, ip) {
  if (!emailEnabled(env)) throw new HttpError(404, 'Connexion par e-mail indisponible.');
  const email = String(rawEmail || '')
    .trim()
    .toLowerCase();
  if (email.length > 254 || !EMAIL.test(email)) throw new HttpError(400, 'Adresse e-mail invalide.');
  if (
    !(await rateLimit(env, `mail:${email}`, 3, 15 * 60_000)) ||
    !(await rateLimit(env, `mailip:${ip}`, 10, 60 * 60_000))
  )
    throw new HttpError(429, 'Trop de demandes. Réessaie dans un moment.');
  // Six digits from the secure generator, without modulo bias worth caring about for a 10-minute, 5-try code.
  const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, '0');
  await env.DB.prepare(
    'INSERT OR REPLACE INTO email_codes (email, code_hash, expires_at, attempts) VALUES (?, ?, ?, 0)',
  )
    .bind(email, await hash(env, email, code), now() + CODE_TTL)
    .run();
  try {
    await sendEmail(env, {
      to: email,
      subject: `Ton code TeXBea : ${code}`,
      text: `Ton code de connexion TeXBea : ${code}\n\nIl est valable 10 minutes. Si tu n’as rien demandé, ignore ce message.`,
    });
  } catch {
    throw new HttpError(502, 'Envoi du code impossible pour le moment.');
  }
  return email;
}

// Returns the verified e-mail, or throws.
export async function checkCode(env, rawEmail, rawCode, ip) {
  const email = String(rawEmail || '')
    .trim()
    .toLowerCase();
  const code = String(rawCode || '').replace(/\s/g, '');
  if (!(await rateLimit(env, `verifyip:${ip}`, 30, 60 * 60_000)))
    throw new HttpError(429, 'Trop d’essais. Réessaie dans un moment.');
  const row = await env.DB.prepare('SELECT code_hash, expires_at, attempts FROM email_codes WHERE email = ?')
    .bind(email)
    .first();
  const bad = new HttpError(400, 'Code incorrect ou expiré.');
  if (!row || row.expires_at < now() || row.attempts >= MAX_ATTEMPTS) throw bad;
  if (!/^\d{6}$/.test(code) || !safeEqual(row.code_hash, await hash(env, email, code))) {
    await env.DB.prepare('UPDATE email_codes SET attempts = attempts + 1 WHERE email = ?').bind(email).run();
    throw bad;
  }
  await env.DB.prepare('DELETE FROM email_codes WHERE email = ?').bind(email).run();
  return email;
}
