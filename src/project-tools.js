export const templates = {
  article:{name:'Article scientifique',source:String.raw`\documentclass[11pt,a4paper]{article}
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
\end{document}`},
  report:{name:'Rapport ou mémoire',source:String.raw`\documentclass[11pt,a4paper]{report}
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
\end{document}`},
  presentation:{name:'Présentation Beamer',source:String.raw`\documentclass{beamer}
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
\end{document}`}
};
export function safePath(name){return typeof name==='string'&&name.length<=180&&/^[\p{L}\p{N}_.\- /]+$/u.test(name)&&name.split('/').every(p=>p&&p!=='.'&&p!=='..'&&!p.startsWith('.')&&!['__proto__','constructor','prototype'].includes(p));}
export function validateProject(input){
  if(!input||typeof input!=='object'||!input.files||Array.isArray(input.files))throw Error('Projet invalide.');
  let size=0;const files={},assets={};
  for(const [name,content] of Object.entries(input.files)){if(!safePath(name)||typeof content!=='string')throw Error('Fichier source invalide : '+name);size+=content.length;files[name]=content;}
  for(const [name,content] of Object.entries(input.assets||{})){if(!safePath(name)||typeof content!=='string'||name in files||!/^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(content))throw Error('Image invalide : '+name);size+=content.length;assets[name]=content;}
  if(Object.keys(files).length+Object.keys(assets).length>200||size>3_000_000)throw Error('Projet trop volumineux : limite de 3 Mo et 200 fichiers pour le stockage navigateur.');
  const main=input.main||Object.keys(files).find(n=>n.endsWith('main.tex'))||Object.keys(files).find(n=>/\\documentclass/.test(files[n]));
  if(!main||typeof files[main]!=='string'||!main.endsWith('.tex'))throw Error('Aucun fichier principal .tex valide.');
  return {name:String(input.name||'Projet importé').slice(0,80),main,files,assets};
}
export function downloadBlob(blob,name){const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
export async function exportProject(project){const {default:JSZip}=await import('jszip');const zip=new JSZip();for(const [n,c] of Object.entries(project.files))zip.file(n,c);for(const [n,c] of Object.entries(project.assets||{}))zip.file(n,c,{base64:true});zip.file('.texbea/project.json',JSON.stringify({name:project.name,main:project.main},null,2));downloadBlob(await zip.generateAsync({type:'blob',compression:'DEFLATE'}),project.name.replace(/[^\p{L}\p{N}_-]/gu,'_')+'.zip');}
export async function importProject(file){
 if(file.size>8_000_000)throw Error('Archive trop volumineuse (8 Mo maximum).');
 if(file.name.toLowerCase().endsWith('.tex'))return validateProject({name:file.name.replace(/\.tex$/i,''),main:file.name,files:{[file.name]:await file.text()}});
 if(!file.name.toLowerCase().endsWith('.zip'))throw Error('Choisis un fichier .tex ou .zip.');
 const {default:JSZip}=await import('jszip');const zip=await JSZip.loadAsync(file);const files={},assets={};let size=0,metadata={};const entries=Object.values(zip.files).filter(e=>!e.dir);
 const useful=entries.filter(e=>!e.name.startsWith('__MACOSX/')&&!/(?:^|\/)\.DS_Store$/.test(e.name)&&e.name!=='.texbea/project.json');const prefix=useful.length&&useful[0].name.includes('/')?useful[0].name.split('/')[0]+'/':'';const strip=prefix&&useful.every(e=>e.name.startsWith(prefix))?prefix:'';
 if(entries.length>1000||useful.length>200)throw Error('Archive trop grande (200 fichiers maximum).');
 for(const entry of entries){const original=entry.name;const unstrip=n=>strip&&n.startsWith(strip)?n.slice(strip.length):n;const name=unstrip(original),unsafe=unstrip(entry.unsafeOriginalName||original);if(original.startsWith('__MACOSX/')||/(?:^|\/)\.DS_Store$/.test(name))continue;if(unsafe!=='.texbea/project.json'&&!safePath(unsafe))throw Error('Chemin non autorisé : '+unsafe);if(name==='.texbea/project.json'){if((entry._data?.uncompressedSize||0)>20000)throw Error('Métadonnées trop volumineuses.');metadata=JSON.parse(await entry.async('string'));continue;}if(!safePath(name))throw Error('Chemin non autorisé : '+name);if((entry._data?.uncompressedSize||0)>3_000_000)throw Error('Fichier trop volumineux : '+name);
 if(/\.(tex|bib|sty|cls|txt|csv|bst|md)$/i.test(name)){files[name]=await entry.async('string');size+=files[name].length;}
 else if(/\.(png|jpe?g|pdf)$/i.test(name)){assets[name]=await entry.async('base64');size+=assets[name].length;}
 else if(/(?:^|\/)\.DS_Store$/.test(name))continue;else throw Error('Format non pris en charge : '+name+' (sources texte, PNG, JPG et PDF acceptés).');
 if(size>3_000_000)throw Error('Projet trop volumineux pour le stockage navigateur.');}
 return validateProject({name:metadata.name||file.name.replace(/\.zip$/i,''),main:strip&&metadata.main?.startsWith(strip)?metadata.main.slice(strip.length):metadata.main,files,assets});
}
