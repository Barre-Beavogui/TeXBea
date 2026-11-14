import {
  templateProject,
  safePath,
  validateProject,
  cleanTags,
  renameFile,
  MAX_FILE_SIZE,
  MAX_PROJECT_SIZE,
  formatSize,
} from './project-tools.js';
import { isCompiler } from './compilers.js';
import { defaultStore, storageFull } from './browser-store.js';
import { cleanComment, mergeComments } from './share.js';
import {
  sanitizeProfile,
  publicUser,
  generateRecoveryKey,
  hashSecretBrowser,
  personalizeProjectFiles,
} from './accounts.js';

const ACCOUNTS_KEY = 'texbea-accounts-v1';
const SESSIONS_KEY = 'texbea-sessions-v1';
let memoryAccounts = { users: [], sessions: {} };

function loadAccounts() {
  try {
    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      const users = JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || '[]');
      const sessions = JSON.parse(localStorage.getItem(SESSIONS_KEY) || '{}');
      return {
        users: Array.isArray(users) ? users : [],
        sessions: sessions && typeof sessions === 'object' ? sessions : {},
      };
    }
  } catch {}
  return memoryAccounts;
}

function saveAccounts({ users, sessions }) {
  memoryAccounts = { users, sessions };
  try {
    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(users));
      localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
    }
  } catch {}
}

