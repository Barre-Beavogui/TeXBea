// Data and pure helpers for LaTeX autocompletion (commands, environments, labels, citations, files, packages).
// Snippets use CodeMirror's syntax: ${} marks a field, ${name} a named placeholder.

export const commands = [
  ['section', '\\section{${titre}}', 'Section'],
  ['section*', '\\section*{${titre}}', 'Section non numérotée'],
  ['subsection', '\\subsection{${titre}}', 'Sous-section'],
  ['subsubsection', '\\subsubsection{${titre}}', 'Sous-sous-section'],
  ['chapter', '\\chapter{${titre}}', 'Chapitre'],
  ['paragraph', '\\paragraph{${titre}}', 'Paragraphe'],
  ['part', '\\part{${titre}}', 'Partie'],
  ['textbf', '\\textbf{${}}', 'Gras'],
  ['textit', '\\textit{${}}', 'Italique'],
  ['emph', '\\emph{${}}', 'Mise en valeur'],
  ['underline', '\\underline{${}}', 'Souligné'],
  ['texttt', '\\texttt{${}}', 'Machine à écrire'],
  ['textsc', '\\textsc{${}}', 'Petites capitales'],
  ['textcolor', '\\textcolor{${couleur}}{${texte}}', 'Couleur (xcolor)'],
  ['footnote', '\\footnote{${}}', 'Note de bas de page'],
  ['label', '\\label{${}}', 'Étiquette'],
  ['ref', '\\ref{${}}', 'Référence'],
  ['eqref', '\\eqref{${}}', 'Référence d’équation'],
  ['pageref', '\\pageref{${}}', 'Page d’une étiquette'],
  ['cite', '\\cite{${}}', 'Citation'],
  ['citep', '\\citep{${}}', 'Citation (natbib)'],
  ['citet', '\\citet{${}}', 'Citation (natbib)'],
  ['href', '\\href{${url}}{${texte}}', 'Lien (hyperref)'],
  ['url', '\\url{${}}', 'Adresse web'],
  ['includegraphics', '\\includegraphics[width=${0.8}\\linewidth]{${fichier}}', 'Image'],
  ['input', '\\input{${fichier}}', 'Inclure un fichier'],
  ['include', '\\include{${fichier}}', 'Inclure un chapitre'],
  ['usepackage', '\\usepackage{${}}', 'Paquet'],
  ['documentclass', '\\documentclass{${article}}', 'Classe du document'],
  ['title', '\\title{${}}', 'Titre'],
  ['author', '\\author{${}}', 'Auteur'],
  ['date', '\\date{${\\today}}', 'Date'],
  ['maketitle', '\\maketitle', 'Afficher le titre'],
  ['tableofcontents', '\\tableofcontents', 'Table des matières'],
  ['listoffigures', '\\listoffigures', 'Liste des figures'],
  ['listoftables', '\\listoftables', 'Liste des tableaux'],
  ['caption', '\\caption{${}}', 'Légende'],
  ['centering', '\\centering', 'Centrer'],
  ['item', '\\item ${}', 'Élément de liste'],
  ['newpage', '\\newpage', 'Nouvelle page'],
  ['clearpage', '\\clearpage', 'Vider les flottants'],
  ['newline', '\\newline', 'Retour à la ligne'],
  ['noindent', '\\noindent', 'Sans alinéa'],
  ['vspace', '\\vspace{${1em}}', 'Espace vertical'],
  ['hspace', '\\hspace{${1em}}', 'Espace horizontal'],
  ['bibliography', '\\bibliography{${references}}', 'Bibliographie BibTeX'],
  ['bibliographystyle', '\\bibliographystyle{${plain}}', 'Style BibTeX'],
  ['newcommand', '\\newcommand{\\${nom}}{${définition}}', 'Nouvelle commande'],
  ['renewcommand', '\\renewcommand{\\${nom}}{${définition}}', 'Redéfinir'],
  ['frac', '\\frac{${num}}{${den}}', 'Fraction'],
  ['dfrac', '\\dfrac{${num}}{${den}}', 'Fraction (display)'],
  ['sqrt', '\\sqrt{${}}', 'Racine'],
  ['sum', '\\sum_{${i=1}}^{${n}}', 'Somme'],
  ['prod', '\\prod_{${i=1}}^{${n}}', 'Produit'],
  ['int', '\\int_{${a}}^{${b}}', 'Intégrale'],
  ['iint', '\\iint', 'Intégrale double'],
  ['oint', '\\oint', 'Intégrale curviligne'],
  ['lim', '\\lim_{${x \\to \\infty}}', 'Limite'],
  ['partial', '\\partial', 'Dérivée partielle'],
  ['infty', '\\infty', 'Infini'],
  ['mathbb', '\\mathbb{${R}}', 'Ensemble (amssymb)'],
  ['mathcal', '\\mathcal{${}}', 'Calligraphique'],
  ['mathrm', '\\mathrm{${}}', 'Romain'],
  ['mathbf', '\\mathbf{${}}', 'Gras mathématique'],
  ['vec', '\\vec{${}}', 'Vecteur'],
  ['overline', '\\overline{${}}', 'Barre'],
  ['hat', '\\hat{${}}', 'Chapeau'],
  ['left(', '\\left( ${} \\right)', 'Parenthèses adaptées'],
  ['left[', '\\left[ ${} \\right]', 'Crochets adaptés'],
  ['text', '\\text{${}}', 'Texte en mode math'],
  ['cdot', '\\cdot', 'Point médian'],
  ['times', '\\times', 'Multiplication'],
  ['leq', '\\leq', '≤'],
  ['geq', '\\geq', '≥'],
  ['neq', '\\neq', '≠'],
  ['approx', '\\approx', '≈'],
  ['in', '\\in', '∈'],
  ['forall', '\\forall', '∀'],
  ['exists', '\\exists', '∃'],
  ['rightarrow', '\\rightarrow', '→'],
  ['Rightarrow', '\\Rightarrow', '⇒'],
  ['Leftrightarrow', '\\Leftrightarrow', '⇔'],
  ['alpha', '\\alpha', 'α'],
  ['beta', '\\beta', 'β'],
  ['gamma', '\\gamma', 'γ'],
  ['delta', '\\delta', 'δ'],
  ['epsilon', '\\epsilon', 'ε'],
  ['varepsilon', '\\varepsilon', 'ε'],
  ['theta', '\\theta', 'θ'],
  ['lambda', '\\lambda', 'λ'],
  ['mu', '\\mu', 'μ'],
  ['pi', '\\pi', 'π'],
  ['rho', '\\rho', 'ρ'],
  ['sigma', '\\sigma', 'σ'],
  ['tau', '\\tau', 'τ'],
  ['phi', '\\phi', 'φ'],
  ['varphi', '\\varphi', 'φ'],
  ['omega', '\\omega', 'ω'],
  ['Omega', '\\Omega', 'Ω'],
  ['Delta', '\\Delta', 'Δ'],
  ['Sigma', '\\Sigma', 'Σ'],
  ['hline', '\\hline', 'Ligne de tableau'],
  ['multicolumn', '\\multicolumn{${colonnes}}{${c}}{${texte}}', 'Fusion de colonnes'],
  ['textwidth', '\\textwidth', 'Largeur du texte'],
  ['linewidth', '\\linewidth', 'Largeur de ligne'],
  ['today', '\\today', 'Date du jour'],
  ['LaTeX', '\\LaTeX', 'Logo LaTeX'],
].map(([name, snippet, detail]) => ({ name, snippet, detail }));

