import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseLatexTable,
  buildLatexTable,
  parseDelimitedTable,
  buildMatrixLatex,
  buildFigureLatex,
  renderMathPreview,
} from '../src/visual-tools.js';
import {
  findTrackedChanges,
  resolveTrackedChange,
  resolveAllTrackedChanges,
  wrapTrackedChange,
  ensureChangesPreamble,
  diffHunks,
  revertDiffHunk,
} from '../src/track-changes.js';
import {
  classifyBibInput,
  makeCitationKey,
  buildBibtexEntry,
  parseArxivAtom,
  formatCrossrefWork,
  appendBibEntry,
  lookupBibliography,
  existingBibKeys,
} from '../src/bib-import.js';

test('visual-tools : construction et lecture aller-retour d’un tableau LaTeX', () => {
  const latex = buildLatexTable({
    rows: [
      ['Grandeur', 'Valeur'],
      ['Tension', '230 V'],
    ],
    aligns: ['l', 'r'],
    style: 'booktabs',
    header: true,
    caption: 'Mesures électriques',
    label: 'mesures',
    wrapped: true,
  });
  assert.match(latex, /\\toprule/);
  assert.match(latex, /\\midrule/);
  assert.match(latex, /\\bottomrule/);
  assert.match(latex, /\\textbf\{Grandeur\} & \\textbf\{Valeur\}/);
  assert.match(latex, /\\label\{tab:mesures\}/);

  const parsed = parseLatexTable(latex);
  assert.ok(parsed);
  assert.equal(parsed.style, 'booktabs');
  assert.equal(parsed.caption, 'Mesures électriques');
  assert.equal(parsed.label, 'mesures');
  assert.deepEqual(parsed.aligns, ['l', 'r']);
  assert.deepEqual(parsed.rows, [
    ['Grandeur', 'Valeur'],
    ['Tension', '230 V'],
  ]);
});

test('visual-tools : collage CSV / TSV et aperçu mathématique en direct', () => {
  const grid = parseDelimitedTable('Nom\tScore\nAlice\t95\nBob\t88');
  assert.deepEqual(grid, [
    ['Nom', 'Score'],
    ['Alice', '95'],
    ['Bob', '88'],
  ]);

  const mat = buildMatrixLatex(
    [
      ['1', '2'],
      ['3', '4'],
    ],
    'bmatrix',
  );
  assert.match(mat, /\\begin\{bmatrix\}/);
  assert.match(mat, /1 & 2 \\\\/);

  const fig = buildFigureLatex({ file: 'courbe.png', caption: 'Résultat', label: 'courbe' });
  assert.match(fig, /\\includegraphics\[width=0\.8\\linewidth\]\{courbe\.png\}/);
  assert.match(fig, /\\label\{fig:courbe\}/);

  const html = renderMathPreview('\\frac{\\alpha + \\beta}{2} = \\sqrt{x^2}');
  assert.match(html, /math-frac/);
  assert.match(html, /α/);
  assert.match(html, /β/);
  assert.match(html, /√/);
});

test('track-changes : détection, acceptation et refus des marques \\added, \\deleted et \\replaced', () => {
  const src =
    'Voici \\added[Barre]{un nouveau mot} et \\deleted{un ancien} ainsi que \\replaced{le bon}{le mauvais} texte.';
  const list = findTrackedChanges({ 'main.tex': src });
  assert.equal(list.length, 3);
  assert.equal(list[0].kind, 'added');
  assert.equal(list[0].author, 'Barre');
  assert.equal(list[1].kind, 'deleted');
  assert.equal(list[2].kind, 'replaced');

  const acceptedOne = resolveTrackedChange(src, list[0], 'accept');
  assert.match(acceptedOne, /^Voici un nouveau mot et \\deleted/);

  const allAccepted = resolveAllTrackedChanges(src, 'accept');
  assert.equal(allAccepted, 'Voici un nouveau mot et  ainsi que le bon texte.');

  const allRejected = resolveAllTrackedChanges(src, 'reject');
  assert.equal(allRejected, 'Voici  et un ancien ainsi que le mauvais texte.');
});

