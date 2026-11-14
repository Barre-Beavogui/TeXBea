import { useCallback, useEffect, useRef, useState } from 'react';
import { cloudClient, syncOnce, parse } from './cloud-sync.js';

const AFTER_CHANGE = 5000;
const EVERY = 2 * 60_000;
const cloud = cloudClient();

// status: 'unavailable' (no cloud on this site) · 'loading' · 'signedout' · 'idle' · 'syncing' · 'error'
// The cloud is optional: without it (or offline) the browser keeps working exactly as before.
export default function useCloudSync({ api, enabled, onChange, openId }) {
  const [state, setState] = useState({
    status: 'loading',
    providers: null,
    user: null,
    error: '',
    last: null,
    usage: null,
    notice: '',
    received: [],
  });
  const fn = useRef({});
  fn.current = { api, onChange, openId };
  const busy = useRef(false);
  const dirty = useRef(false);
  const user = useRef(null);
  const timer = useRef(0);
  const patch = (p) => setState((s) => ({ ...s, ...p }));

  const sync = useCallback(async () => {
    if (!user.current) return;
    if (busy.current) {
      dirty.current = true;
      return;
    }
    busy.current = true;
    patch({ status: 'syncing', error: '' });
    try {
      let result;
      for (let pass = 0; pass < 3; pass++) {
        dirty.current = false;
        const open = fn.current.openId?.();
        result = await syncOnce({
          local: (p, o) => fn.current.api(p, o),
          cloud,
          email: user.current.email,
          skip: new Set(open ? [open] : []),
        });
        if (result.changedLocal) fn.current.onChange?.();
        if (!result.retry && !result.changedLocal) break;
      }
      const first = result.errors[0];
      // What other accounts shared with me; best effort, never blocks the sync.
      const received = await cloud.sharedIndex().catch(() => null);
      if (received) patch({ received });
      patch({
        status: first ? 'error' : 'idle',
        error: first ? first.message : '',
        last: Date.now(),
        usage: result.usage,
      });
    } catch (e) {
      if (e.status === 401) {
        user.current = null;
        patch({ status: 'signedout', user: null, error: 'Session expirée, reconnecte-toi.' });
      } else
        patch({
          status: 'error',
          error: e.status === 0 ? 'Hors connexion : la synchronisation reprendra toute seule.' : e.message,
        });
    } finally {
      busy.current = false;
      if (dirty.current && user.current) setTimeout(sync, 1000);
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const providers = await cloud.providers();
      const me = await cloud.me();
      user.current = me;
      patch({ providers, user: me, status: me ? 'idle' : 'signedout' });
      if (me) sync();
    } catch {
      patch({ status: 'unavailable' });
    }
  }, [sync]);

  useEffect(() => {
    if (!enabled) return;
    const q = new URLSearchParams(location.search);
    if (q.has('connexion')) {
      patch({
        notice:
          q.get('connexion') === 'ok' ? 'Connecté.' : 'La connexion a échoué. Réessaie ou choisis une autre méthode.',
      });
      q.delete('connexion');
      history.replaceState(null, '', location.pathname + (q.size ? '?' + q : '') + location.hash);
    }
    refresh();
  }, [enabled, refresh]);

  useEffect(() => {
    if (!enabled) return;
    const onChanged = () => {
      if (!user.current) return;
      if (busy.current) dirty.current = true;
      else {
        clearTimeout(timer.current);
        timer.current = setTimeout(sync, AFTER_CHANGE);
      }
    };
    const visible = () => document.visibilityState === 'visible' && user.current && sync();
    const id = setInterval(() => document.visibilityState === 'visible' && user.current && sync(), EVERY);
    window.addEventListener('texbea-changed', onChanged);
    window.addEventListener('online', sync);
    document.addEventListener('visibilitychange', visible);
    return () => {
      clearInterval(id);
      clearTimeout(timer.current);
      window.removeEventListener('texbea-changed', onChanged);
      window.removeEventListener('online', sync);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [enabled, sync]);

  return {
    ...state,
    login: (provider) => location.assign(`/api/auth/${provider}/start`),
    requestCode: (email) => cloud.requestCode(email),
    async verifyCode(email, code) {
      await cloud.verifyCode(email, code);
      await refresh();
    },
    syncNow: sync,
    shares: (id) => cloud.shares(id),
    addShare: (id, email) => cloud.addShare(id, email),
    removeShare: (id, email) => cloud.removeShare(id, email),
    // Downloads a project somebody shared with me and returns it in the shape SharedView reads.
    async openReceived(entry) {
      const project = await parse(await cloud.downloadShared(entry));
      return {
        kind: 'share',
        id: project.id,
        project: { ...project, missing: [] },
        comments: Array.isArray(project.comments) ? project.comments : [],
        from: entry.ownerName || entry.ownerEmail,
      };
    },
    async logout() {
      await cloud.logout().catch(() => {});
      user.current = null;
      patch({ user: null, status: 'signedout', error: '', usage: null, received: [] });
    },
    async deleteAccount() {
      await cloud.deleteAccount();
      user.current = null;
      patch({
        user: null,
        status: 'signedout',
        error: '',
        usage: null,
        notice: 'Compte et copies cloud supprimés. Tes projets restent dans ce navigateur.',
      });
    },
  };
}
