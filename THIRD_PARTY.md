# Moteur LaTeX tiers

SwiftLaTeX : https://github.com/SwiftLaTeX/SwiftLaTeX

Artefacts pdfTeX provenant de la version v20022022 :
https://github.com/SwiftLaTeX/SwiftLaTeX/releases/tag/v20022022

Fichiers inclus : `public/latex/swiftlatexpdftex.js` et `swiftlatexpdftex.wasm`.
La licence fournie par le dépôt est copiée dans `public/latex/LICENSE`. Les notices et licences spécifiques des sources amont restent applicables ; le moteur inclut du code TeX et Emscripten.

Modification locale : le miroir par défaut `https://texlive2.swiftlatex.com/` est remplacé par `https://texlive.texlyre.org/`. Le reste des artefacts de compilation est conservé tel quel. Le code source correspondant et les instructions de construction sont disponibles dans le dépôt amont au tag indiqué ; le changement local peut être reproduit par cette substitution de chaîne dans le fichier JavaScript.

Le miroir TeX Live de TeXlyre distribue les paquets à la demande. Les licences de ces paquets restent celles de leurs auteurs.
