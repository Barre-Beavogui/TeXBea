// Bibliographic import helpers: DOI, arXiv ID, Crossref search, and structured manual BibTeX builder.

const STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'from',
  'into',
  'upon',
  'les',
  'des',
  'une',
  'dans',
  'pour',
  'sur',
  'par',
  'avec',
  'étude',
  'etude',
]);

// Extracts all existing citation keys from a .bib file.
export function existingBibKeys(bibText = '') {
  const keys = new Set();
  const re = /@[a-zA-Z]+\s*\{\s*([^,\s}]+)\s*,/g;
  let m;
  while ((m = re.exec(bibText)) !== null) keys.add(m[1].trim());
  return keys;
}

// Detects whether user input is a DOI, an arXiv ID, raw BibTeX, or a text query.
export function classifyBibInput(raw = '') {
  const s = String(raw || '').trim();
  if (!s) return { kind: 'empty', value: '' };
  if (/^@[a-zA-Z]+\s*\{[\s\S]*\}/.test(s)) return { kind: 'bibtex', value: s };

  const doiMatch = s.match(/(?:https?:\/\/(?:dx\.)?doi\.org\/|^doi\s*:\s*|^)(10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+)$/i);
  if (doiMatch) return { kind: 'doi', value: doiMatch[1].replace(/[.,;]+$/, '') };

  const arxivNew = s.match(
    /(?:https?:\/\/arxiv\.org\/(?:abs|pdf)\/|^arxiv\s*:\s*|^)(\d{4}\.\d{4,5})(?:v\d+)?(?:\.pdf)?$/i,
  );
  if (arxivNew) return { kind: 'arxiv', value: arxivNew[1] };

  const arxivOld = s.match(
    /(?:https?:\/\/arxiv\.org\/(?:abs|pdf)\/|^arxiv\s*:\s*|^)([a-z-]+\/\d{7})(?:v\d+)?(?:\.pdf)?$/i,
  );
  if (arxivOld) return { kind: 'arxiv', value: arxivOld[1] };

  return { kind: 'query', value: s };
}

