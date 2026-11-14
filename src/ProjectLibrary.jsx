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
  Users,
  LogOut,
  Archive,
  ArchiveRestore,
  Tag,
  BookOpen,
  CircleHelp,
  ChevronUp,
  RefreshCw,
  Settings,
  X,
} from 'lucide-react';
import { TagDialog, HelpDialog, ReferencesView } from './LibraryExtras.jsx';
import { cleanTags } from './project-tools.js';
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
const TAGS_KEY = 'texbea-tags';
// Labels created but not yet put on a project; the ones in use travel with the projects themselves.
const loadTags = () => {
  try {
    return cleanTags(JSON.parse(localStorage.getItem(TAGS_KEY) || '[]'));
  } catch {
    return [];
  }
};

const TITLES = {
  all: 'Tous les projets',
  workspace: 'Votre espace de travail',
  shared: 'Partagé avec vous',
  archive: 'Archive',
  trash: 'Corbeille',
  refs: 'Bibliothèque',
  settings: 'Paramètres',
};
const EMPTY = {
  all: ['Ton premier projet commence ici', 'Crée un projet pour ouvrir l’éditeur LaTeX.'],
  workspace: ['Aucun projet à toi', 'Les projets que tu crées apparaissent ici.'],
  shared: [
    'Rien de partagé pour l’instant',
    'Ouvre un lien de partage reçu, puis « Copier dans mes projets » : la copie apparaît ici.',
  ],
  archive: ['Aucun projet archivé', 'Archive un projet depuis son menu pour le ranger sans le supprimer.'],
  trash: ['La corbeille est vide', 'Les projets supprimés apparaissent ici.'],
};

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
  api,
  onProfile,
  onLogout,
  storageKey,
  mode,
}) {
  const [view, setView] = useState('all');
  const [localTags, setLocalTags] = useState(loadTags);
  const [tagging, setTagging] = useState(null);
  const [help, setHelp] = useState(false);
  const app = useAppStatus();
  const [query, setQuery] = useState(''),
    [sort, setSort] = useState('recent');
  const tagView = view.startsWith('tag:') ? view.slice(4) : null;
  const trash = view === 'trash';
  const inView = (p) => {
    if (view === 'trash') return !!p.deleted;
    if (p.deleted) return false;
    if (view === 'archive') return !!p.archived;
    if (p.archived) return false;
    if (view === 'workspace') return !p.fromShare;
    if (view === 'shared') return !!p.fromShare;
    if (tagView) return !!p.tags?.includes(tagView);
    return true;
  };
  const allTags = useMemo(
    () =>
      [...new Set([...localTags, ...projects.flatMap((p) => (p.deleted ? [] : p.tags || []))])].sort((a, b) =>
        a.localeCompare(b),
      ),
    [localTags, projects],
  );
  const list = useMemo(
    () =>
      projects
        .filter(inView)
        .filter((p) => p.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
        .sort((a, b) =>
          sort === 'name' ? a.name.localeCompare(b.name) : Date.parse(b.updatedAt || 0) - Date.parse(a.updatedAt || 0),
        ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [projects, query, sort, view],
  );
  const live = projects.filter((p) => !p.deleted && !p.archived);
  const count = {
    all: live.length,
    workspace: live.filter((p) => !p.fromShare).length,
    shared: live.filter((p) => p.fromShare).length,
    archive: projects.filter((p) => !p.deleted && p.archived).length,
    trash: projects.filter((p) => p.deleted).length,
  };
  // Signed in through Google, GitHub or an e-mail code: the cloud session is the identity, even on a guest workspace.
  const cloudUser = cloudSync?.user;
  const cloudWho = cloudUser && {
    name: cloudUser.name || cloudUser.email,
    email: cloudUser.email,
    avatar: cloudUser.avatar,
  };
  const recent = projects
    .filter((p) => !p.deleted && !p.archived)
    .sort((a, b) => Date.parse(b.updatedAt || 0) - Date.parse(a.updatedAt || 0))[0];
  function date(value) {
    return value ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(new Date(value)) : '—';
  }
  function newTag() {
    const [name] = cleanTags([prompt('Nom de la nouvelle balise (30 caractères maximum)', '') || '']);
    if (!name) return;
    const next = cleanTags([...localTags, name]);
    setLocalTags(next);
    try {
      localStorage.setItem(TAGS_KEY, JSON.stringify(next));
    } catch {
      /* the label then lives until the page is closed */
    }
    setView('tag:' + name);
  }
  function removeTag(name) {
    if (!confirm(`Supprimer la balise « ${name} » ? Les projets ne sont pas supprimés.`)) return;
    const next = localTags.filter((t) => t !== name);
    setLocalTags(next);
    try {
      localStorage.setItem(TAGS_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
    onAction('tag-remove', null, name);
    if (tagView === name) setView('all');
  }
  const owner = cloudWho?.name || (user && !user.guest ? user.name : 'Moi');
  const title = tagView ? tagView : TITLES[view];
  const navItem = (id, Icon, label, n) => (
    <button type="button" className={view === id ? 'on' : ''} onClick={() => setView(id)}>
      <Icon size={17} /> {label} {n != null && <em>{n}</em>}
    </button>
  );
  const menuFor = (p) =>
    trash
      ? [
          ['restore', 'Restaurer', RotateCcw],
          ['remove', 'Supprimer définitivement', Trash2],
        ]
      : [
          ['rename', 'Renommer', Pencil],
          ['duplicate', 'Dupliquer', Copy],
          ['tags', 'Balises…', Tag],
          p.archived ? ['unarchive', 'Désarchiver', ArchiveRestore] : ['archive', 'Archiver', Archive],
          ['export', 'Exporter ZIP', Download],
          ['trash', 'Mettre à la corbeille', Trash2],
        ];
  return (
    <div className="library lib">
      <aside className="lib-side">
        <div className="lib-side-nav">
          <Brand />
          <nav className="lib-nav" aria-label="Bibliothèque">
            {navItem('all', FileText, 'Tous les projets', count.all)}
            <div className="lib-sep" />
            {navItem('workspace', User, 'Votre espace de travail', count.workspace)}
            {navItem('shared', Users, 'Partagé avec vous', count.shared)}
            {navItem('archive', Archive, 'Archive', count.archive)}
          </nav>
          <div className="lib-nav" role="group" aria-label="Balises">
            <div className="lib-nav-title">Vos balises</div>
            {allTags.map((t) => (
              <div className="lib-tag-item" key={t}>
                <button type="button" className={view === 'tag:' + t ? 'on' : ''} onClick={() => setView('tag:' + t)}>
                  <Tag size={16} /> <span>{t}</span>
                  <em>{live.filter((p) => p.tags?.includes(t)).length}</em>
                </button>
                <button
                  type="button"
                  className="lib-tag-x"
                  aria-label={'Supprimer la balise ' + t}
                  title="Supprimer la balise"
                  onClick={() => removeTag(t)}
                >
                  <X size={14} />
                </button>
              </div>
            ))}
            <button type="button" onClick={newTag}>
              <Plus size={17} /> Nouvelle balise
            </button>
          </div>
          <nav className="lib-nav" aria-label="Outils">
            {navItem('refs', BookOpen, 'Bibliothèque')}
            {navItem('trash', Trash2, 'Corbeille', count.trash)}
            <button type="button" onClick={() => onNew('import')}>
              <Upload size={17} /> Importer .zip / .tex
            </button>
            {navItem('settings', Settings, 'Paramètres')}
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
          <div className="lib-bottom">
            <button type="button" className="lib-help-btn" onClick={() => setHelp(true)}>
              <CircleHelp size={17} /> Aide
            </button>
            <details className="lib-account-menu">
              <summary>
                <span
                  className="account-chip"
                  style={{ background: cloudWho ? '#1f3a60' : user?.avatarColor || '#1f3a60' }}
                >
                  {cloudWho?.avatar ? (
                    <img src={cloudWho.avatar} alt="" referrerPolicy="no-referrer" />
                  ) : cloudWho ? (
                    userInitials(cloudWho)
                  ) : user?.guest ? (
                    <User size={15} />
                  ) : (
                    userInitials(user)
                  )}
                </span>
                <span className="account-meta">
                  <b>{cloudWho ? cloudWho.name : user?.guest ? 'Compte' : user?.name || 'Compte'}</b>
                  <small>{cloudWho ? cloudWho.email : user?.guest ? 'Non connecté' : user?.email || ''}</small>
                </span>
                <ChevronUp size={16} />
              </summary>
              <div className="lib-account-pop">
                {cloudWho ? (
                  <>
                    <button type="button" onClick={cloudSync.syncNow}>
                      <RefreshCw size={15} /> Synchroniser maintenant
                    </button>
                    <button type="button" onClick={onLogout}>
                      <LogOut size={15} /> Se déconnecter
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (
                          confirm(
                            'Supprimer ton compte et toutes les copies en ligne ? Tes projets restent dans ce navigateur.',
                          )
                        )
                          cloudSync.deleteAccount().catch((e) => alert(e.message));
                      }}
                    >
                      <Trash2 size={15} /> Supprimer mon compte
                    </button>
                  </>
                ) : user?.guest ? (
                  <button type="button" onClick={onProfile}>
                    <User size={15} /> Se connecter / S’inscrire
                  </button>
                ) : (
                  <>
                    <button type="button" onClick={onProfile}>
                      <User size={15} /> Mon profil et mon compte
                    </button>
                    {onLogout && (
                      <button type="button" onClick={onLogout}>
                        <LogOut size={15} /> Se déconnecter
                      </button>
                    )}
                  </>
                )}
              </div>
            </details>
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
        <h1 className="lib-title">{title}</h1>
        {view === 'settings' ? (
          <div className="lib-settings">
            <StorageStatus
              projects={projects}
              browser={mode}
              onBackup={onBackup}
              onRestore={onRestore}
              auto={autoBackup}
              cloud={cloudSync}
              refreshKey={storageKey}
            />
          </div>
        ) : view === 'refs' ? (
          <ReferencesView projects={projects} api={api} onOpen={onOpen} />
        ) : (
          <>
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
                            {p.fromShare ? ' · partagé' : ''}
                          </small>
                          {!!p.tags?.length && (
                            <span className="lib-chips">
                              {p.tags.map((t) => (
                                <i key={t}>{t}</i>
                              ))}
                            </span>
                          )}
                        </span>
                      </span>
                      <span className="lib-owner">{p.fromShare ? 'Partagé' : owner}</span>
                      <time dateTime={p.updatedAt}>{date(p.updatedAt)}</time>
                    </button>
                    <details className="project-menu">
                      <summary aria-label={'Actions pour ' + p.name}>
                        <MoreHorizontal size={18} />
                      </summary>
                      <div>
                        {menuFor(p).map(([action, label, Icon]) => (
                          <button
                            key={action}
                            onClick={(e) => {
                              e.currentTarget.closest('details').open = false;
                              if (action === 'tags') setTagging(p);
                              else onAction(action, p.id);
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
                      {query
                        ? 'Aucun résultat'
                        : (EMPTY[tagView ? 'tag' : view] || ['Aucun projet avec cette balise'])[0]}
                    </h3>
                    <p>
                      {query
                        ? 'Essaie un autre nom.'
                        : tagView
                          ? 'Ajoute cette balise à un projet depuis son menu « Balises… ».'
                          : EMPTY[view]?.[1]}
                    </p>
                    {!query && view === 'all' && <button onClick={onNew}>Créer un projet</button>}
                  </div>
                )}
              </div>
              <footer className="project-panel-footer">
                <span>
                  {list.length} projet{list.length > 1 ? 's' : ''} · {list.reduce((n, p) => n + (p.fileCount || 0), 0)}{' '}
                  fichiers
                </span>
                <span>Écrire. Comprendre. Transmettre.</span>
              </footer>
            </section>
          </>
        )}
      </main>
      {tagging && (
        <TagDialog
          project={tagging}
          allTags={allTags}
          onSave={(tags) => onAction('tags', tagging.id, tags)}
          onClose={() => setTagging(null)}
        />
      )}
      {help && <HelpDialog onClose={() => setHelp(false)} />}
    </div>
  );
}
