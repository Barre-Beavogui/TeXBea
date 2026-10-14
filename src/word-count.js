// Word count in the spirit of Overleaf (texcount): text, headers, captions, formulas and floats.
const WORD = /[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu;
const DISPLAY_ENVS = 'equation|align|gather|multline|eqnarray|displaymath|flalign|alignat';
const countWords = (text) => (text.match(WORD) || []).length;
const stripComments = (s) => s.replace(/(?<!\\)%[^\n]*/g, '');

// Follows \input / \include from the main file so the count covers the whole document once.
export function expandDocument(files, main, seen = new Set()) {
  if (seen.has(main) || files[main] === undefined) return '';
  seen.add(main);
  return stripComments(files[main]).replace(/\\(?:input|include|subfile)\{([^}]+)\}/g, (_, name) => {
    const file = name.endsWith('.tex') ? name : name + '.tex';
    return '\n' + expandDocument(files, file, seen) + '\n';
  });
}

export function wordCount(files, main) {
  let source = expandDocument(files, main);
  const begin = source.indexOf('\\begin{document}');
  if (begin >= 0) source = source.slice(begin + '\\begin{document}'.length);
  const end = source.indexOf('\\end{document}');
  if (end >= 0) source = source.slice(0, end);
  source = source.replace(/\\begin\{(thebibliography)\}[\s\S]*?\\end\{\1\}/g, ' ');

  const result = { words: 0, headers: 0, headerWords: 0, captionWords: 0, mathInline: 0, mathDisplay: 0, floats: 0 };
  source = source.replace(new RegExp(`\\\\begin\\{(${DISPLAY_ENVS})\\*?\\}[\\s\\S]*?\\\\end\\{\\1\\*?\\}`, 'g'), () => {
    result.mathDisplay++;
    return ' ';
  });
  source = source.replace(/\\\[[\s\S]*?\\\]|\$\$[\s\S]*?\$\$/g, () => {
    result.mathDisplay++;
    return ' ';
  });
  source = source.replace(/\\\([\s\S]*?\\\)|(?<!\\)\$(?:\\\$|[^$])+?\$/g, () => {
    result.mathInline++;
    return ' ';
  });
  result.floats = (source.match(/\\begin\{(figure|table|wrapfigure|sidewaysfigure)\*?\}/g) || []).length;
  source = source.replace(
    /\\(?:part|chapter|section|subsection|subsubsection|paragraph|subparagraph)\*?(?:\[[^\]]*\])?\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g,
    (_, title) => {
      result.headers++;
      result.headerWords += countWords(title.replace(/\\[a-zA-Z@]+/g, ' '));
      return ' ';
    },
  );
  source = source.replace(/\\caption(?:\[[^\]]*\])?\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g, (_, caption) => {
    result.captionWords += countWords(caption.replace(/\\[a-zA-Z@]+/g, ' '));
    return ' ';
  });
  source = source
    .replace(/\\begin\{(?:tabular|tabularx|array|longtable)\*?\}(?:\{[^}]*\})?(?:\[[^\]]*\])?\{[^}]*\}/g, ' ')
    .replace(
      /\\(?:label|ref|eqref|pageref|autoref|cref|Cref|cite[a-zA-Z]*|nocite|includegraphics|usepackage|bibliography|bibliographystyle|url|href|hspace|vspace|setlength|addtolength|newcommand|renewcommand|begin|end)\*?(?:\[[^\]]*\])*\{[^}]*\}/g,
      ' ',
    )
    .replace(/\\[a-zA-Z@]+\*?/g, ' ')
    .replace(/\\./g, ' ');
  result.words = countWords(source);
  return result;
}
