# TeXBea V3 — atelier LaTeX et IA locale

TeXBea V3 est un atelier LaTeX avec compilation PDF, gestion des projets et assistant IA local. La version GitHub Pages fonctionne sans compte ni clé API ; les documents sont conservés dans le navigateur. Le serveur Express reste disponible pour l’utilisation locale.

## Inclus
- Comptes locaux avec mots de passe hachés via `scrypt` (Node.js).
- Sessions serveur et espaces personnels.
- Plusieurs projets LaTeX.
- Création, édition, suppression et autosauvegarde de fichiers texte.
- Fichier principal configurable côté API.
- Compilation PDF réelle avec `latexmk` / TeX Live.
- Compilation dans un dossier temporaire, `-no-shell-escape`, délai maximal de 20 secondes.
- Aperçu du vrai PDF dans l'interface.
- Journal d'erreurs de compilation.
- Historique manuel (20 snapshots) + restauration.
- Synchronisation de modifications entre onglets/clients via WebSocket (socle temps réel).
- Téléchargement du fichier `.tex` actif.
- Interface TeXBea sombre et responsive.

## Démarrage rapide
Prérequis : Node.js 22.12+ (ou une version LTS plus récente).

```bash
npm ci
npm run dev
```

Ouvre ensuite `http://localhost:5173`. À la première utilisation, clique sur **Première visite ? Créer un compte**.

## Tests

```bash
npm test
```

Les tests (`test/`, exécutés avec `node --test`, sans dépendance supplémentaire) couvrent la validation des chemins et des projets, l’import ZIP, l’analyse LaTeX sans IA, le retour PDF → source et l’API navigateur (projets, versions, corbeille, stockage plein). Le workflow `.github/workflows/ci.yml` lance les tests et les deux builds sur chaque pull request.

## Installation sur Mac

Place-toi dans le dossier contenant `package.json` avant de lancer les commandes. Le dossier `texnova` du premier prototype est distinct de TeXBea.

Pour compiler les documents, installe MacTeX, puis vérifie dans un nouveau terminal :

```bash
latexmk -v
pdflatex --version
```

## Fichiers exclus de GitHub

Les dépendances (`node_modules/`), le build (`dist/`), les comptes et projets locaux (`server/data/`), les PDF générés (`server/pdfs/`), les fichiers `.env` et les clés privées sont exclus par `.gitignore`. Le fichier `package-lock.json` est conservé pour reproduire les dépendances.

## Activer la vraie compilation PDF
Installe une distribution TeX comprenant `latexmk` et `pdflatex`.

Ubuntu/Debian (exemple) :
```bash
sudo apt update
sudo apt install texlive-latex-base texlive-latex-recommended texlive-latex-extra latexmk
```

Puis relance `npm run dev`. Si `latexmk` n'est pas disponible, l'éditeur et la sauvegarde restent utilisables et l'interface affiche un message explicite.

## Build / lancement production local
```bash
npm run build
npm start
```
Le serveur Express sert automatiquement `dist/` si le build existe. Port par défaut : `8787` (`PORT=...` pour le changer).

## Architecture
- `src/main.jsx` : client React, éditeur, projets, historique, PDF.
- `src/style.css` : design TeXBea.
- `server/index.js` : API, authentification, stockage, compilation, WebSocket.
- `server/data/db.json` : créé automatiquement au premier compte.
- `server/pdfs/` : PDF compilés.

## Sécurité / limites avant mise en ligne publique
Le mode serveur est un **socle réellement exécutable**, mais pas encore une infrastructure SaaS durcie. Avant d'exposer le service à Internet :
1. Exécuter chaque compilation dans un conteneur/VM éphémère sans réseau avec limites CPU/RAM/PID/disque (ne pas compter uniquement sur `-no-shell-escape`).
2. Remplacer le JSON local par PostgreSQL et les sessions mémoire par un stockage persistant/Redis ou des cookies de session sécurisés.
3. Ajouter HTTPS, CSRF selon le mode de session, rate limiting, validation plus stricte, quotas et nettoyage périodique des PDF.
4. Mettre les images/assets dans un stockage objet et ajouter un upload binaire contrôlé.
5. Pour une collaboration simultanée au niveau d'Overleaf, remplacer la synchro fichier actuelle par un CRDT (ex. Yjs) avec présence/cursors et persistance.
6. Ajouter partage/invitations, rôles, commentaires, bibliographie/asset manager, export ZIP et sauvegardes.

