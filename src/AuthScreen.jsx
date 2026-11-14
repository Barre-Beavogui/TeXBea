import React, { useEffect, useState } from 'react';
import LogoMark from './LogoMark.jsx';
import { Eye, EyeOff, Copy, Check } from 'lucide-react';
import { AVATAR_COLORS, passwordStrength, userInitials } from './accounts.js';
import './auth.css';

const GoogleMark = () => (
  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
    <path
      fill="#EA4335"
      d="M24 9.5c3.5 0 6.6 1.2 9.1 3.5l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z"
    />
    <path
      fill="#4285F4"
      d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.6 5.9c4.4-4.1 7-10.1 7-17.6z"
    />
    <path
      fill="#FBBC05"
      d="M10.5 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.8l7.9-6.1z"
    />
    <path
      fill="#34A853"
      d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.9 2.3-8.3 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z"
    />
  </svg>
);
const GithubMark = () => (
  <svg width="18" height="18" viewBox="0 0 16 16" aria-hidden="true" fill="currentColor">
    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
  </svg>
);

export default function AuthScreen({ api, demo = false, onAuth, onGuest, onClose, onBack }) {
  const [mode, setMode] = useState('login'); // 'login' | 'register' | 'recover'
  const [showPass, setShowPass] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [savedAccounts, setSavedAccounts] = useState([]);
  const [issuedRecovery, setIssuedRecovery] = useState(null); // { recoveryKey, authResult }
  const [copiedKey, setCopiedKey] = useState(false);
  const [providers, setProviders] = useState(null);

  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    institution: '',
    department: '',
    role: 'student',
    avatarColor: AVATAR_COLORS[0],
    recoveryKey: '',
    newPassword: '',
  });

  useEffect(() => {
    if (!demo) return;
    api('/auth/accounts')
      .then((r) => {
        const list = r?.accounts || [];
        setSavedAccounts(list);
        if (!list.length) setMode('register');
        else if (!form.email && list[0]?.email) setForm((f) => ({ ...f, email: list[0].email }));
      })
      .catch(() => {});
  }, [demo]);

  useEffect(() => {
    if (!demo) return;
    fetch('/api/auth/providers', { headers: { 'x-texbea': '1' } })
      .then((r) => (r.ok ? r.json() : null))
      .then(setProviders)
      .catch(() => {});
  }, [demo]);

  function social(name, label) {
    if (providers?.[name]) {
      window.location.href = '/api/auth/' + name + '/start';
      return;
    }
    setErr(`La connexion avec ${label} n’est pas encore activée sur ce site.`);
  }

  const strength = passwordStrength(mode === 'recover' ? form.newPassword : form.password);

  async function submit(e) {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      if (mode === 'recover') {
        const j = await api('/auth/recover', {
          method: 'POST',
          body: JSON.stringify({
            email: form.email,
            recoveryKey: form.recoveryKey,
            newPassword: form.newPassword,
          }),
        });
        localStorage.tn_token = j.token;
        localStorage.removeItem('texbea_guest');
        setIssuedRecovery({ recoveryKey: j.recoveryKey, authResult: j });
        return;
      }
      const endpoint = mode === 'register' ? '/auth/register' : '/auth/login';
      const j = await api(endpoint, {
        method: 'POST',
        body: JSON.stringify(form),
      });
      localStorage.tn_token = j.token;
      localStorage.removeItem('texbea_guest');
      if (j.recoveryKey) {
        setIssuedRecovery({ recoveryKey: j.recoveryKey, authResult: j });
      } else {
        onAuth(j);
      }
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  function copyKey() {
    if (!issuedRecovery?.recoveryKey) return;
    navigator.clipboard?.writeText(issuedRecovery.recoveryKey);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  }

  const Logo = (
    <div className="au-brand">
      <span className="au-logo">
        <LogoMark />
      </span>
      <span>
        TeX<b>bea</b>
      </span>
    </div>
  );

  if (issuedRecovery) {
    return (
      <div className="au">
        <div className="au-card" role="dialog" aria-label="Clé de récupération">
          {Logo}
          <h1>Conserve ta clé de récupération</h1>
          <p className="au-sub">Elle te permet de réinitialiser ton mot de passe. Copie-la dans un endroit sûr.</p>
          <div className="au-key">
            <code>{issuedRecovery.recoveryKey}</code>
            <button type="button" onClick={copyKey}>
              {copiedKey ? <Check size={15} /> : <Copy size={15} />}
              {copiedKey ? 'Copiée' : 'Copier'}
            </button>
          </div>
          <button type="button" className="au-submit" onClick={() => onAuth(issuedRecovery.authResult)}>
            Continuer
          </button>
        </div>
      </div>
    );
  }

  const go = (m) => {
    setMode(m);
    setErr('');
  };
  const title =
    mode === 'register' ? 'Créer un compte' : mode === 'recover' ? 'Réinitialiser le mot de passe' : 'Se connecter';

  return (
    <div className="au">
      <div className="au-card">
        {(onBack || onClose) && (
          <button type="button" className="au-back" onClick={onClose || onBack}>
            ← {onClose ? 'Retour à l’atelier' : 'Accueil'}
          </button>
        )}
        {Logo}
        <h1>{title}</h1>

        {mode !== 'recover' && (
          <>
            <div className="au-social">
              <button type="button" onClick={() => social('google', 'Google')}>
                <GoogleMark /> Continuer avec Google
              </button>
              <button type="button" onClick={() => social('github', 'GitHub')}>
                <GithubMark /> Continuer avec GitHub
              </button>
            </div>
            <div className="au-or">
              <span>ou avec ton e-mail</span>
            </div>
          </>
        )}

        {mode === 'login' && savedAccounts.length > 0 && (
          <div className="au-saved">
            {savedAccounts.map((acc) => (
              <button
                key={acc.id}
                type="button"
                className={form.email === acc.email ? 'on' : ''}
                onClick={() => setForm({ ...form, email: acc.email })}
              >
                <span className="au-avatar">{userInitials(acc)}</span>
                <span>
                  <b>{acc.name}</b>
                  <small>{acc.email}</small>
                </span>
              </button>
            ))}
          </div>
        )}

        <form onSubmit={submit}>
          {mode === 'register' && (
            <label>
              <span>Nom complet</span>
              <input
                required
                autoComplete="name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </label>
          )}
          <label>
            <span>Adresse e-mail</span>
            <input
              type="email"
              required
              autoComplete="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </label>

          {mode !== 'recover' ? (
            <label>
              <span>Mot de passe</span>
              <div className="au-pass">
                <input
                  type={showPass ? 'text' : 'password'}
                  required
                  minLength="6"
                  autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                />
                <button
                  type="button"
                  aria-label={showPass ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                  onClick={() => setShowPass((v) => !v)}
                >
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </label>
          ) : (
            <>
              <label>
                <span>Clé de récupération</span>
                <input
                  required
                  placeholder="TEXBEA-XXXX-XXXX-XXXX"
                  value={form.recoveryKey}
                  onChange={(e) => setForm({ ...form, recoveryKey: e.target.value })}
                />
              </label>
              <label>
                <span>Nouveau mot de passe</span>
                <input
                  type={showPass ? 'text' : 'password'}
                  required
                  minLength="6"
                  autoComplete="new-password"
                  value={form.newPassword}
                  onChange={(e) => setForm({ ...form, newPassword: e.target.value })}
                />
              </label>
            </>
          )}

          {(mode === 'register' || mode === 'recover') && strength.score > 0 && (
            <div className={'au-strength s' + strength.score} aria-live="polite">
              <span />
              <span />
              <span />
              <span />
              <small>{strength.label}</small>
            </div>
          )}

          {err && (
            <div className="au-error" role="alert">
              {err}
            </div>
          )}

          <button className="au-submit" disabled={busy}>
            {mode === 'register' ? 'Créer le compte' : mode === 'recover' ? 'Réinitialiser' : 'Se connecter'}
          </button>
        </form>

        <div className="au-links">
          {mode === 'login' && (
            <>
              <button type="button" onClick={() => go('recover')}>
                Mot de passe oublié
              </button>
              <button type="button" onClick={() => go('register')}>
                Créer un compte
              </button>
            </>
          )}
          {mode === 'register' && (
            <button type="button" onClick={() => go('login')}>
              J’ai déjà un compte
            </button>
          )}
          {mode === 'recover' && (
            <button type="button" onClick={() => go('login')}>
              Retour à la connexion
            </button>
          )}
        </div>
        {onGuest && (
          <button type="button" className="au-guest" onClick={onGuest}>
            Continuer sans compte
          </button>
        )}
        <p className="au-legal">
          En continuant, tu acceptes la <a href="/confidentialite">politique de confidentialité</a> et les{' '}
          <a href="/mentions-legales">mentions légales</a>.
        </p>
      </div>
    </div>
  );
}
