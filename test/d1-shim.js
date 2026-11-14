// Minimal D1 look-alike over node:sqlite, enough for the cloud functions' tests.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

export function fakeD1() {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../migrations/0001_init.sql', import.meta.url), 'utf8'));
  const conv = (v) => (v instanceof ArrayBuffer ? new Uint8Array(v) : v);
  const outBlob = (row) => {
    if (!row) return row;
    const o = { ...row };
    for (const k in o)
      if (o[k] instanceof Uint8Array) o[k] = o[k].buffer.slice(o[k].byteOffset, o[k].byteOffset + o[k].byteLength);
    return o;
  };
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    first: async () => outBlob(db.prepare(sql).get(...args.map(conv))) ?? null,
    all: async () => ({
      results: db
        .prepare(sql)
        .all(...args.map(conv))
        .map(outBlob),
    }),
    run: async () => ({ meta: { changes: Number(db.prepare(sql).run(...args.map(conv)).changes) } }),
    _run: () => ({ meta: { changes: Number(db.prepare(sql).run(...args.map(conv)).changes) } }),
  });
  return {
    raw: db,
    prepare: (sql) => stmt(sql),
    batch: async (list) => {
      db.exec('BEGIN');
      try {
        const out = list.map((s) => s._run());
        db.exec('COMMIT');
        return out;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
  };
}
