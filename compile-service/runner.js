// Compiles one LaTeX project in a throw-away directory.
// SANDBOX=docker (default): every job runs in its own container with NO network, a read-only root, no capabilities,
// memory / CPU / process limits, and a hard timeout. SANDBOX=none is for local tests only: it runs latexmk directly.
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readFile, rm, readdir, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

export const LIMITS = {
  files: 500,
  totalBytes: 30 * 1024 * 1024,
  pdfBytes: 15 * 1024 * 1024,
  timeoutMs: 60_000,
  logChars: 16_000,
};
const FLAGS = { pdflatex: '-pdf', xelatex: '-xelatex', lualatex: '-lualatex', latex: '-pdfdvi' };

export class JobError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    Object.assign(this, extra);
  }
}

export function safeName(n) {
  return (
    typeof n === 'string' &&
    n.length > 0 &&
    n.length <= 200 &&
    !n.startsWith('/') &&
    !n.includes('\\') &&
    !n.includes('\0') &&
    !n.split('/').some((s) => s === '' || s === '.' || s === '..' || s.startsWith('-'))
  );
}

// Checks the request and returns the clean job; throws JobError(400/413) otherwise.
export function validateJob(body) {
  const files = body?.files && typeof body.files === 'object' ? Object.entries(body.files) : [];
  const assets = body?.assets && typeof body.assets === 'object' ? Object.entries(body.assets) : [];
  if (!FLAGS[body?.compiler]) throw new JobError(400, 'Compilateur inconnu.');
  if (!safeName(body?.main) || !/\.tex$/i.test(body.main)) throw new JobError(400, 'Fichier principal invalide.');
  if (files.length + assets.length > LIMITS.files) throw new JobError(413, 'Trop de fichiers.');
  let total = 0;
  const out = { main: body.main, compiler: body.compiler, files: [], assets: [] };
  for (const [name, content] of files) {
    if (!safeName(name) || typeof content !== 'string') throw new JobError(400, `Fichier invalide : ${name}`);
    total += content.length;
    out.files.push([name, content]);
  }
  for (const [name, b64] of assets) {
    if (!safeName(name) || typeof b64 !== 'string') throw new JobError(400, `Image invalide : ${name}`);
    total += (b64.length * 3) / 4;
    out.assets.push([name, b64]);
  }
  if (total > LIMITS.totalBytes) throw new JobError(413, 'Projet trop volumineux pour la compilation en ligne.');
  if (!out.files.some(([n]) => n === out.main)) throw new JobError(400, 'Fichier principal absent du projet.');
  return out;
}

export function command(job, dir, env = process.env) {
  const latexmk = [
    FLAGS[job.compiler],
    '-interaction=nonstopmode',
    '-halt-on-error',
    '-no-shell-escape',
    '-file-line-error',
    job.main,
  ];
  if ((env.SANDBOX || 'docker') === 'none') return { cmd: env.LATEX_ENGINE || 'latexmk', args: latexmk };
  return {
    cmd: 'docker',
    args: [
      'run',
      '--rm',
      '--network',
      'none',
      '--read-only',
      '--tmpfs',
      '/tmp:rw,size=128m',
      '--cap-drop',
      'ALL',
      '--security-opt',
      'no-new-privileges',
      '--memory',
      env.JOB_MEMORY || '1g',
      '--memory-swap',
      env.JOB_MEMORY || '1g',
      '--cpus',
      env.JOB_CPUS || '1',
      '--pids-limit',
      '256',
      '--ulimit',
      'fsize=134217728',
      '-u',
      '65534:65534',
      '-e',
      'HOME=/tmp',
      '-e',
      'openout_any=p',
      '-e',
      'openin_any=a',
      '-v',
      `${dir}:/work:rw`,
      '-w',
      '/work',
      env.TEX_IMAGE || 'texbea-tex',
      'latexmk',
      ...latexmk,
    ],
  };
}

function run({ cmd, args }, cwd, timeoutMs) {
  return new Promise((resolve) => {
    const cp = spawn(cmd, args, {
      cwd,
      env: { ...process.env, openout_any: 'p', openin_any: 'a' },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
    });
    let out = '';
    const add = (d) => {
      out += d;
      if (out.length > 400_000) out = out.slice(-200_000);
    };
    cp.stdout.on('data', add);
    cp.stderr.on('data', add);
    const timer = setTimeout(() => {
      try {
        process.kill(-cp.pid, 'SIGKILL'); // the whole group: latexmk and the engine it started
      } catch {
        cp.kill('SIGKILL');
      }
      resolve({ code: 124, out: out + `\nCompilation interrompue après ${Math.round(timeoutMs / 1000)} s.` });
    }, timeoutMs);
    cp.on('error', (e) => {
      clearTimeout(timer);
      resolve({ code: 127, out: String(e) });
    });
    cp.on('exit', (code) => {
      clearTimeout(timer);
      resolve({ code, out });
    });
  });
}

export async function compile(body, env = process.env) {
  const job = validateJob(body);
  const dir = await mkdtemp(path.join(env.JOBS_DIR || tmpdir(), 'texbea-job-'));
  try {
    await chmod(dir, 0o777); // the container runs as an unprivileged user
    for (const [name, content] of job.files) {
      await mkdir(path.dirname(path.join(dir, name)), { recursive: true });
      await writeFile(path.join(dir, name), content);
    }
    for (const [name, b64] of job.assets) {
      await mkdir(path.dirname(path.join(dir, name)), { recursive: true });
      await writeFile(path.join(dir, name), Buffer.from(b64, 'base64'));
    }
    // Sub-directories must be writable too (auxiliary files are written next to the sources).
    await openUp(dir);
    const result = await run(command(job, dir, env), dir, Number(env.JOB_TIMEOUT_MS) || LIMITS.timeoutMs);
    const log = result.out.slice(-LIMITS.logChars);
    const pdfPath = path.join(dir, job.main.replace(/\.tex$/i, '') + '.pdf');
    let pdf = null;
    try {
      pdf = await readFile(pdfPath);
    } catch {
      /* no PDF */
    }
    if (result.code !== 0 || !pdf) return { ok: false, log };
    if (pdf.length > LIMITS.pdfBytes) throw new JobError(413, 'Le PDF produit est trop gros.');
    return { ok: true, pdf: pdf.toString('base64'), log };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function openUp(dir) {
  for (const e of await readdir(dir, { withFileTypes: true }))
    if (e.isDirectory()) {
      await chmod(path.join(dir, e.name), 0o777);
      await openUp(path.join(dir, e.name));
    }
}
