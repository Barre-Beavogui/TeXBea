import { useCallback, useEffect, useRef, useState } from 'react';
import { backupBlob } from './backup.js';
import {
  AUTO_KEY,
  AUTO_INTERVAL,
  AUTO_INTERVAL_HIDDEN,
  changedSince,
  clearFolder,
  folderPermission,
  isAutoBackupDue,
  loadFolder,
  markBackedUp,
  saveFolder,
  supportsFolderBackup,
  writeBackupToFolder,
} from './auto-backup.js';

// When the user last changed something in this session (ms). Set by the interface on every write.
let changedAt = null;
export const markChanged = () => {
  changedAt = Date.now();
};

const PERSIST_KEY = 'texbea-persist-asked';
const PERSIST_RETRY = 7 * 86_400_000;

// Asks the browser, quietly, to keep the projects when space runs short. Chrome decides on its own;
// Firefox shows its own question, so it is asked once a week at most and only once there is something to protect.
async function requestPersistence() {
  const storage = globalThis.navigator?.storage;
  if (!storage?.persist) return false;
  try {
    if (await storage.persisted?.()) return false;
    const asked = Number(localStorage.getItem(PERSIST_KEY) || 0);
    if (Date.now() - asked < PERSIST_RETRY) return false;
    localStorage.setItem(PERSIST_KEY, String(Date.now()));
    return await storage.persist();
  } catch {
    return false;
  }
}

// status: 'unsupported' (browser cannot write to a folder) · 'off' · 'on' · 'permission' (the browser wants a click
// to give the folder access back) · 'error'.
export default function useAutoBackup({ api, enabled, onChange }) {
  const supported = supportsFolderBackup();
  const [state, setState] = useState({ status: supported ? 'off' : 'unsupported', name: '', error: '' });
  const [last, setLast] = useState(() => localStorage.getItem(AUTO_KEY));
  const handle = useRef(null);
  const busy = useRef(false);
  // When a backup was last tried, success or not: a failing folder is not hammered every minute.
  const tried = useRef(0);
  const fn = useRef({});
  fn.current = { api, onChange };

  const run = useCallback(async () => {
    if (!handle.current || busy.current) return;
    busy.current = true;
    tried.current = Date.now();
    try {
      if ((await folderPermission(handle.current)) !== 'granted') {
        setState((s) => ({ ...s, status: 'permission' }));
        return;
      }
      const now = new Date();
      await writeBackupToFolder(handle.current, await backupBlob(await fn.current.api('/backup')), now);
      markBackedUp(now);
      setLast(now.toISOString());
      setState((s) => ({ ...s, status: 'on', error: '' }));
      fn.current.onChange?.();
    } catch (e) {
      setState((s) => ({ ...s, status: 'error', error: e.message || String(e) }));
    } finally {
      busy.current = false;
    }
  }, []);

  // Back to a folder remembered from an earlier visit; catches up if projects changed since the last copy.
  useEffect(() => {
    if (!enabled || !supported) return;
    let dead = false;
    (async () => {
      try {
        const dir = await loadFolder();
        if (!dir || dead) return;
        handle.current = dir;
        const granted = (await folderPermission(dir)) === 'granted';
        setState({ status: granted ? 'on' : 'permission', name: dir.name, error: '' });
        if (granted && changedSince(await fn.current.api('/projects'), localStorage.getItem(AUTO_KEY))) run();
      } catch {
        // No readable folder: the card offers to choose one.
      }
    })();
    return () => {
      dead = true;
    };
  }, [enabled, supported, run]);

  // Every minute: protect the storage once there is work, back up when due. A hidden tab backs up sooner.
  useEffect(() => {
    if (!enabled) return;
    let persisting = false;
    const due = (interval) =>
      Date.now() - tried.current >= interval &&
      isAutoBackupDue(changedAt, localStorage.getItem(AUTO_KEY), Date.now(), interval);
    const tick = async () => {
      if (changedAt && !persisting) {
        persisting = true;
        if (await requestPersistence()) fn.current.onChange?.();
      }
      if (handle.current && due(AUTO_INTERVAL)) run();
    };
    const hide = () => {
      if (document.visibilityState === 'hidden' && handle.current && due(AUTO_INTERVAL_HIDDEN)) run();
    };
    const timer = setInterval(tick, 60_000);
    document.addEventListener('visibilitychange', hide);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', hide);
    };
  }, [enabled, run]);

  // The browser took the folder access back (new session): the first click or key press gives it back.
  useEffect(() => {
    if (state.status !== 'permission') return;
    const regain = async () => {
      if (!handle.current) return;
      if ((await folderPermission(handle.current, true)) === 'granted') {
        setState((s) => ({ ...s, status: 'on' }));
        run();
      }
    };
    const opts = { once: true, capture: true };
    document.addEventListener('pointerdown', regain, opts);
    document.addEventListener('keydown', regain, opts);
    return () => {
      document.removeEventListener('pointerdown', regain, opts);
      document.removeEventListener('keydown', regain, opts);
    };
  }, [state.status, run]);

  async function choose() {
    try {
      const dir = await globalThis.showDirectoryPicker({
        id: 'texbea-backup',
        mode: 'readwrite',
        startIn: 'documents',
      });
      await saveFolder(dir);
      handle.current = dir;
      setState({ status: 'on', name: dir.name, error: '' });
      await run();
    } catch (e) {
      if (e?.name === 'AbortError') return;
      // Chrome refuses a few folders (Documents or Downloads themselves, system folders).
      setState((s) => ({
        ...s,
        status: 'error',
        error:
          e?.name === 'SecurityError'
            ? 'Le navigateur refuse ce dossier. Choisis un sous-dossier, par exemple Documents/TeXBea-sauvegardes.'
            : e?.message || String(e),
      }));
    }
  }
  async function disable() {
    handle.current = null;
    await clearFolder().catch(() => {});
    setState({ status: 'off', name: '', error: '' });
  }

  return { ...state, supported, last, choose, disable, backupNow: run };
}
