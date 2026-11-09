import React, { lazy, Suspense, useMemo, useRef, useState } from 'react';
import { Play, RefreshCw, Copy, Send, MessageSquare, X, Eye, FileText, Code2 } from 'lucide-react';
import { Brand } from './ProjectLibrary.jsx';
import CodeEditor from './CodeEditor.jsx';
import CommentsPanel from './CommentsPanel.jsx';
import { compileInBrowser } from './browser-compiler.js';
import { compilers, effectiveCompiler } from './compilers.js';
import { findSourceLocation } from './source-navigation.js';
import { placeholderFor } from './placeholders.js';
import { commentLine, replyLink } from './share.js';
import { appBase } from './ShareDialog.jsx';
const PdfViewer = lazy(() => import('./PdfViewer.jsx'));

function lineRange(text, line) {
  const lines = text.split('\n');
  const n = Math.min(Math.max(1, line), lines.length);
  const start = lines.slice(0, n - 1).join('\n').length + (n > 1 ? 1 : 0);
  return { line: n, start, end: start + lines[n - 1].length, id: Date.now() };
}

// Comments written here are kept in this browser until they are sent back.
const draftKey = (id) => 'texbea-review-' + id;
function loadDrafts(id) {
  try {
    return JSON.parse(localStorage.getItem(draftKey(id)) || '[]');
  } catch {
    return [];
  }
}