let store;
// Lets the tests choose where projects live.
export function useStore(s) {
  store = s;
  memoryAccounts = { users: [], sessions: {} };
}
const uid = () => crypto.randomUUID();
function make(input, user = null) {
  const raw = input.files ? input : templateProject(input.template, input);
  if (!input.files && user) {
    raw.files = personalizeProjectFiles(raw.files, user);
    if (!raw.compiler && user.defaultCompiler) raw.compiler = user.defaultCompiler;
  }
  const data = validateProject(raw);
  return {
    ...data,
    id: uid(),
    ...(user?.id ? { ownerId: user.id } : {}),
    updatedAt: new Date().toISOString(),
    history: [],
  };
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
  const acct = loadAccounts();
  const token =
    (opt.headers?.Authorization || opt.headers?.authorization || '').replace('Bearer ', '') ||
    (typeof window !== 'undefined' && typeof localStorage !== 'undefined'
      ? localStorage.getItem('tn_token') || ''
      : '');
  const currentUserId = token ? acct.sessions[token] : null;
  const currentUser = currentUserId ? acct.users.find((u) => u.id === currentUserId) || null : null;
  const owns = (p) => !currentUser || !p.ownerId || p.ownerId === currentUser.id;

  if (parts[0] === 'auth') {
    const action = parts[1];
    if (action === 'accounts' && method === 'GET') {
      return { accounts: acct.users.map(publicUser) };
    }
    if (action === 'register' && method === 'POST') {
      const { email, password } = body;
      if (!email || !password || String(password).length < 6)
        fail('Email et mot de passe (6 caractères minimum) requis', 400);
      const normEmail = String(email).trim().toLowerCase();
      if (acct.users.some((u) => u.email.toLowerCase() === normEmail)) fail('Compte déjà existant avec cet email', 409);
      const profile = sanitizeProfile(body);
      const h = await hashSecretBrowser(String(password));
      const recoveryKey = generateRecoveryKey();
      const rec = await hashSecretBrowser(recoveryKey.replace(/[^A-Z0-9]/gi, '').toUpperCase());
      const now = new Date().toISOString();
      const u = {
        id: uid(),
        ...profile,
        ...h,
        recoverySalt: rec.salt,
        recoveryHash: rec.hash,
        createdAt: now,
        updatedAt: now,
        lastLoginAt: now,
      };
      const isFirstAccount = acct.users.length === 0;
      acct.users.push(u);
      // Attach pre-existing guest projects to the first account created on this device.
      if (isFirstAccount) {
        for (const p of db) {
          if (!p.ownerId) {
            p.ownerId = u.id;
            p.files = personalizeProjectFiles(p.files, u);
          }
        }
      }
      let userProject = db.find((p) => p.ownerId === u.id && !p.deleted);
      if (!userProject) {
        userProject = make({ name: 'Mon premier projet' }, u);
        db.push(userProject);
      }
      const newToken = uid() + uid().replace(/-/g, '');
      acct.sessions[newToken] = u.id;
      saveAccounts(acct);
      await store.save(db);
      return { token: newToken, user: publicUser(u), recoveryKey, project: publicCopy(userProject) };
    }
    if (action === 'login' && method === 'POST') {
      const { email, password } = body;
      const u = acct.users.find(
        (x) =>
          x.email.toLowerCase() ===
          String(email || '')
            .trim()
            .toLowerCase(),
      );
      if (!u) fail('Identifiants invalides', 401);
      const check = await hashSecretBrowser(String(password || ''), u.salt);
      if (check.hash !== u.hash) fail('Identifiants invalides', 401);
      u.lastLoginAt = new Date().toISOString();
      const newToken = uid() + uid().replace(/-/g, '');
      acct.sessions[newToken] = u.id;
      saveAccounts(acct);
      return { token: newToken, user: publicUser(u) };
    }
    if (action === 'recover' && method === 'POST') {
      const { email, recoveryKey, newPassword } = body;
      if (!email || !recoveryKey || !newPassword || String(newPassword).length < 6)
        fail('Email, clé de récupération et nouveau mot de passe (6 car. min.) requis', 400);
      const u = acct.users.find((x) => x.email.toLowerCase() === String(email).trim().toLowerCase());
      if (!u || !u.recoveryHash || !u.recoverySalt) fail('Clé de récupération ou email invalide', 401);
      const normKey = String(recoveryKey)
        .replace(/[^A-Z0-9]/gi, '')
        .toUpperCase();
      const check = await hashSecretBrowser(normKey, u.recoverySalt);
      if (check.hash !== u.recoveryHash) fail('Clé de récupération invalide', 401);
      const nextHash = await hashSecretBrowser(String(newPassword));
      const nextRecoveryKey = generateRecoveryKey();
      const nextRec = await hashSecretBrowser(nextRecoveryKey.replace(/[^A-Z0-9]/gi, '').toUpperCase());
      u.salt = nextHash.salt;
      u.hash = nextHash.hash;
      u.recoverySalt = nextRec.salt;
      u.recoveryHash = nextRec.hash;
      u.updatedAt = new Date().toISOString();
      const newToken = uid() + uid().replace(/-/g, '');
      acct.sessions[newToken] = u.id;
      saveAccounts(acct);
      return { token: newToken, user: publicUser(u), recoveryKey: nextRecoveryKey };
    }
    if (action === 'logout' && method === 'POST') {
      if (token) delete acct.sessions[token];
      saveAccounts(acct);
      return { ok: true };
    }
    if (!currentUser) fail('Session requise', 401);
    if (action === 'me' && method === 'GET') {
      return { user: publicUser(currentUser) };
    }
    if (action === 'profile' && method === 'PUT') {
      const nextProfile = sanitizeProfile(body, currentUser);
      if (
        nextProfile.email &&
        nextProfile.email !== currentUser.email.toLowerCase() &&
        acct.users.some((x) => x.id !== currentUser.id && x.email.toLowerCase() === nextProfile.email)
      ) {
        fail('Cet email est déjà utilisé par un autre compte', 409);
      }
      Object.assign(currentUser, nextProfile, { updatedAt: new Date().toISOString() });
      saveAccounts(acct);
      return { user: publicUser(currentUser) };
    }
    if (action === 'password' && method === 'POST') {
      const { currentPassword, newPassword } = body;
      if (!currentPassword || !newPassword || String(newPassword).length < 6)
        fail('Mot de passe actuel et nouveau mot de passe (6 car. min.) requis', 400);
      const check = await hashSecretBrowser(String(currentPassword), currentUser.salt);
      if (check.hash !== currentUser.hash) fail('Mot de passe actuel incorrect', 401);
      const next = await hashSecretBrowser(String(newPassword));
      currentUser.salt = next.salt;
      currentUser.hash = next.hash;
      currentUser.updatedAt = new Date().toISOString();
      saveAccounts(acct);
      return { ok: true };
    }
    if (action === 'recovery-key' && method === 'POST') {
      const { password } = body;
      const check = await hashSecretBrowser(String(password || ''), currentUser.salt);
      if (check.hash !== currentUser.hash) fail('Mot de passe incorrect', 401);
      const recoveryKey = generateRecoveryKey();
      const rec = await hashSecretBrowser(recoveryKey.replace(/[^A-Z0-9]/gi, '').toUpperCase());
      currentUser.recoverySalt = rec.salt;
      currentUser.recoveryHash = rec.hash;
      currentUser.updatedAt = new Date().toISOString();
      saveAccounts(acct);
      return { recoveryKey };
    }
    if (action === 'account' && method === 'DELETE') {
      const { password } = body;
      const check = await hashSecretBrowser(String(password || ''), currentUser.salt);
      if (check.hash !== currentUser.hash) fail('Mot de passe incorrect', 401);
      acct.users = acct.users.filter((x) => x.id !== currentUser.id);
      for (const [k, v] of Object.entries(acct.sessions)) if (v === currentUser.id) delete acct.sessions[k];
      saveAccounts(acct);
      db = db.filter((p) => p.ownerId !== currentUser.id);
      if (!db.length) db = [make({ name: 'Mon premier projet' })];
      await store.save(db);
      return { ok: true };
    }
    fail('Action indisponible', 404);
  }

  let result;
  if (parts[0] === 'backup' && method === 'GET') {
    // Everything, versions' images included: the copies share their (immutable) strings.
    return db.filter(owns).map((p) => ({ ...p, assets: { ...(p.assets || {}) }, history: [...(p.history || [])] }));
  } else if (parts[0] === 'restore' && method === 'POST') {
    // A project already here in the same state is skipped, so restoring the same backup twice adds nothing.
    let added = 0,
      skipped = 0;
    for (const input of body.projects || []) {
      const same = db.find((p) => owns(p) && p.id === input.id);
      if (same && same.updatedAt === input.updatedAt) {
        skipped++;
        continue;
      }
      const data = validateProject(input);
      db.push({
        ...data,
        id: same || !input.id ? uid() : input.id,
        ...(currentUser?.id ? { ownerId: currentUser.id } : {}),
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
      result = make(body, currentUser);
      db.push(result);
    } else
      result = db.filter(owns).map((p) => ({
        id: p.id,
        name: p.name,
        main: p.main,
        updatedAt: p.updatedAt,
        deleted: !!p.deleted,
        pristine: !!p.pristine,
        archived: !!p.archived,
        tags: p.tags || [],
        fromShare: !!p.fromShare,
        fileCount: Object.keys(p.files).length + Object.keys(p.assets || {}).length,
      }));
  } else if (parts[0] === 'projects') {
    const p = db.find((p) => owns(p) && p.id === parts[1]);
    if (!p) fail('Projet introuvable', 404);
    p.assets = p.assets || {};
    p.history = p.history || [];
    if (parts.length === 2) {
      if (method === 'PUT') {
        if (body.name) p.name = String(body.name).trim().slice(0, 80);
        if ('deleted' in body) p.deleted = !!body.deleted;
        if ('archived' in body) p.archived = !!body.archived;
        if (Array.isArray(body.tags)) p.tags = cleanTags(body.tags);
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
      result = make({ ...p, archived: false, name: body.name || p.name + ' — copie' });
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
