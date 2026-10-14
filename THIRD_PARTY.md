# Moteur LaTeX tiers

SwiftLaTeX : https://github.com/SwiftLaTeX/SwiftLaTeX

Artefacts pdfTeX provenant de la version v20022022 :
https://github.com/SwiftLaTeX/SwiftLaTeX/releases/tag/v20022022

Fichiers inclus : `public/latex/swiftlatexpdftex.js` et `swiftlatexpdftex.wasm`.
La licence fournie par le dépôt est copiée dans `public/latex/LICENSE`. Les notices et licences spécifiques des sources amont restent applicables ; le moteur inclut du code TeX et Emscripten.

Modification locale : le miroir par défaut `https://texlive2.swiftlatex.com/` est remplacé par `https://texlive.texlyre.org/`. Le reste des artefacts de compilation est conservé tel quel. Le code source correspondant et les instructions de construction sont disponibles dans le dépôt amont au tag indiqué ; le changement local peut être reproduit par cette substitution de chaîne dans le fichier JavaScript.

Le miroir TeX Live de TeXlyre distribue les paquets à la demande. Les licences de ces paquets restent celles de leurs auteurs.

PDF.js (`pdfjs-dist`) est utilisé pour le rendu du PDF et sa couche de texte sélectionnable : https://github.com/mozilla/pdf.js ; licence Apache-2.0, fournie avec la dépendance npm.

V3 utilise WebLLM/MLC (`@mlc-ai/web-llm`, Apache-2.0) : https://github.com/mlc-ai/web-llm ; les modèles Qwen 2.5 compilés MLC sont téléchargés depuis https://huggingface.co/mlc-ai, avec les licences de leurs auteurs. JSZip est utilisé sous sa licence MIT (paquet également proposé sous GPL-3.0-or-later) : https://github.com/Stuk/jszip.
