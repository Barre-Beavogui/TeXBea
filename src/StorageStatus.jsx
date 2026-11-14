import React, { useEffect, useRef, useState } from 'react';
import { HardDrive, ShieldCheck, ShieldAlert, Archive, ArchiveRestore, FolderSync } from 'lucide-react';
import { formatSize } from './project-tools.js';
import { LAST_BACKUP_KEY, backupReminder } from './backup.js';

// Browser space used, whether the browser promised to keep the projects, and the last full backup.
export default function StorageStatus({ projects, browser, onBackup, onRestore, auto, refreshKey }) {
  const picker = useRef(null);
  const [estimate, setEstimate] = useState(null);
  const [persisted, setPersisted] = useState(null);
  const [last, setLast] = useState(() => localStorage.getItem(LAST_BACKUP_KEY));
  const storage = globalThis.navigator?.storage;
  useEffect(() => {
    setLast(localStorage.getItem(LAST_BACKUP_KEY));
    if (!browser || !storage) return;
    storage
      .estimate?.()
      .then(setEstimate)
      .catch(() => {});
    storage
      .persisted?.()
      .then(setPersisted)
      .catch(() => {});
  }, [browser, refreshKey]);
  async function protect() {
    try {
      const ok = await storage.persist();
      setPersisted(ok);
      if (!ok)
        alert(
          'Le navigateur a refusé pour l’instant. Il accepte en général quand le site est installé, mis en favori ou visité souvent. Une sauvegarde ZIP régulière reste la meilleure protection.',
        );
    } catch {
      setPersisted(false);
    }
  }
  const reminder = backupReminder(last, projects);
  const date = (v) => new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(v));
  return (
    <section className={'storage-card' + (reminder ? ' warn' : '')} aria-label="Sauvegarde et stockage">
      <div className="resume-label">
        <HardDrive size={16} /> SAUVEGARDE
      </div>
      {browser && persisted !== null && (
        <p className={'storage-line ' + (persisted ? 'ok' : 'risk')}>
          {persisted ? <ShieldCheck size={16} /> : <ShieldAlert size={16} />}
          {persisted ? (
            <span>Projets protégés : le navigateur ne les effacera pas pour faire de la place.</span>
          ) : (
            <span>
              Non protégés : le navigateur peut les effacer s’il manque de place.{' '}
              <button className="link" onClick={protect}>
                Protéger
              </button>
            </span>
          )}
        </p>
      )}
      {browser && estimate?.usage != null && (
        <div className="storage-meter" title="Espace utilisé par TeXBea dans ce navigateur">
          <div>
            <span style={{ width: Math.min(100, (estimate.usage / (estimate.quota || 1)) * 100) + '%' }} />
          </div>
          <small>
            {formatSize(estimate.usage)} utilisés
            {estimate.quota ? ` sur ${formatSize(estimate.quota)} disponibles` : ''}
          </small>
        </div>
      )}
      <p className="storage-last">
        {last && `Dernière sauvegarde complète : ${date(last)}. `}
        {reminder ? (
          <b>{last ? 'Des projets ont changé depuis.' : reminder}</b>
        ) : (
          !last && 'Rien à sauvegarder pour l’instant.'
        )}
      </p>
      {auto && <AutoBackupLine auto={auto} date={date} />}
      <div className="storage-actions">
        <button onClick={onBackup}>
          <Archive size={15} /> Tout sauvegarder
        </button>
        <button onClick={() => picker.current?.click()}>
          <ArchiveRestore size={15} /> Restaurer
        </button>
        <input
          ref={picker}
          type="file"
          accept=".zip"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) onRestore(f);
          }}
        />
      </div>
    </section>
  );
}

// Automatic backup into a folder of the user's choice, written without anyone having to remember.
function AutoBackupLine({ auto, date }) {
  const { status, name, last, error } = auto;
  if (status === 'unsupported')
    return (
      <p className="storage-line">
        <FolderSync size={16} />
        <span>
          Sauvegarde automatique dans un dossier : disponible dans Chrome, Edge et Brave. Dans ce navigateur, « Tout
          sauvegarder » reste à lancer à la main.
        </span>
      </p>
    );
  if (status === 'off')
    return (
      <p className="storage-line risk">
        <FolderSync size={16} />
        <span>
          Sauvegarde automatique désactivée.{' '}
          <button className="link" onClick={auto.choose}>
            Choisir un dossier
          </button>
        </span>
      </p>
    );
  if (status === 'permission')
    return (
      <p className="storage-line risk">
        <ShieldAlert size={16} />
        <span>
          Sauvegarde automatique en pause : le navigateur attend un clic pour rouvrir le dossier « {name} ». Clique
          n’importe où dans la page.
        </span>
      </p>
    );
  if (status === 'error')
    return (
      <p className="storage-line risk">
        <ShieldAlert size={16} />
        <span>
          Sauvegarde automatique impossible : {error}{' '}
          <button className="link" onClick={auto.choose}>
            Choisir un autre dossier
          </button>
        </span>
      </p>
    );
  return (
    <p className="storage-line ok">
      <FolderSync size={16} />
      <span>
        Sauvegarde automatique active vers « {name} »{last ? `, dernière copie le ${date(last)}` : ''}. Sept jours de
        copies sont gardés.{' '}
        <button className="link" onClick={auto.backupNow}>
          Sauvegarder maintenant
        </button>{' '}
        <button className="link" onClick={auto.choose}>
          Changer
        </button>{' '}
        <button className="link" onClick={auto.disable}>
          Désactiver
        </button>
      </span>
    </p>
  );
}
