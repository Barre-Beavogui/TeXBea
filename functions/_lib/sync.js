// Per-user project storage. A project is an opaque gzip blob cut in chunks (a D1 row is limited to 2 MB).
// Writing = upload chunks under a fresh upload id, then commit; the commit only succeeds when the client's
// base version is still the current one, so two devices can never silently overwrite each other.
import { json, toBytes, now, HttpError } from './util.js';

export const CHUNK_MAX = 1_000_000;
export const CHUNKS_MAX = 120;
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const quota = (env) => Number(env.QUOTA_BYTES) || 200_000_000;

const checkId = (v) => {
  if (!ID.test(v || '')) throw new HttpError(400, 'Identifiant invalide.');
  return v;
};
const changes = (r) => r?.meta?.changes ?? 0;

export async function index(env, user) {
  const { results } = await env.DB.prepare(
    'SELECT id, version, upload_id AS uploadId, name, updated_at AS updatedAt, deleted, removed, bytes, chunks FROM projects WHERE user_id = ?',
  )
    .bind(user.id)
    .all();
  const used = await env.DB.prepare('SELECT COALESCE(SUM(LENGTH(data)), 0) AS n FROM chunks WHERE user_id = ?')
    .bind(user.id)
    .first();
  return json({
    projects: results.map((p) => ({ ...p, deleted: !!p.deleted, removed: !!p.removed })),
    usage: { bytes: used?.n || 0, quota: quota(env) },
  });
}

