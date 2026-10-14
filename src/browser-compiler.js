import { safePath } from './project-tools.js';
// SwiftLaTeX runs pdfTeX / XeTeX and dvipdfmx in isolated Web Workers; document contents stay local.
class Engine {
  constructor(script) {
    this.script = script;
  }
  stop() {
    this.worker?.terminate();
    this.worker = undefined;
    this.ready = undefined;
    this.pending = undefined;
  }
  waitFor(test, action, timeout = 180000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.stop();
        reject(new Error('Compilation interrompue après 3 minutes. Vérifie ta connexion et réessaie.'));
      }, timeout);
      this.pending = {
        test,
        resolve: (value) => {
          clearTimeout(timer);
          this.pending = undefined;
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          this.pending = undefined;
          reject(error);
        },
      };
      action?.();
    });
  }
  async load() {
    if (this.ready) return this.ready;
    this.worker = new Worker(`${import.meta.env.BASE_URL}latex/${this.script}`);
    this.ready = this.waitFor((data) => !data.cmd && data.result === 'ok', undefined, 60000);
    this.worker.onmessage = ({ data }) => {
      if (this.pending?.test(data)) this.pending.resolve(data);
    };
    this.worker.onerror = (event) => {
      this.pending?.reject(
        new Error(
          event.message ? 'Le moteur LaTeX s’est arrêté : ' + event.message : 'Impossible de charger le moteur LaTeX.',
        ),
      );
      this.stop();
    };
    await this.ready;
  }
  async command(cmd, extra = {}) {
    const result = await this.waitFor(
      (data) => data.cmd === cmd,
      () => this.worker.postMessage({ cmd, ...extra }),
    );
    if (result.result !== 'ok') throw new Error('Impossible de préparer les fichiers LaTeX.');
  }
  run(cmd) {
    return this.waitFor(
      (data) => data.cmd === 'compile',
      () => this.worker.postMessage({ cmd }),
    );
  }
  // Writes every file (creating folders) into the engine's working directory.
  async writeFiles(contentFiles) {
    const folders = new Set();
    for (const [name, content] of Object.entries(contentFiles)) {
      if (!safePath(name)) throw new Error('Nom de fichier invalide : ' + name);
      const parts = name.split('/');
      for (let i = 1; i < parts.length; i++) {
        const dir = parts.slice(0, i).join('/');
        if (!folders.has(dir)) {
          await this.command('mkdir', { url: dir });
          folders.add(dir);
        }
      }
      await this.command('writefile', { url: name, src: content });
    }
  }
}

const engines = {
  pdflatex: new Engine('swiftlatexpdftex.js'),
  xelatex: new Engine('swiftlatexxetex.js'),
  dvipdfmx: new Engine('swiftlatexdvipdfm.js'),
};
let busy = false,
  current;

// Stops a running compilation (Overleaf's "Stop compilation"); the engine reloads on the next compile.
export function cancelCompile() {
  for (const engine of Object.values(engines)) {
    engine.pending?.reject(new Error('Compilation arrêtée.'));
    engine.stop();
  }
}

const failure = (log, message = 'Compilation LaTeX échouée. Consulte le journal.') =>
  Object.assign(new Error(message), { data: { log: log || 'Le moteur n’a pas produit de PDF.' } });

export async function compileInBrowser(project, onProgress = () => {}, compiler = 'pdflatex') {
  if (busy) throw new Error('Une compilation est déjà en cours.');
  const tex = engines[compiler];
  if (!tex) throw new Error('Ce compilateur nécessite le serveur TeXBea local (latexmk). Choisis pdfLaTeX ou XeLaTeX.');
  busy = true;
  current = tex;
  try {
    onProgress(`Chargement du moteur ${compiler === 'xelatex' ? 'XeLaTeX' : 'pdfLaTeX'}…`);
    await tex.load();
    tex.worker.postMessage({ cmd: 'flushcache' });
    const contentFiles = { ...project.files };
    for (const [name, encoded] of Object.entries(project.assets || {}))
      contentFiles[name] = Uint8Array.from(atob(encoded), (x) => x.charCodeAt(0));
    await tex.writeFiles(contentFiles);
    let entry = project.main;
    if (entry.includes('/')) {
      let n = 0;
      entry = 'texbea-entry.tex';
      while (entry in contentFiles) entry = `texbea-entry-${++n}.tex`;
      await tex.command('writefile', { url: entry, src: `\\input{${project.main}}` });
    }
    tex.worker.postMessage({ cmd: 'setmainfile', url: entry });
    let result;
    const passes = Object.values(project.files).some((text) => /\\bibliography\{/.test(text)) ? 3 : 2;
    for (let pass = 1; pass <= passes; pass++) {
      onProgress(pass === 1 ? 'Compilation et téléchargement des paquets…' : 'Résolution des références…');
      result = await tex.run('compilelatex');
      if (result.result !== 'ok' || !result.pdf) throw failure(result.log);
    }
    let pdf = result.pdf,
      log = result.log;
    if (compiler === 'xelatex') {
      // XeTeX writes an .xdv file; dvipdfmx turns it into the PDF, with the images it references.
      onProgress('Conversion XDV → PDF…');
      const dvi = engines.dvipdfmx;
      await dvi.load();
      dvi.worker.postMessage({ cmd: 'flushcache' });
      const xdv = entry.replace(/\.tex$/, '.xdv');
      await dvi.writeFiles(
        Object.fromEntries(Object.entries(contentFiles).filter(([name]) => !/\.(tex|bib|bst|sty|cls)$/i.test(name))),
      );
      await dvi.command('writefile', { url: xdv, src: new Uint8Array(pdf) });
      dvi.worker.postMessage({ cmd: 'setmainfile', url: xdv });
      const converted = await dvi.run('compilepdf');
      log += '\n\n--- dvipdfmx ---\n' + (converted.log || '');
      if (converted.result !== 'ok' || !converted.pdf) throw failure(log, 'Conversion XDV → PDF échouée.');
      pdf = converted.pdf;
    }
    return { url: URL.createObjectURL(new Blob([pdf], { type: 'application/pdf' })), log };
  } catch (error) {
    current?.stop();
    if (compiler === 'xelatex') engines.dvipdfmx.stop();
    throw error;
  } finally {
    busy = false;
    current = undefined;
  }
}
