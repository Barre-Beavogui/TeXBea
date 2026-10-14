import test, {beforeEach} from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
};
const {demoApi} = await import('../src/demo-api.js');
const call = (path, method = 'GET', body) => demoApi(path, {method, body: body && JSON.stringify(body)});

beforeEach(() => store.clear());

test('premier lancement : un projet par défaut', async () => {
  const list = await call('/projects');
  assert.equal(list.length, 1);
  assert.equal(list[0].main, 'main.tex');
});

test('création depuis un modèle, fichiers et fichier principal', async () => {
  const p = await call('/projects', 'POST', {name: 'Thèse', template: 'report'});
  assert.match(p.files['main.tex'], /\\documentclass\[11pt,a4paper\]\{report\}/);
  await call(`/projects/${p.id}/files`, 'POST', {name: 'chap1.tex', content: 'A'});
  await assert.rejects(call(`/projects/${p.id}/files`, 'POST', {name: 'chap1.tex', content: 'B'}), e => e.status === 409);
  await assert.rejects(call(`/projects/${p.id}/files`, 'POST', {name: '../x.tex'}), /invalide/);
  await call(`/projects/${p.id}`, 'PUT', {main: 'chap1.tex'});
  await assert.rejects(call(`/projects/${p.id}/files/chap1.tex`, 'DELETE'), /principal/);
  await assert.rejects(call(`/projects/${p.id}`, 'PUT', {main: 'absent.tex'}), /principal invalide/);
});

test('versions : instantané puis restauration', async () => {
  const [{id}] = await call('/projects');
  const {history} = await call(`/projects/${id}/snapshot`, 'POST', {label: 'Avant'});
  await call(`/projects/${id}/files/main.tex`, 'PUT', {content: 'modifié'});
  const restored = await call(`/projects/${id}/restore/${history[0].id}`, 'POST');
  assert.notEqual(restored.files['main.tex'], 'modifié');
});

test('l’historique est limité à 20 versions', async () => {
  const [{id}] = await call('/projects');
  let history;
  for (let i = 0; i < 25; i++) ({history} = await call(`/projects/${id}/snapshot`, 'POST', {label: 'v' + i}));
  assert.equal(history.length, 20);
  assert.equal(history[0].label, 'v5');
});

test('corbeille obligatoire avant suppression définitive, duplication', async () => {
  const [{id}] = await call('/projects');
  const copy = await call(`/projects/${id}/duplicate`, 'POST');
  assert.match(copy.name, /copie/);
  await assert.rejects(call(`/projects/${id}`, 'DELETE'), /corbeille/);
  await call(`/projects/${id}`, 'PUT', {deleted: true});
  await call(`/projects/${id}`, 'DELETE');
  assert.deepEqual((await call('/projects')).map(p => p.id), [copy.id]);
});

test('stockage plein : erreur 507 et données précédentes intactes', async () => {
  const [{id}] = await call('/projects');
  const before = store.get('texnova-lab-projects');
  const setItem = localStorage.setItem;
  localStorage.setItem = () => { throw new Error('QuotaExceededError'); };
  try {
    await assert.rejects(call(`/projects/${id}/files/main.tex`, 'PUT', {content: 'nouveau'}), e => e.status === 507);
  } finally { localStorage.setItem = setItem; }
  assert.equal(store.get('texnova-lab-projects'), before);
});

test('données locales illisibles : message explicite sans écrasement', async () => {
  store.set('texnova-lab-projects', '{cassé');
  await assert.rejects(call('/projects'), /illisibles/);
  assert.equal(store.get('texnova-lab-projects'), '{cassé');
});
