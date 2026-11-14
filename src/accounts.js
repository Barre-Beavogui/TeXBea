// Accounts, authentication, password security, recovery keys, and academic profile personalization
// shared between browser mode (texbea.com / IndexedDB + localStorage) and the Express server.

export const ROLES = [
  { id: 'student', label: 'Étudiant(e)' },
  { id: 'phd', label: 'Doctorant(e) / Post-doc' },
  { id: 'professor', label: 'Enseignant(e)-chercheur(se)' },
  { id: 'engineer', label: 'Ingénieur(e) / Scientifique' },
  { id: 'other', label: 'Autre' },
];

export const AVATAR_COLORS = [
  '#1f3a60', // Bleu encre TeXBea
  '#c2502b', // Cuivre TeXBea
  '#1f6b52', // Vert forêt
  '#5a3d8a', // Violet académique
  '#8f2d38', // Bordeaux
  '#2b5b84', // Bleu ardoise
];

// Computes 1 or 2 uppercase initials from a name or email.
export function userInitials(user) {
  const raw = String(user?.name || user?.email || 'B').trim();
  const parts = raw.split(/[\s._-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return raw.slice(0, 2).toUpperCase() || 'B';
}

// Evaluates password strength from 0 (empty) to 4 (very strong).
export function passwordStrength(password = '') {
  const p = String(password || '');
  if (!p) return { score: 0, label: '' };
  if (p.length < 6) return { score: 1, label: 'Trop court (6 caractères min.)' };
  let score = 1;
  if (p.length >= 8) score++;
  if (/[A-Z]/.test(p) && /[a-z]/.test(p)) score++;
  if (/\d/.test(p) || /[^A-Za-z0-9]/.test(p)) score++;
  const labels = ['', 'Faible', 'Moyen', 'Fort', 'Très fort'];
  return { score, label: labels[score] };
}

// Validates ORCID format (e.g., 0000-0002-1825-0097) when provided.
export function isValidOrcid(orcid = '') {
  const s = String(orcid || '').trim();
  if (!s) return true;
  return /^(?:https?:\/\/orcid\.org\/)?\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/i.test(s);
}

export function normalizeOrcid(orcid = '') {
  const s = String(orcid || '').trim();
  if (!s) return '';
  const m = s.match(/(\d{4}-\d{4}-\d{4}-\d{3}[\dX])$/i);
  return m ? m[1].toUpperCase() : s.slice(0, 40);
}

// Generates a human-friendly recovery key: TEXBEA-XXXX-XXXX-XXXX
export function generateRecoveryKey() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  const chars = [...bytes].map((b) => alphabet[b % alphabet.length]);
  return `TEXBEA-${chars.slice(0, 4).join('')}-${chars.slice(4, 8).join('')}-${chars.slice(8, 12).join('')}`;
}

// Browser-compatible SHA-256 salted password hash (used by demo-api and recovery key hashing).
export async function hashSecretBrowser(secret = '', salt = '') {
  const useSalt =
    salt || [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
  const data = new TextEncoder().encode(`${useSalt}:texbea:${secret}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const hash = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return { salt: useSalt, hash };
}

// Sanitizes and normalizes user profile fields.
export function sanitizeProfile(input = {}, existing = {}) {
  const email = String(input.email ?? existing.email ?? '')
    .trim()
    .toLowerCase()
    .slice(0, 120);
  const name =
    String(input.name ?? existing.name ?? (email ? email.split('@')[0] : 'Utilisateur'))
      .trim()
      .slice(0, 80) || 'Utilisateur';
  const institution = String(input.institution ?? existing.institution ?? '')
    .trim()
    .slice(0, 120);
  const department = String(input.department ?? existing.department ?? '')
    .trim()
    .slice(0, 120);
  const roleId = input.role ?? existing.role ?? 'student';
  const role = ROLES.some((r) => r.id === roleId) ? roleId : 'other';
  const rawOrcid = input.orcid ?? existing.orcid ?? '';
  if (!isValidOrcid(rawOrcid)) {
    throw Error('Format ORCID invalide (attendu : 0000-0002-1825-0097)');
  }
  const orcid = normalizeOrcid(rawOrcid);
  const bio = String(input.bio ?? existing.bio ?? '')
    .trim()
    .slice(0, 400);
  const colorInput = input.avatarColor ?? existing.avatarColor ?? AVATAR_COLORS[0];
  const avatarColor = AVATAR_COLORS.includes(colorInput) ? colorInput : AVATAR_COLORS[0];
  const defaultCompiler = ['pdflatex', 'xelatex', 'lualatex', 'latex'].includes(
    input.defaultCompiler ?? existing.defaultCompiler,
  )
    ? (input.defaultCompiler ?? existing.defaultCompiler)
    : 'pdflatex';

  return {
    name,
    email,
    institution,
    department,
    role,
    orcid,
    bio,
    avatarColor,
    defaultCompiler,
  };
}

// Strips sensitive fields (hash, salt, recoveryHash) before returning a user object to the client.
export function publicUser(u) {
  if (!u) return null;
  const { hash, salt, recoveryHash, recoverySalt, ...safe } = u;
  return {
    ...safe,
    initials: userInitials(safe),
  };
}

function escapeTexField(s = '') {
  return String(s)
    .replace(/[\\{}%#$&_~^]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Personalizes newly created template files with the user's academic profile (name, institution, email).
export function personalizeProjectFiles(files = {}, user = null) {
  if (!user) return files;
  const author = escapeTexField(user.name);
  const inst = escapeTexField(user.institution);
  const out = {};
  for (const [name, content] of Object.entries(files)) {
    if (typeof content !== 'string' || !name.endsWith('.tex')) {
      out[name] = content;
      continue;
    }
    let next = content;
    if (author && author !== 'Essai local' && author !== 'Workspace') {
      next = next
        .replace(/\\author\{Votre nom\}/g, `\\author{${author}}`)
        .replace(/\\author\{\}/g, `\\author{${author}}`)
        .replace(/\{\\LARGE\\bfseries Prénom Nom\}/g, `{\\LARGE\\bfseries ${author}}`)
        .replace(/\\signature\{Prénom Nom\}/g, `\\signature{${author}}`);
    }
    if (inst) {
      next = next
        .replace(/\\institute\{Établissement\}/g, `\\institute{${inst}}`)
        .replace(/\\institute\{Établissement — Équipe ou département\}/g, () => {
          const dept = escapeTexField(user.department);
          return `\\institute{${dept ? `${inst} — ${dept}` : inst}}`;
        })
        .replace(/\\institute\{Université — Laboratoire\\par Directeur : Pr\. Nom\}/g, `\\institute{${inst}}`);
    }
    out[name] = next;
  }
  return out;
}
