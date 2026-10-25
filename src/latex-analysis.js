// Sections and, for Beamer, frames (titled by their {…} argument or \frametitle), in source order.
export function documentOutline(source) {
  const headings = [
    ...source.matchAll(/^[ \t]*\\(part|chapter|section|subsection|subsubsection)\*?(?:\[[^\]]*\])?\{([^}\n]+)\}/gm),
  ].map((m) => ({ title: m[2], level: m[1], index: m.index, length: m[0].length }));
  const frames = [...source.matchAll(/^[ \t]*\\begin\{frame\}(?:<[^>\n]*>)?(?:\[[^\]\n]*\])?(?:\{([^}\n]*)\})?/gm)].map(
    (m) => {
      const end = source.indexOf('\\end{frame}', m.index);
      const body = source.slice(m.index, end < 0 ? undefined : end);
      const title =
        m[1]?.trim() ||
        body.match(/\\frametitle\{([^}\n]+)\}/)?.[1] ||
        (/\\(titlepage|maketitle)\b/.test(body) ? 'Page de titre' : /\\tableofcontents\b/.test(body) ? 'Plan' : '');
      return { title: title || 'Diapositive', level: 'frame', index: m.index, length: m[0].length };
    },
  );
  return [...headings, ...frames]
    .sort((a, b) => a.index - b.index)
    .map(({ title, level, index, length }) => ({
      title,
      level,
      line: source.slice(0, index).split('\n').length,
      start: index,
      end: index + length,
    }));
}
export function analyzeLatex(source, files = {}) {
  const issues = [],
    stack = [],
    braces = [];
  let math = false,
    line = 1;
  const tokens = /\\(?:[a-zA-Z@]+|.)|%[^\n]*|\$\$?|[{}\n]/g;
  let m;
  while ((m = tokens.exec(source))) {
    const t = m[0];
    if (t === '\n') {
      line++;
      continue;
    }
    if (t.startsWith('%')) continue;
    if (t === '{' || t === '}') {
      if (t === '{') braces.push(line);
      else if (braces.length) braces.pop();
      else issues.push({ line, message: 'Accolade fermante sans ouverture.' });
    }
    if (t.startsWith('$')) math = !math;
  }
  for (const line of braces.slice(0, 10)) issues.push({ line, message: 'Accolade ouvrante non refermée.' });
  const stripped = source.replace(/(?<!\\)%[^\n]*/g, (m) => ' '.repeat(m.length));
  for (const m of stripped.matchAll(/\\(begin|end)\{([^}]+)\}/g)) {
    const line = source.slice(0, m.index).split('\n').length;
    if (m[1] === 'begin') stack.push({ name: m[2], line });
    else {
      const last = stack.pop();
      if (!last || last.name !== m[2])
        issues.push({
          line,
          message: `Environnement ${m[2]} fermé hors séquence${last ? ' (attendu : ' + last.name + ')' : ''}.`,
        });
    }
  }
  for (const s of stack) issues.push({ line: s.line, message: `Environnement ${s.name} non refermé.` });
  if (math) issues.push({ line: 1, message: 'Délimiteur mathématique $ non refermé.' });
  for (const m of stripped.matchAll(/\\(?:input|include)\{([^}]+)\}/g)) {
    const n = m[1].endsWith('.tex') ? m[1] : m[1] + '.tex';
    if (!(n in files))
      issues.push({ line: source.slice(0, m.index).split('\n').length, message: 'Fichier inclus introuvable : ' + n });
  }
  return issues.sort((a, b) => a.line - b.line);
}
