import test from 'node:test';
import assert from 'node:assert/strict';
import {
  usesBiblatex,
  biblatexForBibtex,
  bibAccentsToLatex,
  prepareBibliography,
  needsBibliographyPass,
} from '../src/bibliography.js';

test('biblatex : détection', () => {
  assert.ok(usesBiblatex({ 'main.tex': '\\usepackage[style=apa]{biblatex}' }));
  assert.ok(usesBiblatex({ 'main.tex': '\\usepackage{csquotes, biblatex}' }));
  assert.ok(!usesBiblatex({ 'main.tex': '% \\usepackage{biblatex}\n\\usepackage{natbib}' }));
  assert.ok(!usesBiblatex({ 'refs.bib': '\\usepackage{biblatex}' }));
  assert.ok(needsBibliographyPass({ 'main.tex': '\\addbibresource{refs.bib}' }));
  assert.ok(needsBibliographyPass({ 'main.tex': '\\bibliography{refs}' }));
  assert.ok(!needsBibliographyPass({ 'main.tex': 'texte' }));
});

test('biblatex : backend=bibtex dans la copie compilée', () => {
  assert.equal(biblatexForBibtex('\\usepackage{biblatex}'), '\\usepackage[backend=bibtex]{biblatex}');
  assert.equal(
    biblatexForBibtex('\\usepackage[style=authoryear, backend=biber]{biblatex}'),
    '\\usepackage[style=authoryear, backend=bibtex]{biblatex}',
  );
  assert.equal(
    biblatexForBibtex('\\usepackage[french]{babel,biblatex}'),
    '\\usepackage[french]{babel}\\usepackage[french,backend=bibtex]{biblatex}',
  );
  assert.equal(biblatexForBibtex('\\usepackage{natbib}'), '\\usepackage{natbib}');
});

test('biblatex : accents du .bib en commandes LaTeX', () => {
  assert.equal(bibAccentsToLatex('Élodie Müller'), '{\\\'E}lodie M{\\"u}ller');
  assert.equal(bibAccentsToLatex('Françoise Œuvre naïve'), 'Fran{\\c c}oise {\\OE}uvre na{\\"\\i}ve');
  assert.equal(bibAccentsToLatex('@book{x, title={ASCII}}'), '@book{x, title={ASCII}}');
});

test('biblatex : les fichiers du projet ne changent pas', () => {
  const files = { 'main.tex': '\\usepackage{biblatex}', 'refs.bib': 'é', 'fig.png': new Uint8Array(1) };
  const r = prepareBibliography(files);
  assert.equal(files['main.tex'], '\\usepackage{biblatex}');
  assert.equal(r.files['main.tex'], '\\usepackage[backend=bibtex]{biblatex}');
  assert.equal(r.files['refs.bib'], "{\\'e}");
  assert.equal(r.files['fig.png'], files['fig.png']);
  assert.match(r.note, /biber/);
  assert.equal(prepareBibliography({ 'main.tex': '\\bibliography{refs}' }), null);
});
