import React, { useMemo, useState } from 'react';
import { GitCompare, Check, X, RotateCcw, Plus } from 'lucide-react';
import {
  findTrackedChanges,
  resolveTrackedChange,
  resolveAllTrackedChanges,
  diffHunks,
  revertDiffHunk,
} from './track-changes.js';
import { authorName } from './share.js';

export default function TrackChangesPanel({
  files,
  active,
  code,
  history = [],
  onUpdateFile,
  onMarkSelection,
  onJump,
  onClose,
}) {
  const [mode, setMode] = useState('marks');
  const [replacementText, setReplacementText] = useState('');
  const [showReplacePrompt, setShowReplacePrompt] = useState(false);

  const tracked = useMemo(() => findTrackedChanges(files), [files]);
  const activeTracked = tracked.filter((c) => c.file === active);

  const lastVersion = history.length ? history[history.length - 1] : null;
  const oldCode = lastVersion?.files?.[active] ?? '';
  const hunks = useMemo(() => (lastVersion ? diffHunks(oldCode, code) : []), [lastVersion, oldCode, code]);

  function handleDecision(change, decision) {
    const fileText = files[change.file] ?? '';
    const next = resolveTrackedChange(fileText, change, decision);
    onUpdateFile(change.file, next);
  }

  function handleAll(decision) {
    const next = resolveAllTrackedChanges(code, decision);
    onUpdateFile(active, next);
  }

  function handleRevertHunk(hunkId) {
    const next = revertDiffHunk(oldCode, code, hunkId);
    onUpdateFile(active, next);
  }

  return (
    <section className="comments-panel track-changes-panel" aria-label="Suivi des modifications">
      <div className="comments-head">
        <b>
          <GitCompare size={14} /> Révisions <span className="count">{tracked.length + hunks.length}</span>
        </b>
        <div className="track-mode-tabs">
          <button className={mode === 'marks' ? 'on' : ''} onClick={() => setMode('marks')}>
            Marques ({tracked.length})
          </button>
          <button className={mode === 'hunks' ? 'on' : ''} onClick={() => setMode('hunks')}>
            Blocs modifiés ({hunks.length})
          </button>
        </div>
        <button className="icon" aria-label="Fermer les révisions" onClick={onClose}>
          <X size={15} />
        </button>
      </div>

      {mode === 'marks' && (
        <>
          <div className="track-toolbar">
            <small>Marquer la sélection dans {active} :</small>
            <div className="track-mark-btns">
              <button type="button" onClick={() => onMarkSelection('added', '', authorName())}>
                <Plus size={13} /> Ajout (\added)
              </button>
              <button type="button" onClick={() => onMarkSelection('deleted', '', authorName())}>
                − Suppression (\deleted)
              </button>
              <button type="button" onClick={() => setShowReplacePrompt((v) => !v)}>
                ⇄ Remplacement (\replaced)
              </button>
            </div>
            {showReplacePrompt && (
              <div className="track-replace-box">
                <input
                  placeholder="Nouveau texte de remplacement…"
                  value={replacementText}
                  onChange={(e) => setReplacementText(e.target.value)}
                />
                <button
                  type="button"
                  className="primary"
                  onClick={() => {
                    onMarkSelection('replaced', replacementText, authorName());
                    setReplacementText('');
                    setShowReplacePrompt(false);
                  }}
                >
                  Marquer
                </button>
              </div>
            )}
            {activeTracked.length > 0 && (
              <div className="track-bulk">
                <button type="button" onClick={() => handleAll('accept')}>
                  <Check size={13} /> Tout accepter ({activeTracked.length})
                </button>
                <button type="button" onClick={() => handleAll('reject')}>
                  <RotateCcw size={13} /> Tout refuser
                </button>
              </div>
            )}
          </div>

          <div className="comments-list">
            {!tracked.length && (
              <p className="side-empty">
                Aucune marque <code>\added</code>, <code>\deleted</code> ou <code>\replaced</code> dans le projet.
              </p>
            )}
            {tracked.map((c) => (
              <article key={c.id} className={'comment track-item kind-' + c.kind}>
                <button className="comment-body" onClick={() => onJump(c.file, c.line, c.from, c.to)}>
                  <span className="comment-meta">
                    <b>{c.kind === 'added' ? 'Ajout' : c.kind === 'deleted' ? 'Suppression' : 'Remplacement'}</b>
                    {c.author ? ` (${c.author})` : ''} · {c.file} · ligne {c.line}
                  </span>
                  {c.deleted && <del className="track-del">{c.deleted}</del>}
                  {c.added && <ins className="track-add">{c.added}</ins>}
                </button>
                <div className="comment-actions">
                  <button
                    className="icon"
                    title="Accepter cette modification"
                    aria-label="Accepter la modification"
                    onClick={() => handleDecision(c, 'accept')}
                  >
                    <Check size={14} />
                  </button>
                  <button
                    className="icon"
                    title="Refuser (rétablir l’original)"
                    aria-label="Refuser la modification"
                    onClick={() => handleDecision(c, 'reject')}
                  >
                    <X size={14} />
                  </button>
                </div>
              </article>
            ))}
          </div>
        </>
      )}

      {mode === 'hunks' && (
        <div className="comments-list">
          {!lastVersion && (
            <p className="side-empty">
              Crée une version dans « Historique » pour comparer et réviser chaque bloc modifié depuis cet instantané.
            </p>
          )}
          {lastVersion && !hunks.length && (
            <p className="side-empty">
              Aucune différence dans {active} depuis « {lastVersion.label} ».
            </p>
          )}
          {lastVersion &&
            hunks.map((h) => (
              <article key={h.id} className="comment track-item">
                <button className="comment-body" onClick={() => onJump(active, h.newLine)}>
                  <span className="comment-meta">
                    <b>Ligne {h.newLine}</b> · par rapport à « {lastVersion.label} »
                  </span>
                  {h.removed.length > 0 && <del className="track-del">{h.removed.join('\n')}</del>}
                  {h.added.length > 0 && <ins className="track-add">{h.added.join('\n')}</ins>}
                </button>
                <div className="comment-actions">
                  <button
                    className="icon"
                    title="Rétablir ce bloc tel qu’il était dans la version précédente"
                    aria-label="Rétablir ce bloc"
                    onClick={() => handleRevertHunk(h.id)}
                  >
                    <RotateCcw size={14} />
                  </button>
                </div>
              </article>
            ))}
        </div>
      )}
    </section>
  );
}
