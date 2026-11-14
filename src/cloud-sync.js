// Cloud copy of the projects, per account. The browser stays the working copy: everything keeps working offline,
// and this module only reconciles it with the cloud (upload what changed here, download what changed elsewhere).
// Rule above all: nothing is ever lost. When both sides changed, the cloud version is kept as a separate local copy.
export const CHUNK_SIZE = 900_000;
const STATE_PREFIX = 'texbea-cloud:';

export async function gzip(text) {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
export async function gunzip(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}
export function splitChunks(bytes, size = CHUNK_SIZE) {
  const out = [];
  for (let i = 0; i < bytes.length; i += size) out.push(bytes.subarray(i, i + size));
  return out;
}
export const joinChunks = (parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
};

// What to do for each project. local: [{id, updatedAt}], remote: cloud index, state: {id: {version, updatedAt}} as of
// the last successful sync of this device. Returns [{type, id, ...}].
export function plan(local, remote, state) {
  const L = new Map(local.map((p) => [p.id, p]));
  const R = new Map(remote.map((p) => [p.id, p]));
  const actions = [];
  for (const id of new Set([...L.keys(), ...R.keys(), ...Object.keys(state)])) {
    const l = L.get(id),
      r = R.get(id),
      s = state[id];
    // The untouched starter project of a new device stays local until the person uses it.
    if (l?.pristine && !s && !r) continue;
    const live = r && !r.removed;
    if (l && !r) actions.push({ type: 'upload', id, base: 0 });
    else if (!l && live) {
      // Same version as at the last sync: it was deleted here on purpose. Otherwise it is new or changed elsewhere.
      if (s && s.version === r.version) actions.push({ type: 'remove-remote', id, base: r.version });
      else actions.push({ type: 'download', id, entry: r });
    } else if (!l) {
      if (s) actions.push({ type: 'forget', id });
    } else if (r.removed) {
      // Deleted elsewhere: follow it when nothing changed here, otherwise the work here wins and comes back.
      if (s && s.updatedAt === l.updatedAt) actions.push({ type: 'remove-local', id });
      else actions.push({ type: 'upload', id, base: r.version });
    } else {
      const localChanged = !s || s.updatedAt !== l.updatedAt;
      const remoteChanged = !s || s.version !== r.version;
      if (!s && l.updatedAt === r.updatedAt)
        actions.push({ type: 'adopt', id, version: r.version, updatedAt: l.updatedAt });
      else if (localChanged && !remoteChanged) actions.push({ type: 'upload', id, base: r.version });
      else if (!localChanged && remoteChanged) actions.push({ type: 'download', id, entry: r });
      else if (localChanged && remoteChanged) actions.push({ type: 'conflict', id, entry: r });
    }
  }
  return actions;
}

export const loadState = (email, storage = localStorage) => {
  try {
    return JSON.parse(storage.getItem(STATE_PREFIX + email) || '{}') || {};
  } catch {
    return {};
  }
};
export const saveState = (email, state, storage = localStorage) =>
  storage.setItem(STATE_PREFIX + email, JSON.stringify(state));

class CloudError extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

// Talks to /api (same origin: the session cookie travels by itself).
export function cloudClient(fetchImpl = (...a) => fetch(...a)) {
  async function call(method, path, { body, raw } = {}) {
    const headers = { 'x-texbea': '1' };
    let payload = raw;
    if (body !== undefined) {
      payload = JSON.stringify(body);
      headers['content-type'] = 'application/json';
    }
    let res;
    try {
      res = await fetchImpl('/api' + path, { method, headers, body: payload, credentials: 'same-origin' });
    } catch {
      throw new CloudError('Pas de connexion.', 0);
    }
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new CloudError(data.error || `Erreur ${res.status}`, res.status, data);
    }
    return res;
  }
  const json = async (...a) => (await call(...a)).json();
  return {
    providers: () => json('GET', '/auth/providers'),
    me: async () => (await json('GET', '/auth/me')).user,
    requestCode: (email) => json('POST', '/auth/email/request', { body: { email } }),
    verifyCode: (email, code) => json('POST', '/auth/email/verify', { body: { email, code } }),
    logout: () => json('POST', '/auth/logout', { body: {} }),
    deleteAccount: () => json('DELETE', '/auth/account', { body: {} }),
    plans: () => json('GET', '/billing/plans'),
    checkout: (plan) => json('POST', '/billing/checkout', { body: { plan } }),
    portal: () => json('POST', '/billing/portal', { body: {} }),
    index: () => json('GET', '/sync/index'),
    async upload(id, bytes, meta, base) {
      const uploadId = crypto.randomUUID();
      const parts = splitChunks(bytes);
      for (let i = 0; i < parts.length; i++)
        await call('PUT', `/sync/projects/${id}/uploads/${uploadId}/${i}`, { raw: parts[i] });
      return json('POST', `/sync/projects/${id}/commit`, { body: { ...meta, uploadId, chunks: parts.length, base } });
    },
    async download(entry) {
      const parts = [];
      for (let i = 0; i < entry.chunks; i++)
        parts.push(
          new Uint8Array(
            await (await call('GET', `/sync/projects/${entry.id}/uploads/${entry.uploadId}/${i}`)).arrayBuffer(),
          ),
        );
      return joinChunks(parts);
    },
    remove: (id, base) => json('POST', `/sync/projects/${id}/remove`, { body: { base } }),
    shares: async (id) => (await json('GET', `/sync/projects/${id}/shares`)).shares,
    addShare: (id, email) => json('POST', `/sync/projects/${id}/shares`, { body: { email } }),
    removeShare: (id, email) => json('POST', `/sync/projects/${id}/shares/remove`, { body: { email } }),
    sharedIndex: async () => (await json('GET', '/shared/index')).projects,
    async downloadShared(entry) {
      const parts = [];
      for (let i = 0; i < entry.chunks; i++)
        parts.push(
          new Uint8Array(
            await (
              await call('GET', `/shared/projects/${entry.ownerId}/${entry.id}/uploads/${entry.uploadId}/${i}`)
            ).arrayBuffer(),
          ),
        );
      return joinChunks(parts);
    },
  };
}

