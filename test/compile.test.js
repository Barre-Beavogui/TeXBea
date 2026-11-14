import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { safeName, validateJob, command, compile, JobError } from '../compile-service/runner.js';
import { server } from '../compile-service/server.js';
import { handle } from '../functions/_lib/app.js';
import { fakeD1 } from './d1-shim.js';

const hasLatex = (() => {
  try {
    execFileSync('latexmk', ['-v'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();
const job = (over = {}) => ({
  main: 'main.tex',
  compiler: 'pdflatex',
  files: { 'main.tex': '\\documentclass{article}\\begin{document}Bonjour\\end{document}' },
  assets: {},
  ...over,
});

test('file names are confined to the job directory', () => {
  for (const bad of ['/etc/passwd', '../x.tex', 'a/../../x', 'a//b', '-evil.tex', 'a\\b', '', 'x\0.tex'])
    assert.equal(safeName(bad), false, bad);
  for (const ok of ['main.tex', 'chap/un.tex', 'img/logo.png']) assert.equal(safeName(ok), true, ok);
});
test('jobs are validated', () => {
  assert.throws(() => validateJob(job({ compiler: 'rm' })), JobError);
  assert.throws(() => validateJob(job({ main: '../main.tex' })), JobError);
  assert.throws(() => validateJob(job({ main: 'absent.tex' })), JobError);
  assert.throws(() => validateJob(job({ files: { 'main.tex': 'x', '../up.tex': 'y' } })), JobError);
  assert.throws(() => validateJob(job({ files: { 'main.tex': 'x'.repeat(31 * 1024 * 1024) } })), /volumineux/);
  assert.equal(validateJob(job()).main, 'main.tex');
});
test('the job container has no network and tight limits', () => {
  const { cmd, args } = command(validateJob(job()), '/tmp/j', {});
  assert.equal(cmd, 'docker');
  const line = args.join(' ');
  for (const must of [
    '--network none',
    '--read-only',
    '--cap-drop ALL',
    'no-new-privileges',
    '--pids-limit',
    '-u 65534',
  ])
    assert.ok(line.includes(must), must);
  assert.ok(line.includes('-no-shell-escape'));
  assert.equal(command(validateJob(job()), '/tmp/j', { SANDBOX: 'none' }).cmd, 'latexmk');
});
test('compiles for real (no sandbox), reports errors and times out', { skip: !hasLatex }, async () => {
  const env = { SANDBOX: 'none' };
  const ok = await compile(job(), env);
  assert.equal(ok.ok, true);
  assert.equal(Buffer.from(ok.pdf, 'base64').subarray(0, 4).toString(), '%PDF');
  const bad = await compile(
    job({ files: { 'main.tex': '\\documentclass{article}\\begin{document}\\oups\\end{document}' } }),
    env,
  );
  assert.equal(bad.ok, false);
  assert.match(bad.log, /Undefined control sequence/);
  const slow = await compile(
    job({ files: { 'main.tex': '\\documentclass{article}\\begin{document}\\def\\a{\\a}\\a\\end{document}' } }),
    { ...env, JOB_TIMEOUT_MS: '1500' },
  );
  assert.equal(slow.ok, false);
  assert.match(slow.log, /interrompue/);
});

async function withService(fn) {
  process.env.SANDBOX = 'none';
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  try {
    await fn(`http://127.0.0.1:${server.address().port}`);
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
}
test('the service refuses calls without the shared secret', async () => {
  await withService(async (url) => {
    const r = await fetch(url + '/compile', { method: 'POST', body: JSON.stringify(job()) });
    assert.equal(r.status, 401);
    assert.equal((await fetch(url + '/health')).status, 200);
  });
});

const ORIGIN = 'https://texbea.test';
async function signedIn(env) {
  const sent = [];
  env.EMAIL = { send: async (m) => sent.push(m) };
  const call = (method, path, body, cookie) =>
    handle(
      new Request(ORIGIN + path, {
        method,
        headers: { 'x-texbea': '1', 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
        body: body && JSON.stringify(body),
      }),
      env,
    );
  await call('POST', '/api/auth/email/request', { email: 'a@example.com' });
  const res = await call('POST', '/api/auth/email/verify', {
    email: 'a@example.com',
    code: sent[0].text.match(/\d{6}/)[0],
  });
  const cookie = res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
  return (method, path, body) => call(method, path, body, cookie);
}
test('the Pages function needs a session, forwards to the service and hides nothing about errors', async () => {
  const env = { DB: fakeD1(), AUTH_SECRET: 's' };
  const call = await signedIn(env);
  // Not configured: the feature is off.
  assert.equal((await call('POST', '/api/compile', job())).status, 404);
  assert.equal((await (await call('GET', '/api/auth/providers')).json()).compile, false);
  env.COMPILE_URL = 'https://compile.example/';
  env.COMPILE_SECRET = 'x'.repeat(32);
  assert.equal((await (await call('GET', '/api/auth/providers')).json()).compile, true);
  const anon = await handle(
    new Request(ORIGIN + '/api/compile', { method: 'POST', headers: { 'x-texbea': '1' }, body: '{}' }),
    env,
  );
  assert.equal(anon.status, 401);
  const realFetch = globalThis.fetch;
  const seen = [];
  try {
    globalThis.fetch = async (url, init) => {
      seen.push({ url, init });
      return new Response(JSON.stringify({ ok: true, pdf: 'JVBERg==', log: 'ok' }));
    };
    const ok = await call('POST', '/api/compile', { ...job(), evil: 'x', userId: 'y' });
    assert.equal(ok.status, 200);
    assert.equal((await ok.json()).pdf, 'JVBERg==');
    assert.equal(seen[0].url, 'https://compile.example/compile');
    assert.equal(seen[0].init.headers.authorization, 'Bearer ' + 'x'.repeat(32));
    assert.deepEqual(Object.keys(JSON.parse(seen[0].init.body)).sort(), ['assets', 'compiler', 'files', 'main']);
    globalThis.fetch = async () => new Response(JSON.stringify({ ok: false, log: 'Undefined control sequence' }));
    const bad = await call('POST', '/api/compile', job());
    assert.equal(bad.status, 422);
    assert.match((await bad.json()).log, /Undefined/);
    globalThis.fetch = async () => {
      throw new Error('down');
    };
    assert.equal((await call('POST', '/api/compile', job())).status, 503);
  } finally {
    globalThis.fetch = realFetch;
  }
});
