import React, { useMemo, useState } from 'react';
import LogoMark from './LogoMark.jsx';
import {
  Plus,
  Search,
  FileText,
  Clock3,
  FolderOpen,
  Upload,
  MoreHorizontal,
  Copy,
  Trash2,
  Download,
  Pencil,
  RotateCcw,
  MonitorDown,
  WifiOff,
  User,
  LogOut,
} from 'lucide-react';
import StorageStatus from './StorageStatus.jsx';
import { useAppStatus } from './pwa.js';
import { userInitials } from './accounts.js';
export function Brand() {
  return (
    <div className="brand">
      <div className="logo" aria-hidden="true">
        <LogoMark size={30} />
      </div>
      <div>
        <b>
          TeX<span>bea</span>
        </b>
        <small>L’atelier scientifique</small>
      </div>
    </div>
  );
}
export default function ProjectLibrary({
  projects,
  user,
  onOpen,
  onNew,
  onAction,
  onBackup,
  onRestore,
  autoBackup,
  cloudSync,
  onProfile,
  onLogout,
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
  // Signed in through Google, GitHub or an e-mail code: the cloud session is the identity, even on a guest workspace.
  const cloudUser = cloudSync?.user;
  const cloudWho = cloudUser && {
    name: cloudUser.name || cloudUser.email,
    email: cloudUser.email,
    avatar: cloudUser.avatar,
  };
  const recent = projects
    .filter((p) => !p.deleted)
    .sort((a, b) => Date.parse(b.updatedAt || 0) - Date.parse(a.updatedAt || 0))[0];
  function date(value) {
    return value ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(new Date(value)) : '—';
  }
  const active = projects.filter((p) => !p.deleted).length;
  const trashed = projects.length - active;
  const owner = cloudWho?.name || (user && !user.guest ? user.name : 'Moi');
  return (
    <div className="library lib">
      <aside className="lib-side">
        <div className="lib-side-nav">
          <Brand />
          <nav className="lib-nav" aria-label="Bibliothèque">
            <button type="button" className={!trash ? 'on' : ''} onClick={() => setTrash(false)}>
              <FileText size={17} /> Tous les projets <em>{active}</em>
            </button>
            <button type="button" className={trash ? 'on' : ''} onClick={() => setTrash(true)}>
              <Trash2 size={17} /> Corbeille <em>{trashed}</em>
            </button>
            <button type="button" onClick={() => onNew('import')}>
              <Upload size={17} /> Importer .zip / .tex
            </button>
          </nav>
        </div>
        <div className="lib-side-extra">
          {recent && (
            <section className="resume-card">
              <div className="resume-label">
                <Clock3 size={16} /> REPRENDRE
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
            cloud={cloudSync}
            refreshKey={storageKey}
          />
          <div className="library-account-bar lib-account">
            {cloudWho ? (
              <div className="account-profile-btn account-static" title={'Connecté avec ' + cloudWho.email}>
                <span className="account-chip" style={{ background: '#1f3a60' }}>
                  {cloudWho.avatar ? (
                    <img src={cloudWho.avatar} alt="" referrerPolicy="no-referrer" />
                  ) : (
                    userInitials(cloudWho)
                  )}
                </span>
                <span className="account-meta">
                  <b>{cloudWho.name}</b>
                  <small>{cloudWho.email}</small>
                </span>
              </div>
            ) : (
              <button
                type="button"
                className="account-profile-btn"
                onClick={onProfile}
                title={user?.guest ? 'Créer un compte ou se connecter' : 'Mon profil et mes paramètres de compte'}
              >
                <span className="account-chip" style={{ background: user?.avatarColor || '#1f3a60' }}>
                  {user?.guest ? <User size={15} /> : userInitials(user)}
                </span>
                <span className="account-meta">
                  <b>{user?.guest ? 'Se connecter / S’inscrire' : user?.name || 'Mon compte'}</b>
                  {user?.institution && <small>{user.institution}</small>}
                </span>
              </button>
            )}
            {(cloudWho || !user?.guest) && onLogout && (
              <button
                type="button"
                className="icon account-logout-btn"
                title="Se déconnecter"
                aria-label="Se déconnecter"
                onClick={onLogout}
              >
                <LogOut size={16} />
              </button>
            )}
          </div>
        </div>
      </aside>
      <main className="lib-main">
        <div className="lib-top">
          <span className="library-mode">{mode ? 'Espace personnel · dans ce navigateur' : 'Mon atelier'}</span>
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
        </div>
        <h1 className="lib-title">{trash ? 'Corbeille' : 'Tous les projets'}</h1>
        <div className="lib-tools">
          <label className="library-search">
            <Search size={18} />
            <input
              aria-label="Rechercher un projet"
              placeholder="Rechercher dans tous les projets…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <button className="primary new-project" onClick={onNew}>
            <Plus size={18} /> Nouveau projet
          </button>
        </div>
        <section className="project-panel lib-table">
          <div className="lib-row lib-head" role="row">
            <button
              type="button"
              className={sort === 'name' ? 'on' : ''}
              onClick={() => setSort('name')}
              aria-label="Trier par titre"
            >
              Titre {sort === 'name' && '↑'}
            </button>
            <span>Propriétaire</span>
            <button
              type="button"
              className={sort === 'recent' ? 'on' : ''}
              onClick={() => setSort('recent')}
              aria-label="Trier par date"
            >
              Dernière modification {sort === 'recent' && '↓'}
            </button>
            <span className="lib-head-menu" />
          </div>
          <div className="project-list">
            {list.map((p, i) => (
              <div className="project-list-entry" key={p.id}>
                <button className="project-row lib-row" disabled={trash} onClick={() => onOpen(p.id)}>
                  <span className="project-name">
                    <span className={'project-symbol tone-' + (i % 3)}>
                      <FileText size={18} />
                    </span>
                    <span>
                      <b>{p.name}</b>
                      <small>
                        {p.fileCount || 0} fichier{p.fileCount > 1 ? 's' : ''} · LaTeX
                      </small>
                    </span>
                  </span>
                  <span className="lib-owner">{owner}</span>
                  <time dateTime={p.updatedAt}>{date(p.updatedAt)}</time>
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
                <h3>
                  {query ? 'Aucun résultat' : trash ? 'La corbeille est vide' : 'Ton premier projet commence ici'}
                </h3>
                <p>
                  {query
                    ? 'Essaie un autre nom.'
                    : trash
                      ? 'Les projets supprimés apparaissent ici.'
                      : 'Crée un projet pour ouvrir l’éditeur LaTeX.'}
                </p>
                {!query && !trash && <button onClick={onNew}>Créer un projet</button>}
              </div>
            )}
          </div>
          <footer className="project-panel-footer">
            <span>
              {list.length} projet{list.length > 1 ? 's' : ''} · {projects.reduce((n, p) => n + (p.fileCount || 0), 0)}{' '}
              fichiers
            </span>
            <span>Écrire. Comprendre. Transmettre.</span>
          </footer>
        </section>
      </main>
    </div>
  );
}
