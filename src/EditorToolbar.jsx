import React, { useState } from 'react';
import {
  Bold,
  Italic,
  Sigma,
  List,
  ListOrdered,
  Link,
  Image,
  Table,
  Quote,
  Hash,
  MessageSquareOff,
  X,
  Sparkles,
  ChevronDown,
  Camera,
} from 'lucide-react';
import { aiActions } from './ai-actions.js';

export const symbolGroups = {
  Grec: 'alpha beta gamma delta epsilon varepsilon zeta eta theta vartheta iota kappa lambda mu nu xi pi rho sigma tau upsilon phi varphi chi psi omega Gamma Delta Theta Lambda Xi Pi Sigma Phi Psi Omega',
  Opérateurs:
    'pm mp times div cdot ast star circ bullet oplus otimes cap cup setminus wedge vee sum prod int iint oint partial nabla sqrt{x} frac{a}{b}',
  Relations:
    'leq geq neq approx equiv sim simeq cong propto ll gg in notin subset subseteq supset supseteq perp parallel mid',
  Flèches:
    'to rightarrow leftarrow leftrightarrow Rightarrow Leftarrow Leftrightarrow mapsto longrightarrow uparrow downarrow implies iff',
  Divers:
    'infty forall exists nexists emptyset varnothing mathbb{R} mathbb{N} mathbb{Z} mathbb{Q} mathbb{C} ell hbar Re Im aleph angle degree ldots cdots vdots ddots',
};
const preview = {
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
  'sqrt{x}': '√x',
  'frac{a}{b}': 'a⁄b',
  leq: '≤',
  geq: '≥',
  neq: '≠',
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
  'mathbb{R}': 'ℝ',
  'mathbb{N}': 'ℕ',
  'mathbb{Z}': 'ℤ',
  'mathbb{Q}': 'ℚ',
  'mathbb{C}': 'ℂ',
  ell: 'ℓ',
  hbar: 'ℏ',
  Re: 'ℜ',
  Im: 'ℑ',
  aleph: 'ℵ',
  angle: '∠',
  degree: '°',
  ldots: '…',
  cdots: '⋯',
  vdots: '⋮',
  ddots: '⋱',
};
const insertFor = (name) =>
  name === 'degree' ? '^\\circ' : '\\' + name.replace(/\{[ab x]\}/g, '{${}}') + (/[a-z]$/i.test(name) ? ' ' : '');

export function tableSnippet(rows, cols, withBorders) {
  const spec = withBorders ? '|' + Array(cols).fill('c').join('|') + '|' : Array(cols).fill('l').join(' ');
  const line = Array(cols)
    .fill(0)
    .map((_, i) => '${}')
    .join(' & ');
  const body = Array(rows)
    .fill(0)
    .map(() => '\t\t' + line + ' \\\\' + (withBorders ? ' \\hline' : ''))
    .join('\n');
  return `\\begin{table}[htbp]
\t\\centering
\t\\caption{\${Légende}}
\t\\label{tab:\${étiquette}}
\t\\begin{tabular}{${spec}}${withBorders ? ' \\hline' : ''}
${body}
\t\\end{tabular}
\\end{table}`;
}

function TableDialog({ onInsert, onClose }) {
  const [rows, setRows] = useState(3),
    [cols, setCols] = useState(3),
    [borders, setBorders] = useState(true);
  return (
    <div className="toolbar-popover table-popover" role="dialog" aria-label="Insérer un tableau">
      <div className="popover-head">
        <b>Insérer un tableau</b>
        <button aria-label="Fermer" onClick={onClose}>
          <X size={14} />
        </button>
      </div>
      <div className="table-grid" onMouseLeave={() => {}}>
        {Array.from({ length: 8 }, (_, r) =>
          Array.from({ length: 8 }, (_, c) => (
            <button
              key={r + '-' + c}
              aria-label={`${r + 1} × ${c + 1}`}
              className={r < rows && c < cols ? 'on' : ''}
              onMouseEnter={() => {
                setRows(r + 1);
                setCols(c + 1);
              }}
              onClick={() => onInsert(tableSnippet(r + 1, c + 1, borders))}
            />
          )),
        )}
      </div>
      <p>
        {rows} ligne{rows > 1 ? 's' : ''} × {cols} colonne{cols > 1 ? 's' : ''}
      </p>
      <label>
        <input type="checkbox" checked={borders} onChange={(e) => setBorders(e.target.checked)} /> Bordures
      </label>
    </div>
  );
}

function SymbolPalette({ onInsert, onClose }) {
  const [group, setGroup] = useState('Grec'),
    [query, setQuery] = useState('');
  const names = query
    ? Object.values(symbolGroups)
        .flatMap((g) => g.split(' '))
        .filter((n) => n.toLowerCase().includes(query.toLowerCase()))
    : symbolGroups[group].split(' ');
  return (
    <div className="toolbar-popover symbol-palette" role="dialog" aria-label="Symboles mathématiques">
      <div className="popover-head">
        <input placeholder="Chercher un symbole…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <button aria-label="Fermer" onClick={onClose}>
          <X size={14} />
        </button>
      </div>
      {!query && (
        <div className="symbol-tabs">
          {Object.keys(symbolGroups).map((g) => (
            <button key={g} className={g === group ? 'on' : ''} onClick={() => setGroup(g)}>
              {g}
            </button>
          ))}
        </div>
      )}
      <div className="symbol-grid">
        {names.map((name) => (
          <button key={name} title={'\\' + name} onClick={() => onInsert(insertFor(name))}>
            {preview[name] || name}
          </button>
        ))}
      </div>
    </div>
  );
}

