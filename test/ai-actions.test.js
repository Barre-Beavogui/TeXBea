import test from 'node:test';
import assert from 'node:assert/strict';
import {
  aiActions,
  actionById,
  paragraphAt,
  lineWindow,
  targetFor,
  buildMessages,
  extractCode,
  fitReplacement,
  diffWords,
  photoPrompt,
  documentBody,
} from '../src/ai-actions.js';

const doc = 'Titre\n\nPremier paragraphe\nsur deux lignes.\n\nSecond paragraphe.';

test('le paragraphe sous le curseur est la cible quand rien n’est sélectionné', () => {
  const pos = doc.indexOf('deux');
  const { from, to } = paragraphAt(doc, pos);
  assert.equal(doc.slice(from, to), 'Premier paragraphe\nsur deux lignes.');
  assert.equal(doc.slice(...Object.values(paragraphAt(doc, doc.length))), 'Second paragraphe.');
  const tex = '\\section{Intro}\nUne phrase\nqui continue.\n\\begin{itemize}\n\\item Un point\n\\end{itemize}';
  const para = paragraphAt(tex, tex.indexOf('phrase'));
  assert.equal(tex.slice(para.from, para.to), 'Une phrase\nqui continue.');
  const item = paragraphAt(tex, tex.indexOf('point'));
  assert.equal(tex.slice(item.from, item.to), '\\item Un point');
  assert.deepEqual(targetFor(doc, { start: 0, end: 5 }, actionById('spelling')), { from: 0, to: 5 });
  assert.deepEqual(targetFor(doc, { start: 3, end: 3 }, actionById('continue')), { from: 3, to: 3 });
});

test('fenêtre de lignes autour d’une erreur', () => {
  const src = 'a\nb\nc\nd\ne\nf';
  const w = lineWindow(src, 4, 1);
  assert.equal(src.slice(w.from, w.to), 'c\nd\ne');
  assert.deepEqual([w.firstLine, w.lastLine], [3, 5]);
  const top = lineWindow(src, 1, 2);
  assert.equal(src.slice(top.from, top.to), 'a\nb\nc');
});

test('le code est extrait de la réponse, même pendant le streaming', () => {
  assert.equal(extractCode('Voici :\n```latex\n\\textbf{ok}\n```\nFin'), '\\textbf{ok}');
  assert.equal(extractCode('```latex\nEn cours'), 'En cours');
  assert.equal(extractCode('Voici la version corrigée :\nTexte corrigé.'), 'Texte corrigé.');
});

test('la correction garde les espaces autour du passage', () => {
  assert.equal(fitReplacement('\n  Texte fautif.\n\n', 'Texte correct.'), '\n  Texte correct.\n\n');
  assert.equal(fitReplacement('fin', 'suite', 'insert'), ' suite');
  assert.equal(fitReplacement('fin ', 'suite', 'insert'), 'suite');
});

test('consignes : passage, erreur et consigne libre', () => {
  const [system, user] = buildMessages({ action: actionById('fix-error'), text: '\\textbf{x', error: 'Missing }' });
  assert.match(system.content, /```latex/);
  assert.match(user.content, /PASSAGE À MODIFIER/);
  assert.match(user.content, /Missing \}/);
  const custom = buildMessages({ action: actionById('custom'), instruction: 'mets au passé', text: 'Il mange.' });
  assert.match(custom[1].content, /TÂCHE : mets au passé/);
  assert.match(buildMessages({ action: actionById('continue'), text: 'Début' })[1].content, /TEXTE À CONTINUER/);
  assert.ok(aiActions.every((a) => a.id === 'custom' || a.task));
});

test('diff par mots pour l’aperçu', () => {
  const parts = diffWords('Les chat mange.', 'Les chats mangent.');
  assert.ok(parts.some((p) => p.type === 'del' && p.text.includes('chat')));
  assert.ok(parts.some((p) => p.type === 'add' && p.text.includes('mangent.')));
  assert.equal(
    parts
      .filter((p) => p.type !== 'del')
      .map((p) => p.text)
      .join(''),
    'Les chats mangent.',
  );
  assert.equal(
    parts
      .filter((p) => p.type !== 'add')
      .map((p) => p.text)
      .join(''),
    'Les chat mange.',
  );
});

test('photo → LaTeX : consigne, corps du document et insertion sur sa propre ligne', () => {
  const action = actionById('photo');
  assert.equal(action.vision, true);
  assert.deepEqual(targetFor('abc', { start: 2, end: 2 }, action), { from: 2, to: 2 });
  assert.match(photoPrompt('seulement le tableau'), /seulement le tableau/);
  assert.equal(
    documentBody('\\documentclass{article}\n\\begin{document}\n\\maketitle\n$x^2$\n\\end{document}'),
    '$x^2$',
  );
  assert.equal(documentBody('$x$'), '$x$');
  assert.equal(fitReplacement('Texte', '$x$', 'block', '\n\\end{abstract}'), '\n$x$');
  assert.equal(fitReplacement('Texte\n', '$x$', 'block', 'Suite'), '$x$\n');
});
