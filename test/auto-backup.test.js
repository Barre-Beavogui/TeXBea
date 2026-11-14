import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import {
  AUTO_INTERVAL,
  AUTO_KEEP,
  AUTO_KEY,
  autoFileName,
  changedSince,
  clearFolder,
  folderPermission,
  isAutoBackupDue,
  loadFolder,
  markBackedUp,
  oldAutoFiles,
  saveFolder,
  supportsFolderBackup,
  writeBackupToFolder,
} from '../src/auto-backup.js';
import { backupBlob, readBackup, LAST_BACKUP_KEY } from '../src/backup.js';

const minute = 60_000;
const iso = (ms) => new Date(ms).toISOString();

test('sauvegarde auto : due seulement si quelque chose a changé depuis et que le délai est passé', () => {
  const now = Date.parse('2026-11-14T12:00:00Z');
  const last = iso(now - 30 * minute);
  assert.equal(isAutoBackupDue(null, last, now), false, 'rien n’a changé dans cette session');
  assert.equal(isAutoBackupDue(now - 40 * minute, last, now), false, 'le changement date d’avant la dernière copie');
  assert.equal(isAutoBackupDue(now - minute, iso(now - 5 * minute), now), false, 'dernière copie trop récente');
  assert.equal(isAutoBackupDue(now - minute, last, now), true);
  assert.equal(isAutoBackupDue(now - minute, null, now), true, 'aucune copie auto jusqu’ici');
  assert.equal(
    isAutoBackupDue(now - minute, iso(now - 3 * minute), now, 2 * minute),
    true,
    'délai plus court onglet masqué',
  );
  assert.equal(AUTO_INTERVAL, 10 * minute);
});

test('sauvegarde auto : au lancement, compare avec la date de modification des projets', () => {
  const projects = [{ updatedAt: '2026-11-10T08:00:00Z' }, { updatedAt: '2026-11-12T08:00:00Z' }];
  assert.equal(changedSince(projects, '2026-11-11T00:00:00Z'), true);
  assert.equal(changedSince(projects, '2026-11-13T00:00:00Z'), false);
  assert.equal(changedSince(projects, null), true);
  assert.equal(changedSince([], null), false);
});

test('sauvegarde auto : une copie par jour, les sept plus récentes, jamais un autre fichier du dossier', () => {
  const days = Array.from({ length: 10 }, (_, i) => `TeXBea-auto-2026-11-${String(i + 1).padStart(2, '0')}.zip`);
  const mine = ['these.pdf', 'TeXBea-sauvegarde-2026-11-01.zip', 'TeXBea-auto-copie.zip', 'notes.txt'];
  const old = oldAutoFiles([...mine, ...days]);
  assert.deepEqual(old, days.slice(0, 3).reverse());
  assert.equal(AUTO_KEEP, 7);
  assert.equal(autoFileName(new Date('2026-11-14T23:59:00Z')), 'TeXBea-auto-2026-11-14.zip');
  assert.deepEqual(oldAutoFiles(days.slice(0, 7)), []);
});

// Minimal FileSystemDirectoryHandle: enough for what writeBackupToFolder calls.
function fakeDir(initial = {}) {
  const files = new Map(Object.entries(initial));
  return {
    kind: 'directory',
    name: 'TeXBea-sauvegardes',
    files,
    async getFileHandle(name, { create } = {}) {
      if (!files.has(name) && !create) throw Object.assign(Error('absent'), { name: 'NotFoundError' });
      return {
        kind: 'file',
        async createWritable() {
          let data;
          return {
            async write(b) {
              data = b;
            },
            async close() {
              files.set(name, data);
            },
            async abort() {},
          };
        },
      };
    },
    async removeEntry(name) {
      if (!files.delete(name)) throw Object.assign(Error('absent'), { name: 'NotFoundError' });
    },
    async *entries() {
      for (const name of files.keys()) yield [name, { kind: 'file' }];
    },
  };
}