export const environments = [
  ['itemize', '\\item ${}'],
  ['enumerate', '\\item ${}'],
  ['description', '\\item[${terme}] ${}'],
  ['equation', '${}'],
  ['equation*', '${}'],
  ['align', '${} &= ${} \\\\'],
  ['align*', '${} &= ${} \\\\'],
  ['gather', '${}'],
  ['multline', '${}'],
  ['cases', '${} & \\text{si } ${} \\\\'],
  ['matrix', '${}'],
  ['pmatrix', '${a} & ${b} \\\\ ${c} & ${d}'],
  ['bmatrix', '${a} & ${b} \\\\ ${c} & ${d}'],
  [
    'figure',
    '\\centering\n\t\\includegraphics[width=0.8\\linewidth]{${fichier}}\n\t\\caption{${légende}}\n\t\\label{fig:${}}',
    '[htbp]',
  ],
  [
    'table',
    '\\centering\n\t\\caption{${légende}}\n\t\\label{tab:${}}\n\t\\begin{tabular}{${ll}}\n\t\t${} \\\\\n\t\\end{tabular}',
    '[htbp]',
  ],
  ['tabular', '${} \\\\', '{${ll}}'],
  ['center', '${}'],
  ['flushleft', '${}'],
  ['flushright', '${}'],
  ['quote', '${}'],
  ['abstract', '${}'],
  ['verbatim', '${}'],
  ['minipage', '${}', '{${0.48}\\linewidth}'],
  ['theorem', '${}'],
  ['lemma', '${}'],
  ['proof', '${}'],
  ['definition', '${}'],
  ['frame', '\\frametitle{${titre}}\n\t${}'],
  ['columns', '\\column{0.5\\textwidth}\n\t${}'],
  ['tikzpicture', '${}'],
  ['thebibliography', '\\bibitem{${clé}} ${}', '{99}'],
  ['document', '${}'],
].map(([name, body, args = '']) => ({ name, body, args }));

