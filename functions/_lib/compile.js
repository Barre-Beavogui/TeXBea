// Server-side compilation: forwards the project to the isolated compile service (no-network job containers).
// Only for signed-in accounts, rate limited, and only when COMPILE_URL + COMPILE_SECRET are configured.
import { json, HttpError, rateLimit } from './util.js';
import { getSubscription } from './billing.js';

const MAX_BODY = 30 * 1024 * 1024;
export const compileEnabled = (env) => !!(env.COMPILE_URL && env.COMPILE_SECRET);

export async function compileRemote(env, user, request) {
  if (!compileEnabled(env)) throw new HttpError(404, 'La compilation en ligne n’est pas activée sur ce site.');
  // Server compilation is a paid-plan feature (see PLANS in billing.js); the plan also sets the time limit.
  const plan = await getSubscription(env, user.id);
  if (!plan.serverCompile)
    throw new HttpError(403, 'La compilation sur le serveur est comprise dans les offres Standard et Professionnelle.');
  if (!(await rateLimit(env, `compile:${user.id}`, 40, 60 * 60_000)))
    throw new HttpError(429, 'Trop de compilations en ligne cette heure-ci. Utilise la compilation du navigateur.');
  const text = await request.text();
  if (text.length > MAX_BODY) throw new HttpError(413, 'Projet trop volumineux pour la compilation en ligne.');
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new HttpError(400, 'Requête illisible.');
  }
  // Only the fields the service needs; nothing about the account travels with it.
  const job = {
    main: body.main,
    compiler: body.compiler,
    files: body.files,
    assets: body.assets,
    timeoutSec: plan.compileTimeoutSec,
  };
  let res;
  try {
    res = await fetch(env.COMPILE_URL.replace(/\/+$/, '') + '/compile', {
      method: 'POST',
      headers: { authorization: `Bearer ${env.COMPILE_SECRET}`, 'content-type': 'application/json' },
      body: JSON.stringify(job),
      signal: AbortSignal.timeout(90_000),
    });
  } catch {
    throw new HttpError(503, 'Le serveur de compilation ne répond pas. Réessaie ou compile dans le navigateur.');
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 429) throw new HttpError(429, data.error || 'Serveur de compilation occupé.');
  if (res.status === 400 || res.status === 413) throw new HttpError(res.status, data.error || 'Projet refusé.');
  if (!res.ok) throw new HttpError(502, 'Le serveur de compilation a échoué.');
  if (!data.ok) return json({ ok: false, log: String(data.log || '').slice(-16000) }, 422);
  return json({ ok: true, pdf: data.pdf, log: String(data.log || '').slice(-16000) });
}
