import React, { useState } from 'react';
import { X, User, Shield, Database, Check, Copy, KeyRound, LogOut, Trash2, Download } from 'lucide-react';
import { ROLES, AVATAR_COLORS, userInitials, passwordStrength } from './accounts.js';
import { compilers } from './compilers.js';

export default function ProfileModal({
  user,
  projects = [],
  api,
  demo = false,
  onUpdateUser,
  onBackup,
  onLogout,
  onClose,
  notify,
}) {
  const [tab, setTab] = useState('profile'); // 'profile' | 'security' | 'data'
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const [form, setForm] = useState({
    name: user?.name || '',
    email: user?.email || '',
    institution: user?.institution || '',
    department: user?.department || '',
    role: user?.role || 'student',
    orcid: user?.orcid || '',
    bio: user?.bio || '',
    avatarColor: user?.avatarColor || AVATAR_COLORS[0],
    defaultCompiler: user?.defaultCompiler || 'pdflatex',
  });

  // Password change state
  const [passForm, setPassForm] = useState({ currentPassword: '', newPassword: '' });
  const [keyPass, setKeyPass] = useState('');
  const [newKey, setNewKey] = useState('');
  const [copied, setCopied] = useState(false);
  const [deletePass, setDeletePass] = useState('');

  const strength = passwordStrength(passForm.newPassword);

  async function saveProfile(e) {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      const r = await api('/auth/profile', {
        method: 'PUT',
        body: JSON.stringify(form),
      });
      onUpdateUser(r.user);
      notify?.('Profil mis à jour');
      onClose();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function changePassword(e) {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      await api('/auth/password', {
        method: 'POST',
        body: JSON.stringify(passForm),
      });
      setPassForm({ currentPassword: '', newPassword: '' });
      notify?.('Mot de passe modifié avec succès');
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function regenerateKey(e) {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      const r = await api('/auth/recovery-key', {
        method: 'POST',
        body: JSON.stringify({ password: keyPass }),
      });
      setNewKey(r.recoveryKey);
      setKeyPass('');
      notify?.('Nouvelle clé de secours générée');
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function deleteAccount(e) {
    e.preventDefault();
    if (
      !confirm(
        'Supprimer définitivement ton compte TeXBea et tous les projets associés ? Cette action est irréversible.',
      )
    )
      return;
    setErr('');
    setBusy(true);
    try {
      await api('/auth/account', {
        method: 'DELETE',
        body: JSON.stringify({ password: deletePass }),
      });
      onLogout();
      onClose();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  const activeProjects = projects.filter((p) => !p.deleted).length;
  const trashedProjects = projects.filter((p) => p.deleted).length;
  const totalFiles = projects.reduce((n, p) => n + (p.fileCount || 0), 0);

  return (
    <div className="modalBack" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-wide profile-modal" role="dialog" aria-modal="true" aria-label="Mon compte et profil">
        <div className="modalHead">
          <div className="profile-head-ident">
            <span className="profile-avatar-lg" style={{ background: form.avatarColor }}>
              {userInitials(form)}
            </span>
            <div>
              <h2>{form.name || 'Mon profil'}</h2>
              <small>
                {form.email}
                {form.institution ? ` · ${form.institution}` : ''}
              </small>
            </div>
          </div>
          <button aria-label="Fermer" onClick={onClose}>
            <X />
          </button>
        </div>

        <div className="source-tabs" role="tablist">
          <button
            role="tab"
            aria-selected={tab === 'profile'}
            className={tab === 'profile' ? 'on' : ''}
            onClick={() => {
              setTab('profile');
              setErr('');
            }}
          >
            <User size={15} /> Profil académique
          </button>
          <button
            role="tab"
            aria-selected={tab === 'security'}
            className={tab === 'security' ? 'on' : ''}
            onClick={() => {
              setTab('security');
              setErr('');
            }}
          >
            <Shield size={15} /> Sécurité &amp; Clé de secours
          </button>
          <button
            role="tab"
            aria-selected={tab === 'data'}
            className={tab === 'data' ? 'on' : ''}
            onClick={() => {
              setTab('data');
              setErr('');
            }}
          >
            <Database size={15} /> Données &amp; Compte
          </button>
        </div>

        {err && <div className="error">{err}</div>}

        {tab === 'profile' && (
          <form className="visual-pane" onSubmit={saveProfile}>
            <div className="bib-form-grid">
              <label>
                Nom complet (\author par défaut)
                <input
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Prénom Nom"
                />
              </label>
              <label>
                Adresse email
                <input
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </label>
              <label>
                Établissement / Université / Laboratoire (\institute)
                <input
                  value={form.institution}
                  onChange={(e) => setForm({ ...form, institution: e.target.value })}
                  placeholder="Université, École, CNRS…"
                />
              </label>
              <label>
                Département / Équipe / Spécialité
                <input
                  value={form.department}
                  onChange={(e) => setForm({ ...form, department: e.target.value })}
                  placeholder="Mathématiques, Physique, Informatique…"
                />
              </label>
              <label>
                Statut / Rôle
                <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                  {ROLES.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Identifiant ORCID (optionnel)
                <input
                  value={form.orcid}
                  onChange={(e) => setForm({ ...form, orcid: e.target.value })}
                  placeholder="0000-0002-1825-0097"
                />
              </label>
              <label>
                Compilateur LaTeX préféré
                <select
                  value={form.defaultCompiler}
                  onChange={(e) => setForm({ ...form, defaultCompiler: e.target.value })}
                >
                  {compilers.map((c) => (
                    <option key={c.id} value={c.id} disabled={demo && !c.browser}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="auth-color-row">
                <span>Couleur de l’avatar</span>
                <div className="auth-swatches">
                  {AVATAR_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className={form.avatarColor === c ? 'on' : ''}
                      style={{ background: c }}
                      onClick={() => setForm({ ...form, avatarColor: c })}
                    />
                  ))}
                </div>
              </div>
              <label className="span-2">
                Biographie / Signature courte
                <input
                  value={form.bio}
                  onChange={(e) => setForm({ ...form, bio: e.target.value })}
                  placeholder="Thèmes de recherche, enseignement…"
                />
              </label>
            </div>
            <small>
              Ton nom et ton établissement remplissent automatiquement <code>\author&#123;…&#125;</code> et{' '}
              <code>\institute&#123;…&#125;</code> dans tes nouveaux documents ainsi que ta signature de commentaires et
              révisions.
            </small>
            <div className="modalActions">
              <button type="button" onClick={onClose}>
                Annuler
              </button>
              <button className="primary" disabled={busy}>
                Enregistrer mon profil
              </button>
            </div>
          </form>
        )}

        {tab === 'security' && (
          <div className="visual-pane">
            <form className="profile-section-card" onSubmit={changePassword}>
              <h3>Changer mon mot de passe</h3>
              <div className="bib-form-grid">
                <label>
                  Mot de passe actuel
                  <input
                    type="password"
                    required
                    value={passForm.currentPassword}
                    onChange={(e) => setPassForm({ ...passForm, currentPassword: e.target.value })}
                  />
                </label>
                <label>
                  Nouveau mot de passe (6 car. min.)
                  <input
                    type="password"
                    required
                    minLength="6"
                    value={passForm.newPassword}
                    onChange={(e) => setPassForm({ ...passForm, newPassword: e.target.value })}
                  />
                </label>
              </div>
              {strength.score > 0 && (
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
              <div>
                <button className="primary" disabled={busy}>
                  Mettre à jour le mot de passe
                </button>
              </div>
            </form>

            <form className="profile-section-card" onSubmit={regenerateKey}>
              <h3>
                <KeyRound size={15} /> Clé de récupération en cas d’oubli
              </h3>
              <p>
                Si tu oublies ton mot de passe, ta clé de secours permet de le réinitialiser sans perdre tes projets.
                Générer une nouvelle clé invalide la précédente.
              </p>
              <div className="bib-search-bar">
                <input
                  type="password"
                  required
                  placeholder="Confirme ton mot de passe actuel…"
                  value={keyPass}
                  onChange={(e) => setKeyPass(e.target.value)}
                />
                <button disabled={busy || !keyPass}>Générer une nouvelle clé</button>
              </div>
              {newKey && (
                <div className="recovery-code-box">
                  <code>{newKey}</code>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard?.writeText(newKey);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }}
                  >
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                    {copied ? 'Copiée' : 'Copier'}
                  </button>
                </div>
              )}
            </form>
          </div>
        )}

        {tab === 'data' && (
          <div className="visual-pane">
            <div className="profile-stats-row">
              <div className="profile-stat-box">
                <b>{activeProjects}</b>
                <span>Projets actifs</span>
              </div>
              <div className="profile-stat-box">
                <b>{trashedProjects}</b>
                <span>Dans la corbeille</span>
              </div>
              <div className="profile-stat-box">
                <b>{totalFiles}</b>
                <span>Fichiers LaTeX &amp; images</span>
              </div>
            </div>

            <div className="profile-section-card">
              <h3>Sauvegarde et session</h3>
              <div className="visual-controls">
                {onBackup && (
                  <button type="button" onClick={onBackup}>
                    <Download size={15} /> Exporter tous mes projets (.zip)
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    onLogout();
                    onClose();
                  }}
                >
                  <LogOut size={15} /> Se déconnecter de cette session
                </button>
              </div>
            </div>

            <form className="profile-section-card danger-card" onSubmit={deleteAccount}>
              <h3>
                <Trash2 size={15} /> Zone de danger : supprimer mon compte
              </h3>
              <p>
                Supprime définitivement ton profil et tes projets de cet espace. Pense à exporter une sauvegarde
                complète avant de continuer.
              </p>
              <div className="bib-search-bar">
                <input
                  type="password"
                  required
                  placeholder="Mot de passe pour confirmer la suppression…"
                  value={deletePass}
                  onChange={(e) => setDeletePass(e.target.value)}
                />
                <button className="danger-btn" disabled={busy || !deletePass}>
                  Supprimer mon compte
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
