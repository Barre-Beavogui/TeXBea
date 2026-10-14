function normalize(text) {
  return text
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/œ/g, 'oe')
    .replace(/ﬁ/g, 'fi')
    .replace(/ﬂ/g, 'fl')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}
function sourceIndex(source) {
  // Omit comments, document metadata and formatting commands while retaining their text arguments.
  const masked = source
    .replace(/(?<!\\)%[^\n]*/g, (m) => ' '.repeat(m.length))
    .replace(/\\(?:begin|end|label|usepackage|documentclass|usetikzlibrary)(?:\[[^\]]*\])?\{[^}]*\}/g, (m) =>
      ' '.repeat(m.length),
    )
    .replace(/\\[a-zA-Z@]+\*?/g, (m) => ' '.repeat(m.length));
  let text = '',
    offsets = [],
    space = true;
  for (let i = 0; i < masked.length; i++) {
    const c = normalize(masked[i]);
    if (c) {
      for (const letter of c) {
        text += letter;
        offsets.push(i);
      }
      space = false;
    } else if (!space) {
      text += ' ';
      offsets.push(i);
      space = true;
    }
  }
  return { text: text.trimEnd(), offsets };
}
export function findSourceLocation(files, fragment, occurrence = 0) {
  const query = normalize(fragment);
  if (query.length < 2) return null;
  const matches = [];
  for (const [file, source] of Object.entries(files)) {
    if (!file.endsWith('.tex')) continue;
    const { text, offsets } = sourceIndex(source);
    let from = 0,
      index;
    while ((index = text.indexOf(query, from)) !== -1) {
      const before = text[index - 1],
        after = text[index + query.length];
      if ((!before || before === ' ') && (!after || after === ' ')) {
        const start = offsets[index],
          end = offsets[index + query.length - 1] + 1;
        matches.push({ file, start, end, line: source.slice(0, start).split('\n').length });
      }
      from = index + query.length;
    }
  }
  return matches[Math.min(occurrence, matches.length - 1)] || null;
}

export const normalizeText = normalize;

// Words of a source line as they would appear in the PDF (commands, comments and markup removed).
export function searchablePhrases(line) {
  const words = sourceIndex(line).text.split(' ').filter(Boolean);
  const phrases = [];
  for (const size of [6, 4, 3, 2, 1]) {
    if (words.length < size) continue;
    const start = Math.max(0, Math.floor((words.length - size) / 2));
    const phrase = words.slice(start, start + size).join(' ');
    if (phrase.length >= 4 && !phrases.includes(phrase)) phrases.push(phrase);
  }
  return phrases;
}

// Finds the page and text item of a phrase among the text of each PDF page (forward search, without SyncTeX).
export function locateInPages(pages, phrases) {
  const indexed = pages.map((items) => {
    let text = '';
    const owners = [];
    items.forEach((item, i) => {
      const n = normalize(item.str || '');
      if (!n) return;
      if (text) {
        text += ' ';
        owners.push(i);
      }
      for (const _ of n) owners.push(i);
      text += n;
    });
    return { text, owners };
  });
  for (const phrase of phrases) {
    const hits = [];
    indexed.forEach(({ text, owners }, page) => {
      let from = 0,
        at;
      while ((at = text.indexOf(phrase, from)) !== -1) {
        const before = text[at - 1],
          after = text[at + phrase.length];
        if ((!before || before === ' ') && (!after || after === ' ')) hits.push({ page, item: owners[at] });
        from = at + 1;
      }
    });
    if (hits.length) return { ...hits[0], unique: hits.length === 1 };
  }
  return null;
}
