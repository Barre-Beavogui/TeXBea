import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { indexedDbStore, LEGACY_KEY } from '../src/browser-store.js';
import { demoApi, useStore } from '../src/demo-api.js';

function memoryStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}
const call = (path, method = 'GET', body) => demoApi(path, { method, body: body && JSON.stringify(body) });
const big = 'QUJD'.repeat(5_000_000); // 20 Mo de Base64, bien au-delà de localStorage

test('IndexedDB : projet de 20 Mo, versions sans recopier l’image, relecture à froid', async () => {
  const idb = new IDBFactory();
  useStore(indexedDbStore(idb, memoryStorage()));
  const [{ id }] = await call('/projects');
  await call(`/projects/${id}/files`, 'POST', { name: 'fig.png', content: big, binary: true });
  for (let i = 0; i < 3; i++) await call(`/projects/${id}/snapshot`, 'POST', { label: 'v' + i });
  await call(`/projects/${id}/files/main.tex`, 'PUT', { content: '\\documentclass{article}' });
  const p = await call('/projects/' + id);
  assert.equal(p.assets['fig.png'].length, big.length);
  assert.equal(p.history.length, 3);
  assert.equal(p.history[0].assets['fig.png'], '', 'les versions ne renvoient pas les images');

  // Un seul exemplaire de l’image dans la base.
  const db = await new Promise((r) => (idb.open('texbea', 1).onsuccess = (e) => r(e.target.result)));
  const count = await new Promise(
    (r) => (db.transaction('blobs').objectStore('blobs').count().onsuccess = (e) => r(e.target.result)),
  );
  assert.equal(count, 2); // l’image + le repère « base déjà utilisée »
  db.close();

  // Nouvel onglet : tout est relu depuis IndexedDB, versions comprises.
  useStore(indexedDbStore(idb, memoryStorage()));
  const again = await call('/projects/' + id);
  assert.equal(again.assets['fig.png'], big);
  assert.equal(again.files['main.tex'], '\\documentclass{article}');
  const restored = await call(`/projects/${id}/restore/${again.history[0].id}`, 'POST');
  assert.equal(restored.assets['fig.png'], big);

  // Suppression : l’image disparaît avec le projet.
  await call(`/projects/${id}/files/fig.png`, 'DELETE');
  await call(`/projects/${id}`, 'PUT', { deleted: true });
  await call(`/projects/${id}`, 'DELETE');
  useStore(indexedDbStore(idb, memoryStorage()));
  assert.equal((await call('/projects')).length, 0);
});

test('IndexedDB : les projets de localStorage sont repris une fois', async () => {
  const legacy = memoryStorage();
  legacy.setItem(
    LEGACY_KEY,
    JSON.stringify([
      { id: 'a', name: 'Ancien', main: 'main.tex', files: { 'main.tex': 'x' }, assets: {}, history: [] },
    ]),
  );
  useStore(indexedDbStore(new IDBFactory(), legacy));
  const list = await call('/projects');
  assert.deepEqual(
    list.map((p) => p.name),
    ['Ancien'],
  );
  assert.equal(legacy.getItem(LEGACY_KEY), null);
});

test('IndexedDB : une erreur ne laisse pas de modification à moitié faite', async () => {
  useStore(indexedDbStore(new IDBFactory(), memoryStorage()));
  const [{ id }] = await call('/projects');
  await assert.rejects(
    call(`/projects/${id}/files`, 'POST', { name: 'x.png', content: 'pas du base64', binary: true }),
  );
  const p = await call('/projects/' + id);
  assert.equal('x.png' in p.assets, false);
});
