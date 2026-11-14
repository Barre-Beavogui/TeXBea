import {
  templateProject,
  safePath,
  validateProject,
  renameFile,
  MAX_FILE_SIZE,
  MAX_PROJECT_SIZE,
  formatSize,
} from './project-tools.js';
import { isCompiler } from './compilers.js';
import { defaultStore, storageFull } from './browser-store.js';
import { cleanComment, mergeComments } from './share.js';
let store;
// Lets the tests choose where projects live.
export function useStore(s) {
  store = s;
}
const uid = () => crypto.randomUUID();
function make(input) {
  const data = validateProject(input.files ? input : templateProject(input.template, input));
  return { ...data, id: uid(), updatedAt: new Date().toISOString(), history: [] };
}
// Copy handed to the interface: strings are immutable, so sharing them is safe and avoids copying large images.
// Versions keep their images on this side only (the history panel compares sources).
function publicCopy(p) {
  return {
    ...p,
    files: { ...p.files },
    assets: { ...(p.assets || {}) },
    history: (p.history || []).map(publicVersion),
  };
}
function publicVersion(s) {
  return { ...s, files: { ...s.files }, assets: Object.fromEntries(Object.keys(s.assets || {}).map((n) => [n, ''])) };
}
const projectSize = (p) =>
  [...Object.values(p.files), ...Object.values(p.assets || {})].reduce((n, c) => n + c.length, 0);
