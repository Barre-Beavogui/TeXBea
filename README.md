# TeXBea V2 — socle LaTeX utilisable

TeXBea V2 transforme le prototype V1 en une application full-stack locale prête à servir de base à une alternative à Overleaf. La V2 reste volontairement centrée sur le socle : tes innovations pourront être développées en V3 sans dépendre d'idées imposées ici.

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

## Installation sur Mac

Place-toi dans le dossier contenant `package.json` avant de lancer les commandes. Le dossier `texnova` du premier prototype est distinct de cette V2.

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
Cette V2 est un **socle réellement exécutable**, mais pas encore une infrastructure SaaS durcie. Avant d'exposer le service à Internet :
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
