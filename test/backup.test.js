import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { IDBFactory } from 'fake-indexeddb';
import { buildBackup, readBackup, backupReminder, BACKUP_FILE } from '../src/backup.js';
import { indexedDbStore } from '../src/browser-store.js';
import { demoApi, useStore } from '../src/demo-api.js';

const png = 'iVBORw0KGgo=';
const older = 'AAAA';
const call = (path, method = 'GET', body) => demoApi(path, { method, body: body && JSON.stringify(body) });
const bytes = async (projects) => (await buildBackup(projects)).generateAsync({ type: 'uint8array' });

test('sauvegarde : dossiers lisibles, versions et images, aller-retour', async () => {
  const projects = [
    {
      id: 'a',
      name: 'Thèse / v2',
      main: 'main.tex',
      compiler: 'xelatex',
      updatedAt: '2026-11-01T00:00:00.000Z',
      files: { 'main.tex': '\\documentclass{article}', 'ref.bib': '@book{x}' },
      assets: { 'fig/a.png': png },
      history: [
        {
          id: 'v1',
          at: '2026-10-01',
          label: 'Premier jet',
          main: 'main.tex',
          files: { 'main.tex': 'old' },
          assets: { 'fig/a.png': png, 'b.png': older },
        },
      ],
    },
    {
      id: 'b',
      name: 'Thèse / v2',
      main: 'x.tex',
      deleted: true,
      files: { 'x.tex': '\\documentclass{book}' },
      assets: {},
    },
  ];
  const data = await bytes(projects);
  const zip = await JSZip.loadAsync(data);
  assert.equal(await zip.file('Thèse _ v2/main.tex').async('string'), '\\documentclass{article}');
  assert.ok(zip.file('Thèse _ v2 (2)/x.tex'), 'deux projets du même nom ont deux dossiers');
  assert.equal(await zip.file('Thèse _ v2/fig/a.png').async('base64'), png);
  // L’image identique de la version n’est pas recopiée, l’ancienne image l’est une fois.
  assert.deepEqual(
    Object.keys(zip.files).filter((n) => n.startsWith('.texbea/blobs/') && !zip.files[n].dir),
    ['.texbea/blobs/1'],
  );
  const back = await readBackup(data);
  assert.equal(back.projects.length, 2);
  const [a, b] = back.projects;
  assert.equal(a.compiler, 'xelatex');
  assert.equal(a.files['ref.bib'], '@book{x}');
  assert.equal(a.assets['fig/a.png'], png);
  assert.equal(a.history[0].label, 'Premier jet');
  assert.deepEqual(a.history[0].assets, { 'fig/a.png': png, 'b.png': older });
  assert.equal(b.deleted, true);
});

test('sauvegarde : un ZIP de projet seul ou abîmé est refusé clairement', async () => {
  const zip = new JSZip();
  zip.file('main.tex', 'x');
  await assert.rejects(readBackup(await zip.generateAsync({ type: 'uint8array' })), /Importer/);
  await assert.rejects(readBackup(new Uint8Array([1, 2, 3])), /ZIP/);
  const bad = new JSZip();
  bad.file(
    BACKUP_FILE,
    JSON.stringify({ format: 'texbea-backup', version: 1, projects: [{ folder: 'p', files: ['../x.tex'] }] }),
  );
  await assert.rejects(readBackup(await bad.generateAsync({ type: 'uint8array' })));
});

test('restauration dans le navigateur : versions gardées, pas de doublon au second essai', async () => {
  const idb = new IDBFactory();
  const mem = new Map();
  const legacy = {
    getItem: (k) => mem.get(k) ?? null,
    setItem: (k, v) => mem.set(k, v),
    removeItem: (k) => mem.delete(k),
  };
  useStore(indexedDbStore(idb, legacy));
  const [{ id }] = await call('/projects');
  await call(`/projects/${id}/files`, 'POST', { name: 'fig.png', content: png, binary: true });
  await call(`/projects/${id}/snapshot`, 'POST', { label: 'v1' });
  const all = await call('/backup');
  assert.equal(all[0].history[0].assets['fig.png'], png, 'la sauvegarde reçoit les images des versions');
  const backup = await readBackup(await bytes(all));

  // Navigateur vidé : tout revient, avec les versions.
  useStore(indexedDbStore(new IDBFactory(), legacy));
  await call('/projects');
  await call(`/projects/${(await call('/projects'))[0].id}`, 'PUT', { name: 'Autre' });
  let r = await demoApi('/restore', { method: 'POST', data: { projects: backup.projects } });
  assert.deepEqual(r, { added: 1, skipped: 0 });
  r = await demoApi('/restore', { method: 'POST', data: { projects: backup.projects } });
  assert.deepEqual(r, { added: 0, skipped: 1 });
  const restored = await call('/projects/' + id);
  assert.equal(restored.assets['fig.png'], png);
  assert.equal(restored.history.length, 1);
  assert.equal((await call('/projects')).length, 2);
});

test('rappel de sauvegarde', () => {
  const now = Date.parse('2026-11-20T00:00:00Z');
  const p = [{ updatedAt: '2026-11-10T00:00:00Z' }];
  assert.match(backupReminder(null, p, now), /Aucune/);
  assert.match(backupReminder('2026-11-01T00:00:00Z', p, now), /19 jours/);
  assert.equal(backupReminder('2026-11-11T00:00:00Z', p, now), null, 'rien de changé depuis');
  assert.equal(backupReminder('2026-11-08T00:00:00Z', p, now - 8 * 86_400_000), null, 'sauvegarde récente');
});

test('archive, balises et origine partagée survivent à la sauvegarde', async () => {
  const p = {
    id: 'a1',
    name: 'Rangé',
    main: 'main.tex',
    files: { 'main.tex': '\\documentclass{article}' },
    assets: {},
    archived: true,
    tags: ['Cours'],
    fromShare: true,
    updatedAt: new Date().toISOString(),
  };
  const back = await readBackup(await bytes([p]));
  assert.equal(back.projects[0].archived, true);
  assert.deepEqual(back.projects[0].tags, ['Cours']);
  assert.equal(back.projects[0].fromShare, true);
});