const serialize = (p) => gzip(JSON.stringify({ v: 1, project: p }));
export async function parse(bytes) {
  const data = JSON.parse(await gunzip(bytes));
  if (!data?.project?.id) throw Error('Données cloud illisibles.');
  return data.project;
}

// One reconciliation pass. `local` is the browser's own API (demoApi shape). `skip` holds ids that must not be
// overwritten right now (the project open in the editor). Returns what happened.
export async function syncOnce({ local, cloud, email, skip = new Set(), storage }) {
  const state = loadState(email, storage);
  const done = { uploaded: 0, downloaded: 0, removed: 0, conflicts: 0, errors: [], changedLocal: false, usage: null };
  const remoteIndex = await cloud.index();
  done.usage = remoteIndex.usage;
  done.subscription = remoteIndex.subscription || null;
  const remote = remoteIndex.projects;
  const projects = await local('/projects');
  const save = () => saveState(email, state, storage);
  const fail = (id, e) => {
    if (e.status === 401 || e.status === 0) throw e;
    done.errors.push({ id, message: e.message });
  };
  for (const a of plan(projects, remote, state)) {
    try {
      if (a.type === 'adopt') state[a.id] = { version: a.version, updatedAt: a.updatedAt };
      else if (a.type === 'forget') delete state[a.id];
      else if (a.type === 'upload') {
        const p = await local('/sync/export/' + a.id);
        const res = await cloud.upload(
          a.id,
          await serialize(p),
          { name: p.name, updatedAt: p.updatedAt, deleted: !!p.deleted },
          a.base,
        );
        state[a.id] = { version: res.version, updatedAt: p.updatedAt };
        done.uploaded++;
      } else if (a.type === 'download' || a.type === 'conflict') {
        if (a.type === 'download' && skip.has(a.id)) continue;
        const remoteProject = await parse(await cloud.download(a.entry));
        if (a.type === 'conflict') {
          // Both sides changed: the cloud version is kept next to the local one, the local one goes up as the main copy.
          const copy = {
            ...remoteProject,
            id: crypto.randomUUID(),
            name: `${remoteProject.name} (version cloud)`.slice(0, 80),
            updatedAt: new Date().toISOString(),
          };
          await local('/sync/apply', { method: 'POST', data: { project: copy } });
          done.conflicts++;
          done.changedLocal = true;
          const p = await local('/sync/export/' + a.id);
          const res = await cloud.upload(
            a.id,
            await serialize(p),
            { name: p.name, updatedAt: p.updatedAt, deleted: !!p.deleted },
            a.entry.version,
          );
          state[a.id] = { version: res.version, updatedAt: p.updatedAt };
          done.uploaded++;
        } else {
          await local('/sync/apply', { method: 'POST', data: { project: remoteProject } });
          state[a.id] = { version: a.entry.version, updatedAt: remoteProject.updatedAt };
          done.downloaded++;
          done.changedLocal = true;
        }
      } else if (a.type === 'remove-remote') {
        await cloud.remove(a.id, a.base);
        delete state[a.id];
        done.removed++;
      } else if (a.type === 'remove-local') {
        if (skip.has(a.id)) continue;
        await local('/sync/remove', { method: 'POST', data: { id: a.id } });
        delete state[a.id];
        done.removed++;
        done.changedLocal = true;
      }
      save();
    } catch (e) {
      // A version conflict means another device won the race: the next pass sees it and reconciles.
      if (e.status === 409) done.retry = true;
      else fail(a.id, e);
    }
  }
  save();
  return done;
}
