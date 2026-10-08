import express from 'express';
import crypto from 'crypto';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import os from 'os';
import {spawn} from 'child_process';
import {WebSocketServer} from 'ws';
import {fileURLToPath} from 'url';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const ROOT=path.resolve(__dirname,'..'); const DATA=path.join(__dirname,'data','db.json'); const PDFS=path.join(__dirname,'pdfs');
const PORT=Number(process.env.PORT||8787); const sessions=new Map();
const starter=String.raw`\documentclass[11pt]{article}
\usepackage[margin=2.5cm]{geometry}
\usepackage{amsmath}
\usepackage{xcolor}
\title{Bienvenue sur TeXNova V2}
\author{Votre nom}
\date{\today}
\begin{document}
\maketitle
\section{Votre espace scientifique}
Ce projet est sauvegardé par le serveur TeXNova.
\subsection{Mathématiques}
\[
E = mc^2
\]
\end{document}`;
async function db(){try{return JSON.parse(await fsp.readFile(DATA,'utf8'))}catch{return {users:[],projects:[]}}}
async function save(x){await fsp.mkdir(path.dirname(DATA),{recursive:true}); await fsp.writeFile(DATA,JSON.stringify(x,null,2))}
function id(){return crypto.randomUUID()}
function hash(p,s=crypto.randomBytes(16).toString('hex')){return {salt:s,hash:crypto.scryptSync(p,s,64).toString('hex')}}
function auth(req,res,next){const t=(req.headers.authorization||'').replace('Bearer ','')||String(req.query.token||''); const u=sessions.get(t); if(!u)return res.status(401).json({error:'Session requise'}); req.userId=u; next()}
function safeName(n){return typeof n==='string'&&/^[\w.\- ]{1,120}$/.test(n)&&!n.includes('..')&&!n.startsWith('.')}
function publicProject(p){return {...p,history:(p.history||[]).slice(-20)}}
const app=express(); app.use(express.json({limit:'8mb'}));
app.get('/api/health',(_,res)=>res.json({ok:true,engine:process.env.LATEX_ENGINE||'latexmk'}));
app.post('/api/auth/register',async(req,res)=>{const {email,password,name}=req.body||{}; if(!email||!password||password.length<6)return res.status(400).json({error:'Email et mot de passe (6 caractères minimum) requis'}); const d=await db(); if(d.users.some(u=>u.email.toLowerCase()===email.toLowerCase()))return res.status(409).json({error:'Compte déjà existant'}); const h=hash(password); const u={id:id(),email,name:name||email.split('@')[0],...h,createdAt:new Date().toISOString()}; d.users.push(u); const p={id:id(),ownerId:u.id,name:'Mon premier projet',main:'main.tex',files:{'main.tex':starter,'references.bib':'% Bibliographie TeXNova\n'},updatedAt:new Date().toISOString(),history:[]}; d.projects.push(p); await save(d); const token=crypto.randomBytes(32).toString('hex');sessions.set(token,u.id);res.json({token,user:{id:u.id,email:u.email,name:u.name},project:p})});
app.post('/api/auth/login',async(req,res)=>{const {email,password}=req.body||{};const d=await db();const u=d.users.find(x=>x.email.toLowerCase()===(email||'').toLowerCase());if(!u)return res.status(401).json({error:'Identifiants invalides'});const h=hash(password||'',u.salt).hash;if(!crypto.timingSafeEqual(Buffer.from(h),Buffer.from(u.hash)))return res.status(401).json({error:'Identifiants invalides'});const token=crypto.randomBytes(32).toString('hex');sessions.set(token,u.id);res.json({token,user:{id:u.id,email:u.email,name:u.name}})});
app.post('/api/auth/logout',auth,(req,res)=>{for(const [t,u] of sessions)if(u===req.userId)sessions.delete(t);res.json({ok:true})});
app.get('/api/projects',auth,async(req,res)=>{const d=await db();res.json(d.projects.filter(p=>p.ownerId===req.userId).map(p=>({id:p.id,name:p.name,updatedAt:p.updatedAt,fileCount:Object.keys(p.files).length})))});
app.post('/api/projects',auth,async(req,res)=>{const d=await db();const p={id:id(),ownerId:req.userId,name:(req.body?.name||'Nouveau projet').slice(0,80),main:'main.tex',files:{'main.tex':starter},updatedAt:new Date().toISOString(),history:[]};d.projects.push(p);await save(d);res.json(p)});
app.get('/api/projects/:pid',auth,async(req,res)=>{const d=await db();const p=d.projects.find(x=>x.id===req.params.pid&&x.ownerId===req.userId);if(!p)return res.sendStatus(404);res.json(publicProject(p))});
app.put('/api/projects/:pid',auth,async(req,res)=>{const d=await db();const p=d.projects.find(x=>x.id===req.params.pid&&x.ownerId===req.userId);if(!p)return res.sendStatus(404);if(req.body.name)p.name=String(req.body.name).slice(0,80);if(req.body.main&&p.files[req.body.main]!=null)p.main=req.body.main;p.updatedAt=new Date().toISOString();await save(d);res.json(publicProject(p))});
app.put('/api/projects/:pid/files/:name',auth,async(req,res)=>{const name=decodeURIComponent(req.params.name);if(!safeName(name))return res.status(400).json({error:'Nom de fichier invalide'});const d=await db();const p=d.projects.find(x=>x.id===req.params.pid&&x.ownerId===req.userId);if(!p)return res.sendStatus(404);const content=String(req.body?.content??'');if(content.length>2_000_000)return res.status(413).json({error:'Fichier trop volumineux'});p.files[name]=content;p.updatedAt=new Date().toISOString();await save(d);broadcast(p.id,{type:'file',name,content,by:req.userId});res.json({ok:true,updatedAt:p.updatedAt})});
app.post('/api/projects/:pid/files',auth,async(req,res)=>{const name=String(req.body?.name||'');if(!safeName(name))return res.status(400).json({error:'Nom invalide'});const d=await db();const p=d.projects.find(x=>x.id===req.params.pid&&x.ownerId===req.userId);if(!p)return res.sendStatus(404);if(p.files[name]!=null)return res.status(409).json({error:'Ce fichier existe déjà'});p.files[name]=String(req.body?.content||'');p.updatedAt=new Date().toISOString();await save(d);res.json(publicProject(p))});
app.delete('/api/projects/:pid/files/:name',auth,async(req,res)=>{const name=decodeURIComponent(req.params.name);const d=await db();const p=d.projects.find(x=>x.id===req.params.pid&&x.ownerId===req.userId);if(!p)return res.sendStatus(404);if(name===p.main)return res.status(400).json({error:'Impossible de supprimer le fichier principal'});delete p.files[name];p.updatedAt=new Date().toISOString();await save(d);res.json(publicProject(p))});
app.post('/api/projects/:pid/snapshot',auth,async(req,res)=>{const d=await db();const p=d.projects.find(x=>x.id===req.params.pid&&x.ownerId===req.userId);if(!p)return res.sendStatus(404);p.history=p.history||[];p.history.push({id:id(),at:new Date().toISOString(),label:String(req.body?.label||'Snapshot').slice(0,80),files:p.files});p.history=p.history.slice(-20);await save(d);res.json({history:p.history})});
app.post('/api/projects/:pid/restore/:sid',auth,async(req,res)=>{const d=await db();const p=d.projects.find(x=>x.id===req.params.pid&&x.ownerId===req.userId);if(!p)return res.sendStatus(404);const s=(p.history||[]).find(x=>x.id===req.params.sid);if(!s)return res.sendStatus(404);p.files=structuredClone(s.files);p.updatedAt=new Date().toISOString();await save(d);res.json(publicProject(p))});
async function latexmkAvailable(){return await new Promise(r=>{const c=spawn(process.env.LATEX_ENGINE||'latexmk',['-v']);c.on('error',()=>r(false));c.on('exit',code=>r(code===0))})}
app.post('/api/projects/:pid/compile',auth,async(req,res)=>{const d=await db();const p=d.projects.find(x=>x.id===req.params.pid&&x.ownerId===req.userId);if(!p)return res.sendStatus(404);if(!(await latexmkAvailable()))return res.status(503).json({error:'latexmk/TeX Live non installé sur le serveur',demo:true});const dir=await fsp.mkdtemp(path.join(os.tmpdir(),'texnova-'));try{for(const [n,c] of Object.entries(p.files)){if(!safeName(n))continue;await fsp.writeFile(path.join(dir,n),c)}const args=['-pdf','-interaction=nonstopmode','-halt-on-error','-no-shell-escape',p.main];const result=await new Promise(resolve=>{const cp=spawn(process.env.LATEX_ENGINE||'latexmk',args,{cwd:dir,env:{...process.env,openout_any:'p',openin_any:'a'}});let out='';cp.stdout.on('data',d=>out+=d);cp.stderr.on('data',d=>out+=d);const timer=setTimeout(()=>{cp.kill('SIGKILL');resolve({code:124,out:out+'\nCompilation interrompue après 20 s.'})},20000);cp.on('error',e=>{clearTimeout(timer);resolve({code:127,out:String(e)})});cp.on('exit',code=>{clearTimeout(timer);resolve({code,out})})});const log=result.out.slice(-16000);if(result.code!==0)return res.status(422).json({error:'Compilation échouée',log});const pdf=path.join(dir,path.basename(p.main,'.tex')+'.pdf');const key=`${p.id}-${Date.now()}.pdf`;await fsp.mkdir(PDFS,{recursive:true});await fsp.copyFile(pdf,path.join(PDFS,key));p.lastPdf=key;p.updatedAt=new Date().toISOString();await save(d);res.json({ok:true,url:`/api/pdf/${key}`,log});}finally{await fsp.rm(dir,{recursive:true,force:true})}});
app.get('/api/pdf/:key',auth,async(req,res)=>{const d=await db();const p=d.projects.find(x=>x.ownerId===req.userId&&x.lastPdf===req.params.key);if(!p)return res.sendStatus(404);res.type('pdf').sendFile(path.join(PDFS,req.params.key))});
if(fs.existsSync(path.join(ROOT,'dist'))){app.use(express.static(path.join(ROOT,'dist')));app.use((req,res,next)=>req.path.startsWith('/api/')?next():res.sendFile(path.join(ROOT,'dist','index.html')))}
const server=app.listen(PORT,()=>console.log(`TeXNova server: http://localhost:${PORT}`));
const wss=new WebSocketServer({server,path:'/ws'});const rooms=new Map();function broadcast(pid,msg){for(const ws of rooms.get(pid)||[])if(ws.readyState===1)ws.send(JSON.stringify(msg))}wss.on('connection',(ws,req)=>{const u=new URL(req.url,'http://x');const token=u.searchParams.get('token'),pid=u.searchParams.get('project');if(!sessions.has(token)||!pid)return ws.close();if(!rooms.has(pid))rooms.set(pid,new Set());rooms.get(pid).add(ws);ws.on('message',raw=>{try{const m=JSON.parse(raw);if(m.type==='cursor')broadcast(pid,m)}catch{}});ws.on('close',()=>rooms.get(pid)?.delete(ws))});
