import React, { useEffect, useState } from 'react';
import { Eye, EyeOff, Copy, Check } from 'lucide-react';
import { AVATAR_COLORS, passwordStrength, userInitials } from './accounts.js';
import './auth.css';

export default function AuthScreen({ api, demo = false, onAuth, onGuest, onClose, onBack }) {
  const [mode, setMode] = useState('login'); // 'login' | 'register' | 'recover'
  const [showPass, setShowPass] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [savedAccounts, setSavedAccounts] = useState([]);
  const [issuedRecovery, setIssuedRecovery] = useState(null); // { recoveryKey, authResult }
  const [copiedKey, setCopiedKey] = useState(false);

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
      <span className="au-logo" aria-hidden="true">
        B
      </span>
      <span>
        TeX<b>Bea</b>
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
      </div>
    </div>
  );
}
