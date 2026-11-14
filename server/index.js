import {
  safePath,
  validateProject,
  templateProject,
  renameFile,
  MAX_FILE_SIZE,
  MAX_PROJECT_SIZE,
} from '../src/project-tools.js';
import { compilers, effectiveCompiler, isCompiler } from '../src/compilers.js';
import { cleanComment, mergeComments } from '../src/share.js';
import express from 'express';
import crypto from 'crypto';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';
import { WebSocketServer } from 'ws';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = process.env.TEXBEA_DATA || path.join(__dirname, 'data');
const DATA = path.join(DATA_DIR, 'db.json');
// Images live next to db.json, one file per content (named by its SHA-256): db.json stays small and
// an image kept in twenty versions is stored once.
const BLOBS = path.join(DATA_DIR, 'blobs');
const REF = '@blob:';
const blobContent = new Map(); // hash → Base64
const blobHash = new Map(); // Base64 → hash
const PDFS = path.join(__dirname, 'pdfs');
const PORT = Number(process.env.PORT || 8787);
const sessions = new Map();
const starter = String.raw`\documentclass[11pt]{article}
\usepackage[margin=2.5cm]{geometry}
\usepackage{amsmath}
\usepackage{xcolor}
\title{Bienvenue sur TeXBea V3 — n'hésitez pas à laisser des commentaires}
\author{Votre nom}
\date{\today}
\begin{document}
\maketitle
\section{Votre espace scientifique}
Ce projet est sauvegardé par le serveur TeXBea.
\subsection{Mathématiques}
\[
E = mc^2
\]
\end{document}`;
async function readBlob(hash) {
  if (!blobContent.has(hash)) {
    const content = await fsp.readFile(path.join(BLOBS, hash), 'utf8').catch(() => '');
    blobContent.set(hash, content);
    blobHash.set(content, hash);
  }
  return blobContent.get(hash);
}
async function hydrate(assets = {}) {
  const out = {};
  for (const [n, v] of Object.entries(assets)) out[n] = v.startsWith(REF) ? await readBlob(v.slice(REF.length)) : v;
  return out;
}
async function db() {
  let d;
  try {
    d = JSON.parse(await fsp.readFile(DATA, 'utf8'));
  } catch {
    return { users: [], projects: [] };
  }
  for (const p of d.projects) {
    p.assets = await hydrate(p.assets);
    for (const s of p.history || []) s.assets = await hydrate(s.assets);
  }
  return d;
}
// One write at a time, so cleaning up images never races another request's new image.
let saving = Promise.resolve();
function save(x) {
  const run = saving.then(() => write(x));
  saving = run.catch(() => {});
  return run;
}
async function write(x) {
  await fsp.mkdir(BLOBS, { recursive: true });
  const used = new Set();
  const refs = async (assets = {}) => {
    const out = {};
    for (const [n, v] of Object.entries(assets)) {
      let h = blobHash.get(v);
      if (!h) {
        h = crypto.createHash('sha256').update(v).digest('hex');
        const file = path.join(BLOBS, h);
        if (!fs.existsSync(file)) {
          await fsp.writeFile(file + '.tmp', v);
          await fsp.rename(file + '.tmp', file);
        }
        blobHash.set(v, h);
        blobContent.set(h, v);
      }
      used.add(h);
      out[n] = REF + h;
    }
    return out;
  };
  const stored = { ...x, projects: [] };
  for (const p of x.projects) {
    const history = [];
    for (const s of p.history || []) history.push({ ...s, assets: await refs(s.assets) });
    stored.projects.push({ ...p, assets: await refs(p.assets), history });
  }
  await fsp.writeFile(DATA + '.tmp', JSON.stringify(stored, null, 2));
  await fsp.rename(DATA + '.tmp', DATA);
  // Forget images no project or version points to any more.
  for (const name of await fsp.readdir(BLOBS))
    if (!used.has(name) && !name.endsWith('.tmp')) {
      await fsp.rm(path.join(BLOBS, name), { force: true });
      const content = blobContent.get(name);
      blobContent.delete(name);
      if (content != null) blobHash.delete(content);
    }
}
function id() {
  return crypto.randomUUID();
}
function hash(p, s = crypto.randomBytes(16).toString('hex')) {
  return { salt: s, hash: crypto.scryptSync(p, s, 64).toString('hex') };
}
function auth(req, res, next) {
  const t = (req.headers.authorization || '').replace('Bearer ', '') || String(req.query.token || '');
  const u = sessions.get(t);
  if (!u) return res.status(401).json({ error: 'Session requise' });
  req.userId = u;
  next();
}
function safeName(n) {
  return safePath(n);
}
// Versions are sent without their images: the history panel compares sources only.
function publicVersion(s) {
  return { ...s, assets: Object.fromEntries(Object.keys(s.assets || {}).map((n) => [n, ''])) };
}
function publicProject(p) {
  return { ...p, history: (p.history || []).slice(-20).map(publicVersion) };
}
const app = express();
// A whole project (sources + Base64 images) can travel in one request, for an import.
const BODY_LIMIT = Number(process.env.TEXBEA_BODY_LIMIT_MB) || Math.ceil(MAX_PROJECT_SIZE / 1_000_000) + 10;
app.use(express.json({ limit: BODY_LIMIT + 'mb' }));
app.get('/api/health', (_, res) => res.json({ ok: true, engine: process.env.LATEX_ENGINE || 'latexmk' }));
app.post('/api/auth/register', async (req, res) => {
  const { email, password, name } = req.body || {};
  if (!email || !password || password.length < 6)
    return res.status(400).json({ error: 'Email et mot de passe (6 caractères minimum) requis' });
  const d = await db();
  if (d.users.some((u) => u.email.toLowerCase() === email.toLowerCase()))
    return res.status(409).json({ error: 'Compte déjà existant' });
  const h = hash(password);
  const u = { id: id(), email, name: name || email.split('@')[0], ...h, createdAt: new Date().toISOString() };
  d.users.push(u);
  const p = {
    id: id(),
    ownerId: u.id,
    name: 'Mon premier projet',
    main: 'main.tex',
    files: { 'main.tex': starter, 'references.bib': '% Bibliographie TeXBea\n' },
    updatedAt: new Date().toISOString(),
    history: [],
  };
  d.projects.push(p);
  await save(d);
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, u.id);
  res.json({ token, user: { id: u.id, email: u.email, name: u.name }, project: p });
});
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body || {};
  const d = await db();
  const u = d.users.find((x) => x.email.toLowerCase() === (email || '').toLowerCase());
  if (!u) return res.status(401).json({ error: 'Identifiants invalides' });
  const h = hash(password || '', u.salt).hash;
  if (!crypto.timingSafeEqual(Buffer.from(h), Buffer.from(u.hash)))
    return res.status(401).json({ error: 'Identifiants invalides' });
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, u.id);
  res.json({ token, user: { id: u.id, email: u.email, name: u.name } });
});
app.post('/api/auth/logout', auth, (req, res) => {
  for (const [t, u] of sessions) if (u === req.userId) sessions.delete(t);
  res.json({ ok: true });
});
app.get('/api/backup', auth, async (req, res) => {
  const d = await db();
  res.json(
    d.projects
      .filter((p) => p.ownerId === req.userId)
      .map((p) => ({
        ...p,
        assets: { ...(p.assets || {}) },
        history: [...(p.history || [])],
        comments: [...(p.comments || [])],
      })),
  );
});
app.post('/api/restore', auth, async (req, res) => {
  try {
    const d = await db();
    let added = 0,
      skipped = 0;
    for (const input of req.body?.projects || []) {
      const same = d.projects.find((p) => p.ownerId === req.userId && p.id === input.id);
      if (same && same.updatedAt === input.updatedAt) {
        skipped++;
        continue;
      }
      const data = validateProject(input);
      d.projects.push({
        ...data,
        id: same || !input.id || d.projects.some((p) => p.id === input.id) ? id() : input.id,
        ownerId: req.userId,
        name: same ? `${data.name} (sauvegarde)`.slice(0, 80) : data.name,
        deleted: !!input.deleted,
        updatedAt: input.updatedAt || new Date().toISOString(),
        history: (input.history || []).slice(-20),
        comments: input.comments || [],
      });
      added++;
    }
    await save(d);
    res.json({ added, skipped });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
app.get('/api/projects', auth, async (req, res) => {
  const d = await db();
  res.json(
    d.projects
      .filter((p) => p.ownerId === req.userId)
      .map((p) => ({
        id: p.id,
        name: p.name,
        updatedAt: p.updatedAt,
        main: p.main,
        deleted: !!p.deleted,
        fileCount: Object.keys(p.files).length + Object.keys(p.assets || {}).length,
      })),
  );
});
app.post('/api/projects', auth, async (req, res) => {
  try {
    const d = await db();
    const input = req.body || {};
    const data = validateProject(input.files ? input : templateProject(input.template, input));
    const p = { ...data, id: id(), ownerId: req.userId, updatedAt: new Date().toISOString(), history: [] };
    d.projects.push(p);
    await save(d);
    res.json(p);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
app.delete('/api/projects/:pid', auth, async (req, res) => {
  const d = await db();
  const p = d.projects.find((x) => x.id === req.params.pid && x.ownerId === req.userId);
  if (!p) return res.sendStatus(404);
  if (!p.deleted) return res.status(400).json({ error: 'Place le projet dans la corbeille avant de le supprimer' });
  d.projects = d.projects.filter((x) => x.id !== p.id);
  await save(d);
  res.json({ ok: true });
});
app.post('/api/projects/:pid/duplicate', auth, async (req, res) => {
  const d = await db();
  const old = d.projects.find((x) => x.id === req.params.pid && x.ownerId === req.userId);
  if (!old) return res.sendStatus(404);
  const p = {
    ...validateProject(old),
    id: id(),
    ownerId: req.userId,
    name: (req.body?.name || old.name + ' — copie').slice(0, 80),
    history: [],
    updatedAt: new Date().toISOString(),
  };
  d.projects.push(p);
  await save(d);
  res.json(p);
});
app.get('/api/projects/:pid', auth, async (req, res) => {
  const d = await db();
  const p = d.projects.find((x) => x.id === req.params.pid && x.ownerId === req.userId);
  if (!p) return res.sendStatus(404);
  res.json(publicProject(p));
});
app.put('/api/projects/:pid', auth, async (req, res) => {
  const d = await db();
  const p = d.projects.find((x) => x.id === req.params.pid && x.ownerId === req.userId);
  if (!p) return res.sendStatus(404);
  if ('deleted' in req.body) p.deleted = !!req.body.deleted;
  if (req.body.name) p.name = String(req.body.name).slice(0, 80);
  if (req.body.main && p.files[req.body.main] != null) p.main = req.body.main;
  if (req.body.compiler) {
    if (!isCompiler(req.body.compiler)) return res.status(400).json({ error: 'Compilateur inconnu' });
    p.compiler = req.body.compiler;
  }
  p.updatedAt = new Date().toISOString();
  await save(d);
  res.json(publicProject(p));
});
app.put('/api/projects/:pid/files/:name', auth, async (req, res) => {
  const name = decodeURIComponent(req.params.name);
  if (!safeName(name)) return res.status(400).json({ error: 'Nom de fichier invalide' });
  const d = await db();
  const p = d.projects.find((x) => x.id === req.params.pid && x.ownerId === req.userId);
  if (!p) return res.sendStatus(404);
  const content = String(req.body?.content ?? '');
  if (content.length > MAX_FILE_SIZE) return res.status(413).json({ error: 'Fichier trop volumineux' });
  p.files[name] = content;
  p.updatedAt = new Date().toISOString();
  await save(d);
  broadcast(p.id, { type: 'file', name, content, by: req.userId });
  res.json({ ok: true, updatedAt: p.updatedAt });
});
app.post('/api/projects/:pid/files', auth, async (req, res) => {
  try {
    const name = String(req.body?.name || '');
    if (!safeName(name)) return res.status(400).json({ error: 'Nom invalide' });
    const d = await db();
    const p = d.projects.find((x) => x.id === req.params.pid && x.ownerId === req.userId);
    if (!p) return res.sendStatus(404);
    p.assets = p.assets || {};
    if (p.files[name] != null || p.assets[name] != null)
      return res.status(409).json({ error: 'Ce fichier existe déjà' });
    if (req.body.binary) p.assets[name] = req.body.content;
    else p.files[name] = String(req.body?.content || '');
    validateProject(p);
    p.updatedAt = new Date().toISOString();
    await save(d);
    res.json(publicProject(p));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
app.patch('/api/projects/:pid/files/:name', auth, async (req, res) => {
  const name = decodeURIComponent(req.params.name);
  const d = await db();
  const p = d.projects.find((x) => x.id === req.params.pid && x.ownerId === req.userId);
  if (!p) return res.sendStatus(404);
  try {
    Object.assign(p, renameFile(p, name, String(req.body?.newName || '')));
  } catch (e) {
    return res.status(/existe/.test(e.message) ? 409 : 400).json({ error: e.message });
  }
  p.updatedAt = new Date().toISOString();
  await save(d);
  res.json(publicProject(p));
});
app.delete('/api/projects/:pid/files/:name', auth, async (req, res) => {
  const name = decodeURIComponent(req.params.name);
  const d = await db();
  const p = d.projects.find((x) => x.id === req.params.pid && x.ownerId === req.userId);
  if (!p) return res.sendStatus(404);
  if (name === p.main) return res.status(400).json({ error: 'Impossible de supprimer le fichier principal' });
  delete p.files[name];
  if (p.assets) delete p.assets[name];
  p.updatedAt = new Date().toISOString();
  await save(d);
  res.json(publicProject(p));
});
app.post('/api/projects/:pid/snapshot', auth, async (req, res) => {
  const d = await db();
  const p = d.projects.find((x) => x.id === req.params.pid && x.ownerId === req.userId);
  if (!p) return res.sendStatus(404);
  p.history = p.history || [];
  p.history.push({
    id: id(),
    at: new Date().toISOString(),
    label: String(req.body?.label || 'Snapshot').slice(0, 80),
    files: { ...p.files },
    assets: { ...(p.assets || {}) },
    main: p.main,
  });
  p.history = p.history.slice(-20);
  await save(d);
  res.json({ history: p.history.map(publicVersion) });
});
app.post('/api/projects/:pid/restore/:sid', auth, async (req, res) => {
  const d = await db();
  const p = d.projects.find((x) => x.id === req.params.pid && x.ownerId === req.userId);
  if (!p) return res.sendStatus(404);
  const s = (p.history || []).find((x) => x.id === req.params.sid);
  if (!s) return res.sendStatus(404);
  p.files = { ...s.files };
  p.assets = { ...(s.assets || {}) };
  p.main = s.main || (p.main in p.files ? p.main : Object.keys(p.files).find((n) => n.endsWith('.tex')));
  p.updatedAt = new Date().toISOString();
  await save(d);
  res.json(publicProject(p));
});
app.post('/api/projects/:pid/comments/merge', auth, async (req, res) => {
  const d = await db();
  const p = d.projects.find((x) => x.id === req.params.pid && x.ownerId === req.userId);
  if (!p) return res.sendStatus(404);
  const merged = mergeComments(p.comments || [], req.body?.comments);
  p.comments = merged.comments;
  p.updatedAt = new Date().toISOString();
  await save(d);
  broadcast(p.id, { type: 'comments', comments: p.comments });
  res.json(merged);
});
app.post('/api/projects/:pid/comments', auth, async (req, res) => {
  const d = await db();
  const p = d.projects.find((x) => x.id === req.params.pid && x.ownerId === req.userId);
  if (!p) return res.sendStatus(404);
  const c = cleanComment({ ...(req.body || {}), id: id(), at: new Date().toISOString() });
  if (!c) return res.status(400).json({ error: 'Commentaire vide' });
  p.comments = p.comments || [];
  p.comments.push(c);
  p.updatedAt = new Date().toISOString();
  await save(d);
  broadcast(p.id, { type: 'comments', comments: p.comments });
  res.json({ comments: p.comments });
});
app.patch('/api/projects/:pid/comments/:cid', auth, async (req, res) => {
  const d = await db();
  const p = d.projects.find((x) => x.id === req.params.pid && x.ownerId === req.userId);
  if (!p) return res.sendStatus(404);
  p.comments = p.comments || [];
  const c = p.comments.find((x) => x.id === req.params.cid);
  if (!c) return res.status(404).json({ error: 'Commentaire introuvable' });
  if ('resolved' in (req.body || {})) c.resolved = !!req.body.resolved;
  if (typeof req.body?.text === 'string' && req.body.text.trim()) c.text = req.body.text.trim().slice(0, 4000);
  p.updatedAt = new Date().toISOString();
  await save(d);
  broadcast(p.id, { type: 'comments', comments: p.comments });
  res.json({ comments: p.comments });
});
app.delete('/api/projects/:pid/comments/:cid', auth, async (req, res) => {
  const d = await db();
  const p = d.projects.find((x) => x.id === req.params.pid && x.ownerId === req.userId);
  if (!p) return res.sendStatus(404);
  p.comments = (p.comments || []).filter((x) => x.id !== req.params.cid);
  p.updatedAt = new Date().toISOString();
  await save(d);
  broadcast(p.id, { type: 'comments', comments: p.comments });
  res.json({ comments: p.comments });
});
async function latexmkAvailable() {
  return await new Promise((r) => {
    const c = spawn(process.env.LATEX_ENGINE || 'latexmk', ['-v']);
    c.on('error', () => r(false));
    c.on('exit', (code) => r(code === 0));
  });
}
app.post('/api/projects/:pid/compile', auth, async (req, res) => {
  const d = await db();
  const p = d.projects.find((x) => x.id === req.params.pid && x.ownerId === req.userId);
  if (!p) return res.sendStatus(404);
  if (!(await latexmkAvailable()))
    return res.status(503).json({ error: 'latexmk/TeX Live non installé sur le serveur', demo: true });
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'texbea-'));
  try {
    for (const [n, c] of Object.entries(p.files)) {
      if (!safeName(n)) continue;
      await fsp.mkdir(path.dirname(path.join(dir, n)), { recursive: true });
      await fsp.writeFile(path.join(dir, n), c);
    }
    for (const [n, c] of Object.entries(p.assets || {})) {
      if (!safeName(n)) continue;
      await fsp.mkdir(path.dirname(path.join(dir, n)), { recursive: true });
      await fsp.writeFile(path.join(dir, n), Buffer.from(c, 'base64'));
    }
    const flag = compilers.find((c) => c.id === effectiveCompiler(p)).latexmk;
    const args = [flag, '-interaction=nonstopmode', '-halt-on-error', '-no-shell-escape', p.main];
    const result = await new Promise((resolve) => {
      const cp = spawn(process.env.LATEX_ENGINE || 'latexmk', args, {
        cwd: dir,
        env: { ...process.env, openout_any: 'p', openin_any: 'a' },
      });
      let out = '';
      cp.stdout.on('data', (d) => (out += d));
      cp.stderr.on('data', (d) => (out += d));
      const timer = setTimeout(() => {
        cp.kill('SIGKILL');
        resolve({ code: 124, out: out + '\nCompilation interrompue après 60 s.' });
      }, 60000);
      cp.on('error', (e) => {
        clearTimeout(timer);
        resolve({ code: 127, out: String(e) });
      });
      cp.on('exit', (code) => {
        clearTimeout(timer);
        resolve({ code, out });
      });
    });
    const log = result.out.slice(-16000);
    if (result.code !== 0) return res.status(422).json({ error: 'Compilation échouée', log });
    const pdf = path.join(dir, path.basename(p.main, '.tex') + '.pdf');
    const key = `${p.id}-${Date.now()}.pdf`;
    await fsp.mkdir(PDFS, { recursive: true });
    await fsp.copyFile(pdf, path.join(PDFS, key));
    p.lastPdf = key;
    p.updatedAt = new Date().toISOString();
    await save(d);
    res.json({ ok: true, url: `/api/pdf/${key}`, log });
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }
});
app.get('/api/pdf/:key', auth, async (req, res) => {
  const d = await db();
  const p = d.projects.find((x) => x.ownerId === req.userId && x.lastPdf === req.params.key);
  if (!p) return res.sendStatus(404);
  res.type('pdf').sendFile(path.join(PDFS, req.params.key));
});
if (fs.existsSync(path.join(ROOT, 'dist'))) {
  app.use(express.static(path.join(ROOT, 'dist')));
  app.use((req, res, next) =>
    req.path.startsWith('/api/') ? next() : res.sendFile(path.join(ROOT, 'dist', 'index.html')),
  );
}
app.use((err, req, res, next) => {
  if (err?.type === 'entity.too.large')
    return res
      .status(413)
      .json({ error: `Envoi trop volumineux (${BODY_LIMIT} Mo maximum, voir TEXBEA_BODY_LIMIT_MB).` });
  next(err);
});
const server = app.listen(PORT, () => console.log(`TeXBea server: http://localhost:${PORT}`));
const wss = new WebSocketServer({ server, path: '/ws' });
const rooms = new Map();
function broadcast(pid, msg, except = null) {
  for (const ws of rooms.get(pid) || []) if (ws !== except && ws.readyState === 1) ws.send(JSON.stringify(msg));
}
function broadcastPresence(pid) {
  const peers = [...(rooms.get(pid) || [])].filter((ws) => ws.readyState === 1 && ws.peerInfo).map((ws) => ws.peerInfo);
  broadcast(pid, { type: 'presence', peers });
}
wss.on('connection', async (ws, req) => {
  const u = new URL(req.url, 'http://x');
  const token = u.searchParams.get('token'),
    pid = u.searchParams.get('project');
  if (!sessions.has(token) || !pid) return ws.close();
  const data = await db();
  const user = data.users.find((x) => x.id === sessions.get(token));
  if (!data.projects.some((p) => p.id === pid && p.ownerId === sessions.get(token))) return ws.close();
  ws.peerInfo = {
    peerId: id().slice(0, 8),
    name: user?.name || 'Collaborateur',
    file: 'main.tex',
    line: 1,
  };
  if (!rooms.has(pid)) rooms.set(pid, new Set());
  rooms.get(pid).add(ws);
  broadcastPresence(pid);
  ws.on('message', (raw) => {
    try {
      const m = JSON.parse(raw);
      if (m.type === 'cursor') {
        ws.peerInfo = {
          ...ws.peerInfo,
          name: String(m.name || ws.peerInfo.name).slice(0, 40),
          file: String(m.file || ws.peerInfo.file),
          line: Number(m.line) || 1,
        };
        broadcastPresence(pid);
      }
    } catch {}
  });
  ws.on('close', () => {
    rooms.get(pid)?.delete(ws);
    broadcastPresence(pid);
  });
});
