import { exportProject, downloadBlob, importFiles, checkFileSize, fileToBase64, formatSize } from './project-tools.js';
import NewProjectDialog from './NewProjectDialog.jsx';
import { documentOutline } from './latex-analysis.js';
import ProjectLibrary, { Brand } from './ProjectLibrary.jsx';
import { findSourceLocation, searchablePhrases } from './source-navigation.js';
import { compileInBrowser, cancelCompile } from './browser-compiler.js';
import { compilers, effectiveCompiler, magicProgram, needsUnicodeEngine } from './compilers.js';
import { parseLatexLog } from './log-parser.js';
import { actionById, targetFor, lineWindow } from './ai-actions.js';
import { prepareImage } from './image-input.js';
import { loadSettings, saveSettings } from './settings.js';
import { demoApi } from './demo-api.js';
import { registerOffline } from './pwa.js';
import { readHash, commentLine, authorName } from './share.js';
import CommentsPanel from './CommentsPanel.jsx';
import TrackChangesPanel from './TrackChangesPanel.jsx';
import VisualModal from './VisualModal.jsx';
import BibImportDialog from './BibImportDialog.jsx';
import { findTrackedChanges, wrapTrackedChange, ensureChangesPreamble } from './track-changes.js';
import { appendBibEntry } from './bib-import.js';
import SharedView from './SharedView.jsx';
import ShareDialog from './ShareDialog.jsx';
import { backupBlob, backupFileName, readBackup, LAST_BACKUP_KEY } from './backup.js';
import useAutoBackup, { markChanged } from './useAutoBackup.js';
import useCloudSync from './useCloudSync.js';
import Welcome from './Welcome.jsx';
import CodeEditor from './CodeEditor.jsx';
import EditorToolbar from './EditorToolbar.jsx';
import { LogPanel, ProjectSearch, HistoryPanel, WordCountDialog, SettingsDialog } from './WorkspacePanels.jsx';
const DEMO = import.meta.env.VITE_DEMO === 'true';
import React, { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  FileText,
  Folder,
  Play,
  Plus,
  Save,
  History,
  LogOut,
  Trash2,
  Download,
  Check,
  RefreshCw,
  Users,
  Code2,
  X,
  Search,
  Upload,
  Pencil,
  Settings,
  Square,
  FileSearch,
  LocateFixed,
  CaseSensitive,
  ScrollText,
  Image as ImageIcon,
  Presentation,
  MessageSquare,
  Share2,
  GitCompare,
} from 'lucide-react';
import './style.css';
const AssistantPanel = lazy(() => import('./AssistantPanel.jsx'));
const InlineAssistant = lazy(() => import('./InlineAssistant.jsx'));
const PdfViewer = lazy(() => import('./PdfViewer.jsx'));
const API = '/api';
async function api(path, opt = {}) {
  // Any write (not a sign-in) makes the next automatic backup due.
  if (opt.method && opt.method !== 'GET' && !path.startsWith('/auth')) {
    markChanged();
    globalThis.dispatchEvent?.(new Event('texbea-changed'));
  }
  if (DEMO) return demoApi(path, opt);
  const token = localStorage.tn_token;
  const r = await fetch(API + path, {
    ...opt,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opt.headers || {}),
    },
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || `Erreur ${r.status}`), { data: j, status: r.status });
  return j;
}
function Auth({ onAuth }) {
  const [register, setRegister] = useState(false),
    [form, setForm] = useState({ name: '', email: 'demo@texbea.local', password: 'demo123' }),
    [err, setErr] = useState('');
  async function go(e) {
    e.preventDefault();
    setErr('');
    try {
      const j = await api('/auth/' + (register ? 'register' : 'login'), { method: 'POST', body: JSON.stringify(form) });
      localStorage.tn_token = j.token;
      onAuth(j);
    } catch (e) {
      setErr(e.message);
    }
  }
  return (
    <div className="auth">
      <div className="authbox">
        <div className="biglogo">
          B<span>·</span>
        </div>
        <h1>
          TeX<em>Bea</em>
        </h1>
        <p>Un espace LaTeX moderne, prêt pour tes futures innovations.</p>
        <form onSubmit={go}>
          {register && (
            <input placeholder="Nom" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          )}
          <input
            type="email"
            required
            placeholder="Email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          <input
            type="password"
            required
            minLength="6"
            placeholder="Mot de passe"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
          {err && <div className="error">{err}</div>}
          <button>{register ? 'Créer mon espace' : 'Se connecter'}</button>
        </form>
        <button className="link" onClick={() => setRegister(!register)}>
          {register ? 'Déjà un compte ? Se connecter' : 'Première visite ? Créer un compte'}
        </button>
        <small>Astuce : crée un compte local lors de la première utilisation.</small>
      </div>
    </div>
  );
}
const outlineDepth = { part: 0, chapter: 1, section: 2, subsection: 3, subsubsection: 4, frame: 3 };
// Offset range of a 1-based line, to place the cursor from a log entry or the outline.
function lineRange(text, line) {
  const lines = text.split('\n');
  const n = Math.min(Math.max(1, line), lines.length);
  const start = lines.slice(0, n - 1).join('\n').length + (n > 1 ? 1 : 0);
  return { line: n, start, end: start + lines[n - 1].length };
}

// Groups "chap/intro.tex" style paths into folders for the file tree.
function fileTree(names) {
  const root = { folders: {}, files: [] };
  for (const name of names.sort((a, b) => a.localeCompare(b))) {
    const parts = name.split('/');
    let node = root;
    for (const part of parts.slice(0, -1)) node = node.folders[part] ||= { folders: {}, files: [] };
    node.files.push(name);
  }
  return root;
}

