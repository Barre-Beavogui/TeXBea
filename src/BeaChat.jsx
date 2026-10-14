import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Paperclip, Send, Square, Trash2, FileText, Image as ImageIcon, X, Copy, CornerDownLeft } from 'lucide-react';
import { loadChat, saveChat, clearChat, buildChatMessages, answerParts } from './chat-memory.js';
import { readAttachment, acceptedFiles } from './doc-extract.js';
import {
  aiModels,
  visionModels,
  activateAI,
  loadedModel,
  preferredModel,
  isVisionModel,
  generate,
  readImage,
  stopGeneration,
} from './local-ai.js';

const BUDGET = 20000; // characters sent to an 8k-token text model, leaving room for the answer

// **bold**, `code`, # headings and lists, rendered as React elements (never as HTML).
function inline(text) {
  return text
    .split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
    .map((part, i) =>
      part.startsWith('**') && part.endsWith('**') ? (
        <strong key={i}>{part.slice(2, -2)}</strong>
      ) : part.startsWith('`') && part.endsWith('`') && part.length > 1 ? (
        <code key={i}>{part.slice(1, -1)}</code>
      ) : (
        part
      ),
    );
}
function RichText({ text }) {
  const blocks = [];
  let list = null;
  for (const line of text.split('\n')) {
    const item = line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)/);
    if (item) {
      if (!list) blocks.push((list = { type: /^\s*\d/.test(line) ? 'ol' : 'ul', items: [] }));
      list.items.push(item[1]);
      continue;
    }
    list = null;
    const heading = line.match(/^#{1,4}\s+(.*)/);
    if (heading) blocks.push({ type: 'h', text: heading[1] });
    else if (line.trim()) blocks.push({ type: 'p', text: line });
  }
  return blocks.map((b, i) =>
    b.type === 'h' ? (
      <h4 key={i}>{inline(b.text)}</h4>
    ) : b.type === 'p' ? (
      <p key={i}>{inline(b.text)}</p>
    ) : (
      React.createElement(
        b.type,
        { key: i },
        b.items.map((t, j) => <li key={j}>{inline(t)}</li>),
      )
    ),
  );
}

function Answer({ text, onInsert, streaming }) {
  return answerParts(text).map((part, i) =>
    part.type === 'text' ? (
      <RichText key={i} text={part.text} />
    ) : (
      <div key={i} className="chat-code">
        <pre>{part.text}</pre>
        {!streaming && part.text.trim() && (
          <div className="chat-code-actions">
            <button className="primary" onClick={() => onInsert(part.text)}>
              <CornerDownLeft size={13} />
              Insérer dans le document
            </button>
            <button onClick={() => navigator.clipboard?.writeText(part.text)}>
              <Copy size={13} />
              Copier
            </button>
          </div>
        )}
      </div>
    ),
  );
}

function Chip({ a, onRemove }) {
  return (
    <span className="chat-chip">
      {a.thumb ? <img src={a.thumb} alt="" /> : a.kind === 'image' ? <ImageIcon size={14} /> : <FileText size={14} />}
      <span>{a.name}</span>
      {onRemove && (
        <button aria-label={'Retirer ' + a.name} onClick={onRemove}>
          <X size={12} />
        </button>
      )}
    </span>
  );
}

