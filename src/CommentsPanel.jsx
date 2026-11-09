import React, { useState } from 'react';
import { MessageSquare, Check, RotateCcw, Trash2, X } from 'lucide-react';
import { authorName, setAuthorName, commentLine } from './share.js';

// Comments on the sources: written on the current line (or selection), listed by file, shown in the margin.
export default function CommentsPanel({
  comments,
  files,
  active,
  anchor,
  onAdd,
  onResolve,
  onDelete,
  canDelete = () => true,
  onJump,
  onClose,
}) {
  const [text, setText] = useState('');
  const [author, setAuthor] = useState(authorName);
  const [showResolved, setShowResolved] = useState(false);
  const shown = comments.filter((c) => showResolved || !c.resolved);
  const grouped = shown.reduce((acc, c) => ((acc[c.file] ||= []).push(c), acc), {});
  const date = (v) =>
    v ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(v)) : '';
  function submit(e) {
    e.preventDefault();
    if (!text.trim()) return;
    setAuthorName(author);
    onAdd({ text, author: author.trim() || 'Anonyme' });
    setText('');
  }
  const open = comments.filter((c) => !c.resolved).length;
  return (
    <section className="comments-panel" aria-label="Commentaires">
      <div className="comments-head">
        <b>
          <MessageSquare size={14} /> Commentaires <span className="count">{open}</span>
        </b>
        <label>
          <input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} />
          Voir les résolus
        </label>
        <button className="icon" aria-label="Fermer les commentaires" onClick={onClose}>
          <X size={15} />
        </button>
      </div>
      {onAdd && (
        <form className="comment-form" onSubmit={submit}>
          <small>
            Sur {active}, ligne {anchor.line}
            {anchor.quote ? ` : « ${anchor.quote.slice(0, 60)}${anchor.quote.length > 60 ? '…' : ''} »` : ''}
          </small>
          <textarea
            value={text}
            placeholder="Ton commentaire…"
            rows={2}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(e);
            }}
          />
          <div>
            <input
              aria-label="Ton nom"
              placeholder="Ton nom"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
            />
            <button className="primary" disabled={!text.trim()}>
              Commenter
            </button>
          </div>
        </form>
      )}
      <div className="comments-list">
        {!shown.length && <p className="side-empty">Aucun commentaire pour l’instant.</p>}
        {Object.entries(grouped).map(([file, list]) => (
          <div key={file}>
            <div className="comments-file">{file}</div>
            {list
              .map((c) => ({ ...c, at_line: files[c.file] != null ? commentLine(files[c.file], c) : c.line }))
              .sort((a, b) => a.at_line - b.at_line)
              .map((c) => (
                <article key={c.id} className={'comment' + (c.resolved ? ' resolved' : '')}>
                  <button className="comment-body" onClick={() => onJump(c.file, c.at_line)}>
                    <span className="comment-meta">
                      <b>{c.author}</b> · ligne {c.at_line} · {date(c.at)}
                    </span>
                    {c.quote && <q>{c.quote}</q>}
                    <span>{c.text}</span>
                  </button>
                  <div className="comment-actions">
                    {onResolve && (
                      <button
                        className="icon"
                        title={c.resolved ? 'Rouvrir' : 'Marquer comme résolu'}
                        aria-label={c.resolved ? 'Rouvrir' : 'Marquer comme résolu'}
                        onClick={() => onResolve(c.id, !c.resolved)}
                      >
                        {c.resolved ? <RotateCcw size={14} /> : <Check size={14} />}
                      </button>
                    )}
                    {onDelete && canDelete(c) && (
                      <button
                        className="icon"
                        title="Supprimer"
                        aria-label="Supprimer le commentaire"
                        onClick={() => onDelete(c.id)}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </article>
              ))}
          </div>
        ))}
      </div>
    </section>
  );
}