export async function demoApi(path, opt = {}) {
  store ||= defaultStore();
  try {
    return await run(path, opt);
  } catch (e) {
    // The projects in memory may hold a half-made change: read them again from the browser storage.
    store.reset();
    throw e;
  }
}
async function run(path, opt) {
  let db,
    created = false;
  try {
    db = await store.load();
    if (!db) {
      // `pristine`: the starter project nobody touched yet, which the cloud must not copy to every new device.
      db = [{ ...make({ name: 'Mon premier projet' }), pristine: true }];
      created = true;
    }
    if (!Array.isArray(db)) throw Error();
  } catch {
    throw Error('Les données locales sont illisibles. Exporte une sauvegarde avant toute réparation.');
  }
  // `data` spares a JSON round trip for large bodies (a whole backup).
  const body = opt.data ?? JSON.parse(opt.body || '{}'),
    method = opt.method || 'GET';
  const fail = (error, status = 400) => {
    throw Object.assign(new Error(error), { status, data: { error } });
  };
  const parts = path.split('/').filter(Boolean);
  let result;
  if (parts[0] === 'backup' && method === 'GET') {
    // Everything, versions' images included: the copies share their (immutable) strings.
    return db.map((p) => ({ ...p, assets: { ...(p.assets || {}) }, history: [...(p.history || [])] }));
  } else if (parts[0] === 'restore' && method === 'POST') {
    // A project already here in the same state is skipped, so restoring the same backup twice adds nothing.
    let added = 0,
      skipped = 0;
    for (const input of body.projects || []) {
      const same = db.find((p) => p.id === input.id);
      if (same && same.updatedAt === input.updatedAt) {
        skipped++;
        continue;
      }
      const data = validateProject(input);
      db.push({
        ...data,
        id: same || !input.id ? uid() : input.id,
        name: same ? `${data.name} (sauvegarde)`.slice(0, 80) : data.name,
        deleted: !!input.deleted,
        updatedAt: input.updatedAt || new Date().toISOString(),
        history: (input.history || []).slice(-20),
        comments: input.comments || [],
      });
      added++;
    }
    result = { added, skipped };
  } else if (parts[0] === 'sync' && parts[1] === 'export' && method === 'GET') {
    // One whole project, versions' images included, for the cloud copy.
    const p = db.find((p) => p.id === parts[2]);
    if (!p) fail('Projet introuvable', 404);
    return { ...p, assets: { ...(p.assets || {}) }, history: [...(p.history || [])] };
  } else if (parts[0] === 'sync' && parts[1] === 'apply' && method === 'POST') {
    // A project coming from the cloud replaces the local one with the same id, keeping its id and date as they are.
    const input = body.project || {};
    if (!input.id || typeof input.id !== 'string') fail('Projet invalide');
    const data = validateProject(input);
    const next = {
      ...data,
      id: input.id,
      deleted: !!input.deleted,
      updatedAt: input.updatedAt || new Date().toISOString(),
      history: (input.history || []).slice(-20),
      comments: input.comments || [],
    };
    const at = db.findIndex((p) => p.id === next.id);
    if (at >= 0) db[at] = next;
    else db.push(next);
    result = { ok: true };
  } else if (parts[0] === 'sync' && parts[1] === 'remove' && method === 'POST') {
    db = db.filter((p) => p.id !== body.id);
    result = { ok: true };
  } else if (parts[0] === 'projects' && parts.length === 1) {
    if (method === 'POST') {
      result = make(body);
      db.push(result);
    } else
      result = db.map((p) => ({
        id: p.id,
        name: p.name,
        main: p.main,
        updatedAt: p.updatedAt,
        deleted: !!p.deleted,
        pristine: !!p.pristine,
        fileCount: Object.keys(p.files).length + Object.keys(p.assets || {}).length,
      }));
  } else if (parts[0] === 'projects') {
    const p = db.find((p) => p.id === parts[1]);
    if (!p) fail('Projet introuvable', 404);
    p.assets = p.assets || {};
    p.history = p.history || [];
    if (parts.length === 2) {
      if (method === 'PUT') {
        if (body.name) p.name = String(body.name).trim().slice(0, 80);
        if ('deleted' in body) p.deleted = !!body.deleted;
        if (body.main) {
          if (!(body.main in p.files) || !body.main.endsWith('.tex')) fail('Fichier principal invalide');
          p.main = body.main;
        }
        if (body.compiler) {
          if (!isCompiler(body.compiler)) fail('Compilateur inconnu');
          p.compiler = body.compiler;
        }
      } else if (method === 'DELETE') {
        if (!p.deleted) fail('Place le projet dans la corbeille avant de le supprimer');
        db = db.filter((x) => x.id !== p.id);
      }
      result = p;
    } else if (parts[2] === 'duplicate') {
      result = make({ ...p, name: body.name || p.name + ' — copie' });
      db.push(result);
    } else if (parts[2] === 'files') {
      const n = decodeURIComponent(parts[3] || body.name || '');
      if (!safePath(n)) fail('Nom de fichier invalide');
      if (method === 'DELETE') {
        if (n === p.main) fail('Impossible de supprimer le fichier principal');
        delete p.files[n];
        delete p.assets[n];
        result = p;
      } else if (method === 'PATCH') {
        try {
          Object.assign(p, renameFile(p, n, String(body.newName || '')));
        } catch (e) {
          fail(e.message, /existe/.test(e.message) ? 409 : 400);
        }
        result = p;
      } else if (method === 'POST') {
        if (n in p.files || n in p.assets) fail('Ce fichier existe déjà', 409);
        if (body.binary) {
          const checked = validateProject({ ...p, assets: { ...p.assets, [n]: body.content } });
          p.assets = checked.assets;
        } else p.files[n] = String(body.content || '');
        result = p;
      } else {
        // Saving while typing: check only the sizes, the images were checked when they were added.
        const content = String(body.content || '');
        if (content.length > MAX_FILE_SIZE) fail(`Fichier trop volumineux (${formatSize(MAX_FILE_SIZE)} maximum)`, 413);
        p.files[n] = content;
        if (projectSize(p) > MAX_PROJECT_SIZE) fail('Projet trop volumineux', 413);
        result = { ok: true };
      }
      if (method !== 'PUT') validateProject(p);
    } else if (parts[2] === 'comments') {
      p.comments = p.comments || [];
      if (parts[3] === 'merge' && method === 'POST') {
        const merged = mergeComments(p.comments, body.comments);
        p.comments = merged.comments;
        result = merged;
      } else if (method === 'POST') {
        const c = cleanComment({ ...body, id: uid(), at: new Date().toISOString() });
        if (!c) fail('Commentaire vide');
        p.comments.push(c);
        result = { comments: p.comments };
      } else {
        const c = p.comments.find((c) => c.id === parts[3]);
        if (!c) fail('Commentaire introuvable', 404);
        if (method === 'DELETE') p.comments = p.comments.filter((x) => x !== c);
        else if (method === 'PATCH') {
          if ('resolved' in body) c.resolved = !!body.resolved;
          if (typeof body.text === 'string' && body.text.trim()) c.text = body.text.trim().slice(0, 4000);
        }
        result = { comments: p.comments };
      }
    } else if (parts[2] === 'snapshot') {
      p.history.push({
        id: uid(),
        at: new Date().toISOString(),
        label: String(body.label || 'Version').slice(0, 80),
        files: { ...p.files },
        assets: { ...p.assets },
        main: p.main,
      });
      p.history = p.history.slice(-20);
      result = { history: p.history.map(publicVersion) };
    } else if (parts[2] === 'restore') {
      const s = p.history.find((s) => s.id === parts[3]);
      if (!s) fail('Version introuvable', 404);
      p.files = { ...s.files };
      p.assets = { ...(s.assets || {}) };
      p.main =
        s.main ||
        Object.keys(s.files).find((n) => n === p.main) ||
        Object.keys(s.files).find((n) => n.endsWith('.tex'));
      result = p;
    } else fail('Action indisponible', 404);
    if (method !== 'GET') {
      p.updatedAt = new Date().toISOString();
      delete p.pristine;
    }
  } else fail('Action indisponible', 404);
  if ((opt.method || 'GET') !== 'GET' || created)
    try {
      await store.save(db);
    } catch (e) {
      fail(
        storageFull(e) || store.kind === 'local'
          ? 'Stockage navigateur plein. Exporte tes projets ZIP puis libère de la place. Aucune modification n’a été enregistrée.'
          : 'Enregistrement impossible dans le navigateur : ' + (e?.message || e),
        507,
      );
    }
  return result?.files ? publicCopy(result) : structuredClone(result);
}
