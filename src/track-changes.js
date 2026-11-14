// Track changes (Suivi des modifications) for LaTeX documents:
// 1. Inline markup compatible with the `changes` package (\added{...}, \deleted{...}, \replaced{new}{old})
//    with one-click Accept / Reject per change or across the whole file.
// 2. Hunk-by-hunk review against any saved snapshot version.

import { diffLines } from './diff.js';

export const CHANGES_PREAMBLE = `% Suivi des modifications TeXBea
\\usepackage{xcolor}
\\providecommand{\\added}[2][]{{\\color{teal!80!black}\\textbf{#2}}}
\\providecommand{\\deleted}[2][]{{\\color{red!75!black}[\\footnotesize supprimé : #2]}}
\\providecommand{\\replaced}[3][]{{\\color{teal!80!black}\\textbf{#2}}{\\color{red!75!black}[\\footnotesize ← #3]}}`;

// Reads a balanced `{...}` group starting at index `pos` (where `text[pos] === '{'`).
function readBraced(text, pos) {
  if (text[pos] !== '{') return null;
  let depth = 0,
    i = pos;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '\\') {
      i += 2;
      continue;
    }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return { content: text.slice(pos + 1, i), end: i + 1 };
    }
    i++;
  }
  return null;
}

// Skips optional `[...]` argument if present at `pos`.
function skipOptional(text, pos) {
  let i = pos;
  while (i < text.length && /\s/.test(text[i])) i++;
  if (text[i] !== '[') return { opt: '', pos: i };
  const close = text.indexOf(']', i + 1);
  if (close < 0) return { opt: '', pos: i };
  let next = close + 1;
  while (next < text.length && /\s/.test(text[next])) next++;
  return { opt: text.slice(i + 1, close), pos: next };
}

// Finds all \added, \deleted, and \replaced macros in a single file's source.
export function findTrackedInText(text = '', file = 'main.tex') {
  const out = [];
  const re = /\\(added|deleted|replaced)(?![a-zA-Z])/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const kind = m[1];
    const from = m.index;
    const afterCmd = from + m[0].length;
    const { opt, pos: firstPos } = skipOptional(text, afterCmd);
    const first = readBraced(text, firstPos);
    if (!first) continue;
    let to = first.end,
      added = '',
      deleted = '';
    if (kind === 'added') {
      added = first.content;
    } else if (kind === 'deleted') {
      deleted = first.content;
    } else {
      let secondStart = first.end;
      while (secondStart < text.length && /\s/.test(text[secondStart])) secondStart++;
      const second = readBraced(text, secondStart);
      if (!second) continue;
      added = first.content;
      deleted = second.content;
      to = second.end;
    }
    const line = text.slice(0, from).split('\n').length;
    const author = opt.match(/(?:id|author)\s*=\s*([^,\]]+)/)?.[1]?.trim() || opt.trim() || '';
    out.push({
      id: `${file}:${from}:${to}`,
      file,
      line,
      from,
      to,
      kind,
      added,
      deleted,
      author,
      raw: text.slice(from, to),
    });
    re.lastIndex = to;
  }
  return out;
}

// Finds all tracked changes across all `.tex` files of a project.
export function findTrackedChanges(files = {}) {
  const all = [];
  for (const [file, text] of Object.entries(files)) {
    if (typeof text === 'string' && /\.tex$/i.test(file)) {
      all.push(...findTrackedInText(text, file));
    }
  }
  return all;
}

// Resolves a single tracked change: 'accept' keeps the new text; 'reject' restores the old text.
export function resolveTrackedChange(text, change, decision = 'accept') {
  const replacement =
    decision === 'accept'
      ? change.kind === 'deleted'
        ? ''
        : change.added
      : change.kind === 'added'
        ? ''
        : change.deleted;
  return text.slice(0, change.from) + replacement + text.slice(change.to);
}

// Accepts or rejects every tracked change in `text`.
export function resolveAllTrackedChanges(text, decision = 'accept') {
  const changes = findTrackedInText(text);
  let out = text;
  for (let i = changes.length - 1; i >= 0; i--) {
    out = resolveTrackedChange(out, changes[i], decision);
  }
  return out;
}

// Wraps a selection in a tracked-change macro.
export function wrapTrackedChange(selected = '', kind = 'added', replacement = '', author = '') {
  const opt = author.trim() ? `[${author.trim().replace(/[\[\]]/g, '')}]` : '';
  if (kind === 'deleted') return `\\deleted${opt}{${selected || 'texte supprimé'}}`;
  if (kind === 'replaced') return `\\replaced${opt}{${replacement || 'nouveau texte'}}{${selected || 'ancien texte'}}`;
  return `\\added${opt}{${selected || 'nouveau texte'}}`;
}

// Inserts lightweight macro definitions before \begin{document} if not already defined.
export function ensureChangesPreamble(source = '') {
  if (/\\(?:providecommand|newcommand)\s*\{\\added\}|\\usepackage(?:\[[^\]]*\])?\{changes\}/.test(source)) {
    return source;
  }
  const idx = source.indexOf('\\begin{document}');
  if (idx < 0) return CHANGES_PREAMBLE + '\n\n' + source;
  return source.slice(0, idx) + CHANGES_PREAMBLE + '\n\n' + source.slice(idx);
}

// Groups line-by-line diffs between `oldText` (snapshot) and `newText` (current) into reviewable hunks.
export function diffHunks(oldText = '', newText = '') {
  const lines = diffLines(oldText, newText);
  const hunks = [];
  let cur = null;
  lines.forEach((l, idx) => {
    if (l.type === 'same') {
      if (cur) {
        hunks.push(cur);
        cur = null;
      }
    } else {
      if (!cur) {
        cur = {
          id: hunks.length,
          startIndex: idx,
          oldLine: l.oldLine || 1,
          newLine: l.newLine || 1,
          removed: [],
          added: [],
        };
      }
      if (l.type === 'del') {
        if (!cur.oldLine && l.oldLine) cur.oldLine = l.oldLine;
        cur.removed.push(l.text);
      } else if (l.type === 'add') {
        if (!cur.newLine && l.newLine) cur.newLine = l.newLine;
        cur.added.push(l.text);
      }
    }
  });
  if (cur) hunks.push(cur);
  return hunks;
}

// Reverts a single diff hunk back to its snapshot version ('reject') or keeps the current version ('accept').
export function revertDiffHunk(oldText = '', newText = '', hunkId = 0) {
  const lines = diffLines(oldText, newText);
  const out = [];
  let curHunk = -1,
    inHunk = false;
  for (const l of lines) {
    if (l.type === 'same') {
      inHunk = false;
      out.push(l.text);
    } else {
      if (!inHunk) {
        curHunk++;
        inHunk = true;
      }
      if (curHunk === hunkId) {
        if (l.type === 'del') out.push(l.text);
      } else {
        if (l.type === 'add') out.push(l.text);
      }
    }
  }
  return out.join('\n');
}
