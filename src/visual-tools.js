// Pure helpers for the visual assistant: two-way LaTeX table editing, CSV/TSV paste, matrix/cases builder,
// figure builder, and offline live math preview.

const GREEK_MAP = {
  alpha: 'α',
  beta: 'β',
  gamma: 'γ',
  delta: 'δ',
  epsilon: 'ϵ',
  varepsilon: 'ε',
  zeta: 'ζ',
  eta: 'η',
  theta: 'θ',
  vartheta: 'ϑ',
  iota: 'ι',
  kappa: 'κ',
  lambda: 'λ',
  mu: 'μ',
  nu: 'ν',
  xi: 'ξ',
  pi: 'π',
  rho: 'ρ',
  sigma: 'σ',
  tau: 'τ',
  upsilon: 'υ',
  phi: 'ϕ',
  varphi: 'φ',
  chi: 'χ',
  psi: 'ψ',
  omega: 'ω',
  Gamma: 'Γ',
  Delta: 'Δ',
  Theta: 'Θ',
  Lambda: 'Λ',
  Xi: 'Ξ',
  Pi: 'Π',
  Sigma: 'Σ',
  Phi: 'Φ',
  Psi: 'Ψ',
  Omega: 'Ω',
  pm: '±',
  mp: '∓',
  times: '×',
  div: '÷',
  cdot: '·',
  ast: '∗',
  star: '⋆',
  circ: '∘',
  bullet: '•',
  oplus: '⊕',
  otimes: '⊗',
  cap: '∩',
  cup: '∪',
  setminus: '∖',
  wedge: '∧',
  vee: '∨',
  sum: '∑',
  prod: '∏',
  int: '∫',
  iint: '∬',
  oint: '∮',
  partial: '∂',
  nabla: '∇',
  leq: '≤',
  le: '≤',
  geq: '≥',
  ge: '≥',
  neq: '≠',
  ne: '≠',
  approx: '≈',
  equiv: '≡',
  sim: '∼',
  simeq: '≃',
  cong: '≅',
  propto: '∝',
  ll: '≪',
  gg: '≫',
  in: '∈',
  notin: '∉',
  subset: '⊂',
  subseteq: '⊆',
  supset: '⊃',
  supseteq: '⊇',
  perp: '⊥',
  parallel: '∥',
  mid: '∣',
  to: '→',
  rightarrow: '→',
  leftarrow: '←',
  leftrightarrow: '↔',
  Rightarrow: '⇒',
  Leftarrow: '⇐',
  Leftrightarrow: '⇔',
  mapsto: '↦',
  longrightarrow: '⟶',
  uparrow: '↑',
  downarrow: '↓',
  implies: '⟹',
  iff: '⟺',
  infty: '∞',
  forall: '∀',
  exists: '∃',
  nexists: '∄',
  emptyset: '∅',
  varnothing: '⌀',
  ell: 'ℓ',
  hbar: 'ℏ',
  Re: 'ℜ',
  Im: 'ℑ',
  aleph: 'ℵ',
  angle: '∠',
  ldots: '…',
  cdots: '⋯',
  vdots: '⋮',
  ddots: '⋱',
};

const BLACKBOARD = { R: 'ℝ', N: 'ℕ', Z: 'ℤ', Q: 'ℚ', C: 'ℂ', P: 'ℙ', E: '𝔼' };

// Splits a tabular row on unescaped `&`.
function splitCells(row) {
  const cells = [];
  let cur = '',
    depth = 0;
  for (let i = 0; i < row.length; i++) {
    const ch = row[i];
    if (ch === '\\' && i + 1 < row.length) {
      cur += ch + row[++i];
      continue;
    }
    if (ch === '{') depth++;
    else if (ch === '}' && depth > 0) depth--;
    if (ch === '&' && depth === 0) {
      cells.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  cells.push(cur.trim());
  return cells;
}

// Parses a LaTeX `\begin{table}` or `\begin{tabular}` snippet into an editable grid model.
export function parseLatexTable(source = '') {
  const text = String(source || '').trim();
  const tabMatch = text.match(/\\begin\{tabular\}\s*\{([^}]*)\}([\s\S]*?)\\end\{tabular\}/);
  if (!tabMatch) return null;
  const rawSpec = tabMatch[1];
  const rawBody = tabMatch[2];
  const aligns = [...rawSpec.matchAll(/[lcr]/g)].map((m) => m[0]);
  const hasPipes = rawSpec.includes('|');
  const hasBooktabs = /\\(?:toprule|midrule|bottomrule)\b/.test(rawBody);
  const style = hasBooktabs ? 'booktabs' : hasPipes ? 'borders' : 'plain';
  const caption = text.match(/\\caption\{([^}]*)\}/)?.[1] ?? '';
  const label = (text.match(/\\label\{([^}]*)\}/)?.[1] ?? '').replace(/^tab:/, '');
  const wrapped = /\\begin\{table\*?\}/.test(text);

  const cleaned = rawBody
    .replace(/%(.*)$/gm, '')
    .replace(/\\(?:toprule|midrule|bottomrule|hline|cline\{[^}]*\})\b/g, '')
    .trim();
  const rawRows = cleaned
    .split(/\\\\(?:\s*\[[^\]]*\])?/)
    .map((r) => r.trim())
    .filter(Boolean);
  const cols = Math.max(aligns.length, ...rawRows.map((r) => splitCells(r).length), 1);
  const rows = (rawRows.length ? rawRows : ['']).map((r) => {
    const c = splitCells(r).map((cell) => cell.replace(/^\\textbf\{([\s\S]*)\}$/, '$1').replace(/^\$\{\}$/, ''));
    while (c.length < cols) c.push('');
    return c.slice(0, cols);
  });
  while (aligns.length < cols) aligns.push(style === 'borders' ? 'c' : 'l');
  const header = /\\midrule\b/.test(rawBody) || /\\textbf\{/.test(rawRows[0] || '');
  return {
    rows,
    aligns: aligns.slice(0, cols),
    style,
    header,
    caption,
    label,
    wrapped,
  };
}

