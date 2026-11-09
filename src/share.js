// Sharing without a server: the project's sources and comments travel inside the link itself, compressed,
// after the "#" (the part of a link that browsers never send to the website). Whoever opens the link reads,
// compiles and comments in their own browser; their comments come back to the owner through a reply link.
import { safePath, validateProject } from './project-tools.js';
import { isCompiler } from './compilers.js';

export const SHARE_KEY = 'partage';
export const REPLY_KEY = 'commentaires';
// Beyond this the link no longer passes through most messaging apps; the ZIP export is the way then.
export const MAX_LINK_LENGTH = 200_000;
const MAX_COMMENTS = 500;
const AUTHOR_KEY = 'texbea-author';

const toBase64Url = (bytes) => {
  let text = '';
  for (let i = 0; i < bytes.length; i += 8192) text += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromBase64Url = (s) => {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4)), (c) => c.charCodeAt(0));
};
async function pipe(bytes, stream) {
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
}
export async function pack(data) {
  return toBase64Url(await pipe(new TextEncoder().encode(JSON.stringify(data)), new CompressionStream('deflate-raw')));
}
export async function unpack(text) {
  try {
    return JSON.parse(
      new TextDecoder().decode(await pipe(fromBase64Url(text), new DecompressionStream('deflate-raw'))),
    );
  } catch {
    throw Error('Lien de partage abîmé ou incomplet. Demande à la personne de le copier à nouveau.');
  }
}

export function cleanComment(c) {
  if (!c || typeof c !== 'object' || typeof c.text !== 'string' || !c.text.trim()) return null;
  return {
    id: typeof c.id === 'string' ? c.id.slice(0, 64) : crypto.randomUUID(),
    file: safePath(c.file) ? c.file : '',
    line: Math.max(1, Math.min(1e6, Number(c.line) || 1)),
    quote: String(c.quote || '').slice(0, 300),
    text: c.text.trim().slice(0, 4000),
    author:
      String(c.author || 'Anonyme')
        .trim()
        .slice(0, 60) || 'Anonyme',
    at: typeof c.at === 'string' ? c.at.slice(0, 40) : new Date().toISOString(),
    resolved: !!c.resolved,
  };
}
export const cleanComments = (list) =>
  Array.isArray(list) ? list.map(cleanComment).filter(Boolean).slice(-MAX_COMMENTS) : [];

// Adds the comments that are new; a known comment takes the incoming "resolved" state only when it is set.
export function mergeComments(existing = [], incoming = []) {
  const out = existing.map((c) => ({ ...c }));
  const byId = new Map(out.map((c) => [c.id, c]));
  let added = 0;
  for (const c of cleanComments(incoming)) {
    const known = byId.get(c.id);
    if (known) {
      if (c.resolved) known.resolved = true;
    } else {
      out.push(c);
      byId.set(c.id, c);
      added++;
    }
  }
  return { comments: out.slice(-MAX_COMMENTS), added };
}

// Where a comment sits now: the line that still holds its quoted text nearest to where it was written.
export function commentLine(text, c) {
  const lines = text.split('\n');
  const quote = c.quote?.trim();
  if (quote) {
    let best = null;
    lines.forEach((l, i) => {
      if (l.includes(quote) && (best === null || Math.abs(i + 1 - c.line) < Math.abs(best - c.line))) best = i + 1;
    });
    if (best) return best;
  }
  return Math.min(c.line, lines.length);
}

// Small images (logos, icons) travel in the link; bigger ones would make it far too long and are replaced by
// grey rectangles when the shared copy is compiled.
const IMAGE_BUDGET = 120_000;
export async function shareLink(project, base) {
  let budget = IMAGE_BUDGET;
  const assets = {},
    missing = [];
  for (const [n, c] of Object.entries(project.assets || {}).sort((a, b) => a[1].length - b[1].length))
    if (c.length <= budget) {
      assets[n] = c;
      budget -= c.length;
    } else missing.push(n);
  const payload = {
    v: 1,
    id: project.id,
    name: project.name,
    main: project.main,
    compiler: project.compiler,
    files: project.files,
    assets,
    missing,
    comments: project.comments || [],
  };
  const url = `${base}#${SHARE_KEY}=${await pack(payload)}`;
  return { url, length: url.length, tooLong: url.length > MAX_LINK_LENGTH, missing };
}

export async function replyLink(shared, comments, base) {
  return `${base}#${REPLY_KEY}=${await pack({ v: 1, id: shared.id, name: shared.project?.name ?? shared.name, comments })}`;
}

// Reads location.hash: { kind: 'share', project, comments } or { kind: 'reply', id, name, comments } or null.
export async function readHash(hash) {
  const m = /^#(partage|commentaires)=(.+)$/.exec(hash || '');
  if (!m) return null;
  const data = await unpack(m[2]);
  if (!data || data.v !== 1) throw Error('Ce lien vient d’une autre version de TeXBea.');
  if (m[1] === REPLY_KEY)
    return {
      kind: 'reply',
      id: String(data.id || ''),
      name: String(data.name || ''),
      comments: cleanComments(data.comments),
    };
  const project = validateProject({ name: data.name, main: data.main, files: data.files || {}, assets: data.assets });
  if (isCompiler(data.compiler)) project.compiler = data.compiler;
  project.missing = (Array.isArray(data.missing) ? data.missing : [])
    .filter((n) => safePath(n) && !(n in project.files) && !(n in project.assets))
    .slice(0, 2000);
  return { kind: 'share', id: String(data.id || ''), project, comments: cleanComments(data.comments) };
}

export function authorName() {
  try {
    return localStorage.getItem(AUTHOR_KEY) || '';
  } catch {
    return '';
  }
}
export function setAuthorName(name) {
  try {
    localStorage.setItem(AUTHOR_KEY, name.trim().slice(0, 60));
  } catch {}
}
