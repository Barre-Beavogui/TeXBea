import React, { useEffect, useState } from 'react';
import {
  Eye,
  EyeOff,
  KeyRound,
  ShieldCheck,
  Sparkles,
  FileText,
  Copy,
  Check,
  UserPlus,
  LogIn,
  ArrowRight,
  GraduationCap,
} from 'lucide-react';
import { ROLES, AVATAR_COLORS, passwordStrength, userInitials } from './accounts.js';

export default function AuthScreen({ api, demo = false, onAuth, onGuest, onClose }) {
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

  if (issuedRecovery) {
    return (
      <div className="auth auth-pro">
        <div className="authbox auth-recovery-card" role="dialog" aria-label="Clé de récupération">
          <div className="recovery-badge">
            <ShieldCheck size={28} />
          </div>
          <h2>Conserve ta clé de secours</h2>
          <p>
            Cette clé personnelle te permet de réinitialiser ton mot de passe sur <b>TeXBea</b> si tu l’oublies.
            Copie-la dans un endroit sûr :
          </p>
          <div className="recovery-code-box">
            <code>{issuedRecovery.recoveryKey}</code>
            <button type="button" onClick={copyKey}>
              {copiedKey ? <Check size={15} /> : <Copy size={15} />}
              {copiedKey ? 'Copiée' : 'Copier'}
            </button>
          </div>
          <small>Tu pourras aussi en générer une nouvelle depuis les réglages de ton profil.</small>
          <button type="button" className="primary auth-submit" onClick={() => onAuth(issuedRecovery.authResult)}>
            Accéder à mon atelier <ArrowRight size={16} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="auth auth-pro">
      <div className="auth-shell">
        <aside className="auth-showcase">
          <div className="auth-brand-row">
            <div className="biglogo">
              B<span>·</span>
            </div>
            <div>
              <h1>
                TeX<em>Bea</em>
              </h1>
              <span className="domain-pill">texbea.com · Atelier scientifique</span>
            </div>
          </div>
          <p className="auth-lead">
            L’environnement LaTeX conçu pour les chercheurs, enseignants, ingénieurs et étudiants.
          </p>
          <ul className="auth-features">
            <li>
              <FileText size={17} />
              <div>
                <b>Compilation PDF &amp; Beamer</b>
                <small>Articles, thèses, présentations Beamer, biblatex et éditeur visuel de tableaux/formules.</small>
              </div>
            </li>
            <li>
              <Sparkles size={17} />
              <div>
                <b>Bea, assistante IA locale</b>
                <small>
                  Rédaction, correction d’erreurs et transcription Photo → LaTeX sans envoyer tes documents.
                </small>
              </div>
            </li>
            <li>
              <GraduationCap size={17} />
              <div>
                <b>Profil académique personnalisé</b>
                <small>
                  Pré-remplit automatiquement tes modèles (\author, établissement), commentaires et révisions.
                </small>
              </div>
            </li>
          </ul>
        </aside>

        <div className="authbox auth-card">
          {onClose && (
            <button type="button" className="auth-close-link" onClick={onClose}>
              ← Retour à l’atelier
            </button>
          )}
          <div className="auth-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'login'}
              className={mode === 'login' ? 'on' : ''}
              onClick={() => {
                setMode('login');
                setErr('');
              }}
            >
              <LogIn size={15} /> Se connecter
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'register'}
              className={mode === 'register' ? 'on' : ''}
              onClick={() => {
                setMode('register');
                setErr('');
              }}
            >
              <UserPlus size={15} /> Créer un compte
            </button>
          </div>

          {mode === 'login' && savedAccounts.length > 0 && (
            <div className="saved-accounts">
              <small>Comptes sur cet appareil :</small>
              <div className="saved-account-chips">
                {savedAccounts.map((acc) => (
                  <button
                    key={acc.id}
                    type="button"
                    className={'saved-account-chip' + (form.email === acc.email ? ' on' : '')}
                    onClick={() => setForm({ ...form, email: acc.email })}
                  >
                    <span className="chip-avatar" style={{ background: acc.avatarColor || '#1f3a60' }}>
                      {userInitials(acc)}
                    </span>
                    <span>
                      <b>{acc.name}</b>
                      <small>{acc.email}</small>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <form onSubmit={submit} className="auth-form">
            {mode === 'register' && (
              <>
                <label className="auth-field">
                  <span>Nom complet</span>
                  <input
                    required
                    placeholder="Ex : Barre Beavogui"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </label>
                <div className="auth-row-2">
                  <label className="auth-field">
                    <span>Établissement / Université</span>
                    <input
                      placeholder="Ex : Sorbonne, CNRS, École…"
                      value={form.institution}
                      onChange={(e) => setForm({ ...form, institution: e.target.value })}
                    />
                  </label>
                  <label className="auth-field">
                    <span>Rôle</span>
                    <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                      {ROLES.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="auth-color-row">
                  <span>Couleur de profil</span>
                  <div className="auth-swatches">
                    {AVATAR_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        aria-label={`Couleur ${c}`}
                        className={form.avatarColor === c ? 'on' : ''}
                        style={{ background: c }}
                        onClick={() => setForm({ ...form, avatarColor: c })}
                      />
                    ))}
                  </div>
                </div>
              </>
            )}

            <label className="auth-field">
              <span>Adresse email</span>
              <input
                type="email"
                required
                placeholder="prenom.nom@universite.fr"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </label>

            {mode !== 'recover' ? (
              <label className="auth-field">
                <span>Mot de passe</span>
                <div className="pass-input-wrap">
                  <input
                    type={showPass ? 'text' : 'password'}
                    required
                    minLength="6"
                    placeholder="6 caractères minimum"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                  />
                  <button
                    type="button"
                    className="pass-toggle"
                    aria-label={showPass ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                    onClick={() => setShowPass((v) => !v)}
                  >
                    {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </label>
            ) : (
              <>
                <label className="auth-field">
                  <span>Clé de récupération</span>
                  <input
                    required
                    placeholder="TEXBEA-XXXX-XXXX-XXXX"
                    value={form.recoveryKey}
                    onChange={(e) => setForm({ ...form, recoveryKey: e.target.value })}
                  />
                </label>
                <label className="auth-field">
                  <span>Nouveau mot de passe</span>
                  <input
                    type={showPass ? 'text' : 'password'}
                    required
                    minLength="6"
                    placeholder="Nouveau mot de passe (6 car. min.)"
                    value={form.newPassword}
                    onChange={(e) => setForm({ ...form, newPassword: e.target.value })}
                  />
                </label>
              </>
            )}

            {(mode === 'register' || mode === 'recover') && strength.score > 0 && (
              <div className={'pass-strength score-' + strength.score}>
                <div className="pass-bars">
                  <span />
                  <span />
                  <span />
                  <span />
                </div>
                <small>Robustesse : {strength.label}</small>
              </div>
            )}

            {err && <div className="error">{err}</div>}

            <button className="primary auth-submit" disabled={busy}>
              {mode === 'register'
                ? 'Créer mon espace TeXBea'
                : mode === 'recover'
                  ? 'Réinitialiser mon mot de passe'
                  : 'Se connecter'}
            </button>
          </form>

          <div className="auth-footer-links">
            {mode === 'login' && (
              <button
                type="button"
                className="link"
                onClick={() => {
                  setMode('recover');
                  setErr('');
                }}
              >
                <KeyRound size={14} /> Mot de passe oublié ? Utiliser ma clé de secours
              </button>
            )}
            {mode === 'recover' && (
              <button
                type="button"
                className="link"
                onClick={() => {
                  setMode('login');
                  setErr('');
                }}
              >
                Retour à la connexion
              </button>
            )}
            {onGuest && (
              <button type="button" className="link guest-link" onClick={onGuest}>
                Continuer en accès rapide sans compte →
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
