import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { safePath, validateProject, importProject, templates } from '../src/project-tools.js';

test('safePath accepte les chemins de projet usuels', () => {
  for (const p of ['main.tex', 'chapitres/intro.tex', 'figures/schéma-1.png', 'refs.bib']) assert.ok(safePath(p), p);
});

test('safePath refuse les chemins dangereux', () => {
  for (const p of [
    '../main.tex',
    'a/../b.tex',
    '/main.tex',
    '.env',
    'a//b.tex',
    '__proto__',
    'x/constructor',
    'a\\b.tex',
    'x'.repeat(181),
    42,
  ])
    assert.equal(safePath(p), false, String(p));
});

test('validateProject trouve le fichier principal', () => {
  assert.equal(validateProject({ files: { 'main.tex': 'x' } }).main, 'main.tex');
  assert.equal(validateProject({ files: { 'a.tex': 'x', 'doc.tex': '\\documentclass{article}' } }).main, 'doc.tex');
  assert.throws(() => validateProject({ files: { 'notes.txt': 'x' } }), /fichier principal/);
});

test('validateProject applique les limites de taille et de nombre', () => {
  const files = { 'main.tex': 'x' };
  for (let i = 0; i < 200; i++) files[`f${i}.tex`] = '';
  assert.throws(() => validateProject({ files }), /trop volumineux/);
  assert.throws(() => validateProject({ files: { 'main.tex': 'x'.repeat(3_000_001) } }), /trop volumineux/);
});

test('validateProject refuse un Base64 invalide ou un doublon source/image', () => {
  assert.throws(
    () => validateProject({ files: { 'main.tex': 'x' }, assets: { 'a.png': 'pas du base64!' } }),
    /Image invalide/,
  );
  assert.throws(
    () => validateProject({ files: { 'main.tex': 'x' }, assets: { 'main.tex': 'AAAA' } }),
    /Image invalide/,
  );
  assert.deepEqual(validateProject({ files: { 'main.tex': 'x' }, assets: { 'a.png': 'AAAA' } }).assets, {
    'a.png': 'AAAA',
  });
});

test('les modèles sont des projets valides', () => {
  for (const [key, t] of Object.entries(templates))
    assert.equal(validateProject({ files: { 'main.tex': t.source } }).main, 'main.tex', key);
});

async function zipFile(entries, name = 'projet.zip') {
  const zip = new JSZip();
  for (const [n, c] of Object.entries(entries)) zip.file(n, c);
  return new File([await zip.generateAsync({ type: 'uint8array' })], name);
}

test('importProject retire le dossier racine commun et lit les métadonnées', async () => {
  const file = await zipFile({
    'these/main.tex': '\\documentclass{article}',
    'these/chap/intro.tex': 'Intro',
    'these/fig.png': 'png',
    'these/.texbea/project.json': JSON.stringify({ name: 'Ma thèse', main: 'main.tex' }),
    '__MACOSX/these/._main.tex': 'junk',
  });
  const p = await importProject(file);
  assert.equal(p.name, 'Ma thèse');
  assert.equal(p.main, 'main.tex');
  assert.deepEqual(Object.keys(p.files).sort(), ['chap/intro.tex', 'main.tex']);
  assert.deepEqual(Object.keys(p.assets), ['fig.png']);
});

test('importProject refuse les chemins hors projet et formats inconnus', async () => {
  await assert.rejects(importProject(await zipFile({ 'main.tex': 'x', '../evil.tex': 'x' })), /Chemin non autorisé/);
  await assert.rejects(importProject(await zipFile({ 'main.tex': 'x', 'run.sh': 'x' })), /Format non pris en charge/);
  await assert.rejects(importProject(new File(['x'], 'doc.docx')), /\.tex ou \.zip/);
});

test('importProject accepte un .tex seul', async () => {
  const p = await importProject(new File(['\\documentclass{article}'], 'rapport.tex'));
  assert.equal(p.name, 'rapport');
  assert.equal(p.main, 'rapport.tex');
});
