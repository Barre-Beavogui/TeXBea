// Small helpers shared by the cloud functions (Web APIs only: they run on Cloudflare Workers).
const enc = new TextEncoder();

export const b64url = (bytes) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
export const randomToken = (n = 32) => b64url(crypto.getRandomValues(new Uint8Array(n)));
export async function sha256Bytes(text) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(text)));
}
export async function sha256(text) {
  return [...(await sha256Bytes(text))].map((b) => b.toString(16).padStart(2, '0')).join('');
}
export function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
// BLOB columns come back as ArrayBuffer, or as an array of numbers on older runtimes.
export function toBytes(v) {
  if (v instanceof Uint8Array) return v;
  if (v instanceof ArrayBuffer) return new Uint8Array(v);
  if (ArrayBuffer.isView(v)) return new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
  return Uint8Array.from(v || []);
}
export const HEADERS = {
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
};
export const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...HEADERS, 'content-type': 'application/json; charset=utf-8', ...headers },
  });
export class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}
export function parseCookies(request) {
  const out = {};
  for (const part of (request.headers.get('cookie') || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}
export function cookie(name, value, { maxAge, secure, path = '/' }) {
  return `${name}=${value}; Path=${path}; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
}
export const now = () => Date.now();
// Fixed-window counter in D1. Returns false once `limit` hits are reached in the window.
export async function rateLimit(env, key, limit, windowMs) {
  const t = now();
  const row = await env.DB.prepare('SELECT count, reset_at FROM rate WHERE key = ?').bind(key).first();
  if (!row || row.reset_at <= t) {
    await env.DB.prepare('INSERT OR REPLACE INTO rate (key, count, reset_at) VALUES (?, 1, ?)')
      .bind(key, t + windowMs)
      .run();
    return true;
  }
  if (row.count >= limit) return false;
  await env.DB.prepare('UPDATE rate SET count = count + 1 WHERE key = ?').bind(key).run();
  return true;
}