// Bea as a conversation: remembers the exchanges of this project, reads attached documents and images.
export default function BeaChat({ projectId, source, log, initialPrompt = '', onInsert }) {
  const [messages, setMessages] = useState(() => loadChat(projectId)),
    [input, setInput] = useState(initialPrompt),
    [pending, setPending] = useState([]),
    [model, setModel] = useState(() =>
      isVisionModel(loadedModel()) || !loadedModel() ? preferredModel() : loadedModel(),
    ),
    [includeFile, setIncludeFile] = useState(true),
    [busy, setBusy] = useState(false),
    [phase, setPhase] = useState(''),
    [progress, setProgress] = useState(0),
    [streaming, setStreaming] = useState(''),
    [error, setError] = useState(''),
    [dragging, setDragging] = useState(false);
  const fileRef = useRef(),
    listRef = useRef(),
    stopped = useRef(false);
  const memory = useMemo(
    () =>
      buildChatMessages({ history: messages, question: '', source: includeFile ? source : '', log, budget: BUDGET }),
    [messages, source, log, includeFile],
  );

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, streaming]);
  useEffect(() => () => stopGeneration(), []);

  async function addFiles(files) {
    setError('');
    for (const file of files) {
      try {
        setPhase('Lecture de ' + (file.name || 'l’image') + '…');
        const a = await readAttachment(file);
        setPending((p) => [...p, a]);
      } catch (e) {
        setError(e.message);
      }
    }
    setPhase('');
  }
  async function ensure(id) {
    if (loadedModel() === id) return;
    setPhase(isVisionModel(id) ? 'Chargement du modèle de vision…' : 'Chargement du modèle…');
    setProgress(0);
    await activateAI(id, (r) => setProgress(r.progress));
  }
  async function send() {
    const question = input.trim();
    if (busy || (!question && !pending.length)) return;
    const attachments = pending;
    const user = { role: 'user', content: question, attachments, at: Date.now() };
    const history = messages;
    setMessages([...history, user]);
    setInput('');
    setPending([]);
    setBusy(true);
    setError('');
    setStreaming('');
    stopped.current = false;
    let answer = '';
    try {
      const images = attachments.filter((a) => a.kind === 'image');
      if (images.length) {
        // Images go to the vision model; its reading is kept as text so the conversation can go on about it.
        await ensure(visionModels[0].id);
        const recall = history
          .filter((m) => m.role === 'assistant')
          .slice(-1)
          .map((m) => m.content.slice(0, 500))
          .join('');
        for (const [n, image] of images.entries()) {
          setPhase(images.length > 1 ? `Bea lit l’image ${n + 1} sur ${images.length}…` : 'Bea lit l’image…');
          const prefix = answer + (images.length > 1 ? `**${image.name}**\n` : '');
          const text = await readImage({
            image: image.image,
            prompt:
              (recall ? 'Contexte de la conversation : ' + recall + '\n\n' : '') +
              (question ||
                'Décris cette image. Si elle contient du texte, des formules ou un tableau, transcris-les en LaTeX.') +
              '\nRéponds en français. Mets tout code LaTeX dans un bloc ```latex.',
            maxTokens: 900,
            onToken: (t) => setStreaming(prefix + t),
          });
          image.text = 'Lecture de l’image par Bea :\n' + text.slice(0, 3000);
          answer = prefix + text + '\n\n';
          if (stopped.current) break;
        }
      } else {
        await ensure(model);
        setPhase('');
        const { messages: prompt } = buildChatMessages({
          history,
          question,
          attachments,
          source: includeFile ? source : '',
          log,
          budget: BUDGET,
        });
        answer = await generate({ messages: prompt, maxTokens: 900, temperature: 0.4, onToken: setStreaming });
      }
    } catch (e) {
      setError(e.message);
    } finally {
      const next = [...history, user];
      if (answer.trim()) next.push({ role: 'assistant', content: answer.trim(), at: Date.now() });
      setMessages(next);
      if (!saveChat(projectId, next)) setError('Mémoire du navigateur pleine : la conversation ne sera pas gardée.');
      setStreaming('');
      setPhase('');
      setBusy(false);
    }
  }
  function reset() {
    if (!confirm('Effacer cette conversation ? Bea oubliera ces échanges.')) return;
    clearChat(projectId);
    setMessages([]);
  }

  return (
    <div
      className={'bea-chat' + (dragging ? ' dragging' : '')}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        addFiles([...e.dataTransfer.files]);
      }}
    >
      <div className="chat-bar">
        <select aria-label="Modèle IA local" value={model} disabled={busy} onChange={(e) => setModel(e.target.value)}>
          {aiModels.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        <span
          className="chat-memory"
          title="Les échanges les plus anciens sont résumés pour tenir dans la mémoire du modèle."
        >
          Mémoire : {memory.remembered} échange{memory.remembered > 1 ? 's' : ''}
          {memory.forgotten ? ` + ${memory.forgotten} résumé${memory.forgotten > 1 ? 's' : ''}` : ''}
        </span>
        <button
          className="icon"
          aria-label="Nouvelle conversation"
          title="Nouvelle conversation"
          disabled={busy || !messages.length}
          onClick={reset}
        >
          <Trash2 size={15} />
        </button>
      </div>
      <div className="chat-list" ref={listRef} aria-live="polite">
        {!messages.length && !busy && (
          <div className="chat-empty">
            <b>Discute avec Bea</b>
            <p>
              Pose une question sur ton document, demande une correction ou un tableau. Bea se souvient de la
              conversation de ce projet. Joins une image (photo de formule, de tableau, de page) ou un document (PDF,
              Word, .tex) avec le trombone, ou glisse-les ici.
            </p>
            <div className="chat-suggestions">
              {[
                'Analyse mon document et donne 4 axes d’amélioration',
                'Explique les erreurs du journal',
                'Propose un tableau LaTeX de 3 colonnes',
              ].map((s) => (
                <button key={s} onClick={() => setInput(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={'chat-msg ' + m.role}>
            {m.attachments?.length > 0 && (
              <div className="chat-chips">
                {m.attachments.map((a, j) => (
                  <Chip key={j} a={a} />
                ))}
              </div>
            )}
            {m.role === 'user' ? m.content && <p>{m.content}</p> : <Answer text={m.content} onInsert={onInsert} />}
          </div>
        ))}
        {busy && (
          <div className="chat-msg assistant">
            {streaming ? (
              <Answer text={streaming} streaming />
            ) : (
              <p className="chat-wait">{phase || 'Bea réfléchit…'}</p>
            )}
            {phase.startsWith('Chargement') && <progress max={1} value={progress} />}
          </div>
        )}
      </div>
      {error && (
        <p className="assistant-error" role="alert">
          {error}
        </p>
      )}
      <div className="chat-composer">
        {pending.length > 0 && (
          <div className="chat-chips">
            {pending.map((a, i) => (
              <Chip key={i} a={a} onRemove={() => setPending((p) => p.filter((_, j) => j !== i))} />
            ))}
          </div>
        )}
        <div className="chat-input">
          <button
            className="icon"
            aria-label="Joindre une image ou un document"
            title="Joindre une image ou un document"
            onClick={() => fileRef.current.click()}
          >
            <Paperclip size={17} />
          </button>
          <input
            ref={fileRef}
            hidden
            type="file"
            multiple
            accept={acceptedFiles}
            onChange={(e) => {
              addFiles([...e.target.files]);
              e.target.value = '';
            }}
          />
          <textarea
            aria-label="Message pour Bea"
            rows={1}
            value={input}
            placeholder="Écris à Bea…"
            title="Entrée pour envoyer, Maj+Entrée pour aller à la ligne"
            onChange={(e) => setInput(e.target.value)}
            onPaste={(e) => {
              const files = [...e.clipboardData.files];
              if (files.length) {
                e.preventDefault();
                addFiles(files);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send();
              }
            }}
          />
          {busy ? (
            <button
              className="icon"
              aria-label="Arrêter"
              onClick={() => {
                stopped.current = true;
                stopGeneration();
              }}
            >
              <Square size={15} />
            </button>
          ) : (
            <button
              className="primary chat-send"
              aria-label="Envoyer"
              disabled={!input.trim() && !pending.length}
              onClick={send}
            >
              <Send size={15} />
            </button>
          )}
        </div>
        <label className="chat-option">
          <input type="checkbox" checked={includeFile} onChange={(e) => setIncludeFile(e.target.checked)} />
          Bea voit le fichier ouvert
        </label>
      </div>
    </div>
  );
}
