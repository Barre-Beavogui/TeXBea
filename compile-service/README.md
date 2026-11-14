# Compilation isolée (optionnelle)

Par défaut TeXBea compile **dans le navigateur** (WASM). Ce service ajoute, pour les comptes connectés qui l'activent
(Réglages → « Compiler sur le serveur »), une compilation sur un serveur avec **tous** les moteurs
(pdfLaTeX, XeLaTeX, LuaLaTeX, LaTeX→PDF) et sans télécharger le moteur.

## Isolation

- Chaque compilation tourne dans **son propre conteneur** : `--network none`, racine en lecture seule, `--cap-drop ALL`,
  `no-new-privileges`, utilisateur 65534, 1 Go de RAM, 1 CPU, 256 processus, fichiers ≤ 128 Mo, **60 s maximum**.
- `latexmk -no-shell-escape`, `openout_any=p` : un document ne peut ni lancer de commande ni écrire hors de son dossier.
- Dossier de travail temporaire, effacé après chaque compilation. Rien n'est conservé.
- Le service n'accepte que les appels portant `COMPILE_SECRET` (24 caractères minimum). Seule la fonction
  `/api/compile` de TeXBea le connaît ; elle exige une session, limite à 40 compilations/heure/compte et 30 Mo/projet.

## Installation (un petit serveur Linux avec Docker et Node 20+)

```sh
git clone https://github.com/Barre-Beavogui/TeXBea && cd TeXBea
docker build -t texbea-tex compile-service        # image TeX Live des jobs (≈ 3 Go)
export COMPILE_SECRET=$(openssl rand -hex 32)      # à garder pour Cloudflare
PORT=8787 node compile-service/server.js
```

Ensuite, derrière HTTPS (Cloudflare Tunnel ou Caddy/nginx — ne l'expose jamais en HTTP clair), dans Cloudflare Pages
→ Settings → Variables and Secrets :

| Variable         | Valeur                                         |
| ---------------- | ---------------------------------------------- |
| `COMPILE_URL`    | l'URL publique du service, ex. `https://compile.texbea.com` |
| `COMPILE_SECRET` | le secret ci-dessus (type « Secret »)          |

Puis un redéploiement. Sans ces deux variables, l'option n'apparaît pas et tout reste dans le navigateur.

Variables du service : `PORT`, `MAX_CONCURRENT` (2), `JOB_MEMORY` (1g), `JOB_CPUS` (1), `JOB_TIMEOUT_MS` (60000),
`TEX_IMAGE` (texbea-tex), `JOBS_DIR`. Vérification : `curl localhost:8787/health`.
