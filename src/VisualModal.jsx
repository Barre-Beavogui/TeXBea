import React, { useMemo, useState } from 'react';
import { X, Plus, Trash2, Table, Sigma, Image as ImageIcon, ClipboardPaste } from 'lucide-react';
import {
  parseLatexTable,
  buildLatexTable,
  parseDelimitedTable,
  buildMatrixLatex,
  buildFigureLatex,
  renderMathPreview,
} from './visual-tools.js';

const MATH_PRESETS = [
  ['Fraction', '\\frac{a}{b}'],
  ['Racine', '\\sqrt{x^2 + y^2}'],
  ['Somme', '\\sum_{i=1}^{n} x_i'],
  ['Intégrale', '\\int_{a}^{b} f(x)\\,dx'],
  ['Limite', '\\lim_{x \\to \\infty} f(x)'],
  ['Dérivée partielle', '\\frac{\\partial f}{\\partial x}'],
  [' Binôme', '\\binom{n}{k}'],
  ['Vecteur', '\\vec{u} \\cdot \\vec{v}'],
];

export default function VisualModal({ initialTab = 'table', selection = '', assets = {}, onInsert, onClose }) {
  const parsedTable = useMemo(() => parseLatexTable(selection), [selection]);
  const [tab, setTab] = useState(initialTab);

  // Table state
  const [rows, setRows] = useState(
    parsedTable?.rows || [
      ['Paramètre', 'Symbole', 'Valeur'],
      ['Fréquence', '$f$', '50 Hz'],
      ['Tension', '$U$', '400 V'],
    ],
  );
  const [aligns, setAligns] = useState(parsedTable?.aligns || ['l', 'c', 'r']);
  const [tableStyle, setTableStyle] = useState(parsedTable?.style || 'borders');
  const [header, setHeader] = useState(parsedTable ? parsedTable.header : true);
  const [wrapped, setWrapped] = useState(parsedTable ? parsedTable.wrapped : true);
  const [caption, setCaption] = useState(parsedTable?.caption || '');
  const [label, setLabel] = useState(parsedTable?.label || '');
  const [pasteText, setPasteText] = useState('');
  const [showPaste, setShowPaste] = useState(false);

  // Math state
  const [mathLatex, setMathLatex] = useState(
    selection && !parsedTable ? selection.trim() : '\\int_{0}^{+\\infty} e^{-x^2}\\,dx = \\frac{\\sqrt{\\pi}}{2}',
  );
  const [mathMode, setMathMode] = useState('equation');
  const [matrixKind, setMatrixKind] = useState('pmatrix');
  const [matrixRows, setMatrixRows] = useState([
    ['a_{11}', 'a_{12}'],
    ['a_{21}', 'a_{22}'],
  ]);

  // Figure state
  const imageNames = Object.keys(assets).filter((n) => /\.(png|jpe?g|pdf)$/i.test(n));
  const [figFile, setFigFile] = useState(imageNames[0] || 'image.png');
  const [figWidth, setFigWidth] = useState('0.8\\linewidth');
  const [figPos, setFigPos] = useState('htbp');
  const [figCaption, setFigCaption] = useState('');
  const [figLabel, setFigLabel] = useState('');

  function setCell(r, c, val) {
    setRows((prev) => prev.map((row, ri) => (ri === r ? row.map((cell, ci) => (ci === c ? val : cell)) : row)));
  }
  function addRow() {
    const cols = rows[0]?.length || 2;
    setRows((prev) => [...prev, Array(cols).fill('')]);
  }
  function removeRow(r) {
    if (rows.length <= 1) return;
    setRows((prev) => prev.filter((_, i) => i !== r));
  }
  function addCol() {
    setRows((prev) => prev.map((r) => [...r, '']));
    setAligns((prev) => [...prev, 'c']);
  }
  function removeCol(c) {
    if ((rows[0]?.length || 1) <= 1) return;
    setRows((prev) => prev.map((r) => r.filter((_, i) => i !== c)));
    setAligns((prev) => prev.filter((_, i) => i !== c));
  }
  function applyPaste() {
    const grid = parseDelimitedTable(pasteText);
    if (!grid) return;
    setRows(grid);
    setAligns(Array(grid[0].length).fill('c'));
    setShowPaste(false);
    setPasteText('');
  }

  const generatedTable = useMemo(
    () => buildLatexTable({ rows, aligns, style: tableStyle, header, caption, label, wrapped }),
    [rows, aligns, tableStyle, header, caption, label, wrapped],
  );

  const generatedMath = useMemo(() => {
    const clean = mathLatex.trim();
    if (mathMode === 'inline') return `$${clean}$`;
    if (mathMode === 'display') return `\\[\n\t${clean}\n\\]`;
    return `\\begin{equation}\n\t${clean}\n\\end{equation}`;
  }, [mathLatex, mathMode]);

  const generatedFigure = useMemo(
    () => buildFigureLatex({ file: figFile, width: figWidth, position: figPos, caption: figCaption, label: figLabel }),
    [figFile, figWidth, figPos, figCaption, figLabel],
  );

  return (
    <div className="modalBack" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="modal modal-wide visual-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Assistant visuel LaTeX"
      >
        <div className="modalHead">
          <h2>Assistant visuel LaTeX</h2>
          <button aria-label="Fermer" onClick={onClose}>
            <X />
          </button>
        </div>
        <div className="source-tabs" role="tablist">
          <button
            role="tab"
            aria-selected={tab === 'table'}
            className={tab === 'table' ? 'on' : ''}
            onClick={() => setTab('table')}
          >
            <Table size={15} /> Tableau visuel
          </button>
          <button
            role="tab"
            aria-selected={tab === 'math'}
            className={tab === 'math' ? 'on' : ''}
            onClick={() => setTab('math')}
          >
            <Sigma size={15} /> Formule & Matrice
          </button>
          <button
            role="tab"
            aria-selected={tab === 'figure'}
            className={tab === 'figure' ? 'on' : ''}
            onClick={() => setTab('figure')}
          >
            <ImageIcon size={15} /> Figure & Image
          </button>
        </div>

        {tab === 'table' && (
          <div className="visual-pane">
            <div className="visual-controls">
              <label>
                Style
                <select value={tableStyle} onChange={(e) => setTableStyle(e.target.value)}>
                  <option value="borders">Grille complète (\hline)</option>
                  <option value="booktabs">Scientifique (booktabs)</option>
                  <option value="plain">Épuré (sans bordures)</option>
                </select>
              </label>
              <label>
                <input type="checkbox" checked={header} onChange={(e) => setHeader(e.target.checked)} /> En-tête en gras
              </label>
              <label>
                <input type="checkbox" checked={wrapped} onChange={(e) => setWrapped(e.target.checked)} /> Environnement
                table + légende
              </label>
              <button type="button" onClick={addRow}>
                <Plus size={14} /> Ligne
              </button>
              <button type="button" onClick={addCol}>
                <Plus size={14} /> Colonne
              </button>
              <button type="button" onClick={() => setShowPaste((v) => !v)}>
                <ClipboardPaste size={14} /> Coller CSV / Excel
              </button>
            </div>

            {showPaste && (
              <div className="visual-paste">
                <textarea
                  rows={3}
                  placeholder="Colle ici des cellules copiées depuis Excel, Numbers ou un fichier CSV…"
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                />
                <button type="button" className="primary" onClick={applyPaste} disabled={!pasteText.trim()}>
                  Remplir la grille
                </button>
              </div>
            )}

            {wrapped && (
              <div className="visual-meta">
                <input
                  placeholder="Légende du tableau (\caption)"
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                />
                <input
                  placeholder="Étiquette (\label{tab:...})"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                />
              </div>
            )}

            <div className="visual-table-scroll">
              <table className="visual-grid-editor">
                <thead>
                  <tr>
                    {(rows[0] || []).map((_, c) => (
                      <th key={c}>
                        <div className="col-head">
                          <select
                            aria-label={`Alignement colonne ${c + 1}`}
                            value={aligns[c] || 'c'}
                            onChange={(e) => setAligns((prev) => prev.map((a, i) => (i === c ? e.target.value : a)))}
                          >
                            <option value="l">Gauche (l)</option>
                            <option value="c">Centré (c)</option>
                            <option value="r">Droite (r)</option>
                          </select>
                          {rows[0].length > 1 && (
                            <button type="button" title="Supprimer la colonne" onClick={() => removeCol(c)}>
                              <Trash2 size={12} />
                            </button>
                          )}
                        </div>
                      </th>
                    ))}
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, r) => (
                    <tr key={r} className={header && r === 0 ? 'is-header' : ''}>
                      {row.map((cell, c) => (
                        <td key={c}>
                          <input
                            value={cell}
                            placeholder={r === 0 && header ? `En-tête ${c + 1}` : `Cellule ${r + 1},${c + 1}`}
                            onChange={(e) => setCell(r, c, e.target.value)}
                          />
                        </td>
                      ))}
                      <td>
                        {rows.length > 1 && (
                          <button type="button" title="Supprimer la ligne" onClick={() => removeRow(r)}>
                            <Trash2 size={13} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <details className="visual-code-preview">
              <summary>Code LaTeX généré</summary>
              <pre>{generatedTable}</pre>
            </details>

            <div className="modalActions">
              <button type="button" onClick={onClose}>
                Annuler
              </button>
              <button
                type="button"
                className="primary"
                onClick={() => {
                  onInsert(generatedTable);
                  onClose();
                }}
              >
                {parsedTable ? 'Mettre à jour le tableau' : 'Insérer le tableau'}
              </button>
            </div>
          </div>
        )}

        {tab === 'math' && (
          <div className="visual-pane">
            <div className="visual-math-presets">
              {MATH_PRESETS.map(([name, snippet]) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => setMathLatex((prev) => (prev ? `${prev} ${snippet}` : snippet))}
                >
                  {name}
                </button>
              ))}
            </div>

            <div className="visual-math-split">
              <div className="visual-math-input">
                <label>
                  Expression LaTeX
                  <textarea
                    rows={4}
                    value={mathLatex}
                    onChange={(e) => setMathLatex(e.target.value)}
                    placeholder="Ex: \sum_{n=1}^{\infty} \frac{1}{n^2} = \frac{\pi^2}{6}"
                  />
                </label>
                <div className="visual-controls">
                  <label>
                    Format d’insertion
                    <select value={mathMode} onChange={(e) => setMathMode(e.target.value)}>
                      <option value="equation">Équation numérotée (\begin&#123;equation&#125;)</option>
                      <option value="display">Formule centrée (\[ … \])</option>
                      <option value="inline">Dans le texte ($ … $)</option>
                    </select>
                  </label>
                </div>
              </div>

              <div className="visual-math-preview-box">
                <small>Aperçu en direct</small>
                <div
                  className="math-live-preview"
                  aria-label="Aperçu de la formule"
                  dangerouslySetInnerHTML={{ __html: renderMathPreview(mathLatex) }}
                />
              </div>
            </div>

            <div className="visual-matrix-builder">
              <div className="visual-controls">
                <b>Constructeur de matrice / système</b>
                <select value={matrixKind} onChange={(e) => setMatrixKind(e.target.value)}>
                  <option value="pmatrix">Parenthèses (pmatrix)</option>
                  <option value="bmatrix">Crochets [bmatrix]</option>
                  <option value="vmatrix">Déterminant |vmatrix|</option>
                  <option value="cases">Système d’équations (cases)</option>
                </select>
                <button type="button" onClick={() => setMatrixRows((r) => [...r, Array(r[0]?.length || 2).fill('0')])}>
                  <Plus size={13} /> Ligne
                </button>
                <button type="button" onClick={() => setMatrixRows((r) => r.map((row) => [...row, '0']))}>
                  <Plus size={13} /> Colonne
                </button>
                <button type="button" onClick={() => setMathLatex(buildMatrixLatex(matrixRows, matrixKind))}>
                  Envoyer dans la formule
                </button>
              </div>
              <div className="matrix-grid">
                {matrixRows.map((row, r) => (
                  <div key={r} className="matrix-row">
                    {row.map((val, c) => (
                      <input
                        key={c}
                        value={val}
                        onChange={(e) =>
                          setMatrixRows((prev) =>
                            prev.map((ri, i) => (i === r ? ri.map((ci, j) => (j === c ? e.target.value : ci)) : ri)),
                          )
                        }
                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>

            <div className="modalActions">
              <button type="button" onClick={onClose}>
                Annuler
              </button>
              <button
                type="button"
                className="primary"
                onClick={() => {
                  onInsert(generatedMath);
                  onClose();
                }}
              >
                Insérer la formule
              </button>
            </div>
          </div>
        )}

        {tab === 'figure' && (
          <div className="visual-pane">
            <div className="visual-controls">
              <label>
                Fichier image du projet
                {imageNames.length > 0 ? (
                  <select value={figFile} onChange={(e) => setFigFile(e.target.value)}>
                    {imageNames.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input value={figFile} onChange={(e) => setFigFile(e.target.value)} placeholder="nom-image.png" />
                )}
              </label>
              <label>
                Largeur
                <select value={figWidth} onChange={(e) => setFigWidth(e.target.value)}>
                  <option value="0.5\linewidth">50 % (0.5\linewidth)</option>
                  <option value="0.7\linewidth">70 % (0.7\linewidth)</option>
                  <option value="0.8\linewidth">80 % (0.8\linewidth)</option>
                  <option value="1.0\linewidth">100 % (1.0\linewidth)</option>
                </select>
              </label>
              <label>
                Position
                <select value={figPos} onChange={(e) => setFigPos(e.target.value)}>
                  <option value="htbp">Automatique (htbp)</option>
                  <option value="h!">Ici de préférence (h!)</option>
                  <option value="t">Haut de page (t)</option>
                  <option value="b">Bas de page (b)</option>
                  <option value="H">Exactement ici (H - paquet float)</option>
                </select>
              </label>
            </div>
            <div className="visual-meta">
              <input
                placeholder="Légende de la figure (\caption)"
                value={figCaption}
                onChange={(e) => setFigCaption(e.target.value)}
              />
              <input
                placeholder="Étiquette (\label{fig:...})"
                value={figLabel}
                onChange={(e) => setFigLabel(e.target.value)}
              />
            </div>
            {assets[figFile] && /\.(png|jpe?g)$/i.test(figFile) && (
              <div className="visual-fig-thumb">
                <img
                  alt={figFile}
                  src={`data:image/${figFile.toLowerCase().endsWith('.png') ? 'png' : 'jpeg'};base64,${assets[figFile]}`}
                />
              </div>
            )}
            <pre className="visual-code-preview">{generatedFigure}</pre>
            <div className="modalActions">
              <button type="button" onClick={onClose}>
                Annuler
              </button>
              <button
                type="button"
                className="primary"
                onClick={() => {
                  onInsert(generatedFigure);
                  onClose();
                }}
              >
                Insérer la figure
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