## V3
Le code est séparé de façon à pouvoir brancher tes innovations dans de nouveaux composants/routes sans réécrire le compilateur, l'authentification ou la gestion des projets.

## Espace d’essai hébergé

Le mode `VITE_DEMO=true` conserve projets, fichiers et historique dans le navigateur et compile de vrais PDF avec pdfTeX WebAssembly (SwiftLaTeX). Il ne synchronise pas plusieurs utilisateurs. Le mode normal conserve le serveur Express avec latexmk.

Espace d’essai : https://texnova-v2-lab.guibea7.chatgpt.site (connexion au compte propriétaire requise).

Pour construire cet espace :

```bash
npm ci
npm run build:demo
npm run preview
```

Le dépôt GitHub est public. Le site d’essai reste accessible au propriétaire connecté.

## Compilation dans le navigateur

Clique sur **Compiler PDF**. Deux passes résolvent les références ; le résultat apparaît dans l’aperçu et peut être téléchargé. Le journal reste disponible, y compris en cas d’erreur. Le moteur s’exécute dans un Web Worker et s’arrête après trois minutes en cas de blocage.

Le moteur est inclus dans `public/latex/`. Les paquets et polices manquants sont téléchargés à la demande depuis `https://texlive.texlyre.org/` ; une connexion Internet et la disponibilité de ce miroir sont nécessaires. Le document est compilé localement : le miroir reçoit des noms de fichiers de paquets, pas le contenu du document. Cette version utilise pdfTeX/TeX Live 2020 ; les paquets récents, les appels système et certaines chaînes de compilation avancées peuvent nécessiter le serveur local.

Validation : document français avec Babel, TikZ, decorations.pathmorphing, arrows.meta et calc, sauvegarde avant compilation, affichage du PDF et erreur de commande LaTeX inconnue. L’exemple `examples/machine-synchrone.tex` reprend le dessin fourni.

## Navigation et petits écrans

Sur téléphone, les onglets **Code** et **PDF** donnent accès aux deux panneaux ; **Fichiers** ouvre la liste des sources. Sur ordinateur, l’éditeur et le PDF restent côte à côte. Chaque panneau défile indépendamment, horizontalement et verticalement, avec deux doigts au pavé tactile. Le pincement au-dessus du PDF ajuste son zoom ; le bouton d’ajustement restaure la largeur disponible.

Un double-clic sur le texte du PDF recherche ce fragment dans les fichiers `.tex`, ouvre le fichier correspondant, sélectionne le texte et fait défiler l’éditeur jusqu’à sa ligne. Les numéros de lignes suivent le défilement. Cette navigation utilise le texte extrait par PDF.js, pas SyncTeX : les formules, macros qui génèrent du texte et occurrences ambiguës peuvent ne pas donner une correspondance exacte. Dans ce cas l’interface indique qu’elle ne trouve pas la ligne, au lieu de prétendre avoir une position précise.

Vérifications : vue 1280 px, 1024 px, 768 px, 390 px et 320 px ; accès aux fichiers sur mobile ; code/PDF accessibles sans débordement de la page ; retour d’un titre PDF vers la ligne 111 d’un fichier secondaire ; défilement de l’éditeur et du PDF ; zoom par geste au pavé tactile.

## TeXBea

Le projet s’appelle désormais **TeXBea**. Dépôt : https://github.com/Barre-Beavogui/TeXBea.

L’accueil regroupe la liste des projets, la recherche, le tri par nom ou modification et une carte pour reprendre le dernier document. La création de projet utilise un formulaire. L’atelier place le PDF à gauche, le code au centre et les fichiers à droite, avec une palette bleu encre et cuivre. Les onglets de navigation sont conservés sur mobile.

L’adresse hébergée reste https://texnova-v2-lab.guibea7.chatgpt.site afin de préserver les projets enregistrés dans le navigateur sur cette origine. L’identifiant interne de stockage est également conservé ; les documents existants ne sont pas renommés ni réécrits.

Validation : recherche, création, reprise et navigation de projets ; compilation du dessin TikZ ; retour du PDF au source ; accueil et atelier en 320, 390, 768, 1024 et 1440 pixels.

## Coloration LaTeX

L’éditeur distingue les commandes (cuivre), commentaires (gris), formules (violet), nombres (doré), accolades et environnements (cyan). La coloration conserve exactement le source et suit le défilement dans les deux directions. Les équations entre `$`, `$$`, `\(`, `\[` et les environnements mathématiques usuels sont reconnues.

