// Sharing a cloud project with another account, by e-mail. Read-only: the recipient reads, compiles and can copy it.
// The owner's project stays the single source of truth; the recipient downloads its current chunks.
import { json, toBytes, now, rateLimit, HttpError } from './util.js';
import { sendEmail, emailEnabled } from './email.js';

const ID = /^[A-Za-z0-9_-]{1,64}$/;
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
const MAX_PER_PROJECT = 20;
const ready = new WeakSet();

async function ensure(env) {
  if (ready.has(env.DB)) return;
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS shares (
       owner_id TEXT NOT NULL, project_id TEXT NOT NULL, to_email TEXT NOT NULL, created_at INTEGER NOT NULL,
       PRIMARY KEY (owner_id, project_id, to_email))`,
  ).run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS shares_to ON shares (to_email)').run();
  ready.add(env.DB);
}
const checkId = (v) => {
  if (!ID.test(v || '')) throw new HttpError(400, 'Identifiant invalide.');
  return v;
};
const clean = (raw) =>
  String(raw || '')
    .trim()
    .toLowerCase();

async function ownedProject(env, user, id) {
  const p = await env.DB.prepare(
    'SELECT name FROM projects WHERE user_id = ? AND id = ? AND removed = 0 AND upload_id IS NOT NULL',
  )
    .bind(user.id, checkId(id))
    .first();
  if (!p) throw new HttpError(404, 'Ce projet n’est pas encore dans ta copie en ligne : synchronise-le d’abord.');
  return p;
}

export async function list(env, user, projectId) {
  await ensure(env);
  await ownedProject(env, user, projectId);
  const { results } = await env.DB.prepare(
    'SELECT to_email AS email, created_at AS createdAt FROM shares WHERE owner_id = ? AND project_id = ? ORDER BY created_at',
  )
    .bind(user.id, projectId)
    .all();
  return json({ shares: results });
}

export async function add(env, user, projectId, body) {
  await ensure(env);
  const project = await ownedProject(env, user, projectId);
  const email = clean(body.email);
  if (email.length > 254 || !EMAIL.test(email)) throw new HttpError(400, 'Adresse e-mail invalide.');
  if (email === clean(user.email)) throw new HttpError(400, 'Ce projet est déjà à toi.');
  if (!(await rateLimit(env, `share:${user.id}`, 30, 60 * 60_000)))
    throw new HttpError(429, 'Trop de partages d’affilée. Réessaie dans un moment.');
  const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM shares WHERE owner_id = ? AND project_id = ?')
    .bind(user.id, projectId)
    .first();
  if (count.n >= MAX_PER_PROJECT) throw new HttpError(400, `${MAX_PER_PROJECT} personnes au maximum par projet.`);
  const res = await env.DB.prepare(
    'INSERT OR IGNORE INTO shares (owner_id, project_id, to_email, created_at) VALUES (?, ?, ?, ?)',
  )
    .bind(user.id, projectId, email, now())
    .run();
  // A courtesy message, only the first time; the share itself works even when nothing can be sent.
  let notified = false;
  if ((res?.meta?.changes ?? 0) && emailEnabled(env)) {
    try {
      await sendEmail(env, {
        to: email,
        subject: `${user.name || user.email} a partagé « ${project.name} » avec toi sur TeXBea`,
        text: `${user.name || user.email} (${user.email}) a partagé le projet « ${project.name} » avec toi.\n\nConnecte-toi sur https://texbea.com avec cette adresse e-mail : le projet apparaît dans « Partagé avec vous ».\n\nSi tu ne connais pas cette personne, ignore ce message.`,
      });
      notified = true;
    } catch {
      /* the share stays */
    }
  }
  return json({ ok: true, email, notified });
}

export async function remove(env, user, projectId, body) {
  await ensure(env);
  await env.DB.prepare('DELETE FROM shares WHERE owner_id = ? AND project_id = ? AND to_email = ?')
    .bind(user.id, checkId(projectId), clean(body.email))
    .run();
  return json({ ok: true });
}

// What others shared with me (matched on my verified e-mail address).
export async function received(env, user) {
  await ensure(env);
  const { results } = await env.DB.prepare(
    `SELECT s.owner_id AS ownerId, p.id, p.name, p.updated_at AS updatedAt, p.version, p.upload_id AS uploadId, p.chunks,
            u.name AS ownerName, u.email AS ownerEmail
     FROM shares s
     JOIN projects p ON p.user_id = s.owner_id AND p.id = s.project_id
     JOIN users u ON u.id = s.owner_id
     WHERE s.to_email = ? AND p.removed = 0 AND p.deleted = 0 AND p.upload_id IS NOT NULL
     ORDER BY p.updated_at DESC`,
  )
    .bind(clean(user.email))
    .all();
  return json({ projects: results });
}

export async function receivedChunk(env, user, ownerId, projectId, uploadId, seqText) {
  await ensure(env);
  checkId(ownerId);
  checkId(projectId);
  checkId(uploadId);
  const row = await env.DB.prepare(
    `SELECT c.data FROM shares s
     JOIN projects p ON p.user_id = s.owner_id AND p.id = s.project_id AND p.removed = 0 AND p.deleted = 0
     JOIN chunks c ON c.user_id = p.user_id AND c.project_id = p.id AND c.upload_id = p.upload_id
     WHERE s.to_email = ? AND s.owner_id = ? AND s.project_id = ? AND p.upload_id = ? AND c.seq = ?`,
  )
    .bind(clean(user.email), ownerId, projectId, uploadId, Number(seqText))
    .first();
  if (!row) throw new HttpError(404, 'Données introuvables (le projet a changé, réessaie).');
  return new Response(toBytes(row.data), {
    headers: {
      'content-type': 'application/octet-stream',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}

export async function dropForAccount(env, userId, email) {
  await ensure(env);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM shares WHERE owner_id = ?').bind(userId),
    env.DB.prepare('DELETE FROM shares WHERE to_email = ?').bind(clean(email)),
  ]);
}