test('sauvegarde auto : écrit la copie du jour dans le dossier, relisible, et fait le ménage', async () => {
  const projects = [
    { id: 'p1', name: 'Thèse', main: 'main.tex', files: { 'main.tex': '\\documentclass{article}' }, updatedAt: iso(0) },
  ];
  const blob = await backupBlob(projects);
  const dir = fakeDir({
    'TeXBea-auto-2026-10-01.zip': 'x',
    'TeXBea-auto-2026-11-01.zip': 'x',
    'TeXBea-auto-2026-11-02.zip': 'x',
    'TeXBea-auto-2026-11-03.zip': 'x',
    'TeXBea-auto-2026-11-04.zip': 'x',
    'TeXBea-auto-2026-11-05.zip': 'x',
    'TeXBea-auto-2026-11-06.zip': 'x',
    'cours.pdf': 'à moi',
  });
  const name = await writeBackupToFolder(dir, blob, new Date('2026-11-14T10:00:00Z'));
  assert.equal(name, 'TeXBea-auto-2026-11-14.zip');
  assert.equal(dir.files.has('TeXBea-auto-2026-10-01.zip'), false, 'la plus ancienne est partie');
  assert.equal(dir.files.has('TeXBea-auto-2026-11-01.zip'), true, 'les sept plus récentes jours sont gardées');
  assert.equal([...dir.files.keys()].filter((n) => n.startsWith('TeXBea-auto-')).length, 7);
  assert.equal(dir.files.get('cours.pdf'), 'à moi', 'un fichier de l’utilisateur n’est jamais touché');
  const back = await readBackup(dir.files.get(name));
  assert.equal(back.projects.length, 1);
  assert.equal(back.projects[0].name, 'Thèse');
  // Same day again: replaced, not duplicated.
  await writeBackupToFolder(dir, blob, new Date('2026-11-14T18:00:00Z'));
  assert.equal([...dir.files.keys()].filter((n) => n === name).length, 1);
});

test('sauvegarde auto : une écriture interrompue garde la copie précédente', async () => {
  const dir = fakeDir({ 'TeXBea-auto-2026-11-14.zip': 'ancienne' });
  const handle = await dir.getFileHandle('x', { create: true });
  const real = dir.getFileHandle.bind(dir);
  dir.getFileHandle = async (n, o) => ({
    ...(await real(n, o)),
    async createWritable() {
      return {
        async write() {
          throw Error('disque plein');
        },
        async close() {},
        async abort() {},
      };
    },
  });
  await assert.rejects(writeBackupToFolder(dir, new Blob(['neuve']), new Date('2026-11-14T10:00:00Z')), /disque plein/);
  assert.equal(dir.files.get('TeXBea-auto-2026-11-14.zip'), 'ancienne');
  assert.ok(handle);
});

test('sauvegarde auto : le dossier choisi est retrouvé à la visite suivante', async () => {
  const idb = new IDBFactory();
  assert.equal(await loadFolder(idb), null);
  await saveFolder({ kind: 'directory', name: 'Sauvegardes' }, idb);
  assert.equal((await loadFolder(idb)).name, 'Sauvegardes');
  await clearFolder(idb);
  assert.equal(await loadFolder(idb), null);
});

test('sauvegarde auto : permission du dossier, demandée seulement sur ordre', async () => {
  const asked = [];
  const handle = (state) => ({
    queryPermission: async () => state,
    requestPermission: async () => (asked.push(1), 'granted'),
  });
  assert.equal(await folderPermission(handle('granted')), 'granted');
  assert.equal(await folderPermission(handle('prompt')), 'prompt');
  assert.equal(asked.length, 0, 'sans clic, le navigateur n’est pas sollicité');
  assert.equal(await folderPermission(handle('prompt'), true), 'granted');
  assert.equal(asked.length, 1);
  assert.equal(await folderPermission({}), 'denied');
});

test('sauvegarde auto : compte comme une sauvegarde complète pour le rappel, et détection du navigateur', () => {
  const store = new Map();
  const storage = { setItem: (k, v) => store.set(k, v) };
  markBackedUp(new Date('2026-11-14T10:00:00Z'), storage);
  assert.equal(store.get(AUTO_KEY), '2026-11-14T10:00:00.000Z');
  assert.equal(store.get(LAST_BACKUP_KEY), '2026-11-14T10:00:00.000Z');
  assert.equal(supportsFolderBackup({ showDirectoryPicker() {} }), true);
  assert.equal(supportsFolderBackup({}), false);
});
