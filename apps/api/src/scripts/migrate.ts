// Aplica en orden los archivos de apps/api/migrations que aún no se hayan ejecutado.
import { readdir, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from '../db.js';

const dir = join(dirname(fileURLToPath(import.meta.url)), '../../migrations');

await sql`CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`;
const done = new Set((await sql`SELECT name FROM schema_migrations`).map((r) => r.name as string));
const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
let applied = 0;
for (const f of files) {
  if (done.has(f)) continue;
  const text = await readFile(join(dir, f), 'utf8');
  await sql.begin(async (tx) => {
    await tx.unsafe(text);
    await tx`INSERT INTO schema_migrations (name) VALUES (${f})`;
  });
  console.log(`✔ ${f}`);
  applied++;
}
console.log(applied ? `${applied} migración(es) aplicada(s)` : 'La base de datos ya está al día');
await sql.end();
