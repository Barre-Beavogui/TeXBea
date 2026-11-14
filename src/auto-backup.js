// Automatic backup: the same full ZIP as « Tout sauvegarder », written on its own into a folder the user chose once.
// Browsers that can write to a chosen folder (File System Access API: Chrome, Edge, Brave…) keep the copy outside
// the browser storage, so clearing site data or a full disk does not take the backup with it.
// Everything that touches the browser is passed in, so the rules below are tested without one.
import { LAST_BACKUP_KEY } from './backup.js';

export const AUTO_KEY = 'texbea-last-auto-backup';
// Copies kept in the folder: one per day, the seven most recent days.
export const AUTO_KEEP = 7;
// While the user writes, at most one backup every ten minutes; a tab being hidden or closed shortens it.
export const AUTO_INTERVAL = 10 * 60_000;
export const AUTO_INTERVAL_HIDDEN = 2 * 60_000;
const AUTO_FILE = /^TeXBea-auto-\d{4}-\d{2}-\d{2}\.zip$/;
const DB = 'texbea-auto-backup';
const HANDLE_KEY = 'folder';

export const autoFileName = (now = new Date()) => `TeXBea-auto-${now.toISOString().slice(0, 10)}.zip`;

export const supportsFolderBackup = (g = globalThis) => typeof g.showDirectoryPicker === 'function';

// True when something changed after the last automatic backup and enough time went by.
// `changedAt` is when the user last changed anything (ms), null when nothing changed in this session.
export function isAutoBackupDue(changedAt, lastAuto, now = Date.now(), interval = AUTO_INTERVAL) {
  if (!changedAt) return false;
  const last = Date.parse(lastAuto || 0) || 0;
  return changedAt > last && now - last >= interval;
}

// At launch nothing was changed yet in this session: compare with what the projects say.
export function changedSince(projects, lastAuto) {
  const last = Date.parse(lastAuto || 0) || 0;
  const times = projects.map((p) => Date.parse(p.updatedAt || 0) || 0);
  return times.length ? Math.max(...times) > last : false;
}

// Names of automatic copies to delete so that only the `keep` most recent days remain.
// Files the user put in the folder (any other name) are never listed.
export function oldAutoFiles(names, keep = AUTO_KEEP) {
  return names
    .filter((n) => AUTO_FILE.test(n))
    .sort()
    .reverse()
    .slice(keep);
}

// ── The chosen folder is remembered in a small IndexedDB of its own (handles can be stored there, not in localStorage).
function open(idb) {
  return new Promise((resolve, reject) => {
    const r = idb.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('handles');
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function run(idb, mode, work) {
  const db = await open(idb);
  try {
    const tx = db.transaction('handles', mode);
    const out = await new Promise((resolve, reject) => {
      const req = work(tx.objectStore('handles'));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return out;
  } finally {
    db.close();
  }
}
export const loadFolder = (idb = globalThis.indexedDB) =>
  run(idb, 'readonly', (s) => s.get(HANDLE_KEY)).then((h) => h || null);
export const saveFolder = (handle, idb = globalThis.indexedDB) =>
  run(idb, 'readwrite', (s) => s.put(handle, HANDLE_KEY));
export const clearFolder = (idb = globalThis.indexedDB) => run(idb, 'readwrite', (s) => s.delete(HANDLE_KEY));

// 'granted' | 'prompt' | 'denied'. Asking (`ask`) is only allowed from a click or a key press.
export async function folderPermission(handle, ask = false) {
  const opts = { mode: 'readwrite' };
  try {
    let state = await handle.queryPermission?.(opts);
    if (state !== 'granted' && ask) state = await handle.requestPermission?.(opts);
    return state || 'denied';
  } catch {
    return 'denied';
  }
}

// Writes today's copy (replacing the one of the same day) then removes the copies beyond the seven most recent days.
// The browser writes to a temporary file and swaps it in on close: an interrupted write keeps the previous copy.
export async function writeBackupToFolder(dir, blob, now = new Date()) {
  const name = autoFileName(now);
  const file = await dir.getFileHandle(name, { create: true });
  const out = await file.createWritable();
  try {
    await out.write(blob);
    await out.close();
  } catch (e) {
    await out.abort?.().catch(() => {});
    throw e;
  }
  const names = [];
  for await (const [entry, handle] of dir.entries()) if (handle.kind === 'file') names.push(entry);
  for (const old of oldAutoFiles(names)) await dir.removeEntry(old).catch(() => {});
  return name;
}

export function markBackedUp(now = new Date(), storage = globalThis.localStorage) {
  const when = now.toISOString();
  storage.setItem(AUTO_KEY, when);
  // The reminder of the storage card counts an automatic backup like a manual one.
  storage.setItem(LAST_BACKUP_KEY, when);
}
