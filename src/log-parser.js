// Turns a pdfTeX / latexmk log into clickable entries, in the spirit of Overleaf's "Logs and output files" panel.
const FILE_RE =
  /^\(((?:\.{0,2}\/)?[^\s()]+?\.(?:tex|sty|cls|cfg|def|clo|fd|ldf|bbl|aux|toc|lof|lot|out|ltx|bst|dict))(?=[\s()]|$)/;

// TeX hard-wraps log lines at 79 characters; joining them back keeps file names and messages intact.
function unwrap(log) {
  const out = [];
  let buffer = '';
  for (const line of log.replace(/\r\n?/g, '\n').split('\n')) {
    buffer += line;
    if (line.length !== 79) {
      out.push(buffer);
      buffer = '';
    }
  }
  if (buffer) out.push(buffer);
  return out;
}

function sourceFile(name, files, entry) {
  if (!name) return null;
  const clean = name.replace(/^\.\//, '');
  if (files[clean] !== undefined) return clean;
  if (/^texbea-entry(-\d+)?\.tex$/.test(clean) || clean === 'main.tex') return entry;
  const base = Object.keys(files).find((f) => clean.endsWith('/' + f) || clean === f);
  return base || null;
}

export function parseLatexLog(log = '', files = {}, entry = 'main.tex') {
  const lines = unwrap(log);
  const entries = [];
  const stack = [];
  const current = () => sourceFile([...stack].reverse().find(Boolean), files, entry);
  const push = (level, message, line, file, raw) =>
    entries.push({ level, message: message.trim(), line: line ? Number(line) : null, file: file ?? current(), raw });

  for (let i = 0; i < lines.length; i++) {
    const text = lines[i];
    const fileLine = text.match(/^((?:\.\/)?[^\s:]+\.tex):(\d+): (.*)$/);
    if (fileLine) {
      push('error', fileLine[3], fileLine[2], sourceFile(fileLine[1], files, entry), text);
      continue;
    }
    if (text.startsWith('! ')) {
      let line = null;
      const raw = [text];
      for (let j = i + 1; j < Math.min(lines.length, i + 12); j++) {
        raw.push(lines[j]);
        const m = lines[j].match(/^l\.(\d+)/);
        if (m) {
          line = m[1];
          // The excerpt after "l.12" is source text: its parentheses must not affect the file stack.
          if (lines[j + 1]?.startsWith(' ')) raw.push(lines[j + 1]);
          break;
        }
      }
      push('error', text.slice(2), line, undefined, raw.join('\n'));
      if (line) i += raw.length - 1;
      continue;
    }
    const warning = text.match(/^(LaTeX(?: \w+)?|Package [^\s]+|Class [^\s]+|pdfTeX) [Ww]arning:? (.*)$/);
    if (warning) {
      let message = warning[2];
      const raw = [text];
      while (i + 1 < lines.length && lines[i + 1].trim() && /^\s*(\([^)]*\))?\s{2,}/.test(lines[i + 1])) {
        raw.push(lines[++i]);
        message += ' ' + lines[i].replace(/^\s*(\([^)]*\))?\s*/, '');
      }
      const line = message.match(/on input line (\d+)/)?.[1];
      push('warning', message.replace(/\s+/g, ' '), line, undefined, raw.join('\n'));
      continue;
    }
    if (/^(Over|Under)full \\[hv]box /.test(text)) {
      push('typesetting', text.replace(/\s*\[\]\s*$/, ''), text.match(/lines? (\d+)/)?.[1], undefined, text);
      continue;
    }
    // Track which file is being read: "(./chapitre.tex" opens, ")" closes.
    for (let k = 0; k < text.length; k++) {
      if (text[k] === '(') {
        const m = text.slice(k).match(FILE_RE);
        stack.push(m ? m[1] : null);
        if (m) k += m[0].length - 1;
      } else if (text[k] === ')' && stack.length) stack.pop();
    }
  }
  const seen = new Set();
  const unique = entries.filter((e) => {
    const key = e.level + e.file + e.line + e.message;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return {
    all: unique,
    errors: unique.filter((e) => e.level === 'error'),
    warnings: unique.filter((e) => e.level === 'warning'),
    typesetting: unique.filter((e) => e.level === 'typesetting'),
  };
}