function App() {
  const [user, setUser] = useState(null),
    [projects, setProjects] = useState([]),
    [storageKey, setStorageKey] = useState(0),
    [skippedLogin, setSkippedLogin] = useState(() => localStorage.getItem('texbea-skip-login') === '1'),
    [project, setProject] = useState(null),
    [active, setActive] = useState('main.tex'),
    [code, setCode] = useState(''),
    [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false),
    [compilePhase, setCompilePhase] = useState(''),
    [toast, setToast] = useState(''),
    [log, setLog] = useState(''),
    [pdf, setPdf] = useState(''),
    [showHistory, setShowHistory] = useState(false),
    [mobilePane, setMobilePane] = useState('code'),
    [filesOpen, setFilesOpen] = useState(false),
    [jump, setJump] = useState(null),
    [library, setLibrary] = useState(true),
    [createOpen, setCreateOpen] = useState(false),
    [assistant, setAssistant] = useState(false),
    [assistantPrompt, setAssistantPrompt] = useState(''),
    [projectSearch, setProjectSearch] = useState(false),
    [logOpen, setLogOpen] = useState(false),
    [wordCountOpen, setWordCountOpen] = useState(false),
    [settingsOpen, setSettingsOpen] = useState(false),
    [settings, setSettings] = useState(loadSettings),
    [cursor, setCursor] = useState({ line: 1, column: 1 }),
    [beaRequest, setBeaRequest] = useState(null),
    [pdfTarget, setPdfTarget] = useState(null),
    [assetPreview, setAssetPreview] = useState(null),
    [shared, setShared] = useState(null),
    [commentsOpen, setCommentsOpen] = useState(false),
    [revisionsOpen, setRevisionsOpen] = useState(false),
    [visualOpen, setVisualOpen] = useState(null),
    [bibImportOpen, setBibImportOpen] = useState(false),
    [peers, setPeers] = useState([]),
    [shareOpen, setShareOpen] = useState(false),
    wsRef = useRef(null),
    bcRef = useRef(null),
    timer = useRef(),
    autoTimer = useRef(),
    compiling = useRef(false),
    editorRef = useRef(),
    uploadRef = useRef(),
    photoRef = useRef(),
    assistantSelection = useRef();
  const autoBackup = useAutoBackup({ api, enabled: !!user, onChange: () => setStorageKey((k) => k + 1) });
  useEffect(() => {
    // Signing out brings the sign-in page back.
    const back = () => setSkippedLogin(false);
    window.addEventListener('texbea-logout', back);
    return () => window.removeEventListener('texbea-logout', back);
  }, []);
  const openRef = useRef(null);
  openRef.current = library ? null : project?.id;
  const cloudSync = useCloudSync({
    api,
    enabled: DEMO,
    openId: () => openRef.current,
    onChange: () => {
      setStorageKey((k) => k + 1);
      api('/projects')
        .then(setProjects)
        .catch(() => {});
    },
  });
  useEffect(
    () => () => {
      if (pdf.startsWith('blob:')) URL.revokeObjectURL(pdf);
    },
    [pdf],
  );
  const files = project?.files || {};
  const currentFiles = useMemo(() => ({ ...files, [active]: code }), [files, active, code]);
  const parsedLog = useMemo(() => parseLatexLog(log, files, project?.main), [log, files, project?.main]);
  const comments = project?.comments || [];
  const trackedChanges = useMemo(() => findTrackedChanges(currentFiles), [currentFiles]);
  const activeDiagnostics = useMemo(
    () => [
      ...parsedLog.all.filter((e) => e.file === active),
      // Open comments appear in the margin like the log's messages.
      ...comments
        .filter((c) => c.file === active && !c.resolved)
        .map((c) => ({ line: commentLine(code, c), level: 'info', message: `💬 ${c.author} : ${c.text}` })),
      ...trackedChanges
        .filter((c) => c.file === active)
        .map((c) => ({
          line: c.line,
          level: 'info',
          message: `✏️ Révision (${c.kind === 'added' ? 'ajout' : c.kind === 'deleted' ? 'suppression' : 'remplacement'})`,
        })),
    ],
    [parsedLog, active, comments, trackedChanges, code],
  );
  const outline = useMemo(() => documentOutline(code), [code]);
  const mainSource = active === project?.main ? code : project?.files?.[project?.main];
  const isBeamer = /\\documentclass\s*(?:\[[^\]]*\])?\s*\{beamer\}/.test(mainSource || '');
  const notify = (s) => {
    setToast(s);
    setTimeout(() => setToast(''), 1800);
  };
  // The whole interface follows the editor theme chosen in the settings.
  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme === 'light' ? 'light' : 'dark';
  }, [settings.theme]);
  function updateSettings(next) {
    setSettings(next);
    saveSettings(next);
  }
  async function loadProjects(preferred) {
    try {
      const ps = await api('/projects');
      setProjects(ps);
      const pid = preferred || ps.find((p) => !p.deleted)?.id;
      if (pid) {
        const p = await api('/projects/' + pid);
        openProject(p);
      }
    } catch (e) {
      if (e.status === 401) {
        localStorage.removeItem('tn_token');
        setUser(null);
      }
    }
  }
  function openProject(p) {
    setProjectSearch(false);
    setAssistant(false);
    setLogOpen(false);
    setJump(null);
    setFilesOpen(false);
    setMobilePane('code');
    setProject(p);
    setActive(p.main);
    setCode(p.files[p.main] || '');
    setDirty(false);
    setPdf('');
    setLog('');
  }
  useEffect(() => {
    if (DEMO) {
      setUser({ name: 'Essai local' });
      loadProjects();
    } else if (localStorage.tn_token) {
      setUser({ name: 'Workspace' });
      loadProjects();
    }
    openLinkInHash();
    window.addEventListener('hashchange', openLinkInHash);
    return () => window.removeEventListener('hashchange', openLinkInHash);
  }, []);
  useEffect(() => {
    if (!project) return;
    if (DEMO) {
      if (typeof BroadcastChannel === 'undefined') return;
      const bc = new BroadcastChannel('texbea-sync');
      bcRef.current = bc;
      bc.onmessage = (e) => {
        const m = e.data;
        if (!m || m.projectId !== project.id) return;
        if (m.type === 'file') {
          setProject((p) => (p ? { ...p, files: { ...p.files, [m.name]: m.content } } : p));
          if (m.name === active && !dirty) {
            setCode(m.content);
            notify('Modification synchronisée depuis un autre onglet');
          }
        } else if (m.type === 'comments') {
          setProject((p) => (p ? { ...p, comments: m.comments } : p));
        }
      };
      return () => {
        bc.close();
        bcRef.current = null;
      };
    }
    if (!localStorage.tn_token) return;
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws?token=${localStorage.tn_token}&project=${project.id}`);
    wsRef.current = ws;
    ws.onmessage = (e) => {
      try {
        const m = JSON.parse(e.data);
        if (m.type === 'file') {
          setProject((p) => (p ? { ...p, files: { ...p.files, [m.name]: m.content } } : p));
          if (m.name === active && !dirty) {
            setCode(m.content);
            notify('Modification distante reçue');
          }
        } else if (m.type === 'comments') {
          setProject((p) => (p ? { ...p, comments: m.comments } : p));
        } else if (m.type === 'presence') {
          setPeers(m.peers || []);
        }
      } catch {}
    };
    return () => {
      ws.close();
      wsRef.current = null;
      setPeers([]);
    };
  }, [project?.id, active, dirty]);
  useEffect(() => {
    if (!wsRef.current || wsRef.current.readyState !== 1) return;
    wsRef.current.send(
      JSON.stringify({
        type: 'cursor',
        name: authorName() || user?.name || 'Collaborateur',
        file: active,
        line: cursor.line,
      }),
    );
  }, [active, cursor.line, user?.name]);
  useEffect(() => {
    if (!dirty || !project) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => saveFile(true), 900);
    return () => clearTimeout(timer.current);
  }, [code]);
  // Closing or hiding the tab within the autosave delay must not lose the last keystrokes.
  const flush = useRef();
  flush.current = () => dirty && project && saveFile(true);
  useEffect(() => {
    const save = () => flush.current();
    const hidden = () => document.visibilityState === 'hidden' && flush.current();
    window.addEventListener('pagehide', save);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      window.removeEventListener('pagehide', save);
      document.removeEventListener('visibilitychange', hidden);
    };
  }, []);
  // Auto-compile after a pause in typing, like Overleaf's "Auto Compile".
  useEffect(() => {
    if (!settings.autoCompile || !project || library) return;
    clearTimeout(autoTimer.current);
    autoTimer.current = setTimeout(() => {
      compile({ auto: true });
    }, 2500);
    return () => clearTimeout(autoTimer.current);
  }, [code, settings.autoCompile]);
  // Ctrl/Cmd+S and Ctrl/Cmd+Enter also work when the focus is outside the editor.
  useEffect(() => {
    function keys(e) {
      if (e.defaultPrevented || !(e.ctrlKey || e.metaKey) || library || !project) return;
      if (e.key === 's') {
        e.preventDefault();
        saveFile();
      } else if (e.key === 'Enter' && !busy) {
        e.preventDefault();
        compile();
      } else if (e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setProjectSearch(true);
      }
    }
    window.addEventListener('keydown', keys);
    return () => window.removeEventListener('keydown', keys);
  });
  async function saveFile(silent = false) {
    if (!project) return true;
    try {
      await api(`/projects/${project.id}/files/${encodeURIComponent(active)}`, {
        method: 'PUT',
        body: JSON.stringify({ content: code }),
      });
      setProject((p) => ({ ...p, files: { ...p.files, [active]: code } }));
      bcRef.current?.postMessage({ type: 'file', projectId: project.id, name: active, content: code });
      setDirty(false);
      if (!silent) notify('Sauvegardé');
      return true;
    } catch (e) {
      notify(e.message);
      return false;
    }
  }
  async function compile({ auto = false } = {}) {
    if (compiling.current) return;
    compiling.current = true;
    setBusy(true);
    try {
      if (dirty && !(await saveFile(true))) throw new Error('Sauvegarde impossible. Compilation annulée.');
      const current = { ...project, files: currentFiles };
      const engine = effectiveCompiler(current);
      if (engine === 'pdflatex' && needsUnicodeEngine(currentFiles) && !auto)
        notify('fontspec / polyglossia demandent XeLaTeX ou LuaLaTeX : change le compilateur dans le menu à gauche.');
      const j = DEMO
        ? await compileInBrowser(current, setCompilePhase, engine)
        : await api(`/projects/${project.id}/compile`, { method: 'POST' });
      setPdf(j.url + (DEMO ? '' : '?token=' + encodeURIComponent(localStorage.tn_token)));
      setLog(j.log || '');
      if (!auto) {
        setMobilePane('pdf');
        notify('PDF compilé');
      }
    } catch (e) {
      const text = e.data?.log || e.message;
      setLog(text);
      // Like Overleaf, a failed compilation opens the log on its first error.
      if (parseLatexLog(text, currentFiles, project.main).errors.length) setLogOpen(true);
      if (!auto) notify(e.message);
    } finally {
      compiling.current = false;
      setBusy(false);
      setCompilePhase('');
    }
  }
  function stopCompile() {
    cancelCompile();
    notify('Compilation arrêtée');
  }
  async function addFile() {
    if (dirty && !(await saveFile(true))) return;
    const n = prompt('Nom du fichier (ex : chapitre.tex ou chapitres/intro.tex pour créer un dossier)');
    if (!n) return;
    try {
      const p = await api(`/projects/${project.id}/files`, {
        method: 'POST',
        body: JSON.stringify({ name: n, content: '' }),
      });
      setProject(p);
      setActive(n);
      setCode('');
      setDirty(false);
      setFilesOpen(false);
      setMobilePane('code');
    } catch (e) {
      notify(e.message);
    }
  }
  async function renameFile(n) {
    if (dirty && !(await saveFile(true))) return;
    const next = prompt('Nouveau nom (les dossiers sont séparés par /)', n)?.trim();
    if (!next || next === n) return;
    try {
      const p = await api(`/projects/${project.id}/files/${encodeURIComponent(n)}`, {
        method: 'PATCH',
        body: JSON.stringify({ newName: next }),
      });
      setProject(p);
      if (active === n) setActive(next);
      notify('Fichier renommé. Pense à mettre à jour les \\input et \\includegraphics.');
    } catch (e) {
      notify(e.message);
    }
  }
  async function delFile(n) {
    if (dirty && !(await saveFile(true))) return;
    if (!confirm(`Supprimer ${n} ?`)) return;
    try {
      const p = await api(`/projects/${project.id}/files/${encodeURIComponent(n)}`, { method: 'DELETE' });
      setProject(p);
      if (n === active) {
        setActive(p.main);
        setCode(p.files[p.main] || '');
      }
    } catch (e) {
      notify(e.message);
    }
  }
  async function snapshot() {
    if (!(await saveFile(true))) return;
    const j = await api(`/projects/${project.id}/snapshot`, {
      method: 'POST',
      body: JSON.stringify({ label: 'Version manuelle' }),
    });
    setProject((p) => ({ ...p, history: j.history }));
    notify('Version créée');
  }
  async function restore(sid) {
    if (!confirm('Restaurer cette version ? La version actuelle sera conservée dans l’historique.')) return;
    try {
      const history = project.history || [];
      // Keep the current state, unless saving it would push the chosen (oldest) version out of the 20 kept.
      if (!(history.length >= 20 && history[0].id === sid))
        await api(`/projects/${project.id}/snapshot`, {
          method: 'POST',
          body: JSON.stringify({ label: 'Avant restauration' }),
        });
      const p = await api(`/projects/${project.id}/restore/${sid}`, { method: 'POST' });
      openProject(p);
      setShowHistory(false);
      notify('Version restaurée');
    } catch (e) {
      notify(e.message);
    }
  }
  // `source` opens the dialog on a tab ('import' from the library's import button); a click event means the default.
  async function newProject(source) {
    if (dirty && !(await saveFile(true))) return;
    setCreateOpen(typeof source === 'string' ? source : 'blank');
  }
  async function createProject(options) {
    const p = await api('/projects', { method: 'POST', body: JSON.stringify(options) });
    await loadProjects(p.id);
    setLibrary(false);
  }
  async function returnToLibrary() {
    if (busy) return;
    if (dirty && !(await saveFile(true))) return;
    setProjects(await api('/projects'));
    setLibrary(true);
  }
  function clearHash() {
    history.replaceState(null, '', location.pathname + location.search);
  }
  // A share link opens the read-only copy; a reply link adds someone's comments to the project they read.
  async function openLinkInHash() {
    let link;
    try {
      link = await readHash(location.hash);
    } catch (e) {
      clearHash();
      notify(e.message);
      return;
    }
    if (!link) return;
    setShareOpen(false);
    if (link.kind === 'share') return setShared(link);
    clearHash();
    try {
      const r = await api(`/projects/${link.id}/comments/merge`, {
        method: 'POST',
        body: JSON.stringify({ comments: link.comments }),
      });
      await loadProjects(link.id);
      setLibrary(false);
      setCommentsOpen(true);
      notify(
        r.added
          ? `${r.added} commentaire${r.added > 1 ? 's' : ''} ajouté${r.added > 1 ? 's' : ''} à « ${link.name} »`
          : 'Ces commentaires sont déjà dans le projet',
      );
    } catch (e) {
      notify(
        e.status === 404
          ? `Le projet « ${link.name} » n’est pas dans ce navigateur : ouvre ce lien là où tu l’as partagé.`
          : e.message,
      );
    }
  }
  async function copySharedProject(p) {
    try {
      const created = await api('/projects', {
        method: 'POST',
        body: JSON.stringify({
          name: (p.name + ' (copie)').slice(0, 80),
          main: p.main,
          files: p.files,
          assets: p.assets,
          compiler: p.compiler,
        }),
      });
      clearHash();
      setShared(null);
      await loadProjects(created.id);
      setLibrary(false);
      notify('Copie ajoutée à tes projets');
    } catch (e) {
      notify(e.message);
    }
  }
  async function addComment({ text, author }) {
    const sel = editorRef.current?.selection();
    const selected = sel && sel.end > sel.start ? code.slice(sel.start, sel.end).split('\n')[0] : '';
    const quote = (selected || editorRef.current?.cursorLine() || '').trim().slice(0, 300);
    try {
      const r = await api(`/projects/${project.id}/comments`, {
        method: 'POST',
        body: JSON.stringify({ file: active, line: cursor.line, quote, text, author }),
      });
      setProject((p) => ({ ...p, comments: r.comments }));
      bcRef.current?.postMessage({ type: 'comments', projectId: project.id, comments: r.comments });
    } catch (e) {
      notify(e.message);
    }
  }
  async function changeComment(id, change) {
    try {
      const r = await api(`/projects/${project.id}/comments/${id}`, change);
      setProject((p) => ({ ...p, comments: r.comments }));
      bcRef.current?.postMessage({ type: 'comments', projectId: project.id, comments: r.comments });
    } catch (e) {
      notify(e.message);
    }
  }
  async function updateAnyFile(fileName, nextContent) {
    try {
      await api(`/projects/${project.id}/files/${encodeURIComponent(fileName)}`, {
        method: 'PUT',
        body: JSON.stringify({ content: nextContent }),
      });
      setProject((p) => ({ ...p, files: { ...p.files, [fileName]: nextContent } }));
      bcRef.current?.postMessage({ type: 'file', projectId: project.id, name: fileName, content: nextContent });
      if (fileName === active) {
        setCode(nextContent);
        setDirty(false);
      }
      notify('Révision appliquée');
    } catch (e) {
      notify(e.message);
    }
  }
  async function markSelectionAsChange(kind, replacement = '', author = '') {
    const ed = editorRef.current;
    if (!ed) return;
    const sel = ed.selection();
    const selectedText = code.slice(sel.start, sel.end);
    const wrapped = wrapTrackedChange(selectedText, kind, replacement, author);
    let nextCode = code.slice(0, sel.start) + wrapped + code.slice(sel.end);
    if (active === project.main) {
      nextCode = ensureChangesPreamble(nextCode);
    } else if (project.files[project.main]) {
      const nextMain = ensureChangesPreamble(project.files[project.main]);
      if (nextMain !== project.files[project.main]) {
        await updateAnyFile(project.main, nextMain);
      }
    }
    setCode(nextCode);
    setDirty(true);
    notify('Modification marquée');
  }
  async function addBibEntryToFile(bibFile, entryText) {
    const exists = bibFile in currentFiles;
    const currentBib = currentFiles[bibFile] || '% Bibliographie TeXBea\n';
    const { content, key, duplicate } = appendBibEntry(currentBib, entryText);
    if (duplicate) {
      notify(`La clé « ${key} » est déjà dans ${bibFile}`);
      return { key, duplicate: true };
    }
    if (!exists) {
      const p = await api(`/projects/${project.id}/files`, {
        method: 'POST',
        body: JSON.stringify({ name: bibFile, content }),
      });
      setProject(p);
    } else {
      await updateAnyFile(bibFile, content);
    }
    notify(`Référence « ${key} » ajoutée à ${bibFile}`);
    return { key, duplicate: false };
  }
  async function openShare() {
    if (dirty && !(await saveFile(true))) return;
    setShareOpen(true);
  }
  async function openFromLibrary(id) {
    try {
      openProject(await api('/projects/' + id));
      setLibrary(false);
    } catch (e) {
      notify(e.message);
    }
  }

  async function projectAction(action, id) {
    try {
      if (action === 'export') {
        await exportProject(await api('/projects/' + id));
        notify('Archive ZIP téléchargée');
        return;
      }
      if (action === 'rename') {
        const p = projects.find((p) => p.id === id);
        const name = prompt('Nouveau nom du projet', p.name);
        if (!name?.trim()) return;
        await api('/projects/' + id, { method: 'PUT', body: JSON.stringify({ name }) });
      } else if (action === 'duplicate') await api('/projects/' + id + '/duplicate', { method: 'POST' });
      else if (action === 'trash' || action === 'restore')
        await api('/projects/' + id, { method: 'PUT', body: JSON.stringify({ deleted: action === 'trash' }) });
      else if (action === 'remove') {
        if (!confirm('Supprimer définitivement ce projet ? Cette action ne peut pas être annulée.')) return;
        await api('/projects/' + id, { method: 'DELETE' });
      }
      setProjects(await api('/projects'));
    } catch (e) {
      notify(e.message);
    }
  }
  // Every project in one ZIP; versions, images and comments come along in both browser and server modes.
  async function backupAll() {
    try {
      notify('Préparation de la sauvegarde…');
      const all = await api('/backup');
      const now = new Date();
      downloadBlob(await backupBlob(all), backupFileName(now));
      localStorage.setItem(LAST_BACKUP_KEY, now.toISOString());
      setStorageKey((k) => k + 1);
      notify(`Sauvegarde téléchargée : ${all.length} projet${all.length > 1 ? 's' : ''}`);
    } catch (e) {
      notify('Sauvegarde impossible : ' + e.message);
    }
  }
  async function restoreBackup(file) {
    try {
      const backup = await readBackup(file);
      const when = backup.createdAt
        ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short' }).format(new Date(backup.createdAt))
        : 'date inconnue';
      if (
        !confirm(
          `Restaurer ${backup.projects.length} projet(s) de la sauvegarde du ${when} ? Les projets actuels sont conservés ; ceux déjà présents à l’identique sont ignorés.`,
        )
      )
        return;
      const { added, skipped } = DEMO
        ? await demoApi('/restore', { method: 'POST', data: { projects: backup.projects } })
        : await api('/restore', { method: 'POST', body: JSON.stringify({ projects: backup.projects }) });
      setProjects(await api('/projects'));
      setStorageKey((k) => k + 1);
      notify(
        `${added} projet${added > 1 ? 's' : ''} restauré${added > 1 ? 's' : ''}` +
          (skipped ? `, ${skipped} déjà présent${skipped > 1 ? 's' : ''}` : ''),
      );
    } catch (e) {
      notify(e.message);
    }
  }
  async function importArchive(files, name) {
    const total = [...files].reduce((n, f) => n + f.size, 0);
    if (total > 5_000_000) notify(`Import de ${formatSize(total)} en cours…`);
    const imported = await importFiles(files, name);
    const p = await api('/projects', { method: 'POST', body: JSON.stringify(imported) });
    await loadProjects(p.id);
    setLibrary(false);
    notify('Projet importé, originaux conservés');
  }
  async function uploadFiles(input) {
    try {
      if (dirty && !(await saveFile(true))) return;
      for (const file of input) {
        checkFileSize(file);
        const binary = /\.(png|jpe?g|pdf)$/i.test(file.name);
        if (file.size > 5_000_000) notify(`Ajout de ${file.name} (${formatSize(file.size)})…`);
        const content = binary ? await fileToBase64(file) : await file.text();
        const p = await api(`/projects/${project.id}/files`, {
          method: 'POST',
          body: JSON.stringify({ name: file.name, content, binary }),
        });
        setProject(p);
      }
      notify('Fichiers ajoutés');
    } catch (e) {
      notify(e.message);
    }
  }
  async function changeMain(main) {
    try {
      if (dirty && !(await saveFile(true))) return;
      setProject(await api('/projects/' + project.id, { method: 'PUT', body: JSON.stringify({ main }) }));
      notify('Fichier principal mis à jour');
    } catch (e) {
      notify(e.message);
    }
  }
  async function changeCompiler(compiler) {
    try {
      setProject(await api('/projects/' + project.id, { method: 'PUT', body: JSON.stringify({ compiler }) }));
      notify('Compilateur : ' + compilers.find((c) => c.id === compiler).label);
    } catch (e) {
      notify(e.message);
    }
  }
  // Opens a file (saving the current one first) and selects a range in it.
  async function openAt(file, location) {
    if (file !== active) {
      if (dirty && !(await saveFile(true))) return;
      setActive(file);
      setCode(currentFiles[file] ?? '');
      setDirty(false);
    }
    setMobilePane('code');
    setFilesOpen(false);
    setJump({ ...location, id: Date.now() });
  }
  function jumpTo(location) {
    openAt(active, location);
  }
  function jumpToLog(entry) {
    if (!entry.file || !entry.line || currentFiles[entry.file] === undefined) return;
    openAt(entry.file, lineRange(currentFiles[entry.file], entry.line));
  }
  function askBeaAbout(entry) {
    setAssistantPrompt(
      `Explique cette erreur LaTeX et propose une correction${entry.line ? ` (ligne ${entry.line} de ${entry.file})` : ''} : ${entry.message}`,
    );
    openAssistant();
  }
  // Starts Bea on the selection (or the paragraph under the cursor) of the open file.
  function startBea(actionId = 'custom', instruction = '', image) {
    const ed = editorRef.current;
    if (!ed) return;
    const action = actionById(actionId);
    if (action.vision && !image) {
      photoRef.current?.click();
      return;
    }
    const { from, to } = targetFor(code, ed.selection(), action);
    const original = code.slice(from, to);
    if (action.mode === 'replace' && !original.trim()) {
      notify('Sélectionne un passage ou place le curseur dans un paragraphe.');
      return;
    }
    if (action.mode === 'replace') ed.select(from, to);
    const first = code.slice(0, from).split('\n').length,
      last = first + original.trimEnd().split('\n').length - 1;
    setMobilePane('code');
    setBeaRequest({
      id: Date.now(),
      action,
      instruction,
      image,
      file: active,
      from,
      to,
      original,
      before: code.slice(Math.max(0, from - 2000), from),
      after: code.slice(to, to + 800),
      lines:
        action.mode === 'insert' ? `ligne ${first}` : first === last ? `ligne ${first}` : `lignes ${first}–${last}`,
    });
  }
  // A photo (file picker, camera on a phone, paste or drop in the editor) that Bea turns into LaTeX at the cursor.
  async function startPhoto(file) {
    try {
      startBea('photo', '', await prepareImage(file));
    } catch (e) {
      notify(e.message);
    }
  }
  // From the log: Bea rewrites the lines around the error, with the error message as context.
  async function fixWithBea(entry) {
    const source = currentFiles[entry.file];
    if (source === undefined || !entry.line) return askBeaAbout(entry);
    const { from, to, firstLine, lastLine } = lineWindow(source, entry.line, 2);
    setLogOpen(false);
    await openAt(entry.file, { line: entry.line, start: from, end: to });
    setBeaRequest({
      id: Date.now(),
      action: actionById('fix-error'),
      file: entry.file,
      from,
      to,
      original: source.slice(from, to),
      before: source.slice(Math.max(0, from - 1200), from),
      after: source.slice(to, to + 500),
      error: entry.raw || entry.message,
      lines: `lignes ${firstLine}–${lastLine}`,
    });
  }
  async function replaceWithBackup(next, label = 'Avant remplacement') {
    if (!(await saveFile(true))) throw Error('Sauvegarde impossible');
    const j = await api(`/projects/${project.id}/snapshot`, { method: 'POST', body: JSON.stringify({ label }) });
    await api(`/projects/${project.id}/files/${encodeURIComponent(active)}`, {
      method: 'PUT',
      body: JSON.stringify({ content: next }),
    });
    setProject((p) => ({ ...p, history: j.history, files: { ...p.files, [active]: next } }));
    setCode(next);
    setDirty(false);
    notify('Modification appliquée, version précédente conservée');
  }
  function openAssistant() {
    const selection = editorRef.current?.selection() || { start: 0, end: 0 };
    assistantSelection.current = { ...selection, source: code };
    setAssistant(true);
  }
  async function insertSuggestion(fragment, mode = 'insert') {
    const target = assistantSelection.current;
    if (target.source !== code) throw Error('Le document a changé. Rouvre l’assistant avant d’insérer.');
    let start = target.start,
      end = target.end;
    if (mode === 'body') {
      start = code.lastIndexOf('\\end{document}');
      if (start < 0) start = code.length;
      end = start;
    } else if (mode === 'preamble') {
      start = code.indexOf('\\begin{document}');
      if (start < 0) start = 0;
      end = start;
    }
    await replaceWithBackup(
      mode === 'replace' ? fragment : code.slice(0, start) + '\n' + fragment + '\n' + code.slice(end),
      'Avant proposition IA',
    );
  }
  async function downloadZip() {
    try {
      if (dirty && !(await saveFile(true))) return;
      await exportProject({ ...project, files: currentFiles });
    } catch (e) {
      notify(e.message);
    }
  }
  async function choose(n) {
    if (n === active) {
      setFilesOpen(false);
      setMobilePane('code');
      return;
    }
    if (dirty && !(await saveFile(true))) return;
    setActive(n);
    setCode(files[n] || '');
    setDirty(false);
    setJump(null);
    setFilesOpen(false);
    setMobilePane('code');
  }
  async function navigateSource(fragment, occurrence) {
    const location = findSourceLocation(currentFiles, fragment, occurrence);
    if (!location) {
      notify('Texte généré ou formule : ligne source introuvable');
      return;
    }
    await openAt(location.file, location);
    notify(`${location.file} · ligne ${location.line}`);
  }
  function showInPdf() {
    if (!pdf) {
      notify('Compile d’abord le document');
      return;
    }
    const phrases = searchablePhrases(editorRef.current?.cursorLine() || '');
    if (!phrases.length) {
      notify('Place le curseur sur une ligne de texte');
      return;
    }
    setPdfTarget({ phrases, id: Date.now() });
    setMobilePane('pdf');
  }
  function downloadTex() {
    const b = new Blob([code]);
    const u = URL.createObjectURL(b);
    const a = document.createElement('a');
    a.href = u;
    a.download = active.split('/').pop();
    a.click();
    URL.revokeObjectURL(u);
  }
  function logout() {
    if (DEMO) {
      notify('Espace d’essai sans compte serveur');
      return;
    }
    localStorage.removeItem('tn_token');
    setUser(null);
    setProject(null);
  }
  // Cloud available and nobody signed in: the first page is the sign-in page (or "continue without an account").
  const askLogin =
    DEMO &&
    !shared &&
    !skippedLogin &&
    !cloudSync.user &&
    cloudSync.status !== 'unavailable' &&
    (cloudSync.status === 'loading' ||
      cloudSync.providers?.google ||
      cloudSync.providers?.github ||
      cloudSync.providers?.email);
  if (askLogin)
    return cloudSync.status === 'loading' ? (
      <main className="welcome" aria-busy="true" />
    ) : (
      <Welcome
        cloud={cloudSync}
        onSkip={() => {
          localStorage.setItem('texbea-skip-login', '1');
          setSkippedLogin(true);
        }}
      />
    );
  if (shared)
    return (
      <>
        <SharedView
          shared={shared}
          settings={settings}
          notify={notify}
          onCopy={copySharedProject}
          onExit={() => {
            clearHash();
            setShared(null);
          }}
        />
        {toast && (
          <div className="toast" role="status">
            <Check size={16} />
            {toast}
          </div>
        )}
      </>
    );
  if (!user)
    return (
      <Auth
        onAuth={(j) => {
          setUser(j.user);
          loadProjects(j.project?.id);
        }}
      />
    );
  if (library)
    return (
      <>
        <ProjectLibrary
          projects={projects}
          onOpen={openFromLibrary}
          onNew={newProject}
          onAction={projectAction}
          onBackup={backupAll}
          onRestore={restoreBackup}
          autoBackup={autoBackup}
          cloudSync={cloudSync}
          storageKey={storageKey}
          mode={DEMO}
        />
        {createOpen && (
          <NewProjectDialog
            initialSource={createOpen}
            onClose={() => setCreateOpen(false)}
            onCreate={createProject}
            onImport={importArchive}
          />
        )}
        {toast && (
          <div className="toast" role="status">
            {toast}
          </div>
        )}
      </>
    );
  if (!project)
    return (
      <div className="loading">
        <RefreshCw className="spin" /> Chargement…
      </div>
    );
  const assets = project.assets || {};
  const renderTree = (node, depth = 0) => (
    <>
      {Object.entries(node.folders).map(([folder, child]) => (
        <details key={folder} open className="tree-folder" style={{ '--depth': depth }}>
          <summary>
            <Folder size={14} />
            {folder}
          </summary>
          {renderTree(child, depth + 1)}
        </details>
      ))}
      {node.files.map((n) => {
        const isAsset = n in assets;
        const label = n.split('/').pop();
        return (
          <div
            className={'file ' + (n === active ? 'on' : '') + (isAsset ? ' asset-file' : '')}
            key={n}
            style={{ '--depth': depth }}
          >
            <button
              className="file-open"
              onClick={() => (isAsset ? setAssetPreview({ name: n, content: assets[n] }) : choose(n))}
            >
              {isAsset ? <ImageIcon size={14} /> : <FileText size={14} />}
              <span>{label}</span>
              {n === project.main && <em className="main-badge">principal</em>}
            </button>
            <button aria-label={'Renommer ' + n} title="Renommer ou déplacer" onClick={() => renameFile(n)}>
              <Pencil size={12} />
            </button>
            {n !== project.main && (
              <button aria-label={'Supprimer ' + n} title="Supprimer" onClick={() => delFile(n)}>
                <Trash2 size={12} />
              </button>
            )}
          </div>
        );
      })}
    </>
  );
  const errorCount = parsedLog.errors.length,
    warningCount = parsedLog.warnings.length;
  return (
    <div className={'app mobile-' + mobilePane + (filesOpen ? ' files-open' : '')}>
      <header className="topbar">
        <Brand />
        <nav className="crumbs" aria-label="Projet">
          <button className="back-projects" onClick={returnToLibrary} disabled={busy}>
            <Folder size={15} /> Mes projets
          </button>
          <span className="crumb-sep">/</span>
          <select
            className="project-switch"
            aria-label="Changer de projet"
            value={project.id}
            onChange={async (e) => {
              if (dirty && !(await saveFile(true))) return;
              openProject(await api('/projects/' + e.target.value));
            }}
          >
            {projects
              .filter((p) => !p.deleted)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
          <button className="top-btn new-project-btn" onClick={newProject} title="Nouveau projet">
            <Plus size={15} /> <span>Projet</span>
          </button>
        </nav>
        <div className="grow" />
        <span className={'saveState' + (dirty ? ' dirty' : '')}>
          {dirty ? 'Modifications non sauvegardées' : 'Sauvegardé'}
        </span>
        <div className="top-actions">
          <button className="top-btn" onClick={() => setShowHistory(true)} title="Versions et comparaison">
            <History size={15} /> <span>Historique</span>
          </button>
          <button
            className={'top-btn' + (revisionsOpen ? ' selected' : '')}
            onClick={() => setRevisionsOpen((v) => !v)}
            aria-expanded={revisionsOpen}
            title="Suivi des modifications et révisions"
          >
            <GitCompare size={15} /> <span>Révisions</span>
            {trackedChanges.length > 0 && <span className="badge">{trackedChanges.length}</span>}
          </button>
          <button
            className={'top-btn' + (commentsOpen ? ' selected' : '')}
            onClick={() => setCommentsOpen((v) => !v)}
            aria-expanded={commentsOpen}
            title="Commentaires sur le code"
          >
            <MessageSquare size={15} /> <span>Commentaires</span>
            {comments.some((c) => !c.resolved) && (
              <span className="badge">{comments.filter((c) => !c.resolved).length}</span>
            )}
          </button>
          <button className="top-btn" onClick={openShare} title="Partager une copie en lecture seule par un lien">
            <Share2 size={15} /> <span>Partager</span>
          </button>
          <button className="top-btn" onClick={() => setWordCountOpen(true)} title="Nombre de mots">
            <CaseSensitive size={15} /> <span>Mots</span>
          </button>
          <button className="icon" aria-label="Réglages" title="Réglages" onClick={() => setSettingsOpen(true)}>
            <Settings size={16} />
          </button>
          <button className="icon logout" aria-label="Se déconnecter" title="Se déconnecter" onClick={logout}>
            <LogOut size={16} />
          </button>
        </div>
      </header>
      <nav className="workspace-nav" aria-label="Panneaux de travail">
        <button aria-expanded={filesOpen} onClick={() => setFilesOpen((v) => !v)}>
          <Folder size={16} />
          Fichiers
        </button>
        <button
          className={mobilePane === 'code' ? 'selected' : ''}
          onClick={() => {
            setMobilePane('code');
            setFilesOpen(false);
          }}
        >
          <Code2 size={16} />
          Code
        </button>
        <button
          className={mobilePane === 'pdf' ? 'selected' : ''}
          onClick={() => {
            setMobilePane('pdf');
            setFilesOpen(false);
          }}
        >
          <FileText size={16} />
          PDF
        </button>
      </nav>
      {filesOpen && (
        <button className="drawer-backdrop" aria-label="Fermer les fichiers" onClick={() => setFilesOpen(false)} />
      )}
      <main>
        <aside className="sidebar">
          <button className="drawer-close" aria-label="Fermer le panneau fichiers" onClick={() => setFilesOpen(false)}>
            <X size={18} />
          </button>
          <div className="side-section side-files">
            <div className="sideTitle">
              <span>Fichiers</span>
              <div className="side-actions">
                <button aria-label="Nouveau fichier" title="Nouveau fichier ou dossier" onClick={addFile}>
                  <Plus size={15} />
                </button>
                <button
                  aria-label="Ajouter fichiers ou images"
                  title="Ajouter fichiers / images"
                  onClick={() => uploadRef.current.click()}
                >
                  <Upload size={15} />
                </button>
                <button aria-label="Exporter le projet ZIP" title="Exporter le projet ZIP" onClick={downloadZip}>
                  <Download size={15} />
                </button>
              </div>
              <input
                ref={uploadRef}
                hidden
                type="file"
                multiple
                accept=".tex,.bib,.sty,.cls,.bst,.txt,.csv,.md,.png,.jpg,.jpeg,.pdf"
                onChange={(e) => {
                  uploadFiles([...e.target.files]);
                  e.target.value = '';
                }}
              />
            </div>
            <div className="folder">
              <Folder size={15} />
              {project.name}
            </div>
            <div className="file-tree">{renderTree(fileTree([...Object.keys(files), ...Object.keys(assets)]))}</div>
          </div>
          <details className="side-section document-outline" open>
            <summary>
              Plan du document <span className="count">{outline.length}</span>
            </summary>
            {!outline.length && (
              <p className="side-empty">Ajoute des \section (ou des frame en Beamer) pour voir le plan.</p>
            )}
            {outline.map((h, i) => (
              <button
                key={i}
                className={h.line <= cursor.line && (outline[i + 1]?.line ?? Infinity) > cursor.line ? 'on' : ''}
                onClick={() => jumpTo(h)}
                style={{ paddingLeft: 10 + 12 * outlineDepth[h.level] }}
                data-level={h.level}
              >
                {h.level === 'frame' && <Presentation size={12} aria-label="Diapositive" />}
                {h.title}
              </button>
            ))}
          </details>
          <div className="side-section project-settings">
            <div className="sideTitle">
              <span>Compilation</span>
            </div>
            <label className="main-file-label">
              Fichier principal
              <select aria-label="Fichier principal" value={project.main} onChange={(e) => changeMain(e.target.value)}>
                {Object.keys(files)
                  .filter((n) => n.endsWith('.tex'))
                  .map((n) => (
                    <option key={n}>{n}</option>
                  ))}
              </select>
            </label>
            <label className="main-file-label">
              Compilateur
              <select
                aria-label="Compilateur"
                value={project.compiler || 'pdflatex'}
                onChange={(e) => changeCompiler(e.target.value)}
              >
                {compilers.map((c) => (
                  <option key={c.id} value={c.id} disabled={DEMO && !c.browser}>
                    {c.label}
                    {DEMO && !c.browser ? ' (serveur local)' : ''}
                  </option>
                ))}
              </select>
              {magicProgram(currentFiles[project.main] || '') && (
                <small>Imposé par « % !TEX program » dans {project.main}</small>
              )}
            </label>
            <div className="collab">
              <Users size={15} />
              <div>
                <b>
                  {DEMO
                    ? 'Synchro multi-onglets'
                    : peers.length > 1
                      ? `${peers.length} sessions actives`
                      : 'Temps réel prêt'}
                </b>
                <small>
                  {DEMO
                    ? 'Sauvegarde locale + BroadcastChannel'
                    : peers.length > 1
                      ? peers.map((p) => `${p.name} (${p.file}:${p.line})`).join(' · ')
                      : 'Synchronisation multi-onglets via WebSocket'}
                </small>
              </div>
            </div>
          </div>
        </aside>
        <section className="editor">
          <div className="paneTop">
            <div className="tab">
              <Code2 size={14} />
              {active}
              {dirty && <span className="tab-dot" aria-label="non sauvegardé" />}
            </div>
            <div className="editor-actions">
              <button
                className="icon"
                aria-label="Rechercher"
                title="Rechercher dans le fichier (Ctrl/Cmd + F)"
                onClick={() => editorRef.current?.openSearch()}
              >
                <Search size={15} />
              </button>
              <button
                className="icon"
                aria-label="Rechercher dans le projet"
                title="Rechercher dans le projet (Ctrl/Cmd + Maj + F)"
                onClick={() => setProjectSearch((v) => !v)}
              >
                <FileSearch size={15} />
              </button>
              <button onClick={showInPdf} title="Montrer dans le PDF la ligne du curseur">
                <LocateFixed size={14} />
                <span>Voir dans le PDF</span>
              </button>
              <button onClick={() => saveFile()} title="Ctrl/Cmd + S">
                <Save size={14} />
                <span>Sauver</span>
              </button>
            </div>
          </div>
          <EditorToolbar
            editor={editorRef}
            onBea={startBea}
            onAssistant={openAssistant}
            onVisual={(tab) => setVisualOpen(tab || 'table')}
            onBibImport={() => setBibImportOpen(true)}
            beamer={isBeamer}
          />
          <input
            ref={photoRef}
            hidden
            type="file"
            accept="image/*"
            aria-label="Photo à transformer en LaTeX"
            onChange={(e) => {
              if (e.target.files[0]) startPhoto(e.target.files[0]);
              e.target.value = '';
            }}
          />
          {beaRequest && beaRequest.file === active && (
            <Suspense fallback={null}>
              <InlineAssistant
                key={beaRequest.id}
                request={beaRequest}
                editor={editorRef}
                autoApply={settings.aiAutoApply}
                onAutoApplyChange={(v) => updateSettings({ ...settings, aiAutoApply: v })}
                onClose={() => setBeaRequest(null)}
                notify={notify}
              />
            </Suspense>
          )}
          {revisionsOpen && (
            <TrackChangesPanel
              files={currentFiles}
              active={active}
              code={code}
              history={project.history}
              onUpdateFile={updateAnyFile}
              onMarkSelection={markSelectionAsChange}
              onJump={(file, line, start, end) =>
                openAt(file, start != null ? { line, start, end } : lineRange(currentFiles[file] ?? '', line))
              }
              onClose={() => setRevisionsOpen(false)}
            />
          )}
          {commentsOpen && (
            <CommentsPanel
              comments={comments}
              files={currentFiles}
              active={active}
              anchor={{ line: cursor.line, quote: '' }}
              onAdd={addComment}
              onResolve={(id, resolved) => changeComment(id, { method: 'PATCH', body: JSON.stringify({ resolved }) })}
              onDelete={(id) => {
                if (confirm('Supprimer ce commentaire ?')) changeComment(id, { method: 'DELETE' });
              }}
              onJump={(file, line) => openAt(file, lineRange(currentFiles[file] ?? '', line))}
              onClose={() => setCommentsOpen(false)}
            />
          )}
          {projectSearch && (
            <ProjectSearch
              files={currentFiles}
              onJump={(r) => openAt(r.file, r)}
              onClose={() => setProjectSearch(false)}
            />
          )}
          <div className="codeWrap">
            <CodeEditor
              ref={editorRef}
              value={code}
              docKey={project.id + ':' + active}
              settings={settings}
              diagnostics={activeDiagnostics}
              jump={jump}
              getProject={() => ({ files: currentFiles, assets })}
              onCursor={setCursor}
              onChange={(next) => {
                if (next === code) return;
                setCode(next);
                setDirty(true);
              }}
              actions={{
                save: () => saveFile(),
                compile: () => compile(),
                projectSearch: () => setProjectSearch(true),
                bea: () => startBea('custom'),
                image: startPhoto,
              }}
            />
          </div>
          <div className="status">
            <span>
              Ligne {cursor.line}, col. {cursor.column}
            </span>
            <span>{code.split('\n').length} lignes</span>
            <span>{dirty ? 'Sauvegarde…' : 'Sauvegardé'}</span>
          </div>
        </section>
        <section className="preview">
          <div className="paneTop preview-top">
            <div className="compile-group">
              {busy && DEMO ? (
                <button className="compile stop" onClick={stopCompile} title={compilePhase}>
                  <Square size={13} />
                  Arrêter
                </button>
              ) : (
                <button className="compile" onClick={() => compile()} disabled={busy} title="Ctrl/Cmd + Entrée">
                  {busy ? <RefreshCw size={14} className="spin" /> : <Play size={14} />}
                  {busy ? compilePhase || 'Compilation…' : 'Compiler PDF'}
                </button>
              )}
              <span className="engine-chip" title="Compilateur (à changer dans la colonne Fichiers)">
                {compilers.find((c) => c.id === effectiveCompiler({ ...project, files: currentFiles }))?.label}
              </span>
            </div>
            <div className="preview-actions">
              {log && (
                <button
                  className={'log-button' + (errorCount ? ' has-errors' : warningCount ? ' has-warnings' : '')}
                  onClick={() => setLogOpen((v) => !v)}
                  aria-expanded={logOpen}
                >
                  <ScrollText size={14} />
                  Journal
                  {errorCount > 0 && <span className="badge error">{errorCount}</span>}
                  {warningCount > 0 && <span className="badge warning">{warningCount}</span>}
                </button>
              )}
              {pdf && (
                <a
                  className="btn"
                  href={pdf}
                  download={
                    project.main
                      .split('/')
                      .pop()
                      .replace(/\.tex$/i, '') + '.pdf'
                  }
                >
                  <Download size={14} />
                  PDF
                </a>
              )}
              <button onClick={downloadTex} title="Télécharger le fichier .tex">
                <Download size={14} /> .tex
              </button>
            </div>
          </div>
          <div className="paperArea">
            {logOpen && log ? (
              <LogPanel
                parsed={parsedLog}
                raw={log}
                onJump={jumpToLog}
                onAskBea={askBeaAbout}
                onFixWithBea={fixWithBea}
                onClose={() => setLogOpen(false)}
              />
            ) : pdf ? (
              <Suspense fallback={<p className="pdf-loading">Chargement du lecteur PDF…</p>}>
                <PdfViewer
                  url={pdf}
                  onSource={navigateSource}
                  target={pdfTarget}
                  onTargetMissing={() => notify('Passage introuvable dans le PDF (formule ou texte généré ?)')}
                />
              </Suspense>
            ) : (
              <div className="emptyPdf">
                <div className="docIcon">PDF</div>
                <h2>{busy ? compilePhase || 'Compilation…' : 'Prêt à compiler'}</h2>
                <p>
                  {DEMO
                    ? 'Clique sur Compiler PDF. Le moteur LaTeX s’exécute dans ton navigateur, avec prise en charge de TikZ.'
                    : 'TeXBea utilise latexmk / TeX Live côté serveur. Clique sur « Compiler PDF ».'}
                </p>
                <small>
                  {DEMO
                    ? 'Le premier lancement télécharge les paquets nécessaires. Tes projets restent dans ce navigateur.'
                    : 'Sans TeX Live, le serveur te le signalera.'}
                </small>
              </div>
            )}
          </div>
          <div className="pdfStatus">
            <span>
              <span className={pdf ? 'green' : errorCount ? 'red' : 'amber'}></span>
              {pdf ? 'PDF généré' : errorCount ? 'Erreurs de compilation' : 'En attente'}
            </span>
            <span>
              {compilers.find((c) => c.id === effectiveCompiler({ ...project, files: currentFiles }))?.label}
              {settings.autoCompile ? ' · Compilation auto' : ''}
            </span>
          </div>
        </section>
      </main>
      {assistant && (
        <Suspense
          fallback={
            <div className="modalBack">
              <div className="modal">Chargement de Bea…</div>
            </div>
          }
        >
          <AssistantPanel
            source={code}
            files={files}
            log={log}
            initialPrompt={assistantPrompt}
            onClose={() => {
              setAssistant(false);
              setAssistantPrompt('');
            }}
            onJump={(line) => jumpTo(lineRange(code, line))}
            projectId={project.id}
            onInsert={insertSuggestion}
          />
        </Suspense>
      )}
      {assetPreview && (
        <div className="modalBack">
          <div className="modal asset-preview">
            <div className="modalHead">
              <h2>{assetPreview.name}</h2>
              <button aria-label="Fermer l’image" onClick={() => setAssetPreview(null)}>
                <X />
              </button>
            </div>
            {assetPreview.name.toLowerCase().endsWith('.pdf') ? (
              <iframe title="PDF importé" src={'data:application/pdf;base64,' + assetPreview.content} />
            ) : (
              <img
                alt={assetPreview.name}
                src={
                  'data:image/' +
                  (assetPreview.name.toLowerCase().endsWith('.png') ? 'png' : 'jpeg') +
                  ';base64,' +
                  assetPreview.content
                }
              />
            )}
          </div>
        </div>
      )}
      {createOpen && (
        <NewProjectDialog
          initialSource={createOpen}
          onClose={() => setCreateOpen(false)}
          onCreate={createProject}
          onImport={importArchive}
        />
      )}
      {showHistory && (
        <HistoryPanel
          history={project.history}
          files={currentFiles}
          onRestore={restore}
          onSnapshot={snapshot}
          onClose={() => setShowHistory(false)}
        />
      )}
      {shareOpen && <ShareDialog project={project} onClose={() => setShareOpen(false)} notify={notify} />}
      {visualOpen && (
        <VisualModal
          initialTab={visualOpen}
          selection={(() => {
            const sel = editorRef.current?.selection();
            return sel && sel.end > sel.start ? code.slice(sel.start, sel.end) : '';
          })()}
          assets={assets}
          onInsert={(text) => editorRef.current?.insert(text)}
          onClose={() => setVisualOpen(null)}
        />
      )}
      {bibImportOpen && (
        <BibImportDialog
          files={currentFiles}
          onAddBibEntry={addBibEntryToFile}
          onCiteKey={(key) => editorRef.current?.insert(`\\cite{${key}}`)}
          onClose={() => setBibImportOpen(false)}
        />
      )}
      {wordCountOpen && (
        <WordCountDialog files={currentFiles} main={project.main} onClose={() => setWordCountOpen(false)} />
      )}
      {settingsOpen && (
        <SettingsDialog settings={settings} onChange={updateSettings} onClose={() => setSettingsOpen(false)} />
      )}
      {toast && (
        <div className="toast">
          <Check size={16} />
          {toast}
        </div>
      )}
    </div>
  );
}
if (DEMO && import.meta.env.PROD) registerOffline();
createRoot(document.getElementById('root')).render(<App />);
