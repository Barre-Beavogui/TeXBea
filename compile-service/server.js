// Small HTTP front for the compiler: POST /compile (Bearer COMPILE_SECRET) → { ok, pdf (base64), log }.
// It only ever talks to the TeXBea Pages Function; the jobs themselves run with no network (see runner.js).
import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { compile, JobError, LIMITS } from './runner.js';

const PORT = Number(process.env.PORT) || 8787;
const SECRET = process.env.COMPILE_SECRET || '';
const MAX_CONCURRENT = Number(process.env.MAX_CONCURRENT) || 2;
const MAX_BODY = 45 * 1024 * 1024;
let running = 0;

const send = (res, status, data) => {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(data));
};
const authorized = (req) => {
  const got = Buffer.from((req.headers.authorization || '').replace(/^Bearer /, ''));
  const want = Buffer.from(SECRET);
  return SECRET.length >= 24 && got.length === want.length && timingSafeEqual(got, want);
};
function readBody(req) {
  return new Promise((resolve, reject) => {
    const parts = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new JobError(413, 'Requête trop volumineuse.'));
        req.destroy();
      } else parts.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(parts).toString('utf8')));
    req.on('error', reject);
  });
}

export const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/health') return send(res, 200, { ok: true, running });
    if (req.method !== 'POST' || req.url !== '/compile') return send(res, 404, { error: 'Introuvable.' });
    if (!authorized(req)) return send(res, 401, { error: 'Non autorisé.' });
    if (running >= MAX_CONCURRENT) return send(res, 429, { error: 'Le serveur de compilation est occupé, réessaie.' });
    running++;
    try {
      let body;
      try {
        body = JSON.parse(await readBody(req));
      } catch (e) {
        if (e instanceof JobError) throw e;
        throw new JobError(400, 'Requête illisible.');
      }
      send(res, 200, await compile(body));
    } finally {
      running--;
    }
  } catch (e) {
    if (e instanceof JobError) return send(res, e.status, { error: e.message });
    console.error(e);
    send(res, 500, { error: 'Erreur interne.' });
  }
});

if (import.meta.url === `file://${process.argv[1]}`) {
  if (SECRET.length < 24) {
    console.error('COMPILE_SECRET manquant (24 caractères minimum).');
    process.exit(1);
  }
  server.listen(PORT, () => console.log(`TeXBea compile service on :${PORT} (limits: ${JSON.stringify(LIMITS)})`));
}
