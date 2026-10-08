// Preserve every character: colors are presentation only.
export function tokenizeLatex(source) {
  const tokens = []; let i = 0, math = null, environment = false;
  const emit = (text, kind = '') => { const last = tokens[tokens.length - 1]; if (last?.kind === kind) last.text += text; else tokens.push({text, kind}); };
  while (i < source.length) {
    const rest = source.slice(i), c = source[i];
    if (c === '%') { const end = source.indexOf('\n', i); const until = end < 0 ? source.length : end; emit(source.slice(i, until), 'comment'); i = until; continue; }
    if (c === '\\') {
      const value = rest.match(/^\\(?:[a-zA-Z@]+\*?|.)/s)?.[0] || c;
      if (['\\(','\\['].includes(value)) { math = value; emit(value, 'math-delimiter'); }
      else if (['\\)','\\]'].includes(value)) { math = null; emit(value, 'math-delimiter'); }
      else { emit(value, /^\\[a-zA-Z@]/.test(value) ? 'command' : 'symbol'); environment = value === '\\begin' ? 'begin' : value === '\\end' ? 'end' : false; }
      i += value.length; continue;
    }
    if (c === '$') { const value = rest.startsWith('$$') ? '$$' : '$'; math = math === value ? null : value; emit(value, 'math-delimiter'); i += value.length; continue; }
    if (environment && c === '{') { const match = rest.match(/^\{[^}\n]*\}/); if (match) { emit('{', 'bracket'); const name=match[0].slice(1,-1); emit(name, 'environment'); if (/^(?:equation|align|alignat|gather|multline|displaymath|math|eqnarray)\*?$/.test(name)) math=environment==='begin'?'environment':null; emit('}', 'bracket'); i += match[0].length; environment = false; continue; } }
    if (!/\s/.test(c)) environment = false;
    if ('{}[]'.includes(c)) { emit(c, 'bracket'); i++; continue; }
    if (math && '^_&'.includes(c)) { emit(c, 'symbol'); i++; continue; }
    const number = rest.match(/^\b\d+(?:\.\d+)?\b/);
    if (number) { emit(number[0], 'number'); i += number[0].length; continue; }
    emit(c, math ? 'math' : ''); i++;
  }
  return tokens;
}
