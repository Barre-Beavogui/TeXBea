// Starting points offered by the « Nouveau projet » dialog. Each template builds the project's files from a few
// options (name, slide format, accent colour) so the browser and the server create exactly the same project.
import { modernTheme, institutionalTheme } from './beamer-themes.js';
const classic = {
  article: {
    name: 'Article scientifique',
    source: String.raw`\documentclass[11pt,a4paper]{article}
\usepackage[utf8]{inputenc}
\usepackage[T1]{fontenc}
\usepackage[french]{babel}
\usepackage[margin=2.5cm]{geometry}
\usepackage{amsmath,graphicx}
\title{Mon article}
\author{Votre nom}
\date{\today}
\begin{document}
\maketitle
\begin{abstract}
Présentez ici votre question et vos résultats.
\end{abstract}
\section{Introduction}
Votre texte commence ici.
\section{Méthode}
\section{Résultats}
\section{Conclusion}
\end{document}`,
  },
  report: {
    name: 'Rapport ou mémoire',
    source: String.raw`\documentclass[11pt,a4paper]{report}
\usepackage[utf8]{inputenc}
\usepackage[T1]{fontenc}
\usepackage[french]{babel}
\usepackage[margin=2.5cm]{geometry}
\usepackage{amsmath,graphicx}
\title{Mon rapport}
\author{Votre nom}
\date{\today}
\begin{document}
\maketitle
\tableofcontents
\chapter{Introduction}
Votre texte commence ici.
\chapter{Étude}
\chapter{Conclusion}
\end{document}`,
  },
  presentation: {
    name: 'Présentation Beamer',
    source: String.raw`\documentclass{beamer}
\usepackage[utf8]{inputenc}
\usepackage[T1]{fontenc}
\usepackage[french]{babel}
\title{Ma présentation}
\author{Votre nom}
\begin{document}
\begin{frame}
\titlepage
\end{frame}
\begin{frame}{Introduction}
\begin{itemize}
\item La question de recherche
\item La méthode
\item Les résultats
\end{itemize}
\end{frame}
\end{document}`,
  },
};
Object.assign(classic, {
  homework: {
    name: 'Devoir de mathématiques',
    source: String.raw`\documentclass[11pt,a4paper]{article}
\usepackage[utf8]{inputenc}
\usepackage[T1]{fontenc}
\usepackage[french]{babel}
\usepackage[margin=2.2cm]{geometry}
\usepackage{amsmath,amssymb,amsthm}
\newtheorem{exercice}{Exercice}
\theoremstyle{remark}
\newtheorem*{solution}{Solution}
\title{Devoir n\textsuperscript{o}~1}
\author{Votre nom}
\date{\today}
\begin{document}
\maketitle
\begin{exercice}
Montrer que pour tout $n \in \mathbb{N}$, $\displaystyle\sum_{k=1}^{n} k = \frac{n(n+1)}{2}$.
\end{exercice}
\begin{solution}
Par récurrence sur $n$.
\end{solution}
\end{document}`,
  },
  letter: {
    name: 'Lettre',
    source: String.raw`\documentclass[11pt,a4paper]{letter}
\usepackage[utf8]{inputenc}
\usepackage[T1]{fontenc}
\usepackage[french]{babel}
\usepackage[margin=2.5cm]{geometry}
\signature{Votre nom}
\address{Votre adresse \\ Code postal Ville}
\begin{document}
\begin{letter}{Destinataire \\ Adresse \\ Code postal Ville}
\opening{Madame, Monsieur,}
Votre texte commence ici.
\closing{Veuillez agréer mes salutations distinguées.}
\end{letter}
\end{document}`,
  },
  cv: {
    name: 'Curriculum vitæ',
    source: String.raw`\documentclass[10pt,a4paper]{article}
\usepackage[utf8]{inputenc}
\usepackage[T1]{fontenc}
\usepackage[french]{babel}
\usepackage[margin=1.8cm]{geometry}
\usepackage{xcolor,hyperref}
\pagestyle{empty}
\setlength{\parindent}{0pt}
\definecolor{accent}{HTML}{DB7544}
\newcommand{\rubrique}[1]{\vspace{10pt}{\large\bfseries\color{accent}#1}\\[-6pt]\rule{\linewidth}{0.6pt}\par}
\newcommand{\entree}[3]{\textbf{#1} \hfill #2\\ #3\par\smallskip}
\begin{document}
{\Huge\bfseries Prénom Nom}\\[4pt]
Titre du poste recherché\\
\href{mailto:vous@exemple.fr}{vous@exemple.fr} · +33 6 00 00 00 00 · Ville
\rubrique{Expérience}
\entree{Poste — Entreprise}{2024 – aujourd’hui}{Missions et résultats principaux.}
\rubrique{Formation}
\entree{Diplôme — Établissement}{2020 – 2024}{Spécialité, mention.}
\rubrique{Compétences}
LaTeX, Python, gestion de projet.
\end{document}`,
  },
});
delete classic.presentation;

