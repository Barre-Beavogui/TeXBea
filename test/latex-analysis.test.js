import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeLatex, documentOutline } from '../src/latex-analysis.js';

const ok =
  '\\documentclass{article}\n\\begin{document}\n% { commentaire\nPrix : 5\\$ et \\{ \\}\n$x^{2}$\n\\end{document}';

test('un document correct ne signale rien', () => {
  assert.deepEqual(analyzeLatex(ok), []);
});

test('accolades déséquilibrées', () => {
  assert.match(analyzeLatex('a\n}')[0].message, /fermante/);
  assert.deepEqual(
    analyzeLatex('a\n\\textbf{b').map((i) => [i.line, /ouvrante/.test(i.message)]),
    [[2, true]],
  );
});

test('environnements mal imbriqués ou non refermés', () => {
  const issues = analyzeLatex('\\begin{itemize}\n\\begin{enumerate}\n\\end{itemize}');
  assert.ok(issues.some((i) => i.line === 3 && /hors séquence.*enumerate/.test(i.message)));
  assert.ok(issues.some((i) => i.line === 1 && /itemize non refermé/.test(i.message)));
});

test('dollar non refermé', () => {
  assert.ok(analyzeLatex('$x').some((i) => /Délimiteur/.test(i.message)));
});

test('fichiers inclus introuvables', () => {
  const src = '\\input{chap/intro}\n\\include{annexe.tex}';
  assert.deepEqual(
    analyzeLatex(src, { 'chap/intro.tex': '' }).map((i) => i.line),
    [2],
  );
});

test('plan du document', () => {
  const out = documentOutline('\\chapter{Début}\n  \\section*{A}\n\\subsection[court]{Long titre}\n% \\section{x}');
  assert.deepEqual(
    out.map((o) => [o.level, o.title, o.line]),
    [
      ['chapter', 'Début', 1],
      ['section', 'A', 2],
      ['subsection', 'Long titre', 3],
    ],
  );
});

test('le plan liste les diapositives Beamer avec leur titre', () => {
  const src = [
    '\\begin{frame}[plain]',
    '  \\titlepage',
    '\\end{frame}',
    '\\section{Résultats}',
    '\\begin{frame}{Chiffres clés}',
    '\\end{frame}',
    '\\begin{frame}<2->[fragile]',
    '  \\frametitle{Code}',
    '\\end{frame}',
    '\\begin{frame}',
    'x',
    '\\end{frame}',
  ].join('\n');
  assert.deepEqual(
    documentOutline(src).map((h) => [h.level, h.title, h.line]),
    [
      ['frame', 'Page de titre', 1],
      ['section', 'Résultats', 4],
      ['frame', 'Chiffres clés', 5],
      ['frame', 'Code', 7],
      ['frame', 'Diapositive', 10],
    ],
  );
});
