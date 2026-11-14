import React, { useEffect, useMemo, useState } from 'react';
import { X, Search, BookOpen, Tag, Check, LifeBuoy, Mail, ShieldCheck, FileText } from 'lucide-react';
import { parseBib } from './bib-library.js';
import { cleanTags } from './project-tools.js';

// Small windows of the project library: labels of one project, and help.
export function TagDialog({ project, allTags, onSave, onClose }) {
  const [chosen, setChosen] = useState(project.tags || []);
  const [draft, setDraft] = useState('');
  const known = useMemo(
    () => [...new Set([...allTags, ...chosen])].sort((a, b) => a.localeCompare(b)),
    [allTags, chosen],
  );
  const toggle = (t) => setChosen((c) => (c.includes(t) ? c.filter((x) => x !== t) : [...c, t]));
  function add(e) {
    e.preventDefault();
    const [t] = cleanTags([draft]);
    if (t) setChosen((c) => cleanTags([...c, t]));
    setDraft('');
  }
  return (
    <div className="modalBack" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal lib-dialog" role="dialog" aria-modal="true" aria-label="Balises du projet">
        <div className="modalHead">
          <h2>Balises</h2>
          <button aria-label="Fermer" onClick={onClose}>
            <X />
          </button>
        </div>
        <p className="lib-dialog-sub">« {project.name} »</p>
        <div className="lib-tag-pick">
          {known.map((t) => (
            <label key={t} className={chosen.includes(t) ? 'on' : ''}>
              <input type="checkbox" checked={chosen.includes(t)} onChange={() => toggle(t)} />
              {chosen.includes(t) ? <Check size={14} /> : <Tag size={14} />} {t}
            </label>
          ))}
          {!known.length && <small>Aucune balise pour l’instant : crée la première ci-dessous.</small>}
        </div>
        <form className="lib-tag-new" onSubmit={add}>
          <input
            value={draft}
            maxLength={30}
            placeholder="Nouvelle balise (ex. Cours, TP, Rapport)"
            aria-label="Nom de la nouvelle balise"
            onChange={(e) => setDraft(e.target.value)}
          />
          <button type="submit" disabled={!draft.trim()}>
            Ajouter
          </button>
        </form>
        <div className="lib-dialog-actions">
          <button onClick={onClose}>Annuler</button>
          <button
            className="primary"
            onClick={() => {
              onSave(chosen);
              onClose();
            }}
          >
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}

export function HelpDialog({ onClose }) {
  return (
    <div className="modalBack" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal lib-dialog lib-help" role="dialog" aria-modal="true" aria-label="Aide">
        <div className="modalHead">
          <h2>
            <LifeBuoy size={18} /> Aide
          </h2>
          <button aria-label="Fermer" onClick={onClose}>
            <X />
          </button>
        </div>
        <dl>
          <dt>Écrire et compiler</dt>
          <dd>
            Ouvre un projet, écris en LaTeX et le PDF se compile dans ton navigateur. Double-clique sur le texte du PDF
            pour retrouver le code correspondant.
          </dd>
          <dt>Organiser</dt>
          <dd>
            Les balises regroupent tes projets (une balise par thème), l’archive range ceux qui ne servent plus sans les
            supprimer, la corbeille garde les projets supprimés avant leur effacement définitif.
          </dd>
          <dt>Partagé avec vous</dt>
          <dd>
            Quand quelqu’un te donne un lien de partage, ouvre-le puis choisis « Copier dans mes projets » : la copie
            apparaît ici.
          </dd>
          <dt>Ne rien perdre</dt>
          <dd>
            La copie en ligne se met à jour toute seule quand tu es connecté. Tu peux aussi télécharger un ZIP de tous
            tes projets ou choisir un dossier de sauvegarde automatique.
          </dd>
        </dl>
        <div className="lib-help-links">
          <a href="mailto:support@texbea.com">
            <Mail size={15} /> support@texbea.com
          </a>
          <a href="/confidentialite" target="_blank" rel="noreferrer">
            <ShieldCheck size={15} /> Confidentialité
          </a>
          <a href="/mentions-legales" target="_blank" rel="noreferrer">
            <FileText size={15} /> Mentions légales
          </a>
        </div>
      </div>
    </div>
  );
}

// Every reference of every project, in one searchable list. Reading the .bib files is local and quick.
export function ReferencesView({ projects, api, onOpen }) {
  const [rows, setRows] = useState(null);
  const [query, setQuery] = useState('');
  const ids = projects
    .filter((p) => !p.deleted)
    .map((p) => p.id + ':' + p.updatedAt)
    .join('|');
  useEffect(() => {
    let live = true;
    (async () => {
      const found = [];
      for (const p of projects.filter((p) => !p.deleted)) {
        try {
          const full = await api('/projects/' + p.id);
          for (const [name, text] of Object.entries(full.files || {}))
            if (name.toLowerCase().endsWith('.bib'))
              for (const r of parseBib(text)) found.push({ ...r, project: p, file: name });
        } catch {
          /* a project that cannot be read is skipped */
        }
      }
      if (live) setRows(found);
    })();
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids]);
  const q = query.trim().toLocaleLowerCase();
  const shown = (rows || []).filter(
    (r) =>
      !q || [r.key, r.title, r.author, r.year, r.project.name].some((v) => String(v).toLocaleLowerCase().includes(q)),
  );
  return (
    <>
      <div className="lib-tools">
        <label className="library-search">
          <Search size={18} />
          <input
            aria-label="Rechercher une référence"
            placeholder="Rechercher par titre, auteur, clé ou année…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      </div>
      <section className="project-panel lib-table">
        <div className="lib-row lib-head lib-refs-row">
          <span>Référence</span>
          <span>Année</span>
          <span>Projet</span>
        </div>
        <div className="project-list">
          {shown.map((r, i) => (
            <button
              key={r.project.id + r.file + r.key + i}
              className="lib-row lib-refs-row lib-ref"
              onClick={() => onOpen(r.project.id)}
              title="Ouvrir le projet"
            >
              <span className="lib-ref-main">
                <b>{r.title || r.key}</b>
                <small>
                  {r.author || 'Auteur inconnu'} · <code>{r.key}</code>
                </small>
              </span>
              <span className="lib-owner">{r.year || '—'}</span>
              <span className="lib-owner">{r.project.name}</span>
            </button>
          ))}
          {rows === null && (
            <div className="library-empty">
              <BookOpen size={32} />
              <h3>Lecture des références…</h3>
            </div>
          )}
          {rows !== null && !shown.length && (
            <div className="library-empty">
              <BookOpen size={32} />
              <h3>{q ? 'Aucun résultat' : 'Aucune référence pour l’instant'}</h3>
              <p>
                {q
                  ? 'Essaie un autre mot.'
                  : 'Les entrées de tes fichiers .bib (articles, livres…) sont listées ici, tous projets confondus.'}
              </p>
            </div>
          )}
        </div>
        <footer className="project-panel-footer">
          <span>
            {shown.length} référence{shown.length > 1 ? 's' : ''}
          </span>
          <span>Clique sur une référence pour ouvrir son projet.</span>
        </footer>
      </section>
    </>
  );
}