export const accents = [
  { id: 'DB7544', label: 'Terre cuite' },
  { id: '1F6FEB', label: 'Bleu' },
  { id: '0F766E', label: 'Émeraude' },
  { id: '7C3AED', label: 'Violet' },
  { id: '9F1239', label: 'Bordeaux' },
  { id: '334155', label: 'Ardoise' },
];
const accentOf = (value) => (/^[0-9A-F]{6}$/i.test(value || '') ? value.toUpperCase() : accents[0].id);
const aspectOf = (value) => (value === '43' ? '43' : '169');
// Characters that would break the LaTeX source when the project name becomes the title.
const texText = (value, fallback) =>
  String(value || '')
    .trim()
    .replace(/[\\{}$&#^_%~]/g, '')
    .slice(0, 80) || fallback;

const beamerPreamble = (o, theme) => String.raw`\documentclass[aspectratio=${aspectOf(o.aspect)},11pt]{beamer}
\usepackage[utf8]{inputenc}
\usepackage[T1]{fontenc}
\usepackage{lmodern}
\usepackage[french]{babel}
\usepackage{booktabs}
% Couleur principale du thème : change le code HTML pour adapter la présentation à ta charte.
\definecolor{accent}{HTML}{${accentOf(o.accent)}}
\usetheme{${theme}}
`;

const modern = (o) => ({
  'main.tex':
    beamerPreamble(o, 'TeXBea') +
    String.raw`
\title{${texText(o.name, 'Titre de la présentation')}}
\subtitle{Un sous-titre qui précise le propos}
\author{Prénom Nom}
\institute{Organisation · Équipe}
\date{\today}

\begin{document}

\begin{frame}[plain,noframenumbering]
  \titlepage
\end{frame}

\begin{frame}{Au programme}
  \tableofcontents
\end{frame}

\section{Contexte}

\begin{frame}{Pourquoi en parler aujourd’hui ?}
  \begin{itemize}
    \item Un constat concret, formulé en une phrase
    \item Ce qui manque aujourd’hui pour y répondre
    \item<2-> \alert{La question} à laquelle répond cette présentation
  \end{itemize}
\end{frame}

\begin{frame}{Les chiffres clés}
  \begin{columns}[T]
    \begin{column}{.32\textwidth}\chiffre{87\,\%}{des utilisateurs satisfaits}\end{column}
    \begin{column}{.32\textwidth}\chiffre{× 3}{plus rapide qu’avant}\end{column}
    \begin{column}{.32\textwidth}\chiffre{12}{équipes accompagnées}\end{column}
  \end{columns}
  \vfill
  {\small\color{gris} Source : remplace ces valeurs par tes propres données.}
\end{frame}

\section{Démarche}

\begin{frame}{Une démarche en trois étapes}
  \centering
  \begin{tikzpicture}[
      etape/.style={rectangle, rounded corners=6pt, draw=accent, line width=1pt, fill=accent!8,
        minimum width=3.2cm, minimum height=1.6cm, align=center, font=\small},
      fleche/.style={-{Stealth[length=3mm]}, line width=1.2pt, accent}]
    \node[etape] (a) {\textbf{1. Observer}\\ collecter les données};
    \node[etape, right=1cm of a] (b) {\textbf{2. Analyser}\\ dégager les tendances};
    \node[etape, right=1cm of b] (c) {\textbf{3. Agir}\\ proposer des solutions};
    \draw[fleche] (a) -- (b);
    \draw[fleche] (b) -- (c);
  \end{tikzpicture}
  \vfill
  \begin{block}{Principe}
    Chaque étape produit un livrable vérifiable avant de passer à la suivante.
  \end{block}
\end{frame}

\begin{frame}{Le modèle utilisé}
  \begin{columns}[c]
    \begin{column}{.5\textwidth}
      On modélise la croissance par
      \[ N(t) = \frac{K}{1 + \left(\frac{K - N_0}{N_0}\right) e^{-rt}} \]
      où $K$ est la capacité maximale et $r$ le taux de croissance.
    \end{column}
    \begin{column}{.45\textwidth}
      \begin{tikzpicture}[scale=.9]
        \draw[->, gris] (0,0) -- (4.6,0) node[below] {$t$};
        \draw[->, gris] (0,0) -- (0,3.2) node[left] {$N$};
        \draw[dashed, gris] (0,2.6) -- (4.4,2.6) node[right] {$K$};
        \draw[accent, line width=1.5pt, domain=0:4.4, samples=60]
          plot (\x, {2.6/(1+12*exp(-1.9*\x))});
      \end{tikzpicture}
    \end{column}
  \end{columns}
\end{frame}

\section{Résultats}

\begin{frame}{Comparaison des approches}
  \begin{columns}[c]
    \begin{column}{.48\textwidth}
      \begin{tabular}{lrr}
        \toprule
        Approche & Coût & Délai \\
        \midrule
        Actuelle & 100 & 12 sem. \\
        Proposée & \alert{64} & \alert{5 sem.} \\
        \bottomrule
      \end{tabular}
    \end{column}
    \begin{column}{.48\textwidth}
      \begin{tikzpicture}
        \foreach \v/\n/\c [count=\i] in {3.0/2023/gris!50, 3.8/2024/gris!70, 5.2/2025/accent}
          \fill[\c] (\i*1.1,0) rectangle ++(.7,\v*.55) node[above, xshift=-.35cm, font=\small] {\v};
        \foreach \n [count=\i] in {2023,2024,2025}
          \node[below, font=\scriptsize, gris] at (\i*1.1+.35,0) {\n};
        \draw[gris] (.9,0) -- (4.3,0);
      \end{tikzpicture}
    \end{column}
  \end{columns}
\end{frame}

\begin{frame}{Ce qu’il faut retenir}
  \begin{enumerate}
    \item Le coût baisse d’un tiers
    \item<2-> Le délai est divisé par deux
    \item<3-> La qualité reste au même niveau
  \end{enumerate}
  \vfill
  \onslide<3->{
    \begin{alertblock}{Point de vigilance}
      Ces résultats portent sur un échantillon de 12 équipes.
    \end{alertblock}}
\end{frame}

\section{Conclusion}

\begin{frame}{Conclusion et prochaines étapes}
  \begin{columns}[T]
    \begin{column}{.48\textwidth}
      \begin{exampleblock}{Ce que l’on sait}
        \begin{itemize}
          \item La démarche fonctionne
          \item Le gain est mesurable
        \end{itemize}
      \end{exampleblock}
    \end{column}
    \begin{column}{.48\textwidth}
      \begin{block}{Ce que l’on propose}
        \begin{itemize}
          \item Étendre à 30 équipes
          \item Bilan dans six mois
        \end{itemize}
      \end{block}
    \end{column}
  \end{columns}
\end{frame}

\begin{frame}[plain,noframenumbering]
  \centering\vfill
  {\color{accent}\fontsize{36}{40}\selectfont\bfseries Merci !\par}
  \vskip.5cm
  {\large Des questions ?\par}
  \vskip.3cm
  {\small\color{gris} prenom.nom@exemple.fr\par}
  \vfill
\end{frame}

\appendix
\begin{frame}[noframenumbering]{Annexe : détail des mesures}
  Les diapositives placées après \texttt{\textbackslash appendix} ne comptent pas dans la numérotation :
  idéal pour les réponses aux questions.
\end{frame}

\end{document}
`,
  'beamerthemeTeXBea.sty': modernTheme,
});

const defense = (o) => ({
  'main.tex':
    beamerPreamble(o, 'TeXBeaPro') +
    String.raw`% Couleur des bandeaux (bleu marine par défaut).
\definecolor{marine}{HTML}{14213D}

\title{${texText(o.name, 'Titre du mémoire ou de la thèse')}}
\subtitle{Soutenance de mémoire}
\author[P. Nom]{Prénom Nom}
\institute{Université · Faculté · Laboratoire\\[2pt] Sous la direction de Pr. Directeur}
\date{\today}

\begin{document}

\begin{frame}[plain,noframenumbering]
  \titlepage
\end{frame}

\begin{frame}{Plan de la soutenance}
  \tableofcontents
\end{frame}

\section{Contexte et problématique}

\begin{frame}{Contexte}{Le cadre de l’étude}
  \begin{itemize}
    \item Le domaine et son importance
    \item Les travaux existants et leurs limites
    \item Le besoin auquel répond ce travail
  \end{itemize}
  \vfill
  \begin{block}{Problématique}
    Comment … tout en garantissant … ?
  \end{block}
\end{frame}

\begin{frame}{Objectifs}
  \begin{enumerate}
    \item Proposer un modèle de …
    \item Le valider expérimentalement sur …
    \item Comparer avec l’état de l’art
  \end{enumerate}
\end{frame}

\section{Méthodologie}

\begin{frame}{Démarche}
  \centering
  \begin{tikzpicture}[
      boite/.style={rectangle, rounded corners=4pt, fill=marine, text=white, minimum height=1.1cm,
        minimum width=2.6cm, align=center, font=\small\bfseries},
      fleche/.style={-{Stealth[length=2.6mm]}, line width=1.1pt, accent}]
    \node[boite] (d) {Données};
    \node[boite, right=.9cm of d] (m) {Modèle};
    \node[boite, right=.9cm of m] (v) {Validation};
    \node[boite, right=.9cm of v, fill=accent] (r) {Résultats};
    \draw[fleche] (d) -- (m);
    \draw[fleche] (m) -- (v);
    \draw[fleche] (v) -- (r);
  \end{tikzpicture}
  \vfill
  \begin{columns}[T]
    \begin{column}{.48\textwidth}
      \begin{exampleblock}{Données}
        200 mesures réalisées entre 2024 et 2025.
      \end{exampleblock}
    \end{column}
    \begin{column}{.48\textwidth}
      \begin{exampleblock}{Outils}
        Simulation numérique et analyse statistique.
      \end{exampleblock}
    \end{column}
  \end{columns}
\end{frame}

\begin{frame}{Modélisation}
  Le système est décrit par
  \begin{equation}
    \frac{\mathrm{d}x}{\mathrm{d}t} = -\lambda\, x(t) + u(t), \qquad x(0) = x_0
  \end{equation}
  \pause
  dont la solution s’écrit
  \begin{equation}
    x(t) = x_0\, e^{-\lambda t} + \int_0^t e^{-\lambda (t-s)}\, u(s)\, \mathrm{d}s .
  \end{equation}
\end{frame}

\section{Résultats}

\begin{frame}{Résultats expérimentaux}
  \begin{columns}[c]
    \begin{column}{.52\textwidth}
      \begin{tikzpicture}[scale=.95]
        \draw[->] (0,0) -- (5,0) node[below left] {\scriptsize temps (s)};
        \draw[->] (0,0) -- (0,3.3) node[above right] {\scriptsize réponse};
        \draw[marine, line width=1.4pt, domain=0:4.8, samples=60] plot (\x, {3*exp(-.8*\x)});
        \foreach \x/\y in {.4/2.2, 1/1.4, 1.6/.85, 2.3/.5, 3/.3, 3.8/.15}
          \fill[accent] (\x,\y) circle (2.2pt);
        \node[font=\scriptsize, marine] at (3.3,2.4) {modèle};
        \node[font=\scriptsize, accent] at (3.3,2) {mesures};
      \end{tikzpicture}
    \end{column}
    \begin{column}{.44\textwidth}
      \begin{tabular}{lc}
        \toprule
        Méthode & Erreur \\
        \midrule
        Référence & 8,4\,\% \\
        \alert{Proposée} & \alert{3,1\,\%} \\
        \bottomrule
      \end{tabular}
    \end{column}
  \end{columns}
\end{frame}

\begin{frame}{Discussion}
  \begin{alertblock}{Limites}
    Validation sur un seul jeu de données ; hypothèse de linéarité.
  \end{alertblock}
  \begin{block}{Apports}
    Erreur divisée par 2,7 par rapport à la méthode de référence.
  \end{block}
\end{frame}

\section{Conclusion}

\begin{frame}{Conclusion et perspectives}
  \begin{columns}[T]
    \begin{column}{.48\textwidth}
      \textbf{Contributions}
      \begin{itemize}
        \item Un modèle simple et validé
        \item Un gain net de précision
      \end{itemize}
    \end{column}
    \begin{column}{.48\textwidth}
      \textbf{Perspectives}
      \begin{itemize}
        \item Cas non linéaire
        \item Application industrielle
      \end{itemize}
    \end{column}
  \end{columns}
\end{frame}

\begin{frame}[plain,noframenumbering]
  \begin{tikzpicture}[remember picture,overlay]
    \fill[marine] (current page.south west) rectangle (current page.north east);
  \end{tikzpicture}
  \centering\vfill
  {\color{white}\fontsize{30}{36}\selectfont\bfseries Merci de votre attention\par}
  \vskip.4cm
  {\color{accent}\large Questions et échanges\par}
  \vfill
\end{frame}

\appendix
\begin{frame}[noframenumbering]{Annexe : données complémentaires}
  Ajoute ici les diapositives de réserve pour répondre aux questions du jury.
\end{frame}

\end{document}
`,
  'beamerthemeTeXBeaPro.sty': institutionalTheme,
});

const simple = (o) => ({
  'main.tex': String.raw`\documentclass[aspectratio=${aspectOf(o.aspect)},11pt]{beamer}
\usepackage[utf8]{inputenc}
\usepackage[T1]{fontenc}
\usepackage{lmodern}
\usepackage[french]{babel}
\usetheme{Madrid}
\definecolor{accent}{HTML}{${accentOf(o.accent)}}
\usecolortheme[named=accent]{structure}
\setbeamertemplate{navigation symbols}{}

\title{${texText(o.name, 'Ma présentation')}}
\author{Votre nom}
\institute{Établissement}
\date{\today}

\begin{document}
\begin{frame}
  \titlepage
\end{frame}

\begin{frame}{Plan}
  \tableofcontents
\end{frame}

\section{Introduction}
\begin{frame}{Introduction}
  \begin{itemize}
    \item La question
    \item<2-> La méthode
    \item<3-> Les résultats
  \end{itemize}
\end{frame}

\section{Développement}
\begin{frame}{Un résultat}
  \begin{block}{Théorème}
    Pour tout $n \geq 1$, $\displaystyle\sum_{k=1}^{n} k = \frac{n(n+1)}{2}$.
  \end{block}
\end{frame}

\section{Conclusion}
\begin{frame}{Conclusion}
  Merci de votre attention !
\end{frame}
\end{document}
`,
});

const blank = (o) => ({
  'main.tex': String.raw`\documentclass[11pt,a4paper]{article}
\usepackage[utf8]{inputenc}
\usepackage[T1]{fontenc}
\usepackage{lmodern}
\usepackage[french]{babel}

\title{${texText(o.name, 'Sans titre')}}
\author{}
\date{}

\begin{document}

Commence à écrire ici.

\end{document}
`,
});

const fromSource = (source) => () => ({ 'main.tex': source });
// `group` places the template in the dialog; `beamer` turns on the slide format and colour options.
export const templateGroups = [
  { id: 'documents', label: 'Documents' },
  { id: 'presentations', label: 'Présentations' },
];
export const templates = {
  blank: {
    name: 'Projet vide',
    description: 'Une page blanche, juste le préambule.',
    group: 'documents',
    build: blank,
  },
  article: { ...classic.article, description: 'Résumé, sections et équations.', group: 'documents' },
  report: { ...classic.report, description: 'Chapitres et table des matières.', group: 'documents' },
  homework: { ...classic.homework, description: 'Exercices et solutions.', group: 'documents' },
  letter: { ...classic.letter, description: 'Lettre formelle en français.', group: 'documents' },
  cv: { ...classic.cv, description: 'Une page, sobre et lisible.', group: 'documents' },
  'beamer-modern': {
    name: 'Présentation moderne',
    description: 'Épurée, barre de progression, chiffres clés, schémas TikZ.',
    group: 'presentations',
    beamer: true,
    build: modern,
  },
  'beamer-defense': {
    name: 'Soutenance',
    description: 'Mémoire ou thèse : bandeaux, plan, résultats, annexes.',
    group: 'presentations',
    beamer: true,
    build: defense,
  },
  presentation: {
    name: 'Beamer classique',
    description: 'Thème Madrid aux couleurs de ton choix.',
    group: 'presentations',
    beamer: true,
    build: simple,
  },
};
for (const t of Object.values(templates)) {
  t.build ||= fromSource(t.source);
  // The main file with the default options, for previews and older callers.
  Object.defineProperty(t, 'source', { get: () => t.build({})['main.tex'], enumerable: false });
}

// Project data (before validation) for a template id and the dialog's options.
export function templateProject(id, options = {}) {
  const template = templates[id] || templates.article;
  return { name: options.name, main: 'main.tex', files: template.build(options) };
}
