// LaTeX compilers offered like Overleaf's "Compiler" menu. `browser` says whether the in-browser engine supports it.
export const compilers = [
  { id: 'pdflatex', label: 'pdfLaTeX', browser: true, latexmk: '-pdf' },
  { id: 'xelatex', label: 'XeLaTeX', browser: true, latexmk: '-xelatex' },
  { id: 'lualatex', label: 'LuaLaTeX', browser: false, latexmk: '-lualatex' },
  { id: 'latex', label: 'LaTeX (DVI → PDF)', browser: false, latexmk: '-pdfdvi' },
];
const ids = new Set(compilers.map((c) => c.id));
export const isCompiler = (id) => ids.has(id);

// "% !TEX program = xelatex" (TeXShop, TeXstudio, Overleaf-compatible magic comment) at the top of the main file.
export function magicProgram(source = '') {
  const head = source.split('\n').slice(0, 20).join('\n');
  const m = head.match(/^\s*%\s*!\s*TeX\s+(?:TS-)?program\s*=\s*([a-z]+)/im);
  if (!m) return null;
  const name = m[1].toLowerCase();
  return isCompiler(name) ? name : { pdftex: 'pdflatex', xetex: 'xelatex', luatex: 'lualatex' }[name] || null;
}

export function effectiveCompiler(project) {
  return (
    magicProgram(project?.files?.[project?.main]) || (isCompiler(project?.compiler) ? project.compiler : 'pdflatex')
  );
}

// Packages that only work with XeLaTeX or LuaLaTeX.
export function needsUnicodeEngine(files = {}) {
  return Object.entries(files).some(
    ([name, text]) =>
      name.endsWith('.tex') &&
      /\\usepackage(?:\[[^\]]*\])?\{[^}]*\b(fontspec|polyglossia|unicode-math)\b/.test(
        text.replace(/(?<!\\)%[^\n]*/g, ''),
      ),
  );
}