// Formatting toolbar, like Overleaf's editor toolbar: everything inserts plain LaTeX at the cursor.
function BeaMenu({ onPick }) {
  return (
    <div className="toolbar-popover bea-menu" role="menu" aria-label="Actions de Bea">
      <p>Sur la sélection, ou sur le paragraphe du curseur :</p>
      {aiActions
        .filter((a) => !a.hidden)
        .map((a) => (
          <button key={a.id} role="menuitem" onClick={() => onPick(a.id)}>
            {a.label}
            {a.id === 'custom' && <kbd>Ctrl/Cmd+J</kbd>}
          </button>
        ))}
    </div>
  );
}

export default function EditorToolbar({ editor, onBea }) {
  const [open, setOpen] = useState(null);
  const ed = () => editor.current;
  const insert = (s) => ed()?.insert(s);
  const toggle = (name) => setOpen((o) => (o === name ? null : name));
  return (
    <div className="editor-toolbar-wrap">
      <div className="editor-toolbar" role="toolbar" aria-label="Mise en forme LaTeX">
        {onBea && (
          <>
            <button
              className="bea-button"
              title="Bea corrige, améliore, traduit ou rédige directement dans le code"
              aria-label="Bea"
              aria-expanded={open === 'bea'}
              onClick={() => toggle('bea')}
            >
              <Sparkles size={15} />
              Bea
              <ChevronDown size={13} />
            </button>
            <button
              title="Photo → LaTeX : Bea transcrit une formule, un tableau ou une page (tu peux aussi coller ou glisser une image dans le code)"
              aria-label="Photo vers LaTeX"
              onClick={() => onBea('photo')}
            >
              <Camera size={15} />
            </button>
            <span className="toolbar-sep" />
          </>
        )}
        <select
          aria-label="Titre de section"
          value=""
          onChange={(e) => {
            if (e.target.value) insert(`\\${e.target.value}{\${titre}}`);
          }}
        >
          <option value="">Normal</option>
          <option value="chapter">Chapitre</option>
          <option value="section">Section</option>
          <option value="subsection">Sous-section</option>
          <option value="subsubsection">Sous-sous-section</option>
          <option value="paragraph">Paragraphe</option>
        </select>
        <button title="Gras (Ctrl/Cmd+B)" aria-label="Gras" onClick={() => ed()?.wrap('\\textbf{', '}')}>
          <Bold size={15} />
        </button>
        <button title="Italique (Ctrl/Cmd+I)" aria-label="Italique" onClick={() => ed()?.wrap('\\textit{', '}')}>
          <Italic size={15} />
        </button>
        <span className="toolbar-sep" />
        <button title="Formule dans le texte" aria-label="Formule dans le texte" onClick={() => ed()?.wrap('$', '$')}>
          <span className="toolbar-glyph">$x$</span>
        </button>
        <button
          title="Équation centrée"
          aria-label="Équation centrée"
          onClick={() => insert('\\begin{equation}\n\t${}\n\t\\label{eq:${}}\n\\end{equation}')}
        >
          <span className="toolbar-glyph">(1)</span>
        </button>
        <button
          title="Symboles"
          aria-label="Symboles mathématiques"
          aria-expanded={open === 'symbols'}
          onClick={() => toggle('symbols')}
        >
          <Sigma size={15} />
        </button>
        <span className="toolbar-sep" />
        <button
          title="Liste à puces"
          aria-label="Liste à puces"
          onClick={() => insert('\\begin{itemize}\n\t\\item ${}\n\\end{itemize}')}
        >
          <List size={15} />
        </button>
        <button
          title="Liste numérotée"
          aria-label="Liste numérotée"
          onClick={() => insert('\\begin{enumerate}\n\t\\item ${}\n\\end{enumerate}')}
        >
          <ListOrdered size={15} />
        </button>
        <span className="toolbar-sep" />
        <button title="Lien" aria-label="Lien" onClick={() => insert('\\href{${https://}}{${texte}}')}>
          <Link size={15} />
        </button>
        <button title="Référence croisée" aria-label="Référence croisée" onClick={() => insert('\\ref{${}}')}>
          <Hash size={15} />
        </button>
        <button title="Citation bibliographique" aria-label="Citation" onClick={() => insert('\\cite{${}}')}>
          <Quote size={15} />
        </button>
        <button
          title="Figure"
          aria-label="Figure"
          onClick={() =>
            insert(
              '\\begin{figure}[htbp]\n\t\\centering\n\t\\includegraphics[width=0.8\\linewidth]{${fichier}}\n\t\\caption{${Légende}}\n\t\\label{fig:${étiquette}}\n\\end{figure}',
            )
          }
        >
          <Image size={15} />
        </button>
        <button title="Tableau" aria-label="Tableau" aria-expanded={open === 'table'} onClick={() => toggle('table')}>
          <Table size={15} />
        </button>
        <button
          title="Commenter (Ctrl/Cmd+/)"
          aria-label="Commenter ou décommenter"
          onClick={() => ed()?.toggleComment()}
        >
          <MessageSquareOff size={15} />
        </button>
      </div>
      {open === 'bea' && (
        <BeaMenu
          onPick={(id) => {
            setOpen(null);
            onBea(id);
          }}
        />
      )}
      {open === 'symbols' && <SymbolPalette onInsert={insert} onClose={() => setOpen(null)} />}
      {open === 'table' && (
        <TableDialog
          onInsert={(s) => {
            insert(s);
            setOpen(null);
          }}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}
