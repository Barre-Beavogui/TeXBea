# TeXNova V2 — socle LaTeX utilisable

TeXNova V2 transforme le prototype V1 en une application full-stack locale prête à servir de base à une alternative à Overleaf. La V2 reste volontairement centrée sur le socle : tes innovations pourront être développées en V3 sans dépendre d'idées imposées ici.

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
- Interface TeXNova sombre et responsive.

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
- `src/style.css` : design TeXNova.
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

Le mode `VITE_DEMO=true` utilise le stockage du navigateur pour essayer projets, fichiers et historique sans compte. Il ne compile pas de PDF et ne synchronise pas les utilisateurs. Le mode normal conserve le serveur complet.
