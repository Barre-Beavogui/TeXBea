import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { handle } from '../functions/_lib/app.js';
import { fakeD1 } from './d1-shim.js';
import { cloudClient, syncOnce, plan, splitChunks, joinChunks, gzip, gunzip } from '../src/cloud-sync.js';
import { localStore } from '../src/browser-store.js';

globalThis.localStorage ||= { getItem: () => null, setItem() {}, removeItem() {} };
const { demoApi, useStore } = await import('../src/demo-api.js');
const memory = () => {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
};
const ORIGIN = 'https://texbea.test';

const touch = (d, id) =>
  d.call(`/projects/${id}/files/main.tex`, 'PUT', {
    content: '\\documentclass{article}\\begin{document}start\\end{document}',
  });

async function world() {
  const env = { DB: fakeD1(), EMAIL: { send: async (m) => (env.last = m) }, AUTH_SECRET: 's' };
  const jar = {};
  const bridge = async (path, init = {}) => {
    const headers = { ...init.headers };
    const cookie = Object.entries(jar)
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
    if (cookie) headers.cookie = cookie;
    const res = await handle(new Request(ORIGIN + path, { ...init, headers }), env);
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(';');
      const i = pair.indexOf('=');
      jar[pair.slice(0, i)] = pair.slice(i + 1);
    }
    return res;
  };
  const cloud = cloudClient(bridge);
  await cloud.requestCode('me@example.com');
  await cloud.verifyCode('me@example.com', env.last.text.match(/\d{6}/)[0]);
  const device = () => {
    const storage = memory();
    const store = localStore(storage);
    const local = (p, o) => (useStore(store), demoApi(p, o));
    const call = (p, method = 'GET', body) => local(p, { method, body: body && JSON.stringify(body) });
    return { storage, local, call, sync: (skip) => syncOnce({ local, cloud, email: 'me@example.com', skip, storage }) };
  };
  return { env, cloud, device };
}

