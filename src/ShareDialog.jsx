import React, { useEffect, useState } from 'react';
import { X, Copy, Link2, UserPlus } from 'lucide-react';
import { shareLink } from './share.js';
import { formatSize } from './project-tools.js';

export function appBase() {
  return location.href.split('#')[0];
}

function Invite({ project, cloudSync, notify }) {
  const [list, setList] = useState(null),
    [email, setEmail] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const signedIn = !!cloudSync?.user;
  useEffect(() => {
    if (!signedIn) return;
    cloudSync
      .shares(project.id)
      .then(setList)
      .catch((e) => {
        setList([]);
        if (e.status !== 404) setError(e.message);
      });
  }, [signedIn, project.id]);
  async function add(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      // The invited account reads the cloud copy: push the latest changes first.
      await cloudSync.syncNow();
      const r = await cloudSync.addShare(project.id, email);
      setList(await cloudSync.shares(project.id));
      setEmail('');
      notify(r.notified ? 'Invitation envoyée' : 'Partagé : la personne le verra en se connectant');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  async function remove(addr) {
    try {
      await cloudSync.removeShare(project.id, addr);
      setList((l) => l.filter((s) => s.email !== addr));
    } catch (err) {
      setError(err.message);
    }
  }
  return (
    <section className="share-invite">
      <h3>
        <UserPlus size={16} /> Inviter un compte TeXBea
      </h3>
      {!signedIn ? (
        <p>Connecte-toi (menu Compte) pour partager avec une adresse e-mail. Le lien ci-dessous marche sans compte.</p>
      ) : (
        <>
          <p>
            La personne retrouve le projet dans « Partagé avec vous » en se connectant avec cette adresse, toujours à
            jour, en lecture seule. Tu peux retirer l’accès à tout moment.
          </p>
          <form onSubmit={add}>
            <input
              type="email"
              required
              placeholder="prenom@exemple.fr"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-label="Adresse e-mail de la personne"
            />
            <button className="primary" disabled={busy || !email}>
              {busy ? 'Envoi…' : 'Inviter'}
            </button>
          </form>
          {error && <p className="form-error">{error}</p>}
          {list?.length > 0 && (
            <ul className="share-people">
              {list.map((s) => (
                <li key={s.email}>
                  <span>{s.email}</span>
                  <button type="button" onClick={() => remove(s.email)} aria-label={'Retirer ' + s.email}>
                    Retirer
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

export default function ShareDialog({ project, onClose, notify, cloudSync }) {
  const [link, setLink] = useState(null),
    [error, setError] = useState('');
  useEffect(() => {
    shareLink(project, appBase())
      .then(setLink)
      .catch((e) => setError(e.message));
  }, [project]);
  async function copy() {
    try {
      await navigator.clipboard.writeText(link.url);
      notify('Lien copié');
    } catch {
      document.querySelector('.share-link')?.select();
      notify('Sélectionne le lien puis copie-le (Ctrl/Cmd + C)');
    }
  }
  return (
    <div className="modalBack" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal share-dialog" role="dialog" aria-label="Partager le projet">
        <div className="modalHead">
          <h2>
            <Link2 size={18} /> Partager « {project.name} »
          </h2>
          <button aria-label="Fermer" onClick={onClose}>
            <X />
          </button>
        </div>
        <Invite project={project} cloudSync={cloudSync} notify={notify} />
        <h3>
          <Link2 size={16} /> Ou partager un lien
        </h3>
        <p>
          Le lien contient une copie des sources et des commentaires, sans passer par un serveur. La personne qui
          l’ouvre peut <b>lire, compiler et commenter</b>, mais pas modifier ton projet. Elle te renvoie ses
          commentaires par un lien de retour : en l’ouvrant, ils s’ajoutent à ton projet.
        </p>
        {error && <p className="form-error">{error}</p>}
        {!link && !error && <p>Préparation du lien…</p>}
        {link && link.tooLong && (
          <p className="form-error">
            Le projet est trop gros pour un lien ({formatSize(link.length)}). Partage plutôt l’archive ZIP (menu
            Fichiers).
          </p>
        )}
        {link && !link.tooLong && (
          <>
            <textarea className="share-link" readOnly rows={3} value={link.url} onFocus={(e) => e.target.select()} />
            <div className="share-actions">
              <small>
                Lien de {formatSize(link.length)}. C’est une photo du projet : renvoie un nouveau lien après tes
                modifications.
              </small>
              <button className="primary" onClick={copy}>
                <Copy size={15} /> Copier le lien
              </button>
            </div>
          </>
        )}
        {link?.missing.length > 0 && (
          <p className="share-note">
            {link.missing.length} image{link.missing.length > 1 ? 's' : ''} trop lourde
            {link.missing.length > 1 ? 's' : ''} pour un lien : remplacée{link.missing.length > 1 ? 's' : ''} par un
            rectangle gris dans le PDF compilé par la personne. Les petites images (logos…) sont incluses.
          </p>
        )}
      </div>
    </div>
  );
}