export async function putChunk(env, user, request, projectId, uploadId, seqText) {
  checkId(projectId);
  checkId(uploadId);
  const seq = Number(seqText);
  if (!Number.isInteger(seq) || seq < 0 || seq >= CHUNKS_MAX) throw new HttpError(400, 'Morceau invalide.');
  const body = new Uint8Array(await request.arrayBuffer());
  if (!body.length || body.length > CHUNK_MAX) throw new HttpError(413, 'Morceau trop gros.');
  // The current copy of this very project is about to be replaced, so it does not count against the quota.
  const used = await env.DB.prepare(
    `SELECT COALESCE(SUM(LENGTH(data)), 0) AS n FROM chunks
     WHERE user_id = ? AND NOT (project_id = ? AND upload_id = COALESCE((SELECT upload_id FROM projects WHERE user_id = ? AND id = ?), ''))`,
  )
    .bind(user.id, projectId, user.id, projectId)
    .first();
  if ((used?.n || 0) + body.length > quota(env))
    throw new HttpError(413, 'Espace cloud plein. Supprime des projets ou garde-les seulement sur cet appareil.');
  await env.DB.prepare(
    'INSERT OR REPLACE INTO chunks (user_id, project_id, upload_id, seq, data, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  )
    .bind(
      user.id,
      projectId,
      uploadId,
      seq,
      body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
      now(),
    )
    .run();
  return json({ ok: true });
}

export async function getChunk(env, user, projectId, uploadId, seqText) {
  checkId(projectId);
  checkId(uploadId);
  const row = await env.DB.prepare(
    `SELECT c.data FROM chunks c JOIN projects p ON p.user_id = c.user_id AND p.id = c.project_id AND p.upload_id = c.upload_id
     WHERE c.user_id = ? AND c.project_id = ? AND c.upload_id = ? AND c.seq = ?`,
  )
    .bind(user.id, projectId, uploadId, Number(seqText))
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

const conflict = async (env, user, id) => {
  const cur = await env.DB.prepare('SELECT version FROM projects WHERE user_id = ? AND id = ?')
    .bind(user.id, id)
    .first();
  return new HttpError(409, 'Le projet a changé sur un autre appareil.', { version: cur?.version ?? 0 });
};

export async function commit(env, user, projectId, body) {
  checkId(projectId);
  const uploadId = checkId(body.uploadId);
  const chunks = Number(body.chunks);
  const base = Number(body.base);
  if (!Number.isInteger(chunks) || chunks < 1 || chunks > CHUNKS_MAX || !Number.isInteger(base) || base < 0)
    throw new HttpError(400, 'Requête invalide.');
  const have = await env.DB.prepare(
    'SELECT COUNT(*) AS c, COALESCE(SUM(LENGTH(data)), 0) AS b, COALESCE(MAX(seq), -1) AS m FROM chunks WHERE user_id = ? AND project_id = ? AND upload_id = ?',
  )
    .bind(user.id, projectId, uploadId)
    .first();
  if (have.c !== chunks || have.m !== chunks - 1) throw new HttpError(400, 'Envoi incomplet, réessaie.');
  const name = String(body.name || 'Projet').slice(0, 80);
  const updatedAt = String(body.updatedAt || '').slice(0, 40);
  const deleted = body.deleted ? 1 : 0;
  let res;
  if (base === 0)
    res = await env.DB.prepare(
      `INSERT INTO projects (user_id, id, version, upload_id, name, updated_at, deleted, removed, bytes, chunks)
       VALUES (?, ?, 1, ?, ?, ?, ?, 0, ?, ?) ON CONFLICT (user_id, id) DO NOTHING`,
    )
      .bind(user.id, projectId, uploadId, name, updatedAt, deleted, have.b, chunks)
      .run();
  else
    res = await env.DB.prepare(
      `UPDATE projects SET version = version + 1, upload_id = ?, name = ?, updated_at = ?, deleted = ?, removed = 0, bytes = ?, chunks = ?
       WHERE user_id = ? AND id = ? AND version = ?`,
    )
      .bind(uploadId, name, updatedAt, deleted, have.b, chunks, user.id, projectId, base)
      .run();
  if (!changes(res)) {
    await env.DB.prepare('DELETE FROM chunks WHERE user_id = ? AND project_id = ? AND upload_id = ?')
      .bind(user.id, projectId, uploadId)
      .run();
    throw await conflict(env, user, projectId);
  }
  // The previous copy goes, and so do abandoned uploads (a device that lost its connection half-way).
  await env.DB.batch([
    env.DB.prepare('DELETE FROM chunks WHERE user_id = ? AND project_id = ? AND upload_id <> ?').bind(
      user.id,
      projectId,
      uploadId,
    ),
    env.DB.prepare(
      `DELETE FROM chunks WHERE user_id = ? AND created_at < ? AND NOT EXISTS
       (SELECT 1 FROM projects p WHERE p.user_id = chunks.user_id AND p.id = chunks.project_id AND p.upload_id = chunks.upload_id)`,
    ).bind(user.id, now() - 86400_000),
  ]);
  const cur = await env.DB.prepare('SELECT version FROM projects WHERE user_id = ? AND id = ?')
    .bind(user.id, projectId)
    .first();
  return json({ version: cur.version });
}

// Permanent deletion: the project leaves the cloud, a tombstone tells the other devices to drop it too.
export async function remove(env, user, projectId, body) {
  checkId(projectId);
  const base = Number(body.base);
  if (!Number.isInteger(base) || base < 1) throw new HttpError(400, 'Requête invalide.');
  const res = await env.DB.prepare(
    `UPDATE projects SET version = version + 1, removed = 1, upload_id = NULL, bytes = 0, chunks = 0
     WHERE user_id = ? AND id = ? AND version = ?`,
  )
    .bind(user.id, projectId, base)
    .run();
  if (!changes(res)) {
    const cur = await env.DB.prepare('SELECT version FROM projects WHERE user_id = ? AND id = ?')
      .bind(user.id, projectId)
      .first();
    if (!cur) throw new HttpError(404, 'Projet introuvable.');
    throw await conflict(env, user, projectId);
  }
  await env.DB.prepare('DELETE FROM chunks WHERE user_id = ? AND project_id = ?').bind(user.id, projectId).run();
  const cur = await env.DB.prepare('SELECT version FROM projects WHERE user_id = ? AND id = ?')
    .bind(user.id, projectId)
    .first();
  return json({ version: cur.version });
}