## GitHub Pages

Site public : https://barre-beavogui.github.io/TeXBea/

Chaque envoi sur `main` lance le workflow `.github/workflows/pages.yml`, construit la version navigateur et la publie sur GitHub Pages. Le moteur LaTeX et le lecteur PDF prennent en charge le sous-chemin du dépôt. Le serveur Express n’est pas exécuté par GitHub Pages ; cette version compile réellement les PDF dans le navigateur.

Les projets sont enregistrés par adresse de site. Les documents de l’ancienne adresse ne sont donc pas transférés automatiquement vers GitHub Pages ; exporte tes fichiers `.tex` depuis l’ancien site pour les conserver.

## V3 : première étape

- **Bea, assistant local** : Qwen 2.5 1,5B recommandé, 0,5B compact en option. Modèle chargé uniquement après clic. Téléchargement initial, progression, arrêt de la génération et annulation du chargement en fermant le panneau. Le document n’est pas envoyé à un service d’IA.
- **Propositions révisables** : réponse visible avant application, choix entre fin du document, sélection/curseur ou préambule pour les fragments ; remplacement explicite pour un document complet. Une version de secours est sauvegardée avant chaque application.
- **Analyse sans IA** : accolades, environnements et fichiers inclus ; accès aux lignes signalées. Analyse limitée qui ne remplace pas le compilateur.
- **Modèles** : article scientifique, rapport/mémoire et présentation Beamer.
- **Gestion** : renommer, dupliquer, corbeille, restauration et suppression définitive après confirmation.
- **Import/export ZIP** : sources `.tex`, `.bib`, `.sty`, `.cls`, `.bst`, `.txt`, `.csv`, `.md`, images PNG/JPG et PDF ; sous-dossiers et métadonnées du fichier principal. Import d’un `.tex` seul. Un dossier racine commun dans l’archive est retiré pour conserver les chemins relatifs.
- **Images et sources** : ajout depuis l’atelier, aperçu des images/PDF importés et choix du fichier principal.
- **Éditeur** : plan cliquable, recherche/remplacement ; Cmd/Ctrl+S pour sauvegarder, Cmd/Ctrl+F pour chercher, Cmd/Ctrl+Entrée pour compiler. Voir aussi « Fonctions inspirées d’Overleaf » ci-dessous.
- **Bibliographie** : troisième passe pour les projets utilisant `\bibliography{...}` et BibTeX classique. Biber/biblatex n’est pas intégré à ce moteur navigateur.

### Fonctions inspirées d’Overleaf

