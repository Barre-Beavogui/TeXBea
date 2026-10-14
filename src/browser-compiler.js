import { safePath } from './project-tools.js';
// SwiftLaTeX runs pdfTeX in an isolated Web Worker; document contents stay local.
let worker;
let pending;
let ready;
let busy = false;
function stop() {
  worker?.terminate();
  worker = undefined;
  ready = undefined;
  pending = undefined;
}
function waitFor(test, action, timeout = 180000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      stop();
      reject(new Error('Compilation interrompue après 3 minutes. Vérifie ta connexion et réessaie.'));
    }, timeout);
    pending = {
      test,
      resolve: (value) => {
        clearTimeout(timer);
        pending = undefined;
        resolve(value);
      },
      reject: (error) => {
        clearTimeout(timer);
        pending = undefined;
        reject(error);
      },
    };
    action?.();
  });
}
async function load() {
  if (ready) return ready;
  worker = new Worker(`${import.meta.env.BASE_URL}latex/swiftlatexpdftex.js`);
  ready = waitFor((data) => !data.cmd && data.result === 'ok', undefined, 45000);
  worker.onmessage = ({ data }) => {
    if (pending?.test(data)) pending.resolve(data);
  };
  worker.onerror = (event) => {
    pending?.reject(
      new Error(
        event.message ? 'Le moteur LaTeX s’est arrêté : ' + event.message : 'Impossible de charger le moteur LaTeX.',
      ),
    );
    stop();
  };
  await ready;
}
async function command(cmd, extra = {}) {
  const result = await waitFor(
    (data) => data.cmd === cmd,
    () => worker.postMessage({ cmd, ...extra }),
  );
  if (result.result !== 'ok') throw new Error('Impossible de préparer les fichiers LaTeX.');
}
export async function compileInBrowser(project, onProgress = () => {}) {
  if (busy) throw new Error('Une compilation est déjà en cours.');
  busy = true;
  try {
    onProgress('Chargement du moteur LaTeX…');
    await load();
    worker.postMessage({ cmd: 'flushcache' });
    const folders = new Set();
    const contentFiles = { ...project.files };
    for (const [name, encoded] of Object.entries(project.assets || {}))
      contentFiles[name] = Uint8Array.from(atob(encoded), (x) => x.charCodeAt(0));
    for (const [name, content] of Object.entries(contentFiles)) {
      if (!safePath(name)) {
        throw new Error('Nom de fichier invalide : ' + name);
      }
      const parts = name.split('/');
      for (let i = 1; i < parts.length; i++) {
        const dir = parts.slice(0, i).join('/');
        if (!folders.has(dir)) {
          await command('mkdir', { url: dir });
          folders.add(dir);
        }
      }
      await command('writefile', { url: name, src: content });
    }
    let entry = project.main;
    if (entry.includes('/')) {
      let n = 0;
      entry = 'texbea-entry.tex';
      while (entry in contentFiles) entry = `texbea-entry-${++n}.tex`;
      await command('writefile', { url: entry, src: `\\input{${project.main}}` });
    }
    worker.postMessage({ cmd: 'setmainfile', url: entry });
    let result;
    const passes = Object.values(project.files).some((text) => /\\bibliography\{/.test(text)) ? 3 : 2;
    for (let pass = 1; pass <= passes; pass++) {
      onProgress(pass === 1 ? 'Compilation et téléchargement des paquets…' : 'Résolution des références…');
      result = await waitFor(
        (data) => data.cmd === 'compile',
        () => worker.postMessage({ cmd: 'compilelatex' }),
      );
      if (result.result !== 'ok' || !result.pdf) {
        throw Object.assign(new Error('Compilation LaTeX échouée. Consulte le journal.'), {
          data: { log: result.log || 'Le moteur n’a pas produit de PDF.' },
        });
      }
    }
    return { url: URL.createObjectURL(new Blob([result.pdf], { type: 'application/pdf' })), log: result.log };
  } catch (error) {
    stop();
    throw error;
  } finally {
    busy = false;
  }
}
