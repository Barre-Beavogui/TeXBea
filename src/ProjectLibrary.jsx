import React, { useMemo, useState } from 'react';
import {
  Plus,
  Search,
  FileText,
  Clock3,
  FolderOpen,
  BookOpen,
  ChevronRight,
  Upload,
  MoreHorizontal,
  Copy,
  Trash2,
  Download,
  Pencil,
  RotateCcw,
  MonitorDown,
  WifiOff,
} from 'lucide-react';
import StorageStatus from './StorageStatus.jsx';
import { useAppStatus } from './pwa.js';
export function Brand() {
  return (
    <div className="brand">
      <div className="logo" aria-hidden="true">
        B<span>·</span>
      </div>
      <div>
        <b>
          TeX<span>Bea</span>
        </b>
        <small>L’atelier scientifique</small>
      </div>
    </div>
  );
}
export default function ProjectLibrary({
  projects,
  onOpen,
  onNew,
  onAction,
  onBackup,
  onRestore,
  autoBackup,
  storageKey,
  mode,
}) {
  const [trash, setTrash] = useState(false);
  const app = useAppStatus();
  const [query, setQuery] = useState(''),
    [sort, setSort] = useState('recent');
  const list = useMemo(
    () =>
      projects
        .filter((p) => !!p.deleted === trash)
        .filter((p) => p.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
        .sort((a, b) =>
          sort === 'name' ? a.name.localeCompare(b.name) : Date.parse(b.updatedAt || 0) - Date.parse(a.updatedAt || 0),
        ),
    [projects, query, sort, trash],
  );
  const recent = projects
    .filter((p) => !p.deleted)
    .sort((a, b) => Date.parse(b.updatedAt || 0) - Date.parse(a.updatedAt || 0))[0];
  function date(value) {
    return value ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(new Date(value)) : '—';
  }
  return (
    <div className="library">
      <header className="library-header">
        <Brand />
        <div className="library-tabs">
          <span className="active">Mes projets</span>
          <span className="library-mode">{mode ? 'Espace personnel · dans ce navigateur' : 'Mon atelier'}</span>
        </div>
        {mode && !app.online && (
          <span className="offline-chip" title="Les paquets LaTeX déjà utilisés restent disponibles">
            <WifiOff size={14} /> Hors ligne
          </span>
        )}
        {mode && app.canInstall && (
          <button className="install-app" onClick={app.install}>
            <MonitorDown size={15} /> Installer l’app
          </button>
        )}
        <div className="account-chip">B</div>
      </header>
      <div className="library-content">
        <div className="library-title">
          <div>
            <div className="eyebrow">TON ESPACE DE TRAVAIL</div>
            <h1>
              Des idées aux <em>pages.</em>
            </h1>
            <p>Retrouve tes documents et reprends le fil de ton travail.</p>
          </div>
          <button className="primary new-project" onClick={onNew}>
            <Plus size={18} /> Nouveau projet
          </button>
        </div>
        <div className="library-grid">
          <section className="project-panel">
            <div className="library-v3-tools">
              <div>
                <button className={!trash ? 'active' : ''} onClick={() => setTrash(false)}>
                  Projets actifs
                </button>
                <button className={trash ? 'active' : ''} onClick={() => setTrash(true)}>
                  Corbeille ({projects.filter((p) => p.deleted).length})
                </button>
              </div>
              <button onClick={() => onNew('import')}>
                <Upload size={16} />
                Importer .zip / .tex
              </button>
            </div>
            <div className="project-controls">
              <label className="library-search">
                <Search size={18} />
                <input
                  aria-label="Rechercher un projet"
                  placeholder="Rechercher un projet…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
              <select aria-label="Trier les projets" value={sort} onChange={(e) => setSort(e.target.value)}>
                <option value="recent">Plus récents</option>
                <option value="name">Nom A–Z</option>
              </select>
            </div>
            <div className="project-table-title">
              <h2>
                {trash ? 'Corbeille' : 'Tous les projets'}{' '}
                <span>{projects.filter((p) => !!p.deleted === trash).length}</span>
              </h2>
              <span>Dernière modification</span>
            </div>
            <div className="project-list">
              {list.map((p, i) => (
                <div className="project-list-entry" key={p.id}>
                  <button className="project-row" disabled={trash} onClick={() => onOpen(p.id)}>
                    <span className={'project-symbol tone-' + (i % 3)}>
                      <FileText size={20} />
                    </span>
                    <span className="project-name">
                      <b>{p.name}</b>
                      <small>
                        {p.fileCount || 0} fichier{p.fileCount > 1 ? 's' : ''} · LaTeX
                      </small>
                    </span>
                    <time dateTime={p.updatedAt}>{date(p.updatedAt)}</time>
                    <ChevronRight size={17} />
                  </button>
                  <details className="project-menu">
                    <summary aria-label={'Actions pour ' + p.name}>
                      <MoreHorizontal size={18} />
                    </summary>
                    <div>
                      {(trash
                        ? [
                            ['restore', 'Restaurer', RotateCcw],
                            ['remove', 'Supprimer définitivement', Trash2],
                          ]
                        : [
                            ['rename', 'Renommer', Pencil],
                            ['duplicate', 'Dupliquer', Copy],
                            ['export', 'Exporter ZIP', Download],
                            ['trash', 'Mettre à la corbeille', Trash2],
                          ]
                      ).map(([action, label, Icon]) => (
                        <button
                          key={action}
                          onClick={(e) => {
                            e.currentTarget.closest('details').open = false;
                            onAction(action, p.id);
                          }}
                        >
                          <Icon size={15} />
                          {label}
                        </button>
                      ))}
                    </div>
                  </details>
                </div>
              ))}
              {!list.length && (
                <div className="library-empty">
                  <FolderOpen size={32} />
                  <h3>{query ? 'Aucun résultat' : 'Ton premier projet commence ici'}</h3>
                  <p>{query ? 'Essaie un autre nom.' : 'Crée un projet pour ouvrir l’éditeur LaTeX.'}</p>
                  {!query && <button onClick={onNew}>Créer un projet</button>}
                </div>
              )}
            </div>
            <footer className="project-panel-footer">
              <span>
                {list.length} projet{list.length > 1 ? 's' : ''}
              </span>
              <span>Un espace pour tes idées.</span>
            </footer>
          </section>
          <aside className="library-aside">
            {recent && (
              <section className="resume-card">
                <div className="resume-label">
                  <Clock3 size={16} /> REPRENDRE
                </div>
                <div className="document-mark" aria-hidden="true">
                  <FileText size={48} strokeWidth={1} />
                </div>
                <h2>{recent.name}</h2>
                <p>Modifié le {date(recent.updatedAt)}</p>
                <button onClick={() => onOpen(recent.id)}>
                  Ouvrir l’atelier <FolderOpen size={17} />
                </button>
              </section>
            )}
            <StorageStatus
              projects={projects}
              browser={mode}
              onBackup={onBackup}
              onRestore={onRestore}
              auto={autoBackup}
              refreshKey={storageKey}
            />
            <section className="workspace-note">
              <BookOpen size={21} />
              <h3>Ton atelier, ton rythme.</h3>
              <p>Écris en LaTeX, compile ton PDF et retrouve le code d’un double-clic sur le texte.</p>
              <small>
                {mode
                  ? 'Les projets sont conservés dans ce navigateur. « Tout sauvegarder » les met tous dans un seul ZIP, versions comprises.'
                  : 'Les projets sont sauvegardés dans ton espace.'}
              </small>
            </section>
            <div className="library-stat">
              <b>{projects.reduce((n, p) => n + (p.fileCount || 0), 0)}</b>
              <span>fichiers dans ton atelier</span>
            </div>
          </aside>
        </div>
        <footer className="library-footer">
          <span>TeXBea</span>
          <span>Écrire. Comprendre. Transmettre.</span>
        </footer>
      </div>
    </div>
  );
}
