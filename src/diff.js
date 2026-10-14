// Line diff (longest common subsequence) used to compare a saved version with the current files.
export function diffLines(before = '', after = '') {
  const a = before.split('\n'),
    b = after.split('\n');
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length,
    endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const midA = a.slice(start, endA),
    midB = b.slice(start, endB);
  const out = a.slice(0, start).map((text, i) => ({ type: 'same', text, oldLine: i + 1, newLine: i + 1 }));
  let middle;
  if (midA.length * midB.length > 4_000_000) {
    middle = [...midA.map((text) => ({ type: 'del', text })), ...midB.map((text) => ({ type: 'add', text }))];
  } else {
    const n = midA.length,
      m = midB.length,
      table = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
    for (let i = n - 1; i >= 0; i--)
      for (let j = m - 1; j >= 0; j--)
        table[i][j] = midA[i] === midB[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    middle = [];
    let i = 0,
      j = 0;
    while (i < n || j < m) {
      if (i < n && j < m && midA[i] === midB[j]) {
        middle.push({ type: 'same', text: midA[i] });
        i++;
        j++;
      } else if (i < n && (j === m || table[i + 1][j] >= table[i][j + 1]))
        middle.push({ type: 'del', text: midA[i++] });
      else middle.push({ type: 'add', text: midB[j++] });
    }
  }
  let oldLine = start,
    newLine = start;
  for (const line of middle) {
    if (line.type !== 'add') line.oldLine = ++oldLine;
    if (line.type !== 'del') line.newLine = ++newLine;
    out.push(line);
  }
  a.slice(endA).forEach((text) => out.push({ type: 'same', text, oldLine: ++oldLine, newLine: ++newLine }));
  return out;
}

export function diffStats(lines) {
  return {
    added: lines.filter((l) => l.type === 'add').length,
    removed: lines.filter((l) => l.type === 'del').length,
  };
}

// Files that differ between a version and the current project, with added/removed line counts.
export function compareFiles(oldFiles = {}, newFiles = {}) {
  const names = [...new Set([...Object.keys(oldFiles), ...Object.keys(newFiles)])].sort();
  return names
    .filter((name) => oldFiles[name] !== newFiles[name])
    .map((name) => {
      const status = !(name in oldFiles) ? 'added' : !(name in newFiles) ? 'removed' : 'changed';
      if (status === 'added') return { name, status, added: newFiles[name].split('\n').length, removed: 0 };
      if (status === 'removed') return { name, status, added: 0, removed: oldFiles[name].split('\n').length };
      return { name, status, ...diffStats(diffLines(oldFiles[name], newFiles[name])) };
    });
}
