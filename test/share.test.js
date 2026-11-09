import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import {
  shareLink,
  replyLink,
  readHash,
  mergeComments,
  commentLine,
  cleanComment,
  pack,
  unpack,
} from '../src/share.js';
import { indexedDbStore } from '../src/browser-store.js';
import { demoApi, useStore } from '../src/demo-api.js';

const call = (path, method = 'GET', body) => demoApi(path, { method, body: body && JSON.stringify(body) });
const project = {
  id: 'p1',
  name: 'Thèse',
  main: 'main.tex',
  compiler: 'xelatex',
  files: { 'main.tex': '\\documentclass{article}\n\\begin{document}\nBonjour é\n\\end{document}' },
  assets: { 'logo.png': 'iVBORw0KGgo=', 'big.png': 'A'.repeat(200_000) },
  comments: [
    { id: 'c1', file: 'main.tex', line: 3, quote: 'Bonjour', text: 'Plus formel ?', author: 'Awa', at: '2026-11-09' },
  ],
};

test('partage : le lien contient sources, petites images et commentaires', async () => {
  const link = await shareLink(project, 'https://x.test/TeXBea/');
  assert.ok(link.url.startsWith('https://x.test/TeXBea/#partage='));
  assert.deepEqual(link.missing, ['big.png']);
  assert.ok(link.length < 2000, 'compressé');
  const r = await readHash(new URL(link.url).hash);
  assert.equal(r.kind, 'share');
  assert.equal(r.id, 'p1');
  assert.equal(r.project.files['main.tex'], project.files['main.tex']);
  assert.equal(r.project.assets['logo.png'], 'iVBORw0KGgo=');
  assert.deepEqual(r.project.missing, ['big.png']);
  assert.equal(r.project.compiler, 'xelatex');
  assert.equal(r.comments[0].text, 'Plus formel ?');
});

test('partage : liens abîmés ou dangereux refusés', async () => {
  assert.equal(await readHash('#autre=1'), null);
  await assert.rejects(readHash('#partage=pas-du-tout'), /abîmé/);
  const evil = await pack({ v: 1, name: 'x', main: 'main.tex', files: { '../main.tex': 'x' } });
  await assert.rejects(readHash('#partage=' + evil));
  assert.deepEqual(await unpack(await pack({ a: 'é' })), { a: 'é' });
});

test('commentaires : nettoyage, fusion sans doublon, position suivie', () => {
  assert.equal(cleanComment({ text: '  ' }), null);
  assert.equal(cleanComment({ text: 'ok', file: '../x' }).file, '');
  const a = [{ id: '1', text: 'a', file: 'm.tex', line: 1 }];
  const m = mergeComments(a, [
    { id: '1', text: 'a', resolved: true },
    { id: '2', text: 'b', file: 'm.tex', line: 2 },
  ]);
  assert.equal(m.added, 1);
  assert.equal(m.comments.length, 2);
  assert.equal(m.comments[0].resolved, true);
  // Deux lignes ajoutées au-dessus : le commentaire suit son texte.
  assert.equal(commentLine('x\ny\nA\nBonjour', { line: 2, quote: 'Bonjour' }), 4);
  assert.equal(commentLine('a\nb', { line: 9, quote: 'disparu' }), 2);
});

test('commentaires : aller-retour auteur → relecteur → auteur', async () => {
  useStore(indexedDbStore(new IDBFactory(), { getItem: () => null, removeItem() {} }));
  const [{ id }] = await call('/projects');
  let r = await call(`/projects/${id}/comments`, 'POST', {
    file: 'main.tex',
    line: 2,
    quote: 'x',
    text: 'À revoir',
    author: 'Moi',
  });
  assert.equal(r.comments.length, 1);
  const p = await call('/projects/' + id);
  const shared = await readHash(new URL((await shareLink(p, 'https://x.test/')).url).hash);
  const reviewer = { id: 'r1', file: 'main.tex', line: 5, text: 'Bien', author: 'Awa', at: '2026-11-09' };
  const back = await readHash(new URL(await replyLink(shared, [reviewer], 'https://x.test/')).hash);
  assert.equal(back.kind, 'reply');
  assert.equal(back.id, id);
  r = await call(`/projects/${id}/comments/merge`, 'POST', { comments: back.comments });
  assert.equal(r.added, 1);
  r = await call(`/projects/${id}/comments/merge`, 'POST', { comments: back.comments });
  assert.equal(r.added, 0);
  const cid = r.comments[0].id;
  r = await call(`/projects/${id}/comments/${cid}`, 'PATCH', { resolved: true });
  assert.equal(r.comments[0].resolved, true);
  r = await call(`/projects/${id}/comments/${cid}`, 'DELETE');
  assert.equal(r.comments.length, 1);
  await assert.rejects(call(`/projects/${id}/comments`, 'POST', { text: ' ' }), /vide/);
});
