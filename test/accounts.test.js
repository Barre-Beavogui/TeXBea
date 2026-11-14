import test from 'node:test';
import assert from 'node:assert/strict';
import {
  userInitials,
  passwordStrength,
  isValidOrcid,
  normalizeOrcid,
  generateRecoveryKey,
  sanitizeProfile,
  personalizeProjectFiles,
} from '../src/accounts.js';
import { demoApi, useStore } from '../src/demo-api.js';

function memoryStore(initial = null) {
  let state = initial;
  return {
    kind: 'idb',
    load: async () => (state ? structuredClone(state) : null),
    save: async (next) => {
      state = structuredClone(next);
    },
    reset: () => {},
  };
}

test('accounts : initiales, robustesse du mot de passe, ORCID et clé de secours', () => {
  assert.equal(userInitials({ name: 'Barre Beavogui' }), 'BB');
  assert.equal(userInitials({ name: 'Ada' }), 'AD');
  assert.equal(passwordStrength('123').score, 1);
  assert.equal(passwordStrength('TexBea2026!').score, 4);
  assert.equal(isValidOrcid('0000-0002-1825-0097'), true);
  assert.equal(isValidOrcid('https://orcid.org/0000-0002-1825-009X'), true);
  assert.equal(isValidOrcid('invalid-orcid'), false);
  assert.equal(normalizeOrcid('https://orcid.org/0000-0002-1825-009x'), '0000-0002-1825-009X');

  const key = generateRecoveryKey();
  assert.match(key, /^TEXBEA-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);

  const profile = sanitizeProfile({
    name: '  Barre Beavogui ',
    email: 'Barre.Beavogui@Univ.FR',
    institution: 'Sorbonne Université',
    role: 'phd',
    orcid: '0000-0002-1825-0097',
  });
  assert.equal(profile.name, 'Barre Beavogui');
  assert.equal(profile.email, 'barre.beavogui@univ.fr');
  assert.equal(profile.institution, 'Sorbonne Université');
  assert.equal(profile.role, 'phd');
});

test('accounts : personnalisation automatique des modèles LaTeX avec le profil', () => {
  const files = {
    'main.tex':
      '\\title{Mon article}\n\\author{Votre nom}\n\\institute{Établissement}\n\\begin{document}\\end{document}',
  };
  const out = personalizeProjectFiles(files, {
    name: 'Barre Beavogui',
    institution: 'École Polytechnique',
  });
  assert.match(out['main.tex'], /\\author\{Barre Beavogui\}/);
  assert.match(out['main.tex'], /\\institute\{École Polytechnique\}/);
});

test('accounts : inscription, profil, changement de mot de passe, clé de secours et isolation multi-comptes', async () => {
  useStore(memoryStore());

  // 1. Inscription du premier compte
  const reg = await demoApi('/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Barre Beavogui',
      email: 'barre@texbea.com',
      password: 'Password123!',
      institution: 'TeXBea Lab',
      role: 'phd',
      defaultCompiler: 'xelatex',
    }),
  });
  assert.ok(reg.token);
  assert.match(reg.recoveryKey, /^TEXBEA-/);
  assert.equal(reg.user.name, 'Barre Beavogui');
  assert.equal(reg.user.initials, 'BB');

  const authHeaders = { Authorization: `Bearer ${reg.token}` };

  // 2. Lecture et modification du profil
  const me = await demoApi('/auth/me', { headers: authHeaders });
  assert.equal(me.user.email, 'barre@texbea.com');

  const updated = await demoApi('/auth/profile', {
    method: 'PUT',
    headers: authHeaders,
    body: JSON.stringify({
      institution: 'Institut TeXBea',
      department: 'IA & Mathématiques',
      orcid: '0000-0002-1825-0097',
    }),
  });
  assert.equal(updated.user.institution, 'Institut TeXBea');
  assert.equal(updated.user.orcid, '0000-0002-1825-0097');

  // 3. Création d’un projet depuis un modèle : auteur et compilateur pré-remplis par le profil
  const created = await demoApi('/projects', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ template: 'article', name: 'Article de Barre' }),
  });
  assert.match(created.files['main.tex'], /\\author\{Barre Beavogui\}/);
  assert.equal(created.compiler, 'xelatex');

  // 4. Changement de mot de passe
  await demoApi('/auth/password', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ currentPassword: 'Password123!', newPassword: 'NewPassword456!' }),
  });

  const login = await demoApi('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'barre@texbea.com', password: 'NewPassword456!' }),
  });
  assert.equal(login.user.name, 'Barre Beavogui');

  // 5. Récupération de compte via la clé de secours
  const recovered = await demoApi('/auth/recover', {
    method: 'POST',
    body: JSON.stringify({
      email: 'barre@texbea.com',
      recoveryKey: reg.recoveryKey,
      newPassword: 'RecoveredPassword789!',
    }),
  });
  assert.ok(recovered.token);
  assert.match(recovered.recoveryKey, /^TEXBEA-/);

  // 6. Second compte sur le même appareil : projets isolés
  const reg2 = await demoApi('/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Claire Martin',
      email: 'claire@texbea.com',
      password: 'ClairePass123!',
    }),
  });
  const listClaire = await demoApi('/projects', {
    headers: { Authorization: `Bearer ${reg2.token}` },
  });
  assert.equal(listClaire.length, 1);
  assert.equal(listClaire[0].name, 'Mon premier projet');
});
