import { isCompiler } from './compilers.js';
export { templates, templateGroups, templateProject, accents } from './templates.js';
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
    if (
      !safePath(name) ||
      typeof content !== 'string' ||
      name in files ||
      !/^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(content)
    )
      throw Error('Image invalide : ' + name);
    size += content.length;
    assets[name] = content;
  }
  if (Object.keys(files).length + Object.keys(assets).length > 200 || size > 3_000_000)
    throw Error('Projet trop volumineux : limite de 3 Mo et 200 fichiers pour le stockage navigateur.');
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
  if (file.size > 8_000_000) throw Error('Archive trop volumineuse (8 Mo maximum).');
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
  if (entries.length > 1000 || useful.length > 200) throw Error('Archive trop grande (200 fichiers maximum).');
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
    if ((entry._data?.uncompressedSize || 0) > 3_000_000) throw Error('Fichier trop volumineux : ' + name);
    if (/\.(tex|bib|sty|cls|txt|csv|bst|md)$/i.test(name)) {
      files[name] = await entry.async('string');
      size += files[name].length;
    } else if (/\.(png|jpe?g|pdf)$/i.test(name)) {
      assets[name] = await entry.async('base64');
      size += assets[name].length;
    } else if (/(?:^|\/)\.DS_Store$/.test(name)) continue;
    else throw Error('Format non pris en charge : ' + name + ' (sources texte, PNG, JPG et PDF acceptés).');
    if (size > 3_000_000) throw Error('Projet trop volumineux pour le stockage navigateur.');
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
      size += file.size;
      if (/\.(tex|bib|sty|cls|txt|csv|bst|md)$/i.test(file.name)) sources[file.name] = await file.text();
      else if (/\.(png|jpe?g|pdf)$/i.test(file.name)) assets[file.name] = await base64(file);
      else throw Error('Format non pris en charge : ' + file.name + ' (sources texte, PNG, JPG et PDF acceptés).');
    }
    if (size > 8_000_000) throw Error('Fichiers trop volumineux (8 Mo maximum).');
    const main =
      Object.keys(sources).find((n) => n.endsWith('.tex') && /\\documentclass/.test(sources[n])) ||
      Object.keys(sources).find((n) => n.endsWith('.tex'));
    if (!main) throw Error('Ajoute au moins un fichier .tex.');
    project = validateProject({ name: main.replace(/\.tex$/i, ''), main, files: sources, assets });
  }
  if (name) project.name = name.slice(0, 80);
  return project;
}
async function base64(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
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