- **Éditeur CodeMirror 6** : coloration LaTeX, numéros de ligne, repli des environnements et des sections, accolades appariées et fermées automatiquement, plusieurs curseurs (Alt+clic), annuler/rétablir par fichier, recherche et remplacement avec expressions régulières (Ctrl/Cmd+F).
- **Suggestions automatiques** : commandes courantes avec champs à remplir, `\begin{…}` qui ajoute le `\end{…}` correspondant, `\end{` qui propose l’environnement ouvert, étiquettes après `\ref{`, clés BibTeX et `\bibitem` après `\cite{`, fichiers après `\input{` et `\includegraphics{`, paquets après `\usepackage{`, commandes définies dans le projet.
- **Barre d’outils** : titres, gras/italique (Ctrl/Cmd+B/I), formules, listes, lien, référence, citation, figure, tableau (grille jusqu’à 8 × 8), commentaire (Ctrl/Cmd+/) et palette de symboles mathématiques avec recherche.
- **Journal de compilation** : erreurs, avertissements et problèmes de mise en page regroupés, compteurs sur le bouton Journal, clic pour aller au fichier et à la ligne, marques dans la marge de l’éditeur, journal brut, « Demander à Bea » sur une erreur. Le journal s’ouvre seul si la compilation échoue.
- **Code ↔ PDF** : double-clic dans le PDF pour aller au code (existant) et bouton **Voir dans le PDF** pour aller du curseur au passage correspondant. Recherche par le texte, pas par SyncTeX : les formules ou textes générés peuvent ne pas être retrouvés.
- **Compilation** : compilation automatique après une pause (réglage), bouton Arrêter pendant une compilation dans le navigateur.
- **Projet** : arborescence avec dossiers (`chapitres/intro.tex` crée le dossier), renommer ou déplacer un fichier, recherche dans tout le projet (Ctrl/Cmd+Maj+F, casse, mot entier, regex), nombre de mots façon Overleaf (texte, titres, légendes, formules, flottants, fichiers inclus).
- **Historique** : comparaison ligne à ligne de n’importe quelle version avec l’état actuel, fichier par fichier ; une version « Avant restauration » est créée avant chaque restauration.
- **Réglages** : thème clair ou sombre de l’éditeur, taille du texte, raccourcis Vim ou Emacs (chargés à la demande), correcteur d’orthographe du navigateur (français, anglais, etc.), suggestions, fermeture automatique, retour à la ligne, liste des raccourcis.
- **Choix du compilateur** (menu « Compilateur » sous le fichier principal) : pdfLaTeX et XeLaTeX dans le navigateur (XeLaTeX passe par dvipdfmx, pour `fontspec`, `polyglossia` et les polices système de TeX Live) ; LuaLaTeX et LaTeX (DVI → PDF) avec le serveur local (latexmk `-lualatex` / `-pdfdvi`). Le choix est gardé avec le projet et dans l’export ZIP. Un commentaire `% !TEX program = xelatex` en tête du fichier principal est prioritaire, comme dans Overleaf et TeXstudio.
- **Bea dans l’éditeur** (bouton Bea de la barre d’outils, ou Ctrl/Cmd+J) : sur la sélection, ou sur le paragraphe du curseur, Bea corrige l’orthographe et la grammaire, améliore ou raccourcit la rédaction, corrige le code LaTeX, convertit du texte brut en LaTeX, traduit en anglais ou en français, continue la rédaction ou suit une consigne libre. Les changements s’affichent mot à mot avant d’être appliqués ; « Appliquer directement » les écrit sans confirmation. Chaque modification s’annule avec Ctrl/Cmd+Z. Dans le journal, **Corriger avec Bea** réécrit les lignes autour d’une erreur. Modèles locaux au choix : Qwen 2.5 1,5B, 3B, Coder 3B, 7B ou 0,5B (WebGPU, rien ne quitte l’appareil).
- **Modèles** : devoir de mathématiques, lettre et CV en plus de l’article, du rapport et de la présentation.

Pas encore disponible par rapport à Overleaf : collaboration en temps réel, partage par lien, commentaires et suivi des modifications, chat, éditeur visuel, LuaLaTeX dans le navigateur, SyncTeX exact, synchronisation Git/Dropbox et import Zotero/Mendeley.

### Conditions et limites

L’IA nécessite WebGPU, plusieurs centaines de Mo à environ un Go de téléchargement selon le modèle et environ 1–2 Go de mémoire graphique. Chrome récent sur ordinateur est recommandé. Les petits modèles peuvent proposer du code incorrect : l’utilisateur révise et compile les propositions. Si WebGPU est absent, l’analyse et tous les outils de projets restent utilisables. Le chargement des ressources utilise Hugging Face et les bibliothèques MLC ; seules les ressources des modèles sont téléchargées, pas le document. [Documentation WebLLM](https://webllm.mlc.ai/docs/user/get_started.html).

La limite actuelle est de 200 fichiers et 3 Mo de contenu source/Base64 par projet, sous réserve du quota global de stockage du navigateur. Un dépassement est signalé sans remplacer les données déjà enregistrées. Exporter régulièrement ses ZIP est recommandé. Les ZIP conservent les fichiers et le fichier principal ; l’historique reste dans le navigateur. Pas de partage public automatique des documents.

La collaboration simultanée entre utilisateurs sur Internet et les invitations ne sont pas encore déployées : elles feront l’objet d’une prochaine étape avec un serveur de synchronisation et des règles d’accès. Le ZIP fournit aujourd’hui un partage de copie utilisable. La synchronisation WebSocket du serveur local est limitée aux projets de l’utilisateur authentifié.

### Validation V3

- Conservation des données existantes, opérations de projets, snapshots, validation des chemins et erreur de quota sans perte des données précédentes.
- Import d’un ZIP avec source dans un sous-dossier et PNG, compilation réelle, puis export des mêmes fichiers.
- Recherche/remplacement, restauration de la version préalable, duplication/corbeille et vues 320/390 pixels.
- Chargement réel de Qwen 2.5 0,5B et 1,5B avec WebGPU ; réponse spécifique du modèle recommandé et compilation après application avec une version de secours.
- API serveur : modèles, images, duplication, corbeille et snapshots ; bibliographie BibTeX résolue en PDF.
