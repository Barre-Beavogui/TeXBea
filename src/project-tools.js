import { isCompiler } from './compilers.js';
export { templates, templateGroups, templateProject, accents } from './templates.js';
// Size limits, shared by the browser and the server. Sizes count characters: images are stored as Base64 (4/3 of the bytes).
export const MAX_PROJECT_SIZE = 250_000_000;
export const MAX_FILE_SIZE = 100_000_000;
export const MAX_FILES = 2000;
export const MAX_ARCHIVE_SIZE = 250_000_000;
export function formatSize(n) {
  if (n < 1000) return n + ' o';
  if (n < 1_000_000) return Math.round(n / 1000) + ' Ko';
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1).replace('.', ',') + ' Go';
  return (n / 1_000_000).toFixed(n < 10_000_000 ? 1 : 0).replace('.', ',') + ' Mo';
}
// Linear check: a grouped regex overflows the stack on images of a few megabytes.
export function isBase64(s) {
  return typeof s === 'string' && s.length % 4 === 0 && /^[A-Za-z0-9+/]*={0,2}$/.test(s);
}
export function safePath(name) {
  return (
    typeof name === 'string' &&
    name.length <= 180 &&
    /^[\p{L}\p{N}_.\- /]+$/u.test(name) &&
    name
      .split('/')
      .every(
        (p) =>
          p && p !== '.' && p !== '..' && !p.startsWith('.') && !['__proto__', 'constructor', 'prototype'].includes(p),
      )
  );
}
export function validateProject(input) {
  if (!input || typeof input !== 'object' || !input.files || Array.isArray(input.files))
    throw Error('Projet invalide.');
  let size = 0;
  const files = {},
    assets = {};
  for (const [name, content] of Object.entries(input.files)) {
    if (!safePath(name) || typeof content !== 'string') throw Error('Fichier source invalide : ' + name);
    size += content.length;
    files[name] = content;
  }
  for (const [name, content] of Object.entries(input.assets || {})) {
    if (!safePath(name) || name in files || !isBase64(content)) throw Error('Image invalide : ' + name);
    size += content.length;
    assets[name] = content;
  }
  if (Object.keys(files).length + Object.keys(assets).length > MAX_FILES)
    throw Error(`Projet trop volumineux : ${MAX_FILES} fichiers maximum.`);
  if (size > MAX_PROJECT_SIZE)
    throw Error(`Projet trop volumineux : ${formatSize(size)} pour ${formatSize(MAX_PROJECT_SIZE)} maximum.`);
  const main =
    input.main ||
    Object.keys(files).find((n) => n.endsWith('main.tex')) ||
    Object.keys(files).find((n) => /\\documentclass/.test(files[n]));
  if (!main || typeof files[main] !== 'string' || !main.endsWith('.tex'))
    throw Error('Aucun fichier principal .tex valide.');
  const project = { name: String(input.name || 'Projet importé').slice(0, 80), main, files, assets };
  if (isCompiler(input.compiler)) project.compiler = input.compiler;
  return project;
}
export function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
export async function exportProject(project) {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  for (const [n, c] of Object.entries(project.files)) zip.file(n, c);
  for (const [n, c] of Object.entries(project.assets || {})) zip.file(n, c, { base64: true });
  zip.file(
    '.texbea/project.json',
    JSON.stringify({ name: project.name, main: project.main, compiler: project.compiler || 'pdflatex' }, null, 2),
  );
  downloadBlob(
    await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' }),
    project.name.replace(/[^\p{L}\p{N}_-]/gu, '_') + '.zip',
  );
}
export async function importProject(file) {
  if (file.size > MAX_ARCHIVE_SIZE)
    throw Error(`Archive trop volumineuse : ${formatSize(file.size)} pour ${formatSize(MAX_ARCHIVE_SIZE)} maximum.`);
  if (file.name.toLowerCase().endsWith('.tex'))
    return validateProject({
      name: file.name.replace(/\.tex$/i, ''),
      main: file.name,
      files: { [file.name]: await file.text() },
    });
  if (!file.name.toLowerCase().endsWith('.zip')) throw Error('Choisis un fichier .tex ou .zip.');
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(file);
  const files = {},
    assets = {};
  let size = 0,
    metadata = {};
  const entries = Object.values(zip.files).filter((e) => !e.dir);
  const useful = entries.filter(
    (e) => !e.name.startsWith('__MACOSX/') && !/(?:^|\/)\.DS_Store$/.test(e.name) && e.name !== '.texbea/project.json',
  );
  const prefix = useful.length && useful[0].name.includes('/') ? useful[0].name.split('/')[0] + '/' : '';
  const strip = prefix && useful.every((e) => e.name.startsWith(prefix)) ? prefix : '';
  if (entries.length > MAX_FILES * 5 || useful.length > MAX_FILES)
    throw Error(`Archive trop grande (${MAX_FILES} fichiers maximum).`);
  for (const entry of entries) {
    const original = entry.name;
    const unstrip = (n) => (strip && n.startsWith(strip) ? n.slice(strip.length) : n);
    const name = unstrip(original),
      unsafe = unstrip(entry.unsafeOriginalName || original);
    if (original.startsWith('__MACOSX/') || /(?:^|\/)\.DS_Store$/.test(name)) continue;
    if (unsafe !== '.texbea/project.json' && !safePath(unsafe)) throw Error('Chemin non autorisé : ' + unsafe);
    if (name === '.texbea/project.json') {
      if ((entry._data?.uncompressedSize || 0) > 20000) throw Error('Métadonnées trop volumineuses.');
      metadata = JSON.parse(await entry.async('string'));
      continue;
    }
    if (!safePath(name)) throw Error('Chemin non autorisé : ' + name);
    if ((entry._data?.uncompressedSize || 0) > MAX_FILE_SIZE)
      throw Error(`Fichier trop volumineux : ${name} (${formatSize(MAX_FILE_SIZE)} maximum par fichier).`);
    if (/\.(tex|bib|sty|cls|txt|csv|bst|md)$/i.test(name)) {
      files[name] = await entry.async('string');
      size += files[name].length;
    } else if (/\.(png|jpe?g|pdf)$/i.test(name)) {
      assets[name] = await entry.async('base64');
      size += assets[name].length;
    } else if (/(?:^|\/)\.DS_Store$/.test(name)) continue;
    else throw Error('Format non pris en charge : ' + name + ' (sources texte, PNG, JPG et PDF acceptés).');
    if (size > MAX_PROJECT_SIZE)
      throw Error(`Projet trop volumineux : plus de ${formatSize(MAX_PROJECT_SIZE)} une fois décompressé.`);
  }
  return validateProject({
    name: metadata.name || file.name.replace(/\.zip$/i, ''),
    main: strip && metadata.main?.startsWith(strip) ? metadata.main.slice(strip.length) : metadata.main,
    compiler: metadata.compiler,
    files,
    assets,
  });
}
// Builds a project from what the user picked: one .zip archive, or loose sources and images (a .tex with its .bib and figures).
export async function importFiles(list, name = '') {
  const files = [...list];
  if (!files.length) throw Error('Choisis une archive .zip ou au moins un fichier .tex.');
  let project;
  if (files.length === 1 && /\.(zip|tex)$/i.test(files[0].name)) project = await importProject(files[0]);
  else {
    if (files.some((f) => /\.zip$/i.test(f.name))) throw Error('Une archive .zip s’importe seule.');
    const sources = {},
      assets = {};
    let size = 0;
    for (const file of files) {
      if (!safePath(file.name)) throw Error('Nom de fichier non autorisé : ' + file.name);
      checkFileSize(file);
      size += file.size;
      if (size > MAX_ARCHIVE_SIZE)
        throw Error(`Fichiers trop volumineux : ${formatSize(MAX_ARCHIVE_SIZE)} maximum au total.`);
      if (/\.(tex|bib|sty|cls|txt|csv|bst|md)$/i.test(file.name)) sources[file.name] = await file.text();
      else if (/\.(png|jpe?g|pdf)$/i.test(file.name)) assets[file.name] = await fileToBase64(file);
      else throw Error('Format non pris en charge : ' + file.name + ' (sources texte, PNG, JPG et PDF acceptés).');
    }
    const main =
      Object.keys(sources).find((n) => n.endsWith('.tex') && /\\documentclass/.test(sources[n])) ||
      Object.keys(sources).find((n) => n.endsWith('.tex'));
    if (!main) throw Error('Ajoute au moins un fichier .tex.');
    project = validateProject({ name: main.replace(/\.tex$/i, ''), main, files: sources, assets });
  }
  if (name) project.name = name.slice(0, 80);
  return project;
}
export function checkFileSize(file) {
  // Base64 makes an image 4/3 bigger once stored.
  const stored = /\.(png|jpe?g|pdf)$/i.test(file.name) ? Math.ceil(file.size / 3) * 4 : file.size;
  if (stored > MAX_FILE_SIZE)
    throw Error(
      `Fichier trop volumineux : ${file.name} (${formatSize(file.size)}, ${formatSize((MAX_FILE_SIZE / 4) * 3)} maximum par fichier).`,
    );
}
// Base64 of a file without building a giant intermediate string: FileReader in the browser, Buffer in Node.
export async function fileToBase64(file) {
  if (typeof FileReader !== 'undefined')
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).slice(String(reader.result).indexOf(',') + 1));
      reader.onerror = () => reject(Error('Lecture impossible : ' + file.name));
      reader.readAsDataURL(file);
    });
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
  let text = '';
  for (let i = 0; i < bytes.length; i += 8192) text += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(text);
}
// Renames a source or an image, keeping the main file pointer; used by the browser and the server APIs.
export function renameFile(project, from, to) {
  if (!safePath(to)) throw Error('Nom de fichier invalide : ' + to);
  const assets = project.assets || {};
  if (!(from in project.files) && !(from in assets)) throw Error('Fichier introuvable : ' + from);
  if (from === to) return project;
  if (to in project.files || to in assets) throw Error('Ce fichier existe déjà : ' + to);
  const isText = from in project.files;
  if (from === project.main && !to.endsWith('.tex')) throw Error('Le fichier principal doit rester un fichier .tex.');
  if (isText && /\.(png|jpe?g|pdf)$/i.test(to)) throw Error('Une source texte ne peut pas devenir une image.');
  if (!isText && !/\.(png|jpe?g|pdf)$/i.test(to)) throw Error('Une image doit garder une extension PNG, JPG ou PDF.');
  const move = (record) => Object.fromEntries(Object.entries(record).map(([k, v]) => [k === from ? to : k, v]));
  return {
    ...project,
    files: isText ? move(project.files) : project.files,
    assets: isText ? assets : move(assets),
    main: project.main === from ? to : project.main,
  };
}
