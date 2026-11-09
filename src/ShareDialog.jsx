import React, { useEffect, useState } from 'react';
import { X, Copy, Link2 } from 'lucide-react';
import { shareLink } from './share.js';
import { formatSize } from './project-tools.js';

export function appBase() {
  return location.href.split('#')[0];
}

export default function ShareDialog({ project, onClose, notify }) {
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