// What someone sees when they open a share link: read only, but they can compile and comment.
export default function SharedView({ shared, settings, onCopy, onExit, notify }) {
  const { project } = shared;
  const [active, setActive] = useState(project.main);
  const [mine, setMine] = useState(() => loadDrafts(shared.id));
  const [cursor, setCursor] = useState({ line: 1, column: 1 });
  const [panel, setPanel] = useState(true);
  const [jump, setJump] = useState(null);
  const [pdf, setPdf] = useState(''),
    [busy, setBusy] = useState(false),
    [phase, setPhase] = useState(''),
    [error, setError] = useState('');
  const [mobilePane, setMobilePane] = useState('code');
  const [reply, setReply] = useState('');
  const editorRef = useRef();
  const comments = useMemo(() => [...shared.comments, ...mine], [shared.comments, mine]);
  const text = project.files[active] ?? '';
  const diagnostics = useMemo(
    () =>
      comments
        .filter((c) => c.file === active && !c.resolved)
        .map((c) => ({ line: commentLine(text, c), level: 'info', message: `${c.author} : ${c.text}` })),
    [comments, active, text],
  );
  const engine = effectiveCompiler(project);
  function saveMine(list) {
    setMine(list);
    try {
      localStorage.setItem(draftKey(shared.id), JSON.stringify(list));
    } catch {}
  }
  function anchor() {
    const sel = editorRef.current?.selection();
    const selected = sel && sel.end > sel.start ? text.slice(sel.start, sel.end).split('\n')[0] : '';
    return { line: cursor.line, quote: (selected || editorRef.current?.cursorLine() || '').trim().slice(0, 300) };
  }
  async function compile() {
    setBusy(true);
    setError('');
    try {
      const assets = { ...project.assets };
      for (const n of project.missing || []) assets[n] = placeholderFor(n);
      const r = await compileInBrowser({ ...project, assets }, setPhase, engine === 'lualatex' ? 'pdflatex' : engine);
      setPdf(r.url);
      setMobilePane('pdf');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
      setPhase('');
    }
  }
  async function sendBack() {
    const url = await replyLink(shared, mine, appBase());
    setReply(url);
    try {
      await navigator.clipboard.writeText(url);
      notify('Lien de retour copié : envoie-le à l’auteur');
    } catch {}
  }
  function openAt(file, line) {
    setActive(file);
    setMobilePane('code');
    setJump(lineRange(project.files[file] ?? '', line));
  }
  const texFiles = Object.keys(project.files).sort();
  return (
    <div className={'app shared-view mobile-' + mobilePane}>
      <header className="topbar">
        <Brand />
        <div className="shared-title">
          <span className="shared-badge">
            <Eye size={13} /> Lecture seule
          </span>
          <b>{project.name}</b>
        </div>
        <div className="grow" />
        <div className="top-actions">
          <button className="top-btn" onClick={() => setPanel((v) => !v)} aria-expanded={panel}>
            <MessageSquare size={15} /> <span>Commentaires</span>
          </button>
          <button
            className="top-btn primary"
            onClick={sendBack}
            disabled={!mine.length}
            title="Copie un lien avec tes commentaires, à envoyer à l’auteur"
          >
            <Send size={15} /> <span>Renvoyer mes commentaires{mine.length ? ` (${mine.length})` : ''}</span>
          </button>
          <button
            className="top-btn"
            onClick={() => onCopy(project)}
            title="Créer un projet modifiable à partir de cette copie"
          >
            <Copy size={15} /> <span>Copier dans mes projets</span>
          </button>
          <button className="icon" aria-label="Fermer le partage" title="Fermer" onClick={onExit}>
            <X size={16} />
          </button>
        </div>
      </header>
      {reply && (
        <div className="shared-reply">
          <span>Envoie ce lien à l’auteur ; en l’ouvrant, tes commentaires s’ajouteront à son projet.</span>
          <input readOnly value={reply} onFocus={(e) => e.target.select()} aria-label="Lien de retour" />
          <button onClick={() => setReply('')} aria-label="Fermer">
            <X size={14} />
          </button>
        </div>
      )}
      <nav className="workspace-nav" aria-label="Panneaux">
        <button className={mobilePane === 'code' ? 'selected' : ''} onClick={() => setMobilePane('code')}>
          <Code2 size={16} /> Code
        </button>
        <button className={mobilePane === 'pdf' ? 'selected' : ''} onClick={() => setMobilePane('pdf')}>
          <FileText size={16} /> PDF
        </button>
      </nav>
      <main>
        <section className="editor">
          <div className="paneTop">
            <select
              className="shared-file"
              aria-label="Fichier"
              value={active}
              onChange={(e) => setActive(e.target.value)}
            >
              {texFiles.map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </div>
          {panel && (
            <CommentsPanel
              comments={comments}
              files={project.files}
              active={active}
              anchor={anchor()}
              onAdd={({ text: t, author }) =>
                saveMine([
                  ...mine,
                  {
                    id: crypto.randomUUID(),
                    file: active,
                    ...anchor(),
                    text: t,
                    author,
                    at: new Date().toISOString(),
                    resolved: false,
                  },
                ])
              }
              onDelete={(id) => saveMine(mine.filter((c) => c.id !== id))}
              canDelete={(c) => mine.some((m) => m.id === c.id)}
              onResolve={null}
              onJump={openAt}
              onClose={() => setPanel(false)}
            />
          )}
          <CodeEditor
            ref={editorRef}
            readOnly
            value={text}
            docKey={'shared:' + active}
            settings={settings}
            diagnostics={diagnostics}
            jump={jump}
            getProject={() => project}
            onCursor={setCursor}
            onChange={() => {}}
          />
        </section>
        <section className="preview">
          <div className="paneTop preview-top">
            <div className="compile-group">
              <button className="compile" onClick={compile} disabled={busy}>
                {busy ? <RefreshCw size={14} className="spin" /> : <Play size={14} />}
                {busy ? phase || 'Compilation…' : 'Compiler PDF'}
              </button>
              <span className="engine-chip">{compilers.find((c) => c.id === engine)?.label}</span>
            </div>
          </div>
          <div className="paperArea">
            {pdf ? (
              <Suspense fallback={<p className="pdf-loading">Chargement du lecteur PDF…</p>}>
                <PdfViewer
                  url={pdf}
                  onSource={(fragment, occurrence) => {
                    const loc = findSourceLocation(project.files, fragment, occurrence);
                    if (loc) openAt(loc.file, loc.line);
                  }}
                  onTargetMissing={() => {}}
                />
              </Suspense>
            ) : (
              <div className="emptyPdf">
                <div className="docIcon">PDF</div>
                <h2>{busy ? phase || 'Compilation…' : error ? 'Compilation échouée' : 'Copie partagée'}</h2>
                <p>
                  {error ||
                    'Compile pour voir le PDF. Place le curseur sur une ligne ou sélectionne un passage, puis écris ton commentaire.'}
                </p>
                {project.missing?.length > 0 && (
                  <small>
                    {project.missing.length} image(s) non incluse(s) dans le lien : un rectangle gris les remplace.
                  </small>
                )}
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
