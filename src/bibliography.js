// Bibliographies in the browser. The SwiftLaTeX engines run BibTeX after each pass, but biber (biblatex's
// default backend) does not exist in WebAssembly. biblatex also works with BibTeX: the compile copy of the
// sources asks for backend=bibtex, and the .bib files get their accents as LaTeX commands, which BibTeX sorts
// and abbreviates correctly. The project's own files are never changed.

const BIBLATEX = /\\(?:usepackage|RequirePackage)\s*(\[[^\]]*\])?\s*\{([^}]*)\}/g;

const listsBiblatex = (packages) => packages.split(',').some((p) => p.trim() === 'biblatex');

export function usesBiblatex(files) {
  return Object.entries(files).some(
    ([name, text]) =>
      /\.(tex|sty|cls)$/i.test(name) && [...stripComments(text).matchAll(BIBLATEX)].some((m) => listsBiblatex(m[2])),
  );
}

export function needsBibliographyPass(files) {
  return Object.entries(files).some(
    ([name, text]) => /\.tex$/i.test(name) && /\\(?:bibliography|addbibresource|printbibliography)\b/.test(text),
  );
}

function stripComments(text) {
  return text.replace(/(^|[^\\])%.*$/gm, '$1');
}

// \usepackage[style=apa,backend=biber]{biblatex} → \usepackage[style=apa,backend=bibtex]{biblatex}
export function biblatexForBibtex(text) {
  return text.replace(BIBLATEX, (all, options, packages) => {
    if (!listsBiblatex(packages)) return all;
    // A line with several packages: biblatex gets its own \usepackage so the option stays its own.
    const others = packages
      .split(',')
      .map((p) => p.trim())
      .filter((p) => p && p !== 'biblatex');
    let opts = options ? options.slice(1, -1) : '';
    if (/\bbackend\s*=/.test(opts)) opts = opts.replace(/\bbackend\s*=\s*[^,\]]*/, 'backend=bibtex');
    else opts = opts.trim() ? `${opts},backend=bibtex` : 'backend=bibtex';
    const cmd = all.startsWith('\\RequirePackage') ? '\\RequirePackage' : '\\usepackage';
    return (others.length ? `${cmd}${options || ''}{${others.join(',')}}` : '') + `${cmd}[${opts}]{biblatex}`;
  });
}

const ACCENTS = {
  '\u0300': '`',
  '\u0301': "'",
  '\u0302': '^',
  '\u0308': '"',
  '\u0303': '~',
  '\u0327': 'c ',
  '\u030C': 'v ',
};
const LETTERS = {
  œ: '\\oe',
  Œ: '\\OE',
  æ: '\\ae',
  Æ: '\\AE',
  ß: '\\ss',
  ø: '\\o',
  Ø: '\\O',
  å: '\\aa',
  Å: '\\AA',
  ł: '\\l',
  Ł: '\\L',
};

// "Élodie Müller" → "{\'E}lodie M{\"u}ller": BibTeX then counts each accented letter as one letter.
export function bibAccentsToLatex(text) {
  return text
    .normalize('NFD')
    .replace(/([A-Za-z])([\u0300\u0301\u0302\u0303\u0308\u0327\u030C])/g, (_, letter, mark) => {
      const accent = ACCENTS[mark];
      const base = letter === 'i' && accent !== 'c ' ? '\\i' : letter;
      return `{\\${accent}${base}}`;
    })
    .normalize('NFC')
    .replace(/[œŒæÆßøØåÅłŁ]/g, (c) => `{${LETTERS[c]}}`);
}

// Returns the files to give the browser engine and a note for the log, or null when nothing changes.
export function prepareBibliography(files) {
  if (!usesBiblatex(files)) return null;
  const out = {};
  for (const [name, text] of Object.entries(files)) {
    if (typeof text !== 'string') out[name] = text;
    else if (/\.(tex|sty|cls)$/i.test(name)) out[name] = biblatexForBibtex(text);
    else if (/\.bib$/i.test(name)) out[name] = bibAccentsToLatex(text);
    else out[name] = text;
  }
  return {
    files: out,
    note:
      'TeXBea : biblatex est compilé ici avec BibTeX (backend=bibtex), car biber n’existe pas dans le navigateur. ' +
      'Les styles biblatex courants fonctionnent ; un style qui exige biber (ex. biblatex-chicago) demande le serveur local.',
  };
}
