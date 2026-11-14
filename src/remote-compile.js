// Optional compilation on the TeXBea server (isolated, no network). Needs a signed-in account.
export async function compileOnServer(project, compiler, fetchImpl = (...a) => fetch(...a)) {
  let res;
  try {
    res = await fetchImpl('/api/compile', {
      method: 'POST',
      headers: { 'x-texbea': '1', 'content-type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ main: project.main, compiler, files: project.files, assets: project.assets || {} }),
    });
  } catch {
    throw Object.assign(new Error('Pas de connexion : compile dans le navigateur.'), { offline: true });
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 422) throw Object.assign(new Error('Compilation échouée'), { data: { log: data.log } });
  if (!res.ok) throw Object.assign(new Error(data.error || `Erreur ${res.status}`), { status: res.status });
  const bytes = Uint8Array.from(atob(data.pdf), (c) => c.charCodeAt(0));
  return { url: URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' })), log: data.log || '' };
}
