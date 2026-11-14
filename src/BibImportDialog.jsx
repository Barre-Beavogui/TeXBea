import React, { useMemo, useState } from 'react';
import { X, Search, BookOpen, Plus, Check, RefreshCw } from 'lucide-react';
import { existingBibKeys, buildBibtexEntry, lookupBibliography } from './bib-import.js';

export default function BibImportDialog({ files = {}, onAddBibEntry, onCiteKey, onClose }) {
  const bibFiles = Object.keys(files).filter((n) => /\.bib$/i.test(n));
  const [targetBib, setTargetBib] = useState(bibFiles[0] || 'references.bib');
  const [tab, setTab] = useState('lookup');

  // Lookup state (DOI / arXiv / Crossref / raw BibTeX)
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState([]);
  const [addedKeys, setAddedKeys] = useState(new Set());

  // Manual form state
  const [form, setForm] = useState({
    type: 'article',
    key: '',
    author: '',
    title: '',
    year: new Date().getFullYear().toString(),
    journal: '',
    booktitle: '',
    publisher: '',
    volume: '',
    pages: '',
    doi: '',
    url: '',
  });

  const existing = useMemo(() => existingBibKeys(files[targetBib] || ''), [files, targetBib]);
  const manualPreview = useMemo(() => buildBibtexEntry(form, existing), [form, existing]);

  async function runLookup(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const list = await lookupBibliography(query, existing);
      setResults(list);
    } catch (err) {
      setError(err.message);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  async function addCandidate(item, citeAfter = false) {
    try {
      const res = await onAddBibEntry(targetBib, item.bibtex);
      setAddedKeys((prev) => new Set([...prev, res.key]));
      if (citeAfter && onCiteKey) {
        onCiteKey(res.key);
        onClose();
      }
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="modalBack" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="modal modal-wide bib-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Importer une référence bibliographique"
      >
        <div className="modalHead">
          <h2>
            <BookOpen size={18} /> Bibliographie (.bib)
          </h2>
          <button aria-label="Fermer" onClick={onClose}>
            <X />
          </button>
        </div>

        <div className="visual-controls">
          <label>
            Fichier .bib cible
            {bibFiles.length > 0 ? (
              <select value={targetBib} onChange={(e) => setTargetBib(e.target.value)}>
                {bibFiles.map((n) => (
                  <option key={n} value={n}>
                    {n} ({existingBibKeys(files[n] || '').size} réf.)
                  </option>
                ))}
              </select>
            ) : (
              <input value={targetBib} onChange={(e) => setTargetBib(e.target.value)} placeholder="references.bib" />
            )}
          </label>
        </div>

        <div className="source-tabs" role="tablist">
          <button
            role="tab"
            aria-selected={tab === 'lookup'}
            className={tab === 'lookup' ? 'on' : ''}
            onClick={() => setTab('lookup')}
          >
            <Search size={14} /> DOI, arXiv ou Recherche
          </button>
          <button
            role="tab"
            aria-selected={tab === 'manual'}
            className={tab === 'manual' ? 'on' : ''}
            onClick={() => setTab('manual')}
          >
            <Plus size={14} /> Saisie guidée (hors-ligne)
          </button>
        </div>

        {tab === 'lookup' && (
          <div className="visual-pane">
            <form className="bib-search-bar" onSubmit={runLookup}>
              <input
                autoFocus
                placeholder="Ex : 10.1038/nature14539, arXiv:1706.03762, titre d’article ou bloc @article{…}"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <button className="primary" disabled={loading || !query.trim()}>
                {loading ? <RefreshCw size={14} className="spin" /> : <Search size={14} />}
                Chercher
              </button>
            </form>
            {error && <div className="error">{error}</div>}
            <div className="bib-results">
              {!results.length && !loading && !error && (
                <p className="side-empty">
                  Entre un DOI, un identifiant arXiv, un titre/auteur ou colle directement une entrée BibTeX.
                </p>
              )}
              {results.map((item, i) => {
                const already = existing.has(item.key) || addedKeys.has(item.key);
                return (
                  <article key={i} className="bib-result-card">
                    <div className="bib-result-main">
                      <b>{item.title}</b>
                      <small>
                        {[
                          item.author,
                          item.year,
                          item.journal,
                          item.doi && `DOI: ${item.doi}`,
                          item.eprint && `arXiv:${item.eprint}`,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </small>
                      <code>\cite&#123;{item.key}&#125;</code>
                      <details>
                        <summary>Voir le BibTeX</summary>
                        <pre>{item.bibtex}</pre>
                      </details>
                    </div>
                    <div className="bib-result-actions">
                      <button type="button" onClick={() => addCandidate(item, false)} disabled={already}>
                        {already ? <Check size={14} /> : <Plus size={14} />}
                        {already ? 'Ajoutée' : 'Ajouter au .bib'}
                      </button>
                      <button type="button" className="primary" onClick={() => addCandidate(item, true)}>
                        Ajouter & Citer
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        )}

        {tab === 'manual' && (
          <div className="visual-pane">
            <div className="bib-form-grid">
              <label>
                Type de document
                <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                  <option value="article">Article de revue (@article)</option>
                  <option value="inproceedings">Actes de conférence (@inproceedings)</option>
                  <option value="book">Livre (@book)</option>
                  <option value="phdthesis">Thèse (@phdthesis)</option>
                  <option value="misc">Autre / Web (@misc)</option>
                </select>
              </label>
              <label>
                Clé de citation (auto si vide)
                <input
                  placeholder={manualPreview.key}
                  value={form.key}
                  onChange={(e) => setForm({ ...form, key: e.target.value })}
                />
              </label>
              <label className="span-2">
                Titre
                <input
                  placeholder="Titre de la publication"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                />
              </label>
              <label className="span-2">
                Auteur(s) (séparés par « and »)
                <input
                  placeholder="Dupont, Jean and Martin, Claire"
                  value={form.author}
                  onChange={(e) => setForm({ ...form, author: e.target.value })}
                />
              </label>
              <label>
                Année
                <input value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} />
              </label>
              <label>
                Revue / Conférence / Éditeur
                <input
                  placeholder="Nature, IEEE, Springer…"
                  value={form.journal}
                  onChange={(e) => setForm({ ...form, journal: e.target.value })}
                />
              </label>
              <label>
                DOI (optionnel)
                <input
                  placeholder="10.1000/xyz123"
                  value={form.doi}
                  onChange={(e) => setForm({ ...form, doi: e.target.value })}
                />
              </label>
              <label>
                URL (optionnel)
                <input
                  placeholder="https://…"
                  value={form.url}
                  onChange={(e) => setForm({ ...form, url: e.target.value })}
                />
              </label>
            </div>
            <pre className="visual-code-preview">{manualPreview.bibtex}</pre>
            <div className="modalActions">
              <button type="button" onClick={onClose}>
                Annuler
              </button>
              <button
                type="button"
                disabled={!form.title.trim()}
                onClick={() => addCandidate({ key: manualPreview.key, bibtex: manualPreview.bibtex }, false)}
              >
                Ajouter à {targetBib}
              </button>
              <button
                type="button"
                className="primary"
                disabled={!form.title.trim()}
                onClick={() => addCandidate({ key: manualPreview.key, bibtex: manualPreview.bibtex }, true)}
              >
                Ajouter & Insérer \cite&#123;{manualPreview.key}&#125;
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
