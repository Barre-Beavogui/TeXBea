// Editor preferences, kept per browser like Overleaf's "Settings" menu.
const KEY = 'texbea-settings';
export const defaultSettings = {
  fontSize: 13,
  theme: 'dark',
  keymap: 'default',
  lineWrapping: false,
  autocomplete: true,
  closeBrackets: true,
  spellcheck: 'off',
  autoCompile: false,
  aiAutoApply: false,
};
export function loadSettings() {
  try {
    return { ...defaultSettings, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return { ...defaultSettings };
  }
}
export function saveSettings(settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Storage full or blocked: the settings still apply for this visit.
  }
}