// Builds clean LaTeX from the visual table state.
export function buildLatexTable({
  rows = [
    ['', ''],
    ['', ''],
  ],
  aligns = [],
  style = 'borders',
  header = true,
  caption = '',
  label = '',
  wrapped = true,
} = {}) {
  const rCount = Math.max(1, rows.length);
  const cCount = Math.max(1, ...rows.map((r) => r.length));
  const normAligns = Array.from({ length: cCount }, (_, i) =>
    ['l', 'c', 'r'].includes(aligns[i]) ? aligns[i] : style === 'borders' ? 'c' : 'l',
  );
  const spec = style === 'borders' ? '|' + normAligns.join('|') + '|' : normAligns.join(' ');
  const top = style === 'booktabs' ? ' \\toprule' : style === 'borders' ? ' \\hline' : '';
  const bodyLines = [];
  for (let r = 0; r < rCount; r++) {
    const cells = Array.from({ length: cCount }, (_, c) => {
      const val = String(rows[r]?.[c] ?? '').trim();
      if (!val) return ' ';
      return header && r === 0 && !val.startsWith('\\textbf{') ? `\\textbf{${val}}` : val;
    });
    let suffix = ' \\\\';
    if (style === 'borders') suffix += ' \\hline';
    else if (style === 'booktabs') {
      if (header && r === 0 && rCount > 1) suffix += ' \\midrule';
      else if (r === rCount - 1) suffix += ' \\bottomrule';
    } else if (header && r === 0 && rCount > 1) {
      suffix += ' \\hline';
    }
    bodyLines.push('\t\t' + cells.join(' & ') + suffix);
  }
  const tabular = `\\begin{tabular}{${spec}}${top}\n${bodyLines.join('\n')}\n\t\\end{tabular}`;
  if (!wrapped) return tabular;
  const capLine = caption ? `\n\t\\caption{${caption}}` : '\n\t\\caption{Légende}';
  const labLine = label ? `\n\t\\label{tab:${label.replace(/^tab:/, '')}}` : '\n\t\\label{tab:tableau}';
  return `\\begin{table}[htbp]\n\t\\centering${capLine}${labLine}\n\t${tabular}\n\\end{table}`;
}

