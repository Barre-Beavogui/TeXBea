import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Lists the files of this build that the offline service worker (public/sw.js) downloads at install.
function precacheList() {
  return {
    name: 'texbea-precache',
    apply: 'build',
    generateBundle(_, bundle) {
      // Bea's engine (about 12 Mo) is cached the first time Bea is opened, not on every first visit.
      const size = (o) => (o.code || o.source || '').length;
      const files = Object.entries(bundle)
        .filter(([f, o]) => f.startsWith('assets/') && size(o) < 3_000_000)
        .map(([f]) => f);
      const walk = (dir, prefix) =>
        readdirSync(dir).flatMap((n) =>
          statSync(join(dir, n)).isDirectory() ? walk(join(dir, n), `${prefix}${n}/`) : [`${prefix}${n}`],
        );
      const pub = walk('public', '').filter((f) => f !== 'sw.js' && !f.endsWith('LICENSE'));
      this.emitFile({ type: 'asset', fileName: 'precache.json', source: JSON.stringify([...files, ...pub]) });
    },
  };
}

export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [react(), precacheList()],
  server: { proxy: { '/api': 'http://localhost:8787', '/ws': { target: 'ws://localhost:8787', ws: true } } },
});
