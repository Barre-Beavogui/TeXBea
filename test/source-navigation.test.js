import test from 'node:test';
import assert from 'node:assert/strict';
import {findSourceLocation} from '../src/source-navigation.js';

const files = {
  'main.tex': '\\documentclass{article}\n\\begin{document}\n\\section{Résultats}\nLe \\textbf{rendement} est élevé.\n\\end{document}',
  'annexe.tex': 'Autre texte.\nLe rendement est élevé.',
  'refs.bib': 'Le rendement est élevé',
};

test('retrouve un fragment malgré les commandes et accents', () => {
  const loc = findSourceLocation(files, 'resultats');
  assert.equal(loc.file, 'main.tex');
  assert.equal(loc.line, 3);
  assert.equal(files['main.tex'].slice(loc.start, loc.end), 'Résultats');
});

test('gère plusieurs occurrences et ignore les fichiers non .tex', () => {
  assert.equal(findSourceLocation(files, 'Le rendement est élevé', 0).file, 'main.tex');
  const second = findSourceLocation(files, 'Le rendement est élevé', 1);
  assert.deepEqual([second.file, second.line], ['annexe.tex', 2]);
  assert.equal(findSourceLocation(files, 'Le rendement est élevé', 5).file, 'annexe.tex');
});

test('ne correspond pas au milieu d’un mot ni aux fragments trop courts', () => {
  assert.equal(findSourceLocation(files, 'endement'), null);
  assert.equal(findSourceLocation(files, 'L'), null);
});
