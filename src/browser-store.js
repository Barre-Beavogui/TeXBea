// Where the browser version keeps its projects.
// IndexedDB holds hundreds of megabytes (localStorage stops near 5 Mo for the whole site). Images are written
// once in a "blobs" store and projects or versions only point to them, so twenty versions of a project with a
// 50 Mo figure still store that figure once.
export const LEGACY_KEY = 'texnova-lab-projects';
const DB_NAME = 'texbea';
const REF = '@blob:';

const request = (r) =>
  new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
const finished = (tx) =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || Error('Écriture annulée'));
  });

export function storageFull(error) {
  return /quota/i.test(`${error?.name} ${error?.message}`);
}

// Fallback (tests, very old browsers): the former localStorage format, read again on every call.
export function localStore(storage = globalThis.localStorage) {
  return {
    kind: 'local',
    async load() {
      return JSON.parse(storage.getItem(LEGACY_KEY) || 'null');
    },
    async save(projects) {
      storage.setItem(LEGACY_KEY, JSON.stringify(projects));
    },
    reset() {},
  };
}

export function indexedDbStore(idb = globalThis.indexedDB, legacy = globalThis.localStorage) {
  let opening, cache, order;
  // Content of each stored image → its key, so an unchanged image is never written twice.
  let keys = new Map();
  const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('texbea-projects') : null;
  // Another tab wrote: read again from the database next time.
  if (channel) {
    channel.onmessage = () => reset();
    channel.unref?.(); // Node (tests): do not keep the process alive
  }
  function reset() {
    cache = null;
  }
  function open() {
    return (opening ||= new Promise((resolve, reject) => {
      const r = idb.open(DB_NAME, 1);
      r.onupgradeneeded = () => {
        r.result.createObjectStore('projects', { keyPath: 'id' });
        r.result.createObjectStore('blobs');
      };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => {
        opening = null;
        reject(r.error);
      };
    }));
  }
  async function load() {
    if (cache) return cache;
    const db = await open();
    const tx = db.transaction(['projects', 'blobs']);
    const blobs = tx.objectStore('blobs');
    const [records, blobKeys, blobValues] = await Promise.all([
      request(tx.objectStore('projects').getAll()),
      request(blobs.getAllKeys()),
      request(blobs.getAll()),
    ]);
    // '#used' marks a database that already held projects: emptied on purpose, it must not get the starter project.
    const used = blobKeys.includes('#used');
    const pairs = blobKeys.map((k, i) => [k, blobValues[i]]).filter(([k]) => k !== '#used');
    const content = new Map(pairs);
    keys = new Map(pairs.map(([k, v]) => [v, k]));
    const hydrate = (assets = {}) =>
      Object.fromEntries(
        Object.entries(assets).map(([n, v]) => [n, v.startsWith(REF) ? (content.get(v.slice(REF.length)) ?? '') : v]),
      );
    records.sort((a, b) => a.order - b.order);
    order = new Map(records.map((r) => [r.project.id, r.order]));
    if (!records.length) {
      // First visit since the move to IndexedDB: bring the localStorage projects along.
      const old = JSON.parse(legacy?.getItem(LEGACY_KEY) || 'null');
      if (Array.isArray(old) && old.length) {
        await save(old);
        legacy.removeItem(LEGACY_KEY);
        return (cache = old);
      }
      return used ? (cache = []) : null;
    }
    return (cache = records.map(({ project: p }) => ({
      ...p,
      assets: hydrate(p.assets),
      history: (p.history || []).map((s) => ({ ...s, assets: hydrate(s.assets) })),
    })));
  }
  async function save(projects) {
    const db = await open();
    const tx = db.transaction(['projects', 'blobs'], 'readwrite');
    const store = tx.objectStore('projects'),
      blobs = tx.objectStore('blobs');
    const added = [],
      used = new Set();
    const refs = (assets = {}) =>
      Object.fromEntries(
        Object.entries(assets).map(([n, v]) => {
          let k = keys.get(v);
          if (!k) {
            k = crypto.randomUUID();
            keys.set(v, k);
            added.push(v);
            blobs.put(v, k);
          }
          used.add(k);
          return [n, REF + k];
        }),
      );
    order ||= new Map();
    let next = Math.max(0, ...order.values()) + 1;
    blobs.put('', '#used');
    const kept = new Set();
    for (const p of projects) {
      if (!order.has(p.id)) order.set(p.id, next++);
      kept.add(p.id);
      store.put({
        id: p.id,
        order: order.get(p.id),
        project: {
          ...p,
          assets: refs(p.assets),
          history: (p.history || []).map((s) => ({ ...s, assets: refs(s.assets) })),
        },
      });
    }
    for (const id of [...order.keys()])
      if (!kept.has(id)) {
        store.delete(id);
        order.delete(id);
      }
    for (const [v, k] of [...keys])
      if (!used.has(k)) {
        blobs.delete(k);
        keys.delete(v);
      }
    try {
      await finished(tx);
    } catch (e) {
      for (const v of added) keys.delete(v);
      reset();
      throw e;
    }
    cache = projects;
    channel?.postMessage('saved');
    // Ask the browser not to evict the projects when the disk gets full (no prompt in most browsers).
    globalThis.navigator?.storage?.persist?.().catch(() => {});
  }
  return { kind: 'indexeddb', load, save, reset };
}

export function defaultStore() {
  return typeof indexedDB !== 'undefined' ? indexedDbStore() : localStore();
}
