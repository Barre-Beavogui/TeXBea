// Backup of every project in one ZIP, and its restoration.
// Each project gets a readable folder (its current sources and images, usable as is in another LaTeX tool);
// .texbea/backup.json keeps what a folder cannot hold: names, main file, compiler, trash state and versions.
// An image is written once even when it appears in the project and in several of its versions.
import { validateProject, safePath, formatSize, isBase64, MAX_ARCHIVE_SIZE } from './project-tools.js';
import { isCompiler } from './compilers.js';
import { cleanComments } from './share.js';

export const BACKUP_FILE = '.texbea/backup.json';
export const MAX_BACKUP_SIZE = MAX_ARCHIVE_SIZE * 4;
export const LAST_BACKUP_KEY = 'texbea-last-backup';

function folderName(name, taken) {
  const base =
    String(name || '')
      .replace(/[^\p{L}\p{N}_ -]/gu, '_')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 60) || 'Projet';
  let folder = base,
    n = 1;
  while (taken.has(folder.toLowerCase())) folder = `${base} (${++n})`;
  taken.add(folder.toLowerCase());
  return folder;
}

// Returns the JSZip archive (the caller chooses blob or uint8array).
export async function buildBackup(projects, now = new Date()) {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  const taken = new Set(['.texbea']);
  // Content of an image → its path in the archive.
  const written = new Map();
  let blobs = 0;
  const place = (content, path) => {
    if (written.has(content)) return written.get(content);
    path ||= `.texbea/blobs/${++blobs}`;
    zip.file(path, content, { base64: true });
    written.set(content, path);
    return path;
  };
  const entries = projects.map((p) => {
    const folder = folderName(p.name, taken);
    for (const [n, c] of Object.entries(p.files)) zip.file(`${folder}/${n}`, c);
    const assets = {};
    for (const [n, c] of Object.entries(p.assets || {})) {
      const path = `${folder}/${n}`;
      if (written.has(c)) zip.file(path, c, { base64: true });
      else place(c, path);
      assets[n] = path;
    }
    return {
      id: p.id,
      folder,
      name: p.name,
      main: p.main,
      compiler: p.compiler || 'pdflatex',
      deleted: !!p.deleted,
      archived: !!p.archived,
      tags: p.tags || [],
      fromShare: !!p.fromShare,
      updatedAt: p.updatedAt,
      files: Object.keys(p.files),
      assets,
      comments: p.comments || [],
      history: (p.history || []).map((s) => ({
        id: s.id,
        at: s.at,
        label: s.label,
        main: s.main,
        files: s.files,
        // An image the browser did not hand over (empty) is left out of the version.
        assets: Object.fromEntries(
          Object.entries(s.assets || {})
            .filter(([, c]) => c)
            .map(([n, c]) => [n, place(c)]),
        ),
      })),
    };
  });
  zip.file(
    BACKUP_FILE,
    JSON.stringify({ format: 'texbea-backup', version: 1, createdAt: now.toISOString(), projects: entries }, null, 1),
  );
  return zip;
}

export async function backupBlob(projects) {
  const zip = await buildBackup(projects);
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}

export function backupFileName(now = new Date()) {
  return `TeXBea-sauvegarde-${now.toISOString().slice(0, 10)}.zip`;
}

function checkVersion(s) {
  const files = {};
  for (const [n, c] of Object.entries(s.files || {})) {
    if (!safePath(n) || typeof c !== 'string') throw Error('Version invalide.');
    files[n] = c;
  }
  return files;
}

// Reads a backup made by buildBackup. `data` is a File/Blob (browser) or bytes (tests).
export async function readBackup(data) {
  const size = data.size ?? data.byteLength ?? data.length;
  if (size > MAX_BACKUP_SIZE)
    throw Error(`Sauvegarde trop volumineuse : ${formatSize(size)} pour ${formatSize(MAX_BACKUP_SIZE)} maximum.`);
  const { default: JSZip } = await import('jszip');
  let zip;
  try {
    zip = await JSZip.loadAsync(data);
  } catch {
    throw Error('Ce fichier n’est pas une archive ZIP lisible.');
  }
  const index = zip.file(BACKUP_FILE);
  if (!index)
    throw Error('Ce ZIP n’est pas une sauvegarde complète TeXBea. Pour ajouter un seul projet, utilise « Importer ».');
  let meta;
  try {
    meta = JSON.parse(await index.async('string'));
  } catch {
    throw Error('Sauvegarde abîmée : index illisible.');
  }
  if (meta?.format !== 'texbea-backup' || !Array.isArray(meta.projects)) throw Error('Sauvegarde TeXBea non reconnue.');
  if (meta.version > 1) throw Error('Cette sauvegarde vient d’une version plus récente de TeXBea.');
  const cache = new Map();
  const image = async (path) => {
    if (typeof path !== 'string' || path.includes('..')) throw Error('Sauvegarde abîmée : chemin invalide.');
    if (!cache.has(path)) {
      const entry = zip.file(path);
      if (!entry) throw Error('Sauvegarde incomplète : il manque ' + path);
      cache.set(path, await entry.async('base64'));
    }
    return cache.get(path);
  };
  const projects = [];
  for (const m of meta.projects) {
    if (typeof m?.folder !== 'string' || !Array.isArray(m.files)) throw Error('Sauvegarde abîmée.');
    const files = {},
      assets = {};
    for (const n of m.files) {
      const entry = zip.file(`${m.folder}/${n}`);
      if (!entry) throw Error(`Sauvegarde incomplète : ${m.folder}/${n}`);
      files[n] = await entry.async('string');
    }
    for (const [n, path] of Object.entries(m.assets || {})) assets[n] = await image(path);
    const project = validateProject({
      name: m.name,
      main: m.main,
      files,
      assets,
      tags: m.tags,
      archived: m.archived === true,
      fromShare: m.fromShare === true,
    });
    if (isCompiler(m.compiler)) project.compiler = m.compiler;
    const history = [];
    for (const s of Array.isArray(m.history) ? m.history : []) {
      const vAssets = {};
      for (const [n, path] of Object.entries(s.assets || {})) {
        if (!safePath(n)) throw Error('Version invalide.');
        vAssets[n] = await image(path);
        if (!isBase64(vAssets[n])) throw Error('Version invalide.');
      }
      history.push({
        id: String(s.id || crypto.randomUUID()),
        at: String(s.at || meta.createdAt || ''),
        label: String(s.label || 'Version').slice(0, 80),
        main: typeof s.main === 'string' ? s.main : project.main,
        files: checkVersion(s),
        assets: vAssets,
      });
    }
    projects.push({
      ...project,
      id: typeof m.id === 'string' ? m.id : undefined,
      deleted: !!m.deleted,
      comments: cleanComments(m.comments),
      updatedAt: typeof m.updatedAt === 'string' ? m.updatedAt : undefined,
      history: history.slice(-20),
    });
  }
  return { createdAt: meta.createdAt, projects };
}

// Days after which a backup is called old when projects changed since.
const STALE_DAYS = 7;

export function backupReminder(lastBackup, projects, now = Date.now()) {
  const changed = projects.some((p) => !p.deleted && Date.parse(p.updatedAt || 0) > Date.parse(lastBackup || 0));
  if (!changed) return null;
  if (!lastBackup) return 'Aucune sauvegarde complète pour l’instant.';
  const days = Math.floor((now - Date.parse(lastBackup)) / 86_400_000);
  return days >= STALE_DAYS ? `Dernière sauvegarde il y a ${days} jours, des projets ont changé depuis.` : null;
}
