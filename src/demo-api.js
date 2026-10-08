const key='texnova-lab-projects';
const starter=String.raw`\documentclass{article}
\title{Mon expérience TeXNova}
\begin{document}
\maketitle
\section{Bonjour}
Modifie ce texte, ajoute un fichier et crée une version.
\end{document}`;
const uid=()=>crypto.randomUUID();
const make=(name)=>({id:uid(),name,main:'main.tex',files:{'main.tex':starter},history:[],updatedAt:new Date().toISOString()});
export async function demoApi(path,opt={}){
 let db=JSON.parse(localStorage.getItem(key)||'null')||[make('Mon premier projet')];
 const body=JSON.parse(opt.body||'{}'), method=opt.method||'GET';
 const fail=(error,status=400)=>{throw Object.assign(new Error(error),{status,data:{error}})};
 const parts=path.split('/').filter(Boolean);let result;
 if(parts[0]==='projects'&&parts.length===1){if(method==='POST'){result=make(body.name||'Nouveau projet');db.push(result)}else result=db.map(({id,name,updatedAt,files})=>({id,name,updatedAt,fileCount:Object.keys(files).length}));}
 else if(parts[0]==='projects'){
 const p=db.find(p=>p.id===parts[1]);if(!p)fail('Projet introuvable',404);
 if(parts.length===2)result=p;
 else if(parts[2]==='compile')fail('La compilation PDF nécessite le serveur TeX Live. Cet espace d’essai permet l’édition, la sauvegarde locale et l’historique.',503);
 else if(parts[2]==='files'){
 const n=decodeURIComponent(parts[3]||body.name||'');if(!/^[\w.\- ]{1,120}$/.test(n)||n.includes('..')||n.startsWith('.'))fail('Nom de fichier invalide');
 if(method==='DELETE'){if(n===p.main)fail('Impossible de supprimer le fichier principal');delete p.files[n];result=p}
 else if(method==='POST'){if(n in p.files)fail('Ce fichier existe déjà',409);p.files[n]=body.content||'';result=p}
 else {p.files[n]=body.content||'';result={ok:true}};
 }else if(parts[2]==='snapshot'){p.history.push({id:uid(),at:new Date().toISOString(),label:body.label||'Version',files:structuredClone(p.files)});p.history=p.history.slice(-20);result={history:p.history}}
 else if(parts[2]==='restore'){const s=p.history.find(s=>s.id===parts[3]);if(!s)fail('Version introuvable',404);p.files=structuredClone(s.files);result=p}
 else fail('Action indisponible',404);
 p.updatedAt=new Date().toISOString();
 }else fail('Action indisponible',404);
 localStorage.setItem(key,JSON.stringify(db));return structuredClone(result);
}