export const packages = [
  'amsmath',
  'amssymb',
  'amsthm',
  'graphicx',
  'hyperref',
  'geometry',
  'babel',
  'inputenc',
  'fontenc',
  'xcolor',
  'tikz',
  'pgfplots',
  'booktabs',
  'tabularx',
  'longtable',
  'multirow',
  'array',
  'siunitx',
  'float',
  'caption',
  'subcaption',
  'wrapfig',
  'enumitem',
  'fancyhdr',
  'titlesec',
  'listings',
  'minted',
  'natbib',
  'csquotes',
  'microtype',
  'lmodern',
  'setspace',
  'parskip',
  'url',
  'cleveref',
  'mathtools',
  'physics',
  'chemfig',
  'mhchem',
  'algorithm',
  'algpseudocode',
  'lipsum',
  'multicol',
  'pdfpages',
  'eurosym',
  'textcomp',
  'tcolorbox',
];

const IMAGE = /\.(png|jpe?g|pdf|eps)$/i;

// Everything the project defines that can be referenced: labels, BibTeX keys, files, custom commands.
export function projectSymbols(files = {}, assets = {}) {
  const labels = new Set(),
    citations = new Set(),
    userCommands = new Set();
  for (const [name, text] of Object.entries(files)) {
    if (name.endsWith('.tex') || name.endsWith('.sty')) {
      const clean = text.replace(/(?<!\\)%[^\n]*/g, '');
      for (const m of clean.matchAll(/\\label\{([^}]+)\}/g)) labels.add(m[1]);
      for (const m of clean.matchAll(/\\bibitem(?:\[[^\]]*\])?\{([^}]+)\}/g)) citations.add(m[1]);
      for (const m of clean.matchAll(/\\(?:re)?newcommand\*?\{?\\([a-zA-Z@]+)\}?/g)) userCommands.add(m[1]);
      for (const m of clean.matchAll(/\\DeclareMathOperator\*?\{?\\([a-zA-Z@]+)\}?/g)) userCommands.add(m[1]);
    }
    if (name.endsWith('.bib')) for (const m of text.matchAll(/@\w+\s*\{\s*([^,\s]+)\s*,/g)) citations.add(m[1]);
  }
  const all = [...Object.keys(files), ...Object.keys(assets)];
  return {
    labels: [...labels],
    citations: [...citations],
    userCommands: [...userCommands],
    texFiles: all.filter((n) => n.endsWith('.tex')).map((n) => n.replace(/\.tex$/, '')),
    images: all.filter((n) => IMAGE.test(n)),
    bibFiles: all.filter((n) => n.endsWith('.bib')).map((n) => n.replace(/\.bib$/, '')),
  };
}

// Which kind of completion fits the text just before the cursor. `prefix` is what the user has typed so far.
export function latexContext(before) {
  const rules = [
    ['label', /\\(?:ref|eqref|autoref|cref|Cref|pageref|nameref|vref)\{([^}]*)$/],
    ['citation', /\\(?:[a-zA-Z]*cite[a-zA-Z]*|nocite)\*?(?:\[[^\]]*\])*\{(?:[^}]*,\s*)?([^},\s]*)$/],
    ['texFile', /\\(?:input|include|subfile)\{([^}]*)$/],
    ['image', /\\includegraphics\*?(?:\[[^\]]*\])?\{([^}]*)$/],
    ['bibFile', /\\(?:bibliography|addbibresource)\{(?:[^}]*,)?([^},]*)$/],
    ['package', /\\(?:usepackage|RequirePackage)(?:\[[^\]]*\])?\{(?:[^}]*,\s*)?([^},\s]*)$/],
    ['begin', /\\begin\{([a-zA-Z*]*)$/],
    ['end', /\\end\{([a-zA-Z*]*)$/],
    ['command', /\\([a-zA-Z@]*\*?)$/],
  ];
  for (const [kind, re] of rules) {
    const m = before.match(re);
    if (m) return { kind, prefix: m[1] };
  }
  return null;
}

// The innermost environment still open before the cursor, to offer it first after \end{.
export function openEnvironment(before) {
  const stack = [];
  for (const m of before.replace(/(?<!\\)%[^\n]*/g, '').matchAll(/\\(begin|end)\{([^}]+)\}/g)) {
    if (m[1] === 'begin') stack.push(m[2]);
    else if (stack[stack.length - 1] === m[2]) stack.pop();
  }
  return stack[stack.length - 1] || null;
}
