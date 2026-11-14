// Reads the references of .bib files, to list them across every project.
// Only what the list shows: citation key, type, title, authors, year.

const FIELD = /([A-Za-z][\w-]*)\s*=\s*/y;

// Value of a field starting at `at`: {balanced braces}, "quoted" or a bare word/number. Returns [text, next index].
function readValue(src, at) {
  const c = src[at];
  if (c === '{') {
    let depth = 0;
    for (let i = at; i < src.length; i++) {
      if (src[i] === '\\') i++;
      else if (src[i] === '{') depth++;
      else if (src[i] === '}' && --depth === 0) return [src.slice(at + 1, i), i + 1];
    }
    return [src.slice(at + 1), src.length];
  }
  if (c === '"') {
    for (let i = at + 1; i < src.length; i++) {
      if (src[i] === '\\') i++;
      else if (src[i] === '"') return [src.slice(at + 1, i), i + 1];
    }
    return [src.slice(at + 1), src.length];
  }
  const m = /^[^,}\s]+/.exec(src.slice(at));
  return [m ? m[0] : '', at + (m ? m[0].length : 0)];
}

const clean = (v = '') =>
  v
    .replace(/\\(La)?TeX\b\s*/g, '$1TeX')
    .replace(/\\[a-zA-Z]+\s*/g, '')
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

export function parseBib(text = '') {
  const out = [];
  const head = /@([A-Za-z]+)\s*\{\s*([^,\s}]+)\s*,/g;
  let m;
  while ((m = head.exec(text))) {
    const type = m[1].toLowerCase();
    if (['comment', 'string', 'preamble'].includes(type)) continue;
    const fields = {};
    let at = head.lastIndex;
    for (;;) {
      while (at < text.length && /[\s,]/.test(text[at])) at++;
      if (at >= text.length || text[at] === '}' || text[at] === '@') break;
      FIELD.lastIndex = at;
      const f = FIELD.exec(text);
      if (!f) break;
      const [value, next] = readValue(text, FIELD.lastIndex);
      fields[f[1].toLowerCase()] = value;
      at = next;
    }
    head.lastIndex = Math.max(head.lastIndex, at);
    out.push({
      key: m[2],
      type,
      title: clean(fields.title),
      author: clean(fields.author).replace(/\s+and\s+/g, ', '),
      year: clean(fields.year || (fields.date || '').slice(0, 4)),
    });
  }
  return out;
}