test('plan: the decision table', () => {
  const l = (id, updatedAt) => ({ id, updatedAt });
  const r = (id, version, extra = {}) => ({ id, version, updatedAt: 'x', removed: false, ...extra });
  const types = (local, remote, state) => plan(local, remote, state).map((a) => a.type);
  assert.deepEqual(types([l('a', '1')], [], {}), ['upload']);
  assert.deepEqual(types([{ ...l('a', '1'), pristine: true }], [], {}), []);
  assert.deepEqual(types([], [r('a', 1)], {}), ['download']);
  assert.deepEqual(types([], [r('a', 1)], { a: { version: 1, updatedAt: '1' } }), ['remove-remote']);
  assert.deepEqual(types([], [r('a', 2)], { a: { version: 1, updatedAt: '1' } }), ['download']);
  assert.deepEqual(types([l('a', '1')], [r('a', 1)], { a: { version: 1, updatedAt: '1' } }), []);
  assert.deepEqual(types([l('a', '2')], [r('a', 1)], { a: { version: 1, updatedAt: '1' } }), ['upload']);
  assert.deepEqual(types([l('a', '1')], [r('a', 2)], { a: { version: 1, updatedAt: '1' } }), ['download']);
  assert.deepEqual(types([l('a', '2')], [r('a', 2)], { a: { version: 1, updatedAt: '1' } }), ['conflict']);
  assert.deepEqual(types([l('a', 'x')], [r('a', 3)], {}), ['adopt']);
  assert.deepEqual(types([l('a', 'y')], [r('a', 3)], {}), ['conflict']);
  assert.deepEqual(types([l('a', '1')], [r('a', 2, { removed: true })], { a: { version: 1, updatedAt: '1' } }), [
    'remove-local',
  ]);
  assert.deepEqual(types([l('a', '2')], [r('a', 2, { removed: true })], { a: { version: 1, updatedAt: '1' } }), [
    'upload',
  ]);
  assert.deepEqual(types([], [r('a', 2, { removed: true })], { a: { version: 1, updatedAt: '1' } }), ['forget']);
  assert.deepEqual(types([l('a', '1')], [], { a: { version: 1, updatedAt: '1' } }), ['upload']);
});
test('gzip and chunk helpers round trip', async () => {
  const text = 'é'.repeat(10_000) + 'LaTeX';
  assert.equal(await gunzip(await gzip(text)), text);
  const bytes = randomBytes(2500);
  const parts = splitChunks(bytes, 1000);
  assert.deepEqual(
    parts.map((p) => p.length),
    [1000, 1000, 500],
  );
  assert.deepEqual(joinChunks(parts), new Uint8Array(bytes));
});
test('two devices: upload, download, edit, delete follow each other', async () => {
  const { device } = await world();
  const A = device(),
    B = device();
  const [{ id }] = await A.call('/projects');
  await A.call(`/projects/${id}/files/main.tex`, 'PUT', {
    content: '\\documentclass{article}\\begin{document}A\\end{document}',
  });
  let r = await A.sync();
  assert.deepEqual([r.uploaded, r.errors.length], [1, 0]);
  r = await B.sync();
  assert.equal(r.downloaded, 1);
  assert.match((await B.call('/projects/' + id)).files['main.tex'], /A\\end/);
  // Nothing to do when nothing changed.
  r = await B.sync();
  assert.deepEqual([r.uploaded, r.downloaded, r.removed], [0, 0, 0]);
  // B edits, A receives.
  await B.call(`/projects/${id}/files/main.tex`, 'PUT', {
    content: '\\documentclass{article}\\begin{document}B\\end{document}',
  });
  await B.sync();
  r = await A.sync();
  assert.equal(r.downloaded, 1);
  assert.match((await A.call('/projects/' + id)).files['main.tex'], /B\\end/);
  // The date is the one of the edit, not the time of the download.
  assert.equal(
    (await A.call('/projects')).find((p) => p.id === id).updatedAt,
    (await B.call('/projects')).find((p) => p.id === id).updatedAt,
  );
  // Trash travels as a flag, permanent deletion as a removal.
  await B.call(`/projects/${id}`, 'PUT', { deleted: true });
  await B.sync();
  await A.sync();
  assert.equal((await A.call('/projects')).find((p) => p.id === id).deleted, true);
  await B.call(`/projects/${id}`, 'DELETE');
  r = await B.sync();
  assert.equal(r.removed, 1);
  r = await A.sync();
  assert.equal(r.removed, 1);
  assert.equal(
    (await A.call('/projects')).some((p) => p.id === id),
    false,
  );
});
test('conflict: both versions survive on both devices', async () => {
  const { device } = await world();
  const A = device(),
    B = device();
  const [{ id }] = await A.call('/projects');
  await touch(A, id);
  await A.sync();
  await B.sync();
  const write = (d, text) =>
    d.call(`/projects/${id}/files/main.tex`, 'PUT', {
      content: `\\documentclass{article}\\begin{document}${text}\\end{document}`,
    });
  await write(A, 'FROM-A');
  await new Promise((r) => setTimeout(r, 5));
  await write(B, 'FROM-B');
  await A.sync();
  const r = await B.sync();
  assert.equal(r.conflicts, 1);
  const list = (await B.call('/projects')).filter((p) => !p.pristine);
  assert.equal(list.length, 2);
  const copy = list.find((p) => p.id !== id);
  assert.match(copy.name, /\(version cloud\)$/);
  assert.match((await B.call('/projects/' + copy.id)).files['main.tex'], /FROM-A/);
  assert.match((await B.call('/projects/' + id)).files['main.tex'], /FROM-B/);
  // The next passes spread both everywhere.
  await B.sync();
  await A.sync();
  await B.sync();
  const aList = await A.call('/projects');
  assert.equal(aList.length, 2);
  assert.match((await A.call('/projects/' + id)).files['main.tex'], /FROM-B/);
  assert.match((await A.call('/projects/' + copy.id)).files['main.tex'], /FROM-A/);
});
test('the project open in the editor is not overwritten, and comes in later', async () => {
  const { device } = await world();
  const A = device(),
    B = device();
  const [{ id }] = await A.call('/projects');
  await touch(A, id);
  await A.sync();
  await B.sync();
  await A.call(`/projects/${id}/files/main.tex`, 'PUT', {
    content: '\\documentclass{article}\\begin{document}NEW\\end{document}',
  });
  await A.sync();
  let r = await B.sync(new Set([id]));
  assert.equal(r.downloaded, 0);
  assert.doesNotMatch((await B.call('/projects/' + id)).files['main.tex'], /NEW/);
  r = await B.sync();
  assert.equal(r.downloaded, 1);
  assert.match((await B.call('/projects/' + id)).files['main.tex'], /NEW/);
});
test('a project bigger than one chunk goes through intact', async () => {
  const { device } = await world();
  const A = device(),
    B = device();
  const [{ id }] = await A.call('/projects');
  const image = randomBytes(2_400_000).toString('base64'); // does not compress: several 900 KB chunks
  await A.call(`/projects/${id}/files`, 'POST', { name: 'fig.png', content: image, binary: true });
  await A.sync();
  await B.sync();
  assert.equal((await B.call('/projects/' + id)).assets['fig.png'], image);
});
test('first sign-in on a device that already holds the same project adopts it without copies', async () => {
  const { device } = await world();
  const A = device();
  const [{ id }] = await A.call('/projects');
  await touch(A, id);
  await A.sync();
  A.storage.removeItem('texbea-cloud:me@example.com');
  const r = await A.sync();
  assert.deepEqual([r.uploaded, r.downloaded, r.conflicts], [0, 0, 0]);
  assert.equal((await A.call('/projects')).length, 1);
  assert.ok(id);
});
test('a failing cloud never touches local projects', async () => {
  const { device, cloud } = await world();
  const A = device();
  const [{ id }] = await A.call('/projects');
  const broken = {
    ...cloud,
    index: async () => Promise.reject(Object.assign(new Error('Pas de connexion.'), { status: 0 })),
  };
  await assert.rejects(
    syncOnce({ local: A.local, cloud: broken, email: 'me@example.com', storage: A.storage }),
    /connexion/,
  );
  assert.equal((await A.call('/projects'))[0].id, id);
});
