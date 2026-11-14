import React, { useState } from 'react';
import { GitBranch, Mail, ArrowLeft, ShieldCheck } from 'lucide-react';
import { Brand } from './ProjectLibrary.jsx';

// First page when the cloud is available: sign in without any password, or carry on in this browser only.
export default function Welcome({ cloud, onSkip }) {
  const { providers, notice, error } = cloud;
  const [step, setStep] = useState('choose');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const [working, setWorking] = useState(false);
  const run = async (task) => {
    setWorking(true);
    setMessage('');
    try {
      await task();
    } catch (e) {
      setMessage(e.message);
    }
    setWorking(false);
  };
  return (
    <main className="welcome">
      <header>
        <Brand />
      </header>
      <section className="welcome-card" aria-labelledby="welcome-title">
        <h1 id="welcome-title">Se connecter à TeXBea</h1>
        <p className="welcome-lead">Sans mot de passe. Tes projets te suivent sur tous tes appareils.</p>
        {(notice || error) && (
          <p className="welcome-note" role="status">
            {notice || error}
          </p>
        )}
        {step === 'choose' && (
          <>
            {providers?.google && (
              <button className="welcome-provider" onClick={() => cloud.login('google')}>
                <span className="welcome-g" aria-hidden="true">
                  G
                </span>
                Continuer avec Google
              </button>
            )}
            {providers?.github && (
              <button className="welcome-provider" onClick={() => cloud.login('github')}>
                <GitBranch size={18} aria-hidden="true" />
                Continuer avec GitHub
              </button>
            )}
            {providers?.email && (
              <>
                {(providers.google || providers.github) && <div className="welcome-or">ou</div>}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    run(async () => {
                      await cloud.requestCode(email);
                      setStep('code');
                      setMessage('Code envoyé. Regarde ta boîte mail, et les indésirables.');
                    });
                  }}
                >
                  <label htmlFor="welcome-email">Adresse e-mail</label>
                  <input
                    id="welcome-email"
                    type="email"
                    required
                    autoComplete="email"
                    placeholder="ton@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                  <button className="welcome-primary" disabled={working}>
                    <Mail size={16} /> Recevoir un code par e-mail
                  </button>
                </form>
              </>
            )}
          </>
        )}
        {step === 'code' && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              run(() => cloud.verifyCode(email, code));
            }}
          >
            <label htmlFor="welcome-code">Code reçu à {email}</label>
            <input
              id="welcome-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              autoFocus
              maxLength={6}
              placeholder="6 chiffres"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
            <button className="welcome-primary" disabled={working}>
              Valider
            </button>
            <button type="button" className="link" onClick={() => setStep('choose')}>
              <ArrowLeft size={13} /> Changer d’adresse
            </button>
          </form>
        )}
        {message && (
          <p className="welcome-note" role="status">
            {message}
          </p>
        )}
      </section>
      <p className="welcome-skip">
        <button className="link" onClick={onSkip}>
          Continuer sans compte
        </button>
        <small>Tes projets restent alors dans ce navigateur seulement.</small>
      </p>
      <p className="welcome-privacy">
        <ShieldCheck size={14} /> TeXBea ne demande jamais de mot de passe. Les projets en ligne sont stockés chez
        TeXBea, chiffrés pendant le transfert.
      </p>
    </main>
  );
}
