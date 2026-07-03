import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { pool } from "./db.js";

// Versioned migration runner: applies each file in migrations/ (sorted by name) exactly
// once, inside a transaction, recording it in schema_migrations. Re-running is a no-op;
// adding a new NNNN_*.sql file applies just that one on the next run.
const dir = fileURLToPath(new URL("./migrations", import.meta.url));

async function main() {
  await pool.query(
    `create table if not exists schema_migrations (
       id text primary key,
       applied_at timestamptz not null default now()
     )`
  );

  const applied = new Set(
    (await pool.query<{ id: string }>("select id from schema_migrations")).rows.map((r) => r.id)
  );

  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  let ran = 0;
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(new URL(`./migrations/${file}`, import.meta.url), "utf8");
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query(sql);
      await client.query("insert into schema_migrations (id) values ($1)", [file]);
      await client.query("commit");
      console.log(`applied ${file}`);
      ran++;
    } catch (err) {
      await client.query("rollback").catch(() => {});
      console.error(`failed ${file}:`, err instanceof Error ? err.message : err);
      throw err;
    } finally {
      client.release();
    }
  }

  console.log(ran ? `\n${ran} migration(s) applied.` : "Already up to date.");
  await pool.end();
}

main().catch(() => process.exit(1));
