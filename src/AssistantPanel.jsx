import React, { useMemo, useState } from 'react';
import { Sparkles, X, CheckCircle2 } from 'lucide-react';
import { analyzeLatex } from './latex-analysis.js';
import { cancelActivation, stopGeneration } from './local-ai.js';
import BeaChat from './BeaChat.jsx';
export default function AssistantPanel({
  projectId,
  source,
  files,
  log,
  onClose,
  onJump,
  onInsert,
  initialPrompt = '',
}) {
  const [tab, setTab] = useState(initialPrompt ? 'ai' : 'analysis'),
    [error, setError] = useState('');
  const issues = useMemo(() => analyzeLatex(source, files), [source, files]);
  return (
    <div className="modalBack">
      <section
        className={'assistant-panel' + (tab === 'ai' ? ' chatting' : '')}
        role="dialog"
        aria-modal="true"
        aria-labelledby="assistant-title"
      >
        <div className="assistant-heading">
          <div>
            <Sparkles size={20} />
            <h2 id="assistant-title">Bea · assistant LaTeX</h2>
          </div>
          <button
            aria-label="Fermer l’assistant"
            onClick={() => {
              stopGeneration();
              cancelActivation();
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
            Discussion avec Bea
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
              Discuter avec Bea
            </button>
          </div>
        ) : (
          <BeaChat
            projectId={projectId}
            source={source}
            log={log}
            initialPrompt={initialPrompt}
            onInsert={async (code) => {
              const whole = /\\documentclass/.test(code) && /\\begin\{document\}/.test(code);
              try {
                await onInsert(code, whole ? 'replace' : 'selection');
                onClose();
              } catch (e) {
                setError(e.message);
              }
            }}
          />
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
