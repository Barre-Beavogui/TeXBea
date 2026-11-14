import React, { useEffect, useRef, useState } from 'react';
import {
  HardDrive,
  ShieldCheck,
  ShieldAlert,
  Archive,
  ArchiveRestore,
  FolderSync,
  Cloud,
  Mail,
  Sparkles,
} from 'lucide-react';
import { formatSize } from './project-tools.js';
import { LAST_BACKUP_KEY, backupReminder } from './backup.js';
import PlansModal from './PlansModal.jsx';

// One line of the backup card: what it is, where it stands, what can be done about it.
function Row({ icon, tone = '', title, children, actions }) {
  return (
    <div className={'storage-row ' + tone}>
      <span className="storage-ico">{icon}</span>
      <div className="storage-body">
        <b>{title}</b>
        <div className="storage-text">{children}</div>
        {actions && <div className="storage-row-actions">{actions}</div>}
      </div>
    </div>
  );
}
const Mini = (props) => <button type="button" className="storage-mini" {...props} />;

// Where the projects are kept: online copy, folder on the computer, ZIP file, and the browser's own storage.
export default function StorageStatus({ projects, browser, onBackup, onRestore, auto, cloud, refreshKey }) {
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
    // Ask quietly: browsers grant it by themselves once the site is used often, installed or bookmarked.
    storage
      .persisted?.()
      .then(async (yes) => {
        if (!yes) yes = await storage.persist?.().catch(() => false);
        setPersisted(!!yes);
      })
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
  const cloudOk = !!cloud?.user && cloud.status !== 'error';
  const folderOk = auto?.status === 'on';
  const zipOk = !!last && !reminder;
  const safe = cloudOk || folderOk || zipOk || persisted;
  const level = cloudOk || folderOk || zipOk ? 'ok' : persisted ? '' : 'risk';
  const summary = cloudOk
    ? 'Tes projets sont copiés en ligne.'
    : folderOk
      ? 'Tes projets sont copiés dans ton dossier.'
      : zipOk
        ? 'Ta sauvegarde ZIP est à jour.'
        : projects.some((p) => !p.deleted)
          ? 'Tes projets ne sont que dans ce navigateur : active une copie ci-dessous.'
          : 'Rien à sauvegarder pour l’instant.';
  return (
    <section
      className={'storage-card' + (level === 'risk' && reminder ? ' warn' : '')}
      aria-label="Sauvegarde et stockage"
    >
      <div className="resume-label">
        <HardDrive size={16} /> SAUVEGARDE
      </div>
      <p className={'storage-summary ' + level}>
        {safe && level !== 'risk' ? <ShieldCheck size={17} /> : <ShieldAlert size={17} />}
        <span>{summary}</span>
      </p>
      {cloud && <CloudRow cloud={cloud} date={date} />}
      {auto && <AutoBackupRow auto={auto} date={date} />}
      <Row
        icon={<Archive size={16} />}
        tone={zipOk ? 'ok' : reminder ? 'risk' : ''}
        title="Fichier ZIP"
        actions={
          <>
            <Mini onClick={onBackup}>
              <Archive size={14} /> Tout sauvegarder
            </Mini>
            <Mini onClick={() => picker.current?.click()}>
              <ArchiveRestore size={14} /> Restaurer
            </Mini>
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
          </>
        }
      >
        {last ? `Dernière sauvegarde le ${date(last)}. ` : ''}
        {reminder
          ? last
            ? 'Des projets ont changé depuis.'
            : reminder
          : !last
            ? 'Rien à sauvegarder pour l’instant.'
            : ''}
      </Row>
      {browser && (persisted !== null || estimate?.usage != null) && (
        <details className="storage-browser">
          <summary>Espace du navigateur</summary>
          {persisted !== null && (
            <p className={'storage-line ' + (persisted ? 'ok' : '')}>
              {persisted ? <ShieldCheck size={16} /> : <ShieldAlert size={16} />}
              {persisted ? (
                <span>Protégé : le navigateur n’effacera pas les projets pour faire de la place.</span>
              ) : (
                <span>
                  Non protégé : le navigateur peut effacer les projets s’il manque de place.{' '}
                  <button className="link" onClick={protect}>
                    Protéger
                  </button>
                </span>
              )}
            </p>
          )}
          {estimate?.usage != null && (
            <div
              className="storage-meter"
              title="Espace utilisé par TeXBea dans ce navigateur (projets, moteur LaTeX, cache)"
            >
              <div>
                <span style={{ width: Math.min(100, (estimate.usage / (estimate.quota || 1)) * 100) + '%' }} />
              </div>
              <small>
                {formatSize(estimate.usage)} utilisés (projets, moteur LaTeX et cache)
                {estimate.quota ? ` sur ${formatSize(estimate.quota)} disponibles` : ''}
              </small>
            </div>
          )}
        </details>
      )}
    </section>
  );
}

