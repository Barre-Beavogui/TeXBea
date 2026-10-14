import {templates,safePath,validateProject} from './project-tools.js';
const key='texnova-lab-projects';
const uid=()=>crypto.randomUUID();
function make(input){const data=validateProject(input.files?input:{name:input.name,main:'main.tex',files:{'main.tex':(templates[input.template]||templates.article).source}});return {...data,id:uid(),updatedAt:new Date().toISOString(),history:[]};}
export async function demoApi(path,opt={}){
 let db;try{db=JSON.parse(localStorage.getItem(key)||'null')||[make({name:'Mon premier projet'})];if(!Array.isArray(db))throw Error();}catch{throw Error('Les données locales sont illisibles. Exporte une sauvegarde avant toute réparation.');}
 const body=JSON.parse(opt.body||'{}'),method=opt.method||'GET';const fail=(error,status=400)=>{throw Object.assign(new Error(error),{status,data:{error}})};
 const parts=path.split('/').filter(Boolean);let result;
 if(parts[0]==='projects'&&parts.length===1){if(method==='POST'){result=make(body);db.push(result)}else result=db.map(p=>({id:p.id,name:p.name,main:p.main,updatedAt:p.updatedAt,deleted:!!p.deleted,fileCount:Object.keys(p.files).length+Object.keys(p.assets||{}).length}));}
 else if(parts[0]==='projects'){
 const p=db.find(p=>p.id===parts[1]);if(!p)fail('Projet introuvable',404);p.assets=p.assets||{};p.history=p.history||[];
 if(parts.length===2){if(method==='PUT'){if(body.name)p.name=String(body.name).trim().slice(0,80);if('deleted'in body)p.deleted=!!body.deleted;if(body.main){if(!(body.main in p.files)||!body.main.endsWith('.tex'))fail('Fichier principal invalide');p.main=body.main;}}else if(method==='DELETE'){if(!p.deleted)fail('Place le projet dans la corbeille avant de le supprimer');db=db.filter(x=>x.id!==p.id);}result=p;}
 else if(parts[2]==='duplicate'){result=make({...p,name:body.name||p.name+' — copie'});db.push(result);}
 else if(parts[2]==='files'){
 const n=decodeURIComponent(parts[3]||body.name||'');if(!safePath(n))fail('Nom de fichier invalide');
 if(method==='DELETE'){if(n===p.main)fail('Impossible de supprimer le fichier principal');delete p.files[n];delete p.assets[n];result=p;}
 else if(method==='POST'){if(n in p.files||n in p.assets)fail('Ce fichier existe déjà',409);if(body.binary){const checked=validateProject({...p,assets:{...p.assets,[n]:body.content}});p.assets=checked.assets;}else p.files[n]=String(body.content||'');result=p;}
 else{p.files[n]=String(body.content||'');result={ok:true};}
 validateProject(p);
 }else if(parts[2]==='snapshot'){p.history.push({id:uid(),at:new Date().toISOString(),label:String(body.label||'Version').slice(0,80),files:structuredClone(p.files),assets:structuredClone(p.assets),main:p.main});p.history=p.history.slice(-20);result={history:p.history};}
 else if(parts[2]==='restore'){const s=p.history.find(s=>s.id===parts[3]);if(!s)fail('Version introuvable',404);p.files=structuredClone(s.files);p.assets=structuredClone(s.assets||{});p.main=s.main||Object.keys(s.files).find(n=>n===p.main)||Object.keys(s.files).find(n=>n.endsWith('.tex'));result=p;}
 else fail('Action indisponible',404);
 if(method!=='GET')p.updatedAt=new Date().toISOString();
 }else fail('Action indisponible',404);
 try{localStorage.setItem(key,JSON.stringify(db))}catch{fail('Stockage navigateur plein. Exporte tes projets ZIP puis libère de la place. Aucune modification n’a été enregistrée.',507)}
 return structuredClone(result);
}
