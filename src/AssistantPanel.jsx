import React, { useMemo, useState } from 'react';
import { Sparkles, X, CheckCircle2, Download, Square } from 'lucide-react';
import { analyzeLatex } from './latex-analysis.js';
import {
  aiModels,
  activateAI,
  cancelActivation,
  aiReady,
  askAI,
  stopGeneration,
  loadedModel,
  preferredModel,
} from './local-ai.js';
export default function AssistantPanel({ source, files, log, onClose, onJump, onInsert, initialPrompt = '' }) {
  const [tab, setTab] = useState(initialPrompt ? 'ai' : 'analysis'),
    [model, setModel] = useState(loadedModel() || preferredModel()),
    [ready, setReady] = useState(!!loadedModel()),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false),
    [progress, setProgress] = useState(0),
    [prompt, setPrompt] = useState(initialPrompt),
    [answer, setAnswer] = useState(''),
    [error, setError] = useState(''),
    [placement, setPlacement] = useState('selection');
  const issues = useMemo(() => analyzeLatex(source, files), [source, files]);
  const proposal = answer.match(/```(?:latex|tex)?\s*\n([\s\S]*?)```/i)?.[1];
  const fullDocument = !!proposal && /\\documentclass/.test(proposal) && /\\begin\{document\}/.test(proposal);
  async function load() {
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
  async function ask(text = prompt) {
    if (!text.trim()) return;
    setBusy(true);
    setError('');
    setAnswer('');
    try {
      await askAI({ prompt: text, source, log, onToken: setAnswer });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="modalBack">
      <section className="assistant-panel" role="dialog" aria-modal="true" aria-labelledby="assistant-title">
        <div className="assistant-heading">
          <div>
            <Sparkles size={20} />
            <h2 id="assistant-title">Bea · assistant LaTeX</h2>
            <span>V3</span>
          </div>
          <button
            aria-label="Fermer l’assistant"
            onClick={() => {
              stopGeneration();
              if (loading) cancelActivation();
              onClose();
            }}
          >
            <X size={20} />
          </button>
        </div>
        <div className="assistant-tabs">
          <button className={tab === 'analysis' ? 'active' : ''} onClick={() => setTab('analysis')}>
            Analyse du document
          </button>
          <button className={tab === 'ai' ? 'active' : ''} onClick={() => setTab('ai')}>
            IA locale gratuite
          </button>
        </div>
        {tab === 'analysis' ? (
          <div className="assistant-body">
            <p>
              Vérifications locales des accolades, environnements et fichiers inclus. Ce contrôle ne remplace pas la
              compilation.
            </p>
            {!issues.length ? (
              <div className="analysis-success">
                <CheckCircle2 size={20} />
                Aucune anomalie détectée par ces contrôles.
              </div>
            ) : (
              issues.map((issue, i) => (
                <button
                  className="analysis-issue"
                  key={i}
                  onClick={() => {
                    onJump(issue.line);
                    onClose();
                  }}
                >
                  <b>Ligne {issue.line}</b>
                  <span>{issue.message}</span>
                </button>
              ))
            )}
            <button className="primary" onClick={() => setTab('ai')}>
              Poser une question à Bea
            </button>
          </div>
        ) : (
          <div className="assistant-body">
            <div className="ai-setup">
              <label>
                Modèle
                <select
                  aria-label="Modèle IA local"
                  disabled={loading || busy}
                  value={model}
                  onChange={(e) => {
                    setModel(e.target.value);
                    setReady(aiReady(e.target.value));
                  }}
                >
                  {aiModels.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </label>
              <p>
                Sans clé ni frais d’API. Le premier lancement télécharge plusieurs centaines de Mo ; le modèle plus
                précis est plus lourd. Prévoir environ 1 à 2 Go de mémoire graphique et un navigateur compatible WebGPU.
                Ton texte reste sur cet appareil.
              </p>
              {!ready && (
                <button className="primary" disabled={loading} onClick={load}>
                  <Download size={16} />
                  {loading ? 'Chargement…' : 'Télécharger et activer l’IA'}
                </button>
              )}
              {loading && <progress max={1} value={progress} />}{' '}
              {ready && <span className="model-ready">Modèle prêt sur cet appareil</span>}
            </div>
            <div className="ai-shortcuts">
              {['Explique ce code LaTeX', 'Explique les erreurs du journal', 'Propose un tableau LaTeX'].map((s) => (
                <button
                  key={s}
                  disabled={!ready || busy}
                  onClick={() => {
                    setPrompt(s);
                    ask(s);
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
            <label className="ai-question">
              Ta demande
              <textarea
                aria-label="Demande à l’IA"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Explique une formule, propose un schéma TikZ, aide-moi à structurer une section…"
              />
            </label>
            <p className="ai-context">
              Le fichier actif et le journal de compilation sont inclus sous forme d’extraits. Vérifie les propositions
              avant de les appliquer.
            </p>
            <div className="ai-send">
              <button className="primary" disabled={!ready || busy || !prompt.trim()} onClick={() => ask()}>
                Demander à Bea
              </button>
              {busy && (
                <button onClick={stopGeneration}>
                  <Square size={14} />
                  Arrêter
                </button>
              )}
            </div>
            {answer && (
              <div className="ai-answer">
                <pre>{answer}</pre>
                {proposal && !busy && (
                  <>
                    {!fullDocument && (
                      <label className="proposal-placement">
                        Où insérer ?
                        <select
                          aria-label="Position d’insertion IA"
                          value={placement}
                          onChange={(e) => setPlacement(e.target.value)}
                        >
                          <option value="selection">Au curseur (remplace la sélection)</option>
                          <option value="body">À la fin du document</option>
                          <option value="preamble">Dans le préambule</option>
                        </select>
                      </label>
                    )}
                    <button
                      className="primary"
                      onClick={async () => {
                        try {
                          await onInsert(proposal, fullDocument ? 'replace' : placement);
                          onClose();
                        } catch (e) {
                          setError(e.message);
                        }
                      }}
                    >
                      {fullDocument
                        ? 'Remplacer le fichier (version de secours)'
                        : 'Insérer le code proposé (avec sauvegarde)'}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        )}
        {error && (
          <p className="assistant-error" role="alert">
            {error}
          </p>
        )}
      </section>
    </div>
  );
}