// Automatic backup into a folder of the user's choice, written without anyone having to remember.
function AutoBackupRow({ auto, date }) {
  const { status, name, last, error } = auto;
  const title = 'Dossier sur ton ordinateur';
  if (status === 'unsupported')
    return (
      <Row icon={<FolderSync size={16} />} title={title}>
        Copie automatique dans un dossier : disponible dans Chrome, Edge et Brave.
      </Row>
    );
  if (status === 'off')
    return (
      <Row
        icon={<FolderSync size={16} />}
        title={title}
        actions={<Mini onClick={auto.choose}>Choisir un dossier</Mini>}
      >
        Facultatif : une copie est écrite toute seule dans le dossier de ton choix, avec sept jours d’historique.
      </Row>
    );
  if (status === 'permission')
    return (
      <Row icon={<ShieldAlert size={16} />} tone="risk" title={title}>
        En pause : le navigateur attend un clic pour rouvrir le dossier « {name} ». Clique n’importe où dans la page.
      </Row>
    );
  if (status === 'error')
    return (
      <Row
        icon={<ShieldAlert size={16} />}
        tone="risk"
        title={title}
        actions={<Mini onClick={auto.choose}>Choisir un autre dossier</Mini>}
      >
        Copie impossible : {error}
      </Row>
    );
  return (
    <Row
      icon={<FolderSync size={16} />}
      tone="ok"
      title={title}
      actions={
        <>
          <Mini onClick={auto.backupNow}>Sauvegarder maintenant</Mini>
          <Mini onClick={auto.choose}>Changer</Mini>
          <Mini onClick={auto.disable}>Désactiver</Mini>
        </>
      }
    >
      Copie automatique vers « {name} »{last ? `, dernière le ${date(last)}` : ''}. Sept jours de copies sont gardés.
    </Row>
  );
}

// Online copy: signed out → three ways to sign in, none with a password; signed in → state of the synchronisation.
function CloudRow({ cloud, date }) {
  const [step, setStep] = useState('');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const [working, setWorking] = useState(false);
  const [plansOpen, setPlansOpen] = useState(false);
  const { status, providers, user, error, last, usage, billing, notice } = cloud;
  if (status === 'unavailable' || (status === 'loading' && !notice)) return null;
  const sub = billing?.subscription || { plan: usage?.plan || 'free', planName: usage?.planName || 'Gratuit' };
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
  if (!user)
    return (
      <Row
        icon={<Cloud size={16} />}
        title="Copie en ligne"
        actions={
          <Mini onClick={() => setPlansOpen(true)}>
            <Sparkles size={13} /> Voir les offres (200 Mo à 10 Go)
          </Mini>
        }
      >
        Connecte-toi, sans mot de passe, pour retrouver tes projets sur tous tes appareils. Ils restent aussi dans ce
        navigateur.
        {(notice || error) && <em> {notice || error}</em>}
        <span className="storage-body-extra">
          <span className="cloud-login">
            {providers?.google && <button onClick={() => cloud.login('google')}>Continuer avec Google</button>}
            {providers?.github && <button onClick={() => cloud.login('github')}>Continuer avec GitHub</button>}
            {providers?.email && !step && (
              <button onClick={() => setStep('email')}>
                <Mail size={14} /> Recevoir un code par e-mail
              </button>
            )}
          </span>
          {step === 'email' && (
            <form
              className="cloud-login"
              onSubmit={(e) => {
                e.preventDefault();
                run(async () => {
                  await cloud.requestCode(email);
                  setStep('code');
                  setMessage('Code envoyé : regarde ta boîte mail (et les indésirables).');
                });
              }}
            >
              <input
                type="email"
                required
                autoFocus
                placeholder="ton@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <button disabled={working}>Envoyer le code</button>
            </form>
          )}
          {step === 'code' && (
            <form
              className="cloud-login"
              onSubmit={(e) => {
                e.preventDefault();
                run(() => cloud.verifyCode(email, code));
              }}
            >
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                autoFocus
                maxLength={6}
                placeholder="Code à 6 chiffres"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
              <button disabled={working}>Valider</button>
            </form>
          )}
          {message && <em> {message}</em>}
          {plansOpen && <PlansModal cloud={cloud} onClose={() => setPlansOpen(false)} />}
        </span>
      </Row>
    );
  return (
    <>
      <Row
        icon={<Cloud size={16} />}
        tone={status === 'error' ? 'risk' : 'ok'}
        title={`Copie en ligne · Offre ${sub.planName || 'Gratuit'}`}
        actions={
          <>
            <Mini onClick={() => setPlansOpen(true)}>
              <Sparkles size={13} /> {sub.plan === 'free' ? 'Passer à Standard / Pro' : 'Offres & abonnement'}
            </Mini>
            <Mini onClick={cloud.syncNow} disabled={status === 'syncing'}>
              Synchroniser
            </Mini>
            <Mini onClick={cloud.logout}>Se déconnecter</Mini>
            <Mini
              onClick={() => {
                if (
                  confirm(
                    'Supprimer ton compte et toutes les copies en ligne ? Tes projets restent dans ce navigateur.',
                  )
                )
                  cloud.deleteAccount().catch((e) => alert(e.message));
              }}
            >
              Supprimer mon compte
            </Mini>
          </>
        }
      >
        Active pour {user.email}.{' '}
        {status === 'syncing'
          ? 'Synchronisation…'
          : status === 'error'
            ? error
            : last
              ? `Synchronisé le ${date(last)}.`
              : ''}
        {usage ? ` ${formatSize(usage.bytes)} sur ${formatSize(usage.quota)}.` : ''} Les projets sont stockés chez
        TeXBea (chiffrés pendant le transfert, pas de bout en bout).
      </Row>
      {plansOpen && <PlansModal cloud={cloud} onClose={() => setPlansOpen(false)} />}
    </>
  );
}
