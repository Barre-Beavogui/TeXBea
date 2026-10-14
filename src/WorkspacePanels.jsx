import React, { useMemo, useState } from 'react';
import { X, AlertCircle, AlertTriangle, Info, RotateCcw } from 'lucide-react';
import { diffLines, compareFiles } from './diff.js';
import { wordCount } from './word-count.js';
import { defaultSettings } from './settings.js';

function Modal({ title, onClose, wide, children }) {
  return (
    <div className="modalBack" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={'modal' + (wide ? ' modal-wide' : '')} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modalHead">
          <h2>{title}</h2>
          <button aria-label="Fermer" onClick={onClose}>
            <X />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

const levelIcon = { error: AlertCircle, warning: AlertTriangle, typesetting: Info };
const levelName = { error: 'Erreurs', warning: 'Avertissements', typesetting: 'Mise en page' };

// Overleaf-style log: grouped, clickable entries, with the raw log one click away.
export function LogPanel({ parsed, raw, onJump, onAskBea, onFixWithBea, onClose }) {
  const [filter, setFilter] = useState(parsed.errors.length ? 'error' : 'all'),
    [showRaw, setShowRaw] = useState(false);
  const list = filter === 'all' ? parsed.all : parsed.all.filter((e) => e.level === filter);
  return (
    <section className="log-panel" aria-label="Journal de compilation">
      <div className="log-head">
        <b>Journal</b>
        <div className="log-filters">
          <button className={filter === 'all' ? 'on' : ''} onClick={() => setFilter('all')}>
            Tout ({parsed.all.length})
          </button>
          {['error', 'warning', 'typesetting'].map((level) => (
            <button
              key={level}
              className={(filter === level ? 'on ' : '') + 'level-' + level}
              onClick={() => setFilter(level)}
            >
              {levelName[level]} ({parsed.all.filter((e) => e.level === level).length})
            </button>
          ))}
        </div>
        <button className="log-close" aria-label="Fermer le journal" onClick={onClose}>
          <X size={16} />
        </button>
      </div>
      <div className="log-list">
        {!list.length && <p className="log-empty">Rien à signaler dans cette catégorie.</p>}
        {list.map((entry, i) => {
          const Icon = levelIcon[entry.level];
          return (
            <div key={i} className={'log-entry level-' + entry.level}>
              <button className="log-entry-main" disabled={!entry.file || !entry.line} onClick={() => onJump(entry)}>
                <Icon size={15} />
                <span className="log-message">{entry.message}</span>
                {entry.file && (
                  <span className="log-location">
                    {entry.file}
                    {entry.line ? ' · ligne ' + entry.line : ''}
                  </span>
                )}
              </button>
              {entry.level === 'error' && onFixWithBea && entry.file && entry.line && (
                <button className="log-ask log-fix" onClick={() => onFixWithBea(entry)}>
                  Corriger avec Bea
                </button>
              )}
              {entry.level === 'error' && onAskBea && (
                <button className="log-ask" onClick={() => onAskBea(entry)}>
                  Expliquer
                </button>
              )}
            </div>
          );
        })}
      </div>
      <details className="log-raw" open={showRaw} onToggle={(e) => setShowRaw(e.currentTarget.open)}>
        <summary>Journal brut</summary>
        <pre>{raw}</pre>
      </details>
    </section>
  );
}

// Search every text file of the project, like Overleaf's "Search in project" (Ctrl+Shift+F).
export function ProjectSearch({ files, onJump, onClose }) {
  const [term, setTerm] = useState(''),
    [caseSensitive, setCaseSensitive] = useState(false),
    [regex, setRegex] = useState(false),
    [wholeWord, setWholeWord] = useState(false);
  const { results, error } = useMemo(() => {
    if (!term) return { results: [] };
    let re;
    try {
      const source = regex ? term : term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      re = new RegExp(
        wholeWord ? `(?<![\\p{L}\\p{N}_])(?:${source})(?![\\p{L}\\p{N}_])` : source,
        'gu' + (caseSensitive ? '' : 'i'),
      );
    } catch (e) {
      return { results: [], error: 'Expression régulière invalide' };
    }
    const out = [];
    for (const [file, text] of Object.entries(files)) {
      for (const m of text.matchAll(re)) {
        if (!m[0]) break;
        const lineStart = text.lastIndexOf('\n', m.index - 1) + 1;
        const lineEnd = text.indexOf('\n', m.index);
        const line = text.slice(0, m.index).split('\n').length;
        out.push({
          file,
          line,
          start: m.index,
          end: m.index + m[0].length,
          before: text.slice(Math.max(lineStart, m.index - 40), m.index),
          match: m[0],
          after: text.slice(
            m.index + m[0].length,
            Math.min(lineEnd < 0 ? text.length : lineEnd, m.index + m[0].length + 60),
          ),
        });
        if (out.length >= 500) return { results: out };
      }
    }
    return { results: out };
  }, [files, term, caseSensitive, regex, wholeWord]);
  const grouped = results.reduce((acc, r) => ((acc[r.file] ||= []).push(r), acc), {});
  return (
    <section className="project-search" aria-label="Rechercher dans le projet">
      <div className="project-search-head">
        <input
          autoFocus
          placeholder="Rechercher dans tout le projet…"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
        />
        <button aria-label="Fermer la recherche" onClick={onClose}>
          <X size={16} />
        </button>
      </div>
      <div className="project-search-options">
        <label>
          <input type="checkbox" checked={caseSensitive} onChange={(e) => setCaseSensitive(e.target.checked)} /> Aa
        </label>
        <label>
          <input type="checkbox" checked={wholeWord} onChange={(e) => setWholeWord(e.target.checked)} /> Mot entier
        </label>
        <label>
          <input type="checkbox" checked={regex} onChange={(e) => setRegex(e.target.checked)} /> .* Regex
        </label>
        <span>
          {error ||
            (term
              ? `${results.length}${results.length === 500 ? '+' : ''} résultat${results.length > 1 ? 's' : ''}`
              : '')}
        </span>
      </div>
      <div className="project-search-results">
        {Object.entries(grouped).map(([file, items]) => (
          <div key={file}>
            <h4>
              {file} <small>{items.length}</small>
            </h4>
            {items.map((r, i) => (
              <button key={i} onClick={() => onJump(r)}>
                <span className="result-line">{r.line}</span>
                <span className="result-text">
                  {r.before}
                  <mark>{r.match}</mark>
                  {r.after}
                </span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

// History with a line-by-line comparison of any saved version against the current files.
export function HistoryPanel({ history, files, onRestore, onSnapshot, onClose }) {
  const versions = [...(history || [])].reverse();
  const [selected, setSelected] = useState(versions[0]?.id),
    [file, setFile] = useState(null);
  const version = versions.find((v) => v.id === selected) || versions[0];
  const changes = useMemo(() => (version ? compareFiles(version.files, files) : []), [version, files]);
  const currentFile = file && changes.some((c) => c.name === file) ? file : changes[0]?.name;
  const lines = useMemo(
    () => (version && currentFile ? diffLines(version.files[currentFile] ?? '', files[currentFile] ?? '') : []),
    [version, currentFile, files],
  );
  return (
    <Modal title="Historique et comparaison" onClose={onClose} wide>
      <div className="history-layout">
        <div className="history-versions">
          <button className="history-new" onClick={onSnapshot}>
            Créer une version maintenant
          </button>
          {versions.map((v) => (
            <button key={v.id} className={v.id === version?.id ? 'on' : ''} onClick={() => setSelected(v.id)}>
              <b>{v.label}</b>
              <small>{new Date(v.at).toLocaleString()}</small>
            </button>
          ))}
          {!versions.length && <p>Aucune version enregistrée. Une version est créée avant chaque remplacement.</p>}
        </div>
        <div className="history-diff">
          {version && (
            <>
              <div className="history-diff-head">
                <span>Différences entre « {version.label} » et la version actuelle</span>
                <button onClick={() => onRestore(version.id)}>
                  <RotateCcw size={14} /> Restaurer cette version
                </button>
              </div>
              {!changes.length && <p>Aucune différence avec la version actuelle.</p>}
              <div className="history-files">
                {changes.map((c) => (
                  <button key={c.name} className={c.name === currentFile ? 'on' : ''} onClick={() => setFile(c.name)}>
                    {c.name}
                    <span className="diff-added">+{c.added}</span>
                    <span className="diff-removed">−{c.removed}</span>
                    {c.status !== 'changed' && <em>{c.status === 'added' ? 'nouveau' : 'supprimé'}</em>}
                  </button>
                ))}
              </div>
              <pre className="diff-view">
                {lines.map((l, i) =>
                  l.type === 'same' && !lines.slice(Math.max(0, i - 3), i + 4).some((x) => x.type !== 'same') ? null : (
                    <div key={i} className={'diff-' + l.type}>
                      <span className="diff-num">{l.oldLine ?? ''}</span>
                      <span className="diff-num">{l.newLine ?? ''}</span>
                      <span className="diff-sign">{l.type === 'add' ? '+' : l.type === 'del' ? '−' : ' '}</span>
                      {l.text || ' '}
                    </div>
                  ),
                )}
              </pre>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}

export function WordCountDialog({ files, main, onClose }) {
  const c = useMemo(() => wordCount(files, main), [files, main]);
  const rows = [
    ['Mots dans le texte', c.words],
    ['Titres de sections', c.headers],
    ['Mots dans les titres', c.headerWords],
    ['Mots dans les légendes', c.captionWords],
    ['Formules dans le texte', c.mathInline],
    ['Formules centrées', c.mathDisplay],
    ['Figures et tableaux', c.floats],
  ];
  return (
    <Modal title="Nombre de mots" onClose={onClose}>
      <p className="word-total">
        <b>{(c.words + c.headerWords + c.captionWords).toLocaleString('fr-FR')}</b> mots au total
      </p>
      <table className="word-table">
        <tbody>
          {rows.map(([label, value]) => (
            <tr key={label}>
              <td>{label}</td>
              <td>{value.toLocaleString('fr-FR')}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <small>Calcul sur {main} et les fichiers inclus, hors préambule, commentaires et bibliographie.</small>
    </Modal>
  );
}

const shortcuts = [
  ['Ctrl/Cmd + S', 'Sauvegarder'],
  ['Ctrl/Cmd + Entrée', 'Compiler'],
  ['Ctrl/Cmd + B / I', 'Gras / italique'],
  ['Ctrl/Cmd + /', 'Commenter les lignes'],
  ['Ctrl/Cmd + F', 'Rechercher et remplacer dans le fichier'],
  ['Ctrl/Cmd + Maj + F', 'Rechercher dans le projet'],
  ['Ctrl/Cmd + Z / Maj + Z', 'Annuler / rétablir'],
  ['Ctrl + Espace', 'Suggestions'],
  ['Alt + clic', 'Plusieurs curseurs'],
  ['Ctrl/Cmd + Maj + [ / ]', 'Replier / déplier'],
  ['Double-clic sur le PDF', 'Aller au code'],
  ['Ctrl/Cmd + J', 'Demander à Bea de modifier la sélection'],
];

export function SettingsDialog({ settings, onChange, onClose }) {
  const set = (key, value) => onChange({ ...settings, [key]: value });
  return (
    <Modal title="Réglages" onClose={onClose}>
      <div className="settings-grid">
        <label>
          Thème de l’éditeur
          <select value={settings.theme} onChange={(e) => set('theme', e.target.value)}>
            <option value="dark">Sombre</option>
            <option value="light">Clair</option>
          </select>
        </label>
        <label>
          Taille du texte
          <select value={settings.fontSize} onChange={(e) => set('fontSize', Number(e.target.value))}>
            {[11, 12, 13, 14, 15, 16, 18, 20].map((n) => (
              <option key={n} value={n}>
                {n} px
              </option>
            ))}
          </select>
        </label>
        <label>
          Raccourcis clavier
          <select value={settings.keymap} onChange={(e) => set('keymap', e.target.value)}>
            <option value="default">Standard</option>
            <option value="vim">Vim</option>
            <option value="emacs">Emacs</option>
          </select>
        </label>
        <label>
          Correcteur d’orthographe
          <select value={settings.spellcheck} onChange={(e) => set('spellcheck', e.target.value)}>
            <option value="off">Désactivé</option>
            <option value="fr">Français</option>
            <option value="en">Anglais</option>
            <option value="es">Espagnol</option>
            <option value="pt">Portugais</option>
            <option value="de">Allemand</option>
          </select>
        </label>
        {[
          ['autocomplete', 'Suggestions automatiques'],
          ['closeBrackets', 'Fermer automatiquement { [ ( $'],
          ['lineWrapping', 'Retour à la ligne automatique'],
          ['autoCompile', 'Compilation automatique après une pause'],
          ['aiAutoApply', 'Bea applique directement ses corrections (Ctrl/Cmd+Z pour annuler)'],
        ].map(([key, label]) => (
          <label key={key} className="settings-check">
            <input type="checkbox" checked={!!settings[key]} onChange={(e) => set(key, e.target.checked)} />
            {label}
          </label>
        ))}
      </div>
      <button className="link" onClick={() => onChange({ ...defaultSettings })}>
        Rétablir les réglages par défaut
      </button>
      <h3>Raccourcis</h3>
      <table className="shortcut-table">
        <tbody>
          {shortcuts.map(([keys, action]) => (
            <tr key={keys}>
              <td>
                <kbd>{keys}</kbd>
              </td>
              <td>{action}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <small>Le correcteur d’orthographe est celui du navigateur ; la langue doit y être installée.</small>
    </Modal>
  );
}
