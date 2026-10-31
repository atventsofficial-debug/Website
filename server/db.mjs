// Postgres access: a pool, a transaction helper with retry on serialization conflicts,
// and the schema migration run at start-up.
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { ROOT } from './config.mjs';

export function createPool(url, max = 20) {
  const pool = new pg.Pool({ connectionString: url, max });
  // A dropped idle connection must not crash the process.
  pool.on('error', err => console.error('pg pool error:', err.code || err.message));
  return pool;
}

const RETRY = new Set(['40001', '40P01']); // serialization failure, deadlock

export async function tx(pool, fn, tries = 4) {
  for (let attempt = 1; ; attempt++) {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      const out = await fn(c);
      await c.query('COMMIT');
      return out;
    } catch (e) {
      await c.query('ROLLBACK').catch(() => {});
      if (RETRY.has(e.code) && attempt < tries) continue;
      throw e;
    } finally {
      c.release();
    }
  }
}

export async function migrate(pool) {
  const sql = fs.readFileSync(path.join(ROOT, 'server', 'schema.sql'), 'utf8');
  // One instance at a time, so parallel deploys do not race the DDL.
  await tx(pool, async c => {
    await c.query('SELECT pg_advisory_xact_lock(4242)');
    await c.query(sql);
  });
}
