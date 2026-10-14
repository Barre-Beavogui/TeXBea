import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLatexLog } from '../src/log-parser.js';
import { wordCount } from '../src/word-count.js';
import { latexContext, openEnvironment, projectSymbols } from '../src/latex-completions.js';
import { diffLines, compareFiles } from '../src/diff.js';

const files = { 'main.tex': '', 'chap/intro.tex': '' };
const log = `This is pdfTeX, Version 3.14159265-2.6-1.40.21
(./texbea-entry.tex (./main.tex
LaTeX2e <2020-02-02>
(/usr/share/texlive/article.cls (/usr/share/texlive/size10.clo))
(./chap/intro.tex
! Undefined control sequence.
l.7 Voici \\foo
                (avec parenthèse
Overfull \\hbox (12.3pt too wide) in paragraph at lines 10--12
[]\\OT1/cmr/m/n/10 Texte
)
LaTeX Warning: Reference \`fig:a' on page 1 undefined on input line 15.

Package hyperref Warning: Token not allowed in a PDF string (Unicode):
(hyperref)                removing \`math shift' on input line 20.

! Missing $ inserted.
<inserted text>
                $
l.22 x^
       2
) )`;

test('journal : erreurs, avertissements et boîtes rattachés au bon fichier', () => {
  const r = parseLatexLog(log, files, 'main.tex');
  assert.deepEqual(
    r.errors.map((e) => [e.file, e.line, e.message]),
    [
      ['chap/intro.tex', 7, 'Undefined control sequence.'],
      ['main.tex', 22, 'Missing $ inserted.'],
    ],
  );
  assert.deepEqual(
    r.warnings.map((e) => [e.file, e.line]),
    [
      ['main.tex', 15],
      ['main.tex', 20],
    ],
  );
  assert.match(r.warnings[1].message, /removing `math shift'/);
  assert.deepEqual(
    r.typesetting.map((e) => [e.file, e.line]),
    [['chap/intro.tex', 10]],
  );
});

test('journal : lignes coupées à 79 caractères et format fichier:ligne', () => {
  const long =
    'LaTeX Warning: Citation `une-cle-tres-longue-pour-forcer-le-retour-a-la-ligne-i' +
    '\n' +
    "' on page 1 undefined on input line 9.";
  assert.equal(long.split('\n')[0].length, 79);
  const r = parseLatexLog(long, files);
  assert.equal(r.warnings[0].line, 9);
  assert.equal(
    parseLatexLog('./chap/intro.tex:3: Undefined control sequence.', files).errors[0].file,
    'chap/intro.tex',
  );
});

test('nombre de mots façon Overleaf', () => {
  const doc = {
    'main.tex': String.raw`\documentclass{article}
\title{Ignoré}
\begin{document}
\section{Une introduction}
Bonjour le monde, voici un texte. % commentaire ignoré
On a $x+y$ et \(z\).
\[ a = b \]
\begin{align} c &= d \end{align}
\input{chap}
\begin{figure}\includegraphics{a.png}\caption{Une belle figure}\label{fig:a}\end{figure}
\begin{tabular}{lcr} a & b \end{tabular}
Voir \ref{fig:a} et \href{https://x.org}{le site}.
\end{document}`,
    'chap.tex': 'Deux mots.',
  };
  assert.deepEqual(wordCount(doc, 'main.tex'), {
    words: 6 + 3 + 2 + 2 + 4,
    headers: 1,
    headerWords: 2,
    captionWords: 3,
    mathInline: 2,
    mathDisplay: 2,
    floats: 1,
  });
});

test('contexte d’autocomplétion', () => {
  assert.deepEqual(latexContext('voir \\ref{fig:'), { kind: 'label', prefix: 'fig:' });
  assert.deepEqual(latexContext('\\cite[p.~3]{knuth, lam'), { kind: 'citation', prefix: 'lam' });
  assert.deepEqual(latexContext('\\includegraphics[width=3cm]{fig'), { kind: 'image', prefix: 'fig' });
  assert.deepEqual(latexContext('\\usepackage[utf8]{inputenc,ams'), { kind: 'package', prefix: 'ams' });
  assert.deepEqual(latexContext('\\begin{ite'), { kind: 'begin', prefix: 'ite' });
  assert.deepEqual(latexContext('texte \\sec'), { kind: 'command', prefix: 'sec' });
  assert.equal(latexContext('texte simple'), null);
  assert.equal(openEnvironment('\\begin{figure}\\begin{center}\\end{center}'), 'figure');
});

test('symboles du projet', () => {
  const s = projectSymbols(
    {
      'main.tex': '\\label{eq:1} % \\label{cache}\n\\newcommand{\\R}{\\mathbb{R}}\\bibitem{local}',
      'refs.bib': '@article{knuth84,\n title={x}}\n@book{ lamport ,}',
    },
    { 'img/a.png': 'AAAA' },
  );
  assert.deepEqual(s.labels, ['eq:1']);
  assert.deepEqual(s.citations.sort(), ['knuth84', 'lamport', 'local']);
  assert.deepEqual(s.userCommands, ['R']);
  assert.deepEqual(s.images, ['img/a.png']);
  assert.deepEqual(s.bibFiles, ['refs']);
  assert.deepEqual(s.texFiles, ['main']);
});

test('comparaison de versions', () => {
  const d = diffLines('a\nb\nc\nd', 'a\nB\nc\nd\ne');
  assert.deepEqual(
    d.map((l) => l.type[0] + l.text),
    ['sa', 'db', 'aB', 'sc', 'sd', 'ae'],
  );
  assert.deepEqual(
    d.find((l) => l.text === 'B'),
    { type: 'add', text: 'B', newLine: 2 },
  );
  assert.deepEqual(compareFiles({ 'a.tex': 'x', 'b.tex': 'y' }, { 'a.tex': 'x\nz', 'c.tex': '1\n2' }), [
    { name: 'a.tex', status: 'changed', added: 1, removed: 0 },
    { name: 'b.tex', status: 'removed', added: 0, removed: 1 },
    { name: 'c.tex', status: 'added', added: 2, removed: 0 },
  ]);
});
