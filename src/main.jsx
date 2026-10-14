import { exportProject, importProject } from './project-tools.js';
import { documentOutline } from './latex-analysis.js';
import ProjectLibrary, { Brand, ProjectDialog } from './ProjectLibrary.jsx';
import { findSourceLocation, searchablePhrases } from './source-navigation.js';
import { compileInBrowser, cancelCompile } from './browser-compiler.js';
import { compilers, effectiveCompiler, magicProgram, needsUnicodeEngine } from './compilers.js';
import { parseLatexLog } from './log-parser.js';
import { actionById, targetFor, lineWindow } from './ai-actions.js';
import { prepareImage } from './image-input.js';
import { loadSettings, saveSettings } from './settings.js';
import { demoApi } from './demo-api.js';
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
  Sparkles,
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
} from 'lucide-react';
import './style.css';
const AssistantPanel = lazy(() => import('./AssistantPanel.jsx'));
const InlineAssistant = lazy(() => import('./InlineAssistant.jsx'));
const PdfViewer = lazy(() => import('./PdfViewer.jsx'));
const API = '/api';
async function api(path, opt = {}) {
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
          TeXBea <em>V3</em>
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
    timer = useRef(),
    autoTimer = useRef(),
    compiling = useRef(false),
    editorRef = useRef(),
    uploadRef = useRef(),
    photoRef = useRef(),
    assistantSelection = useRef();
  useEffect(
    () => () => {
      if (pdf.startsWith('blob:')) URL.revokeObjectURL(pdf);
    },
    [pdf],
  );
  const files = project?.files || {};
  const currentFiles = useMemo(() => ({ ...files, [active]: code }), [files, active, code]);
  const parsedLog = useMemo(() => parseLatexLog(log, files, project?.main), [log, files, project?.main]);
  const activeDiagnostics = useMemo(() => parsedLog.all.filter((e) => e.file === active), [parsedLog, active]);
  const outline = useMemo(() => documentOutline(code), [code]);
  const notify = (s) => {
    setToast(s);
    setTimeout(() => setToast(''), 1800);
  };
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
      return;
    }
    if (localStorage.tn_token) {
      setUser({ name: 'Workspace' });
      loadProjects();
    }
  }, []);
  useEffect(() => {
    if (DEMO || !project || !localStorage.tn_token) return;
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws?token=${localStorage.tn_token}&project=${project.id}`);
    ws.onmessage = (e) => {
      try {
        const m = JSON.parse(e.data);
        if (m.type === 'file' && m.name === active && !dirty) {
          setCode(m.content);
          notify('Modification distante reçue');
        }
      } catch {}
    };
    return () => ws.close();
  }, [project?.id, active, dirty]);
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
  async function newProject() {
    if (dirty && !(await saveFile(true))) return;
    setCreateOpen(true);
  }
  async function createProject(name, template) {
    const p = await api('/projects', { method: 'POST', body: JSON.stringify({ name, template }) });
    await loadProjects(p.id);
    setLibrary(false);
  }
  async function returnToLibrary() {
    if (busy) return;
    if (dirty && !(await saveFile(true))) return;
    setProjects(await api('/projects'));
    setLibrary(true);
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
  async function importArchive(file) {
    try {
      const imported = await importProject(file);
      const p = await api('/projects', { method: 'POST', body: JSON.stringify(imported) });
      await loadProjects(p.id);
      setLibrary(false);
      notify('Projet importé, originaux conservés');
    } catch (e) {
      notify(e.message);
    }
  }
  async function uploadFiles(input) {
    try {
      if (dirty && !(await saveFile(true))) return;
      for (const file of input) {
        if (file.size > 1_500_000) throw Error('Fichier trop volumineux : ' + file.name);
        const binary = /\.(png|jpe?g|pdf)$/i.test(file.name);
        let content;
        if (binary) {
          const bytes = new Uint8Array(await file.arrayBuffer());
          let text = '';
          for (let i = 0; i < bytes.length; i += 8192) text += String.fromCharCode(...bytes.subarray(i, i + 8192));
          content = btoa(text);
        } else content = await file.text();
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
          onImport={importArchive}
          mode={DEMO}
        />
        {createOpen && <ProjectDialog onClose={() => setCreateOpen(false)} onCreate={createProject} />}{' '}
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
      <header>
        <Brand />
        <button className="back-projects" onClick={returnToLibrary} disabled={busy}>
          <Folder size={16} /> Mes projets
        </button>
        <select
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
        <button className="ghostText" onClick={newProject}>
          <Plus size={15} /> Projet
        </button>
        <div className="grow" />
        <span className="saveState">{dirty ? '● non sauvegardé' : '✓ sauvegardé'}</span>
        <button className="icon" aria-label="Réglages" title="Réglages" onClick={() => setSettingsOpen(true)}>
          <Settings size={16} />
        </button>
        <button className="icon logout" aria-label="Se déconnecter" onClick={logout}>
          <LogOut size={16} />
        </button>
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
        <aside>
          <button className="drawer-close" aria-label="Fermer le panneau fichiers" onClick={() => setFilesOpen(false)}>
            <X size={18} />
          </button>
          <div className="sideTitle">
            <span>FICHIERS</span>
            <button aria-label="Nouveau fichier" title="Nouveau fichier ou dossier" onClick={addFile}>
              <Plus size={15} />
            </button>
          </div>
          <div className="folder">
            <Folder size={16} />
            {project.name}
          </div>
          <div className="file-tree">{renderTree(fileTree([...Object.keys(files), ...Object.keys(assets)]))}</div>
          <details className="document-outline" open>
            <summary>Plan du document ({outline.length})</summary>
            {outline.map((h, i) => (
              <button
                key={i}
                className={h.line <= cursor.line && (outline[i + 1]?.line ?? Infinity) > cursor.line ? 'on' : ''}
                onClick={() => jumpTo(h)}
                style={{
                  paddingLeft: 6 + 12 * ['part', 'chapter', 'section', 'subsection', 'subsubsection'].indexOf(h.level),
                }}
              >
                {h.title}
              </button>
            ))}
          </details>
          <div className="sideTools">
            <button onClick={() => uploadRef.current.click()}>
              <Upload size={15} />
              Ajouter fichiers / images
            </button>
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
            <button onClick={downloadZip}>
              <Download size={15} />
              Exporter le projet ZIP
            </button>
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
            <button onClick={() => setShowHistory(true)}>
              <History size={15} />
              Historique ({project.history?.length || 0})
            </button>
            <div className="collab">
              <Users size={16} />
              <div>
                <b>{DEMO ? 'Essai individuel' : 'Temps réel prêt'}</b>
                <small>{DEMO ? 'Sauvegarde dans ce navigateur' : 'Synchronisation multi-onglets via WebSocket'}</small>
              </div>
            </div>
          </div>
        </aside>
        <section className="editor">
          <div className="paneTop">
            <div className="tab">
              <Code2 size={14} />
              {active}
            </div>
            <div className="editor-actions">
              <button onClick={() => saveFile()}>
                <Save size={14} /> Sauver
              </button>
              {busy && DEMO ? (
                <button className="compile stop" onClick={stopCompile} title={compilePhase}>
                  <Square size={13} />
                  Arrêter
                </button>
              ) : (
                <button className="compile" onClick={() => compile()} disabled={busy} title="Ctrl/Cmd + Entrée">
                  <Play size={15} />
                  {busy ? compilePhase || 'Compilation…' : 'Compiler PDF'}
                </button>
              )}
            </div>
          </div>
          <div className="editor-v3-tools">
            <button onClick={openAssistant}>
              <Sparkles size={15} />
              Bea · assistant
            </button>
            <button onClick={() => editorRef.current?.openSearch()} title="Ctrl/Cmd + F">
              <Search size={15} />
              Rechercher
            </button>
            <button onClick={() => setProjectSearch((v) => !v)} title="Ctrl/Cmd + Maj + F">
              <FileSearch size={15} />
              Dans le projet
            </button>
            <button onClick={showInPdf} title="Montrer dans le PDF la ligne du curseur">
              <LocateFixed size={15} />
              Voir dans le PDF
            </button>
            <button onClick={() => setWordCountOpen(true)}>
              <CaseSensitive size={15} />
              Mots
            </button>
            <span>V3</span>
          </div>
          <EditorToolbar editor={editorRef} onBea={startBea} />
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
          <div className="paneTop">
            <b>APERÇU PDF</b>
            <div>
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
                  href={pdf}
                  download={
                    project.main
                      .split('/')
                      .pop()
                      .replace(/\.tex$/i, '') + '.pdf'
                  }
                >
                  Télécharger PDF
                </a>
              )}
              <button onClick={downloadTex}>
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
      {createOpen && <ProjectDialog onClose={() => setCreateOpen(false)} onCreate={createProject} />}
      {showHistory && (
        <HistoryPanel
          history={project.history}
          files={currentFiles}
          onRestore={restore}
          onSnapshot={snapshot}
          onClose={() => setShowHistory(false)}
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
createRoot(document.getElementById('root')).render(<App />);
