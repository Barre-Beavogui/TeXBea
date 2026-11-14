import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBib } from '../src/bib-library.js';

test('lit les clés, titres, auteurs et années', () => {
  const list = parseBib(`
@article{knuth84,
  author = {Donald E. Knuth and Leslie Lamport},
  title = {The {\\TeX}book: a "classic"},
  year = 1984,
}
@book{lamport94, title="LaTeX", author="Leslie Lamport", date = {1994-01-01}}
@comment{ignoré}
@string{x = "y"}
`);
  assert.equal(list.length, 2);
  assert.deepEqual(list[0], {
    key: 'knuth84',
    type: 'article',
    title: 'The TeXbook: a "classic"',
    author: 'Donald E. Knuth, Leslie Lamport',
    year: '1984',
  });
  assert.equal(list[1].key, 'lamport94');
  assert.equal(list[1].year, '1994');
  assert.equal(list[1].title, 'LaTeX');
});

test('un fichier vide ou sans entrée donne une liste vide', () => {
  assert.deepEqual(parseBib(''), []);
  assert.deepEqual(parseBib('du texte sans référence'), []);
});