// Parses TSV (copied from spreadsheets) or CSV into a 2D array of strings.
export function parseDelimitedTable(text = '') {
  const lines = String(text || '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .filter((l) => l.trim().length > 0);
  if (!lines.length) return null;
  const sep = lines[0].includes('\t') ? '\t' : lines[0].includes(';') ? ';' : ',';
  const rows = lines.map((line) => line.split(sep).map((c) => c.trim().replace(/^"(.*)"$/, '$1')));
  const cols = Math.max(...rows.map((r) => r.length));
  return rows.map((r) => {
    const out = [...r];
    while (out.length < cols) out.push('');
    return out;
  });
}

// Builds a matrix or piecewise cases environment.
export function buildMatrixLatex(
  rows = [
    ['a', 'b'],
    ['c', 'd'],
  ],
  kind = 'pmatrix',
) {
  const valid = ['pmatrix', 'bmatrix', 'Bmatrix', 'vmatrix', 'Vmatrix', 'matrix', 'cases'];
  const env = valid.includes(kind) ? kind : 'pmatrix';
  const body = rows.map((r) => '\t' + r.map((c) => String(c ?? '').trim() || '0').join(' & ')).join(' \\\\\n');
  return `\\begin{${env}}\n${body}\n\\end{${env}}`;
}

// Builds a complete \begin{figure} block for an uploaded image.
export function buildFigureLatex({
  file = 'image.png',
  width = '0.8\\linewidth',
  position = 'htbp',
  caption = '',
  label = '',
} = {}) {
  const pos = ['htbp', 'h!', 't', 'b', 'p', 'H'].includes(position) ? position : 'htbp';
  const cleanLabel = (
    label ||
    file
      .split('/')
      .pop()
      .replace(/\.[^.]+$/, '')
      .replace(/[^a-zA-Z0-9_-]/g, '-') ||
    'figure'
  ).replace(/^fig:/, '');
  return `\\begin{figure}[${pos}]
\t\\centering
\t\\includegraphics[width=${width || '0.8\\linewidth'}]{${file}}
\t\\caption{${caption || 'Légende'}}
\t\\label{fig:${cleanLabel}}
\\end{figure}`;
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Offline, dependency-free live math preview (converts common LaTeX math constructs into readable HTML).
export function renderMathPreview(latex = '') {
  let s = String(latex || '')
    .trim()
    .replace(/^\$\$?|\$\$?$/g, '')
    .replace(/^\\\[|\\\]$/g, '')
    .replace(/^\\\(|\\\)$/g, '')
    .replace(/\\begin\{(equation\*?|align\*?|gather\*?)\}/g, '')
    .replace(/\\end\{(equation\*?|align\*?|gather\*?)\}/g, '')
    .replace(/\\label\{[^}]*\}/g, '')
    .trim();
  if (!s) return '';
  s = escapeHtml(s);

  // Matrices and cases environments
  s = s.replace(/\\begin\{(p|b|B|v|V)?matrix\}([\s\S]*?)\\end\{\1?matrix\}/g, (_, kind, body) => {
    const open = { p: '(', b: '[', B: '{', v: '|', V: '‖' }[kind] || '';
    const close = { p: ')', b: ']', B: '}', v: '|', V: '‖' }[kind] || '';
    const trs = body
      .trim()
      .split(/\\\\/)
      .filter((r) => r.trim())
      .map(
        (r) =>
          '<tr>' +
          r
            .split('&')
            .map((c) => `<td>${renderInlineMath(c.trim())}</td>`)
            .join('') +
          '</tr>',
      )
      .join('');
    return `<span class="math-matrix"><span class="math-delim">${open}</span><table><tbody>${trs}</tbody></table><span class="math-delim">${close}</span></span>`;
  });

  s = s.replace(/\\begin\{cases\}([\s\S]*?)\\end\{cases\}/g, (_, body) => {
    const trs = body
      .trim()
      .split(/\\\\/)
      .filter((r) => r.trim())
      .map(
        (r) =>
          '<tr>' +
          r
            .split('&')
            .map((c) => `<td>${renderInlineMath(c.trim())}</td>`)
            .join('') +
          '</tr>',
      )
      .join('');
    return `<span class="math-matrix"><span class="math-delim">{</span><table><tbody>${trs}</tbody></table></span>`;
  });

  return renderInlineMath(s);
}

function renderInlineMath(input) {
  let s = input;
  s = s.replace(/\\mathbb\{([A-Z])\}/g, (_, l) => BLACKBOARD[l] || l);
  s = s.replace(/\\(?:text|mathrm|textbf|mathit)\{([^{}]*)\}/g, '<span class="math-text">$1</span>');
  for (let i = 0; i < 3; i++) {
    s = s.replace(
      /\\(?:d|t)?frac\{([^{}]*)\}\{([^{}]*)\}/g,
      '<span class="math-frac"><span class="math-num">$1</span><span class="math-den">$2</span></span>',
    );
    s = s.replace(
      /\\sqrt\[([^\]]*)\]\{([^{}]*)\}/g,
      '<sup class="math-root">$1</sup>√(<span class="math-rad">$2</span>)',
    );
    s = s.replace(/\\sqrt\{([^{}]*)\}/g, '√(<span class="math-rad">$1</span>)');
    s = s.replace(/\^\{([^{}]*)\}/g, '<sup>$1</sup>');
    s = s.replace(/_\{([^{}]*)\}/g, '<sub>$1</sub>');
  }
  s = s.replace(/\^([a-zA-Z0-9+-])/g, '<sup>$1</sup>');
  s = s.replace(/_([a-zA-Z0-9+-])/g, '<sub>$1</sub>');
  s = s.replace(/\\(?:left|right)\s*([()[\]|.])/g, (_, d) => (d === '.' ? '' : d));
  s = s.replace(/\\(?:left|right)\\([{}])/g, '$1');
  s = s.replace(/\\([a-zA-Z]+)/g, (all, name) => GREEK_MAP[name] || name);
  s = s.replace(/\\[,;:!]/g, ' ');
  s = s.replace(/\\\\/g, '<br/>');
  return s;
}
