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
      resolve: value => { clearTimeout(timer); pending = undefined; resolve(value); },
      reject: error => { clearTimeout(timer); pending = undefined; reject(error); }
    };
    action?.();
  });
}
async function load() {
  if (ready) return ready;
  worker = new Worker('/latex/swiftlatexpdftex.js');
  ready = waitFor(data => !data.cmd && data.result === 'ok', undefined, 45000);
  worker.onmessage = ({data}) => {
    if (pending?.test(data)) pending.resolve(data);
  };
  worker.onerror = event => {
    pending?.reject(new Error(event.message || 'Impossible de charger le moteur LaTeX.'));
    stop();
  };
  await ready;
}
async function command(cmd, extra = {}) {
  const result = await waitFor(data => data.cmd === cmd, () => worker.postMessage({cmd, ...extra}));
  if (result.result !== 'ok') throw new Error('Impossible de préparer les fichiers LaTeX.');
}
export async function compileInBrowser(project, onProgress = () => {}) {
  if (busy) throw new Error('Une compilation est déjà en cours.');
  busy = true;
  try {
    onProgress('Chargement du moteur LaTeX…');
    await load();
    worker.postMessage({cmd: 'flushcache'});
    for (const [name, content] of Object.entries(project.files)) {
      if (!/^[\w.\- ]{1,120}$/.test(name) || name.includes('..') || name.startsWith('.')) {
        throw new Error('Nom de fichier invalide : ' + name);
      }
      await command('writefile', {url: name, src: content});
    }
    worker.postMessage({cmd: 'setmainfile', url: project.main});
    let result;
    for (let pass = 1; pass <= 2; pass++) {
      onProgress(pass === 1 ? 'Compilation et téléchargement des paquets…' : 'Résolution des références…');
      result = await waitFor(data => data.cmd === 'compile', () => worker.postMessage({cmd: 'compilelatex'}));
      if (result.result !== 'ok' || !result.pdf) {
        throw Object.assign(new Error('Compilation LaTeX échouée. Consulte le journal.'), {data: {log: result.log || 'Le moteur n’a pas produit de PDF.'}});
      }
    }
    return {url: URL.createObjectURL(new Blob([result.pdf], {type: 'application/pdf'})), log: result.log};
  } catch (error) {
    stop();
    throw error;
  } finally {
    busy = false;
  }
}