test('track-changes : préambule et révision par blocs (diffHunks)', () => {
  const doc = '\\documentclass{article}\n\\begin{document}\nBonjour\n\\end{document}';
  const withPreamble = ensureChangesPreamble(doc);
  assert.match(withPreamble, /\\providecommand\{\\added\}/);
  assert.equal(ensureChangesPreamble(withPreamble), withPreamble);

  assert.equal(wrapTrackedChange('ancien', 'replaced', 'nouveau', 'Alice'), '\\replaced[Alice]{nouveau}{ancien}');

  const oldText = 'Ligne 1\nLigne 2\nLigne 3';
  const newText = 'Ligne 1\nLigne 2 modifiée\nLigne 3';
  const hunks = diffHunks(oldText, newText);
  assert.equal(hunks.length, 1);
  assert.deepEqual(hunks[0].removed, ['Ligne 2']);
  assert.deepEqual(hunks[0].added, ['Ligne 2 modifiée']);
  assert.equal(revertDiffHunk(oldText, newText, 0), oldText);
});

test('bib-import : classification DOI / arXiv / BibTeX, génération de clé et import', async () => {
  assert.deepEqual(classifyBibInput('https://doi.org/10.1038/nature14539'), {
    kind: 'doi',
    value: '10.1038/nature14539',
  });
  assert.deepEqual(classifyBibInput('arXiv:1706.03762v5'), { kind: 'arxiv', value: '1706.03762' });
  assert.equal(classifyBibInput('@article{k, title={T}}').kind, 'bibtex');
  assert.equal(classifyBibInput('Attention is all you need').kind, 'query');

  const keys = new Set(['vaswani2017attention']);
  const key2 = makeCitationKey(
    { author: 'Ashish Vaswani and Noam Shazeer', year: '2017', title: 'Attention Is All You Need' },
    keys,
  );
  assert.equal(key2, 'vaswani2017attentiona');

  const atomXml = `<feed><entry>
    <id>http://arxiv.org/abs/1706.03762v1</id>
    <published>2017-06-12T00:00:00Z</published>
    <title>Attention Is All You Need</title>
    <author><name>Ashish Vaswani</name></author>
    <arxiv:primary_category term="cs.CL"/>
  </entry></feed>`;
  const arxivEntries = parseArxivAtom(atomXml);
  assert.equal(arxivEntries.length, 1);
  assert.equal(arxivEntries[0].key, 'vaswani2017attention');
  assert.match(arxivEntries[0].bibtex, /eprint = \{1706\.03762\}/);

  const crossref = formatCrossrefWork({
    type: 'journal-article',
    title: ['Deep Learning'],
    author: [{ family: 'LeCun', given: 'Yann' }],
    published: { 'date-parts': [[2015]] },
    'container-title': ['Nature'],
    DOI: '10.1038/nature14539',
  });
  assert.equal(crossref.key, 'lecun2015deep');
  assert.match(crossref.bibtex, /journal = \{Nature\}/);

  const firstAdd = appendBibEntry('% Bib\n', crossref.bibtex);
  assert.equal(firstAdd.duplicate, false);
  assert.ok(existingBibKeys(firstAdd.content).has('lecun2015deep'));

  const dupAdd = appendBibEntry(firstAdd.content, crossref.bibtex);
  assert.equal(dupAdd.duplicate, true);

  const fetched = await lookupBibliography('arXiv:1706.03762', new Set(), async () => ({
    ok: true,
    text: async () => atomXml,
  }));
  assert.equal(fetched[0].key, 'vaswani2017attention');

  const manual = buildBibtexEntry({ type: 'book', author: 'Knuth, Donald', title: 'The TeXbook', year: '1984' });
  assert.equal(manual.key, 'knuth1984texbook');
});