function slugWord(s = '') {
  return String(s)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

// Generates a collision-free citation key like `vaswani2017attention`.
export function makeCitationKey({ author = '', year = '', title = '' } = {}, existing = new Set()) {
  const firstAuthor = String(author).split(/\s+and\s+|,|;/i)[0] || '';
  const tokens = firstAuthor.trim().split(/\s+/).filter(Boolean);
  const surname = slugWord(firstAuthor.includes(',') ? tokens[0] : tokens[tokens.length - 1] || 'ref') || 'ref';
  const y = String(year).match(/\d{4}/)?.[0] || '';
  const titleWord =
    String(title)
      .split(/\s+/)
      .map(slugWord)
      .find((w) => w.length >= 3 && !STOP_WORDS.has(w)) || '';
  const base = (surname + y + titleWord).slice(0, 36) || 'reference';
  if (!existing.has(base)) return base;
  for (let i = 0; i < 26; i++) {
    const candidate = base + String.fromCharCode(97 + i);
    if (!existing.has(candidate)) return candidate;
  }
  return `${base}_${Date.now().toString(36).slice(-4)}`;
}

// Builds a formatted BibTeX entry from structured fields.
export function buildBibtexEntry(fields = {}, existing = new Set()) {
  const type = [
    'article',
    'book',
    'inproceedings',
    'incollection',
    'phdthesis',
    'mastersthesis',
    'techreport',
    'misc',
  ].includes(fields.type)
    ? fields.type
    : 'article';
  const key = (fields.key || '').trim() || makeCitationKey(fields, existing);
  const order = [
    'author',
    'title',
    'journal',
    'booktitle',
    'publisher',
    'school',
    'institution',
    'year',
    'volume',
    'number',
    'pages',
    'doi',
    'eprint',
    'archivePrefix',
    'primaryClass',
    'url',
    'note',
  ];
  const lines = [];
  for (const k of order) {
    const val = String(fields[k] ?? '').trim();
    if (val) lines.push(`  ${k} = {${val}}`);
  }
  return {
    key,
    bibtex: `@${type}{${key},\n${lines.join(',\n')}\n}`,
  };
}

// Parses an arXiv Atom XML response into BibTeX entries.
export function parseArxivAtom(xml = '', existing = new Set()) {
  const entries = [...String(xml).matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map((m) => m[1]);
  const used = new Set(existing);
  const out = [];
  for (const entry of entries) {
    const idUrl = entry.match(/<id>([\s\S]*?)<\/id>/)?.[1]?.trim() || '';
    const eprint = idUrl.match(/arxiv\.org\/abs\/([^\s<]+?)(?:v\d+)?$/i)?.[1] || '';
    const title = (entry.match(/<title>([\s\S]*?)<\/title>/)?.[1] || '').replace(/\s+/g, ' ').trim();
    if (!title || (title === 'Error' && !eprint)) continue;
    const authors = [...entry.matchAll(/<author>\s*<name>([\s\S]*?)<\/name>/g)].map((m) => m[1].trim());
    const published = entry.match(/<published>(\d{4})/)?.[1] || '';
    const primaryClass = entry.match(/primary_category[^>]*term="([^"]+)"/)?.[1] || '';
    const doi = entry.match(/<arxiv:doi[^>]*>([\s\S]*?)<\/arxiv:doi>/)?.[1]?.trim() || '';
    const author = authors.join(' and ');
    const { key, bibtex } = buildBibtexEntry(
      {
        type: 'article',
        author,
        title,
        year: published,
        journal: eprint ? `arXiv preprint arXiv:${eprint}` : '',
        eprint,
        archivePrefix: eprint ? 'arXiv' : '',
        primaryClass,
        doi,
        url: idUrl,
      },
      used,
    );
    used.add(key);
    out.push({ key, title, author, year: published, eprint, doi, bibtex });
  }
  return out;
}

// Converts a Crossref work item into a structured BibTeX result.
export function formatCrossrefWork(item = {}, existing = new Set()) {
  const title = (Array.isArray(item.title) ? item.title[0] : item.title || '').replace(/\s+/g, ' ').trim();
  const authors = (item.author || [])
    .map((a) => [a.family, a.given].filter(Boolean).join(', ') || a.name || '')
    .filter(Boolean);
  const author = authors.join(' and ');
  const year =
    item.published?.['date-parts']?.[0]?.[0] ||
    item['published-print']?.['date-parts']?.[0]?.[0] ||
    item['published-online']?.['date-parts']?.[0]?.[0] ||
    item.created?.['date-parts']?.[0]?.[0] ||
    '';
  const container =
    (Array.isArray(item['container-title']) ? item['container-title'][0] : item['container-title']) || '';
  const rawType = String(item.type || '');
  const type = rawType.includes('book') ? 'book' : rawType.includes('proceedings') ? 'inproceedings' : 'article';
  const { key, bibtex } = buildBibtexEntry(
    {
      type,
      author,
      title,
      year: String(year || ''),
      journal: type === 'article' ? container : '',
      booktitle: type === 'inproceedings' ? container : '',
      publisher: item.publisher || '',
      volume: item.volume || '',
      number: item.issue || '',
      pages: item.page || '',
      doi: item.DOI || '',
      url: item.URL || (item.DOI ? `https://doi.org/${item.DOI}` : ''),
    },
    existing,
  );
  return { key, title, author, year: String(year || ''), journal: container, doi: item.DOI || '', bibtex };
}

// Appends a BibTeX entry to a .bib file string and returns { content, key, duplicate }.
export function appendBibEntry(bibText = '', entryText = '') {
  const trimmed = String(entryText || '').trim();
  if (!trimmed) throw Error('Entrée BibTeX vide');
  const keyMatch = trimmed.match(/^@[a-zA-Z]+\s*\{\s*([^,\s}]+)\s*,/);
  if (!keyMatch) throw Error('Format BibTeX invalide (attendu : @article{cle, ...})');
  const key = keyMatch[1].trim();
  const existing = existingBibKeys(bibText);
  if (existing.has(key)) return { content: bibText, key, duplicate: true };
  const sep = !bibText.trim() ? '' : bibText.endsWith('\n\n') ? '' : bibText.endsWith('\n') ? '\n' : '\n\n';
  return { content: bibText + sep + trimmed + '\n', key, duplicate: false };
}

// Fetches one or more bibliographic candidates by DOI, arXiv ID, or Crossref search query.
export async function lookupBibliography(input = '', existing = new Set(), fetchImpl = fetch) {
  const parsed = classifyBibInput(input);
  if (parsed.kind === 'empty') throw Error('Saisis un DOI, un identifiant arXiv ou des mots-clés.');
  if (parsed.kind === 'bibtex') {
    const key = parsed.value.match(/^@[a-zA-Z]+\s*\{\s*([^,\s}]+)\s*,/)?.[1] || 'ref';
    return [{ key, title: 'Entrée BibTeX collée', author: '', year: '', bibtex: parsed.value.trim() }];
  }
  if (parsed.kind === 'arxiv') {
    const r = await fetchImpl(`https://export.arxiv.org/api/query?id_list=${encodeURIComponent(parsed.value)}`);
    if (!r.ok) throw Error(`arXiv indisponible (${r.status})`);
    const list = parseArxivAtom(await r.text(), existing);
    if (!list.length) throw Error(`Aucun article arXiv trouvé pour « ${parsed.value} »`);
    return list;
  }
  if (parsed.kind === 'doi') {
    const r = await fetchImpl(`https://api.crossref.org/works/${encodeURIComponent(parsed.value)}`);
    if (!r.ok) throw Error(`DOI introuvable (${parsed.value})`);
    const j = await r.json();
    if (!j?.message) throw Error('Réponse DOI incomplète');
    return [formatCrossrefWork(j.message, existing)];
  }
  const r = await fetchImpl(`https://api.crossref.org/works?query=${encodeURIComponent(parsed.value)}&rows=5`);
  if (!r.ok) throw Error(`Recherche bibliographique indisponible (${r.status})`);
  const j = await r.json();
  const items = j?.message?.items || [];
  if (!items.length) throw Error('Aucune référence trouvée pour cette recherche');
  const used = new Set(existing);
  return items.map((item) => {
    const formatted = formatCrossrefWork(item, used);
    used.add(formatted.key);
    return formatted;
  });
}
