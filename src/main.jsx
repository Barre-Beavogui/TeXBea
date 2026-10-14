import { exportProject, importProject, downloadBlob } from './project-tools.js';
import { documentOutline } from './latex-analysis.js';
import EditorSearch from './EditorSearch.jsx';
import LatexHighlight from './LatexHighlight.jsx';
import ProjectLibrary, { Brand, ProjectDialog } from './ProjectLibrary.jsx';
import { findSourceLocation } from './source-navigation.js';
import { compileInBrowser } from './browser-compiler.js';
import { demoApi } from './demo-api.js';
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
  AlertTriangle,
  RefreshCw,
  Users,
  Code2,
  X,
  Sparkles,
  Search,
  Upload,
  Copy,
} from 'lucide-react';
import './style.css';
const AssistantPanel = lazy(() => import('./AssistantPanel.jsx'));
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
    [searchOpen, setSearchOpen] = useState(false),
    [assetPreview, setAssetPreview] = useState(null),
    timer = useRef(),
    editorRef = useRef(),
    gutterRef = useRef(),
    highlightRef = useRef(),
    uploadRef = useRef(),
    assistantSelection = useRef();
  useEffect(
    () => () => {
      if (pdf.startsWith('blob:')) URL.revokeObjectURL(pdf);
    },
    [pdf],
  );
  useEffect(() => {
    if (!jump || !editorRef.current) return;
    const el = editorRef.current;
    requestAnimationFrame(() => {
      el.focus({ preventScroll: true });
      el.setSelectionRange(jump.start, jump.end);
      const lineHeight = parseFloat(getComputedStyle(el).lineHeight);
      el.scrollTop = Math.max(0, (jump.line - 1) * lineHeight - el.clientHeight / 2 + 16);
      el.scrollLeft = 0;
      syncEditorScroll(el);
    });
  }, [jump, active, code, mobilePane]);
  function syncEditorScroll(el) {
    if (gutterRef.current) gutterRef.current.scrollTop = el.scrollTop;
    if (highlightRef.current) {
      highlightRef.current.scrollTop = el.scrollTop;
      highlightRef.current.scrollLeft = el.scrollLeft;
    }
  }
  useEffect(() => {
    if (editorRef.current) syncEditorScroll(editorRef.current);
  }, [code, active, library, mobilePane]);
  const files = project?.files || {};
  const notify = (s) => {
    setToast(s);
    setTimeout(() => setToast(''), 1800);
  };
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
    setSearchOpen(false);
    setAssistant(false);
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
  async function compile() {
    setBusy(true);
    setLog('');
    setPdf('');
    try {
      if (dirty && !(await saveFile(true))) throw new Error('Sauvegarde impossible. Compilation annulée.');
      const current = { ...project, files: { ...project.files, [active]: code } };
      const j = DEMO
        ? await compileInBrowser(current, setCompilePhase)
        : await api(`/projects/${project.id}/compile`, { method: 'POST' });
      setPdf(j.url + (DEMO ? '' : '?token=' + encodeURIComponent(localStorage.tn_token)));
      setLog(j.log || '');
      setMobilePane('pdf');
      notify('PDF compilé');
    } catch (e) {
      setLog(e.data?.log || e.message);
      notify(e.message);
    } finally {
      setBusy(false);
      setCompilePhase('');
    }
  }
  async function addFile() {
    if (dirty && !(await saveFile(true))) return;
    const n = prompt('Nom du fichier (ex: chapitre.tex)');
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
  async function delFile(n) {
    if (dirty && !(await saveFile(true))) return;
    if (!confirm(`Supprimer ${n} ?`)) return;
    try {
      const p = await api(`/projects/${project.id}/files/${encodeURIComponent(n)}`, { method: 'DELETE' });
      setProject(p);
      setActive(p.main);
      setCode(p.files[p.main] || '');
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
    if (!confirm('Restaurer cette version ?')) return;
    const p = await api(`/projects/${project.id}/restore/${sid}`, { method: 'POST' });
    openProject(p);
    setShowHistory(false);
    notify('Version restaurée');
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
  function jumpTo(location) {
    setMobilePane('code');
    setFilesOpen(false);
    setJump({ ...location, id: Date.now() });
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
    const el = editorRef.current;
    assistantSelection.current = { start: el?.selectionStart || 0, end: el?.selectionEnd || 0, source: code };
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
      await exportProject({ ...project, files: { ...files, [active]: code } });
    } catch (e) {
      notify(e.message);
    }
  }
  async function choose(n) {
    if (dirty && !(await saveFile(true))) return;
    setActive(n);
    setCode(files[n] || '');
    setDirty(false);
    setJump(null);
    setFilesOpen(false);
    setMobilePane('code');
  }
  async function navigateSource(fragment, occurrence) {
    const currentFiles = { ...files, [active]: code };
    const location = findSourceLocation(currentFiles, fragment, occurrence);
    if (!location) {
      notify('Texte généré ou formule : ligne source introuvable');
      return;
    }
    if (dirty && !(await saveFile(true))) return;
    setActive(location.file);
    setCode(currentFiles[location.file]);
    setDirty(false);
    setMobilePane('code');
    setJump({ ...location, id: Date.now() });
    notify(`${location.file} · ligne ${location.line}`);
  }
  function downloadTex() {
    const b = new Blob([code]);
    const u = URL.createObjectURL(b);
    const a = document.createElement('a');
    a.href = u;
    a.download = active;
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
            <button onClick={addFile}>
              <Plus size={15} />
            </button>
          </div>
          <div className="folder">
            <Folder size={16} />
            {project.name}
          </div>
          {Object.keys(files).map((n) => (
            <div className={'file ' + (n === active ? 'on' : '')} key={n} onClick={() => choose(n)}>
              <FileText size={14} />
              <span>{n}</span>
              {n !== project.main && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    delFile(n);
                  }}
                >
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          ))}
          {Object.entries(project.assets || {}).map(([n, content]) => (
            <div className="file asset-file" key={n}>
              <button onClick={() => setAssetPreview({ name: n, content })}>
                <FileText size={14} />
                {n}
              </button>
              <button aria-label={'Supprimer ' + n} onClick={() => delFile(n)}>
                <Trash2 size={12} />
              </button>
            </div>
          ))}
          <details className="document-outline">
            <summary>Plan du document ({documentOutline(code).length})</summary>
            {documentOutline(code).map((h, i) => (
              <button key={i} onClick={() => jumpTo(h)} style={{ paddingLeft: h.level.includes('sub') ? 18 : 6 }}>
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
              accept=".tex,.bib,.sty,.cls,.txt,.csv,.png,.jpg,.jpeg,.pdf"
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
            <button onClick={snapshot}>
              <History size={15} />
              Créer une version
            </button>
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
              <button className="compile" onClick={compile} disabled={busy}>
                <Play size={15} />
                {busy ? compilePhase || 'Compilation…' : 'Compiler PDF'}
              </button>
            </div>
          </div>
          <div className="editor-v3-tools">
            <button onClick={openAssistant}>
              <Sparkles size={15} />
              Bea · assistant
            </button>
            <button onClick={() => setSearchOpen((v) => !v)}>
              <Search size={15} />
              Rechercher
            </button>
            <span>V3</span>
          </div>
          {searchOpen && (
            <EditorSearch
              source={code}
              onFind={jumpTo}
              onReplace={replaceWithBackup}
              onClose={() => setSearchOpen(false)}
            />
          )}
          <div className="codeWrap">
            <div className="lines" ref={gutterRef}>
              {code.split('\n').map((_, i) => (
                <div className={jump?.line === i + 1 ? 'source-highlight' : ''} key={i}>
                  {i + 1}
                </div>
              ))}
            </div>
            <LatexHighlight ref={highlightRef} code={code} />
            <textarea
              ref={editorRef}
              aria-label="Code LaTeX"
              wrap="off"
              onScroll={(e) => syncEditorScroll(e.currentTarget)}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                  e.preventDefault();
                  saveFile();
                }
                if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
                  e.preventDefault();
                  setSearchOpen(true);
                }
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !busy) {
                  e.preventDefault();
                  compile();
                }
              }}
              spellCheck={false}
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                setDirty(true);
                setJump(null);
              }}
            />
          </div>
          <div className="status">
            <span>{code.split('\n').length} lignes</span>
            <span>{jump ? 'Ligne ' + jump.line : 'UTF-8'}</span>
            <span>{dirty ? 'Sauvegarde…' : 'Sauvegardé'}</span>
          </div>
        </section>
        <section className="preview">
          <div className="paneTop">
            <b>APERÇU PDF</b>
            <div>
              {pdf && (
                <a href={pdf} download={project.main.replace(/\.tex$/i, '') + '.pdf'}>
                  Télécharger PDF
                </a>
              )}
              <button onClick={downloadTex}>
                <Download size={14} /> .tex
              </button>
            </div>
          </div>
          <div className="paperArea">
            {pdf ? (
              <Suspense fallback={<p className="pdf-loading">Chargement du lecteur PDF…</p>}>
                <PdfViewer url={pdf} onSource={navigateSource} />
              </Suspense>
            ) : (
              <div className="emptyPdf">
                <div className="docIcon">PDF</div>
                <h2>Prêt à compiler</h2>
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
          {log && (
            <details className="log">
              <summary>Journal de compilation</summary>
              <pre>{log}</pre>
            </details>
          )}
          <div className="pdfStatus">
            <span>
              <span className={pdf ? 'green' : 'amber'}></span>
              {pdf ? 'PDF généré' : 'En attente'}
            </span>
            <span>TeXBea Engine</span>
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
            onClose={() => setAssistant(false)}
            onJump={(line) => {
              const start =
                code
                  .split('\n')
                  .slice(0, line - 1)
                  .join('\n').length + (line > 1 ? 1 : 0);
              jumpTo({ line, start, end: start + code.split('\n')[line - 1].length });
            }}
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
      {createOpen && <ProjectDialog onClose={() => setCreateOpen(false)} onCreate={createProject} />}{' '}
      {showHistory && (
        <div className="modalBack">
          <div className="modal">
            <div className="modalHead">
              <h2>Historique</h2>
              <button onClick={() => setShowHistory(false)}>
                <X />
              </button>
            </div>
            {[...(project.history || [])].reverse().map((h) => (
              <div className="history" key={h.id}>
                <div>
                  <b>{h.label}</b>
                  <small>{new Date(h.at).toLocaleString()}</small>
                </div>
                <button onClick={() => restore(h.id)}>Restaurer</button>
              </div>
            ))}
            {!project.history?.length && <p>Aucune version enregistrée.</p>}
          </div>
        </div>
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
