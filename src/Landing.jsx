import React, { useEffect, useState } from 'react';
import LogoMark from './LogoMark.jsx';
import {
  Bot,
  MousePointerClick,
  HardDriveDownload,
  Presentation,
  GitCompare,
  BookMarked,
  History,
  Link2,
  GraduationCap,
  FolderCheck,
  WifiOff,
  Cpu,
  Check,
  Menu,
  X,
} from 'lucide-react';
import './landing.css';

const SOURCE = [
  '\\documentclass{article}',
  '\\usepackage[french]{babel}',
  '\\title{Machine synchrone}',
  '\\begin{document}',
  '\\maketitle',
  'Loi des mailles du stator :',
  '\\[ v = R\\,i + L\\,\\frac{di}{dt} \\]',
  '\\end{document}',
];

// Colours LaTeX the way the editor does: commands, formulas, plain text.
function Line({ text }) {
  if (text.startsWith('\\[')) return <span className="lp-math">{text}</span>;
  const parts = text.split(/(\\[a-zA-Z]+)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith('\\') ? (
          <span key={i} className="lp-cmd">
            {p}
          </span>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

// The one moving thing on the page: the source is written line by line and the page appears as it is "compiled".
function Demo() {
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const [n, setN] = useState(reduced ? SOURCE.length : 0);
  const [run, setRun] = useState(0);
  useEffect(() => {
    if (reduced) return;
    const t = setInterval(() => setN((v) => (v >= SOURCE.length ? v : v + 1)), 520);
    return () => clearInterval(t);
  }, [reduced, run]);
  const replay = () => {
    if (!reduced) setN(0);
    setRun((r) => r + 1);
  };
  return (
    <div className="lp-demo" aria-label="Exemple : un fichier LaTeX et le document obtenu">
      <div className="lp-code" aria-hidden="true">
        <div className="lp-code-bar">main.tex</div>
        <ol>
          {SOURCE.map((l, i) => (
            <li key={i} className={i < n ? 'on' : ''}>
              <Line text={l} />
            </li>
          ))}
        </ol>
      </div>
      <button className="lp-replay" onClick={replay}>
        Rejouer
      </button>
      <div
        className="lp-page"
        role="img"
        aria-label="Page compilée : titre Machine synchrone et la loi des mailles du stator"
      >
        <h2 className={n > 4 ? 'on' : ''}>Machine synchrone</h2>
        <p className={n > 5 ? 'on' : ''}>Loi des mailles du stator :</p>
        <div className={'lp-eq' + (n > 6 ? ' on' : '')}>
          <i>v</i> = <i>R</i> <i>i</i> + <i>L</i>
          <span className="lp-frac">
            <span>
              <i>di</i>
            </span>
            <span>
              <i>dt</i>
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}

const PDF_LINES = ['Les pertes fer varient avec', 'le carré de la fréquence', 'et l’induction maximale.'];

// Mouse demo: pointing at a phrase of the "PDF" lights up the matching source line.
function LinkDemo() {
  const [on, setOn] = useState(1);
  return (
    <div className="lp-mock lp-link-demo" aria-label="Exemple : une phrase du PDF correspond à une ligne du code">
      <div className="lp-pdf" onMouseLeave={() => setOn(1)}>
        {PDF_LINES.map((t, i) => (
          <span
            key={t}
            className={'lp-ph' + (on === i ? ' on' : '')}
            tabIndex={0}
            onMouseEnter={() => setOn(i)}
            onFocus={() => setOn(i)}
          >
            {t}{' '}
          </span>
        ))}
        <MousePointerClick size={20} className="lp-pointer" aria-hidden="true" />
      </div>
      <div className="lp-lines">
        {PDF_LINES.map((t, i) => (
          <div key={t} className={on === i ? 'hit' : ''}>
            <em>{41 + i}</em> {t}
          </div>
        ))}
      </div>
      <small>Passe la souris sur une phrase du PDF.</small>
    </div>
  );
}

const PROOF = [
  [Cpu, 'PDF compilé chez toi', 'Le moteur LaTeX tourne dans ton navigateur, sans file d’attente.'],
  [Bot, 'Assistante IA locale', 'Bea répond sans envoyer ton texte à un serveur.'],
  [WifiOff, 'Utilisable hors connexion', 'Installe TeXBea comme une application.'],
  [FolderCheck, 'Sauvegarde automatique', 'Une copie datée dans le dossier de ton choix.'],
];

const MORE = [
  [Presentation, 'Présentations Beamer', 'Trois thèmes prêts à l’emploi et un mode Présenter en plein écran.'],
  [GitCompare, 'Modifications suivies', 'Relis un texte corrigé et accepte ou refuse chaque changement.'],
  [BookMarked, 'Import BibTeX', 'Ajoute tes références et garde une bibliographie propre.'],
  [History, 'Versions', 'Enregistre des versions de chaque projet et reviens en arrière en un clic.'],
  [Link2, 'Partage par lien', 'Envoie un lien de lecture avec commentaires, sans créer de compte pour le lecteur.'],
  [
    GraduationCap,
    'Pensé pour les études',
    'Interface en français, profil académique et modèles de rapports, devoirs et CV.',
  ],
];

export default function Landing({ onOpen, onLogin }) {
  const [menu, setMenu] = useState(false);
  const close = () => setMenu(false);
  const [active, setActive] = useState('');
  useEffect(() => {
    const ids = ['fonctions', 'et-aussi', 'confidentialite'];
    const els = ids.map((id) => document.getElementById(id)).filter(Boolean);
    if (!els.length || typeof IntersectionObserver !== 'function') return;
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && setActive(e.target.id)),
      { rootMargin: '-35% 0px -55% 0px' },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
  return (
    <div className="lp">
      <header className="lp-nav">
        <a className="lp-brand" href="#top" aria-label="TeXBea, accueil">
          <span className="lp-logo">
            <LogoMark />
          </span>
          <span>
            TeX<b>bea</b>
          </span>
        </a>
        <nav aria-label="Sections">
          {[
            ['fonctions', 'Fonctions'],
            ['et-aussi', 'Et aussi'],
            ['confidentialite', 'Confidentialité'],
          ].map(([id, label]) => (
            <a
              key={id}
              href={'#' + id}
              className={active === id ? 'on' : ''}
              aria-current={active === id ? 'true' : undefined}
            >
              {label}
            </a>
          ))}
        </nav>
        <div className="lp-nav-actions">
          <button className="lp-link" onClick={onLogin}>
            Se connecter
          </button>
          <button className="lp-btn lp-btn-primary" onClick={onOpen}>
            Ouvrir l’atelier
          </button>
          <button
            className="lp-burger"
            aria-label={menu ? 'Fermer le menu' : 'Ouvrir le menu'}
            aria-expanded={menu}
            onClick={() => setMenu((m) => !m)}
          >
            {menu ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
        {menu && (
          <div className="lp-menu">
            <a href="#fonctions" onClick={close}>
              Fonctions
            </a>
            <a href="#et-aussi" onClick={close}>
              Et aussi
            </a>
            <a href="#confidentialite" onClick={close}>
              Confidentialité
            </a>
            <button onClick={onLogin}>Se connecter</button>
            <button onClick={onOpen}>Ouvrir l’atelier</button>
          </div>
        )}
      </header>

      <main id="top">
        <section className="lp-hero">
          <div className="lp-hero-text">
            <h1>Ton atelier LaTeX tient dans ton navigateur.</h1>
            <p>
              Écris, compile et relis tes documents scientifiques sur ton ordinateur. Pas de file d’attente, pas d’envoi
              de tes fichiers, pas de compte pour commencer.
            </p>
            <div className="lp-cta">
              <button className="lp-btn lp-btn-primary lp-btn-lg" onClick={onOpen}>
                Ouvrir l’atelier
              </button>
              <a className="lp-btn lp-btn-ghost lp-btn-lg" href="#fonctions">
                Voir ce qui change
              </a>
            </div>
            <small>Rien à installer. Tes projets restent dans ton navigateur.</small>
          </div>
          <Demo />
        </section>

        <section className="lp-proof" aria-label="L’essentiel">
          <ul>
            {PROOF.map(([Icon, title, text]) => (
              <li key={title}>
                <Icon size={22} aria-hidden="true" />
                <div>
                  <b>{title}</b>
                  <span>{text}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="lp-section" id="fonctions">
          <div className="lp-feature">
            <div className="lp-feature-text">
              <h2>Bea relit, explique et corrige, sur ton appareil</h2>
              <p>
                Bea explique une erreur de compilation, reformule un paragraphe, écrit la diapositive suivante ou
                transforme un passage en diapositives. Le modèle s’exécute dans ton navigateur : ton mémoire ne part
                nulle part.
              </p>
            </div>
            <div className="lp-mock lp-chat" aria-label="Exemple de conversation avec Bea">
              <div className="lp-bubble me">Pourquoi « Undefined control sequence » ligne 12 ?</div>
              <div className="lp-bubble bea">
                <Bot size={15} aria-hidden="true" />
                <span>
                  La commande <code>\frcac</code> n’existe pas. Tu voulais écrire <code>\frac</code> ?
                </span>
              </div>
              <div className="lp-chat-foot">
                <Cpu size={14} aria-hidden="true" /> Modèle exécuté sur cet appareil
              </div>
            </div>
          </div>

          <div className="lp-feature lp-flip">
            <div className="lp-feature-text">
              <h2>Du PDF au code en un double-clic</h2>
              <p>
                Double-clique sur une phrase du PDF : l’éditeur ouvre le bon fichier et sélectionne la ligne. Les
                erreurs de compilation pointent vers leur ligne, avec une explication en français.
              </p>
            </div>
            <LinkDemo />
          </div>

          <div className="lp-feature">
            <div className="lp-feature-text">
              <h2>Tes projets restent à toi</h2>
              <p>
                Tout est conservé dans ton navigateur, avec les versions. TeXBea peut en plus écrire seule une
                sauvegarde ZIP datée dans le dossier de ton choix et garder sept jours de copies. Tu exportes tout,
                quand tu veux.
              </p>
            </div>
            <div className="lp-mock lp-backup" aria-label="Exemple d’état de la sauvegarde">
              <div className="lp-status">
                <HardDriveDownload size={18} aria-hidden="true" />
                <div>
                  <b>Sauvegarde automatique active</b>
                  <span>Dossier « Documents/TeXBea », dernière copie il y a 4 minutes.</span>
                </div>
              </div>
              <ul>
                <li>texbea-sauvegarde-14-11.zip</li>
                <li>texbea-sauvegarde-13-11.zip</li>
                <li>texbea-sauvegarde-12-11.zip</li>
              </ul>
            </div>
          </div>
        </section>

        <section className="lp-section lp-tint" id="et-aussi">
          <h2 className="lp-h2">Et tout le nécessaire pour finir un document</h2>
          <ul className="lp-grid">
            {MORE.map(([Icon, title, text]) => (
              <li key={title}>
                <Icon size={22} aria-hidden="true" />
                <h3>{title}</h3>
                <p>{text}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="lp-section lp-privacy" id="confidentialite">
          <h2 className="lp-h2">Ce que TeXBea ne fait pas</h2>
          <ul>
            {[
              'Il n’envoie pas ton document à un serveur de compilation.',
              'Il n’envoie pas ton texte à une IA distante : Bea tourne sur ton appareil.',
              'Il ne t’enferme pas : un ZIP complet, avec les versions, part quand tu le demandes.',
            ].map((t) => (
              <li key={t}>
                <Check size={18} aria-hidden="true" />
                {t}
              </li>
            ))}
          </ul>
          <p className="lp-note">
            Pour compiler, le navigateur télécharge les paquets LaTeX dont ton document a besoin. Le miroir reçoit des
            noms de paquets, jamais le contenu de ton document.
          </p>
        </section>

        <section className="lp-final">
          <h2>Ouvre ton premier document.</h2>
          <button className="lp-btn lp-btn-primary lp-btn-lg" onClick={onOpen}>
            Ouvrir l’atelier
          </button>
        </section>
      </main>

      <footer className="lp-footer">
        <div className="lp-footer-main">
          <div className="lp-footer-brand">
            <span className="lp-brand">
              <span className="lp-logo">
                <LogoMark />
              </span>
              <span>
                TeX<b>bea</b>
              </span>
            </span>
            <p>L’atelier LaTeX scientifique qui tient dans ton navigateur.</p>
          </div>
          <nav aria-label="Pied de page">
            <h3>Produit</h3>
            <a href="#fonctions">Fonctions</a>
            <a href="#et-aussi">Et aussi</a>
            <a href="#confidentialite">Confidentialité</a>
            <button onClick={onOpen}>Ouvrir l’atelier</button>
          </nav>
          <nav aria-label="Contact">
            <h3>Contact</h3>
            <a href="mailto:contact@texbea.com">contact@texbea.com</a>
            <a href="mailto:support@texbea.com">support@texbea.com</a>
            <a href="/confidentialite.html">Confidentialité</a>
            <a href="/mentions-legales.html">Mentions légales</a>
          </nav>
        </div>
        <div className="lp-footer-legal">
          <span>© 2026 TeXBea. Tous droits réservés.</span>
          <span>texbea.com</span>
        </div>
      </footer>
    </div>
  );
}
