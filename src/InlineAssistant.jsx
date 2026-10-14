import React, { useEffect, useRef, useState } from 'react';
import { Sparkles, X, Check, RotateCcw, Square, Download } from 'lucide-react';
import { buildMessages, extractCode, diffWords, fitReplacement, photoPrompt, documentBody } from './ai-actions.js';
import {
  aiModels,
  visionModels,
  isVisionModel,
  readImage,
  activateAI,
  cancelActivation,
  loadedModel,
  preferredModel,
  generate,
  stopGeneration,
} from './local-ai.js';

// Bea working directly in the editor: she rewrites the target passage, shows the changes, and applies them
// (or applies them at once with the "apply directly" setting). Every edit is undoable with Ctrl/Cmd+Z.
export default function InlineAssistant({ request, editor, autoApply, onAutoApplyChange, onClose, notify }) {
  const { action } = request;
  const vision = !!action.vision,
    models = vision ? visionModels : aiModels;
  // Photos need the vision model; text actions use the text models.
  const usable = (id) => !!id && isVisionModel(id) === vision;
  const [model, setModel] = useState(usable(loadedModel()) ? loadedModel() : vision ? models[0].id : preferredModel()),
    [ready, setReady] = useState(usable(loadedModel())),
    [loading, setLoading] = useState(false),
    [progress, setProgress] = useState(0),
    [instruction, setInstruction] = useState(request.instruction || ''),
    [asked, setAsked] = useState(action.id !== 'custom' || !!request.instruction),
    [busy, setBusy] = useState(false),
    [output, setOutput] = useState(''),
    [error, setError] = useState(''),
    [applied, setApplied] = useState(false);
  const run = useRef(0);
  const proposal = vision ? documentBody(extractCode(output)) : extractCode(output);
  const insert = action.mode !== 'replace';

  async function activate() {
    setError('');
    setLoading(true);
    try {
      await activateAI(model, (r) => setProgress(r.progress));
      setReady(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }
  async function start() {
    const id = ++run.current;
    setBusy(true);
    setError('');
    setOutput('');
    setApplied(false);
    try {
      const onToken = (t) => id === run.current && setOutput(t);
      const text = vision
        ? await readImage({ image: request.image, prompt: photoPrompt(instruction), onToken })
        : await generate({
            messages: buildMessages({
              ...request,
              instruction,
              text: insert ? request.before : request.original,
              before: insert ? '' : request.before,
            }),
            maxTokens: Math.min(1500, Math.ceil(request.original.length / 2.5) + 400),
            onToken,
          });
      if (id !== run.current) return;
      const code = vision ? documentBody(extractCode(text)) : extractCode(text);
      if (!code.trim()) setError('Bea n’a rien proposé. Réessaie ou reformule la consigne.');
      else if (!insert && code.trim() === request.original.trim())
        setError('Bea ne voit rien à changer dans ce passage.');
      else if (autoApply) apply(code);
    } catch (e) {
      if (id === run.current) setError(e.message);
    } finally {
      if (id === run.current) setBusy(false);
    }
  }
  function apply(code = proposal) {
    const text = fitReplacement(insert ? request.before : request.original, code, action.mode, request.after);
    const ok = editor.current?.replaceRange(request.from, request.to, request.original, text);
    if (!ok) {
      setError('Le passage a été modifié pendant que Bea travaillait. Relance l’action.');
      return;
    }
    setApplied(true);
    notify('Bea a modifié le document · Ctrl/Cmd+Z pour annuler');
    if (!autoApply) onClose();
  }
  useEffect(() => {
    if (ready && asked && !output && !busy && !error) start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, asked]);
  useEffect(() => () => stopGeneration(), []);
  useEffect(() => {
    const keys = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    };
    window.addEventListener('keydown', keys);
    return () => window.removeEventListener('keydown', keys);
  });
  function close() {
    run.current++;
    stopGeneration();
    if (loading) cancelActivation();
    onClose();
  }

  return (
    <section className="inline-assistant" aria-label="Bea dans l’éditeur">
      <div className="inline-head">
        <Sparkles size={15} />
        <b>Bea · {action.id === 'custom' && asked ? instruction : action.label}</b>
        {request.lines && <span className="inline-scope">{request.lines}</span>}
        <button className="inline-close" aria-label="Fermer Bea" onClick={close}>
          <X size={15} />
        </button>
      </div>
      {vision && (
        <div className="inline-photo">
          <img src={request.image} alt="Photo à transcrire" />
          {ready && !busy && !applied && (
            <input
              aria-label="Précision pour la photo"
              placeholder="Précision facultative (ex. : seulement le tableau), puis Réessayer"
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
            />
          )}
        </div>
      )}
      {!ready ? (
        <div className="inline-setup">
          <select
            aria-label="Modèle IA local"
            value={model}
            disabled={loading}
            onChange={(e) => setModel(e.target.value)}
          >
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <button className="primary" disabled={loading} onClick={activate}>
            <Download size={14} />
            {loading ? 'Chargement… ' + Math.round(progress * 100) + ' %' : 'Activer Bea (IA locale gratuite)'}
          </button>
          <small>
            {vision
              ? 'Le modèle de vision lit la photo sur ton appareil. Premier téléchargement d’environ 2,5 Go, puis gardé par le navigateur. Il faut une carte graphique récente (Mac M1 ou plus, ou 6 Go de mémoire vidéo).'
              : 'Une seule fois : le modèle est ensuite gardé par le navigateur. Rien ne quitte ton appareil.'}
          </small>
          {loading && <progress max={1} value={progress} />}
        </div>
      ) : !asked ? (
        <form
          className="inline-setup"
          onSubmit={(e) => {
            e.preventDefault();
            if (instruction.trim()) setAsked(true);
          }}
        >
          <input
            autoFocus
            aria-label="Consigne pour Bea"
            placeholder="Ex. : transforme en tableau, ajoute une équation, mets au passé…"
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
          />
          <button className="primary" disabled={!instruction.trim()}>
            Lancer
          </button>
          <label className="inline-auto">
            <input type="checkbox" checked={!!autoApply} onChange={(e) => onAutoApplyChange(e.target.checked)} />
            Appliquer directement
          </label>
        </form>
      ) : (
        <>
          <div className="inline-preview" aria-live="polite">
            {!output && busy && <p className="inline-wait">{vision ? 'Bea lit la photo…' : 'Bea lit le passage…'}</p>}
            {output &&
              (insert ? (
                <pre>
                  <ins>{proposal}</ins>
                </pre>
              ) : (
                <pre>
                  {(busy ? [{ type: 'add', text: proposal }] : diffWords(request.original.trim(), proposal)).map(
                    (part, i) =>
                      part.type === 'same' ? (
                        <span key={i}>{part.text}</span>
                      ) : part.type === 'add' ? (
                        <ins key={i}>{part.text}</ins>
                      ) : (
                        <del key={i}>{part.text}</del>
                      ),
                  )}
                </pre>
              ))}
          </div>
          <div className="inline-actions">
            {busy ? (
              <button onClick={stopGeneration}>
                <Square size={13} />
                Arrêter
              </button>
            ) : applied ? (
              <>
                <span className="inline-done">
                  <Check size={14} />
                  Appliqué
                </span>
                <button
                  onClick={() => {
                    editor.current?.undo();
                    setApplied(false);
                  }}
                >
                  Annuler
                </button>
                <button className="primary" onClick={close}>
                  OK
                </button>
              </>
            ) : (
              <>
                <button className="primary" disabled={!proposal.trim()} onClick={() => apply()}>
                  <Check size={14} />
                  {insert ? 'Insérer' : 'Appliquer'}
                </button>
                <button onClick={start}>
                  <RotateCcw size={13} />
                  Réessayer
                </button>
                <button onClick={close}>Rejeter</button>
              </>
            )}
            <label className="inline-auto">
              <input type="checkbox" checked={!!autoApply} onChange={(e) => onAutoApplyChange(e.target.checked)} />
              Appliquer directement
            </label>
          </div>
        </>
      )}
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
