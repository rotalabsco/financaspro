/**
 * Uso único em bancos criados antes do Drizzle (pelo Prisma): registra a migration
 * 0000_baseline como já aplicada, sem rodar o SQL dela. As tabelas já existem; a partir
 * daqui `npm run db:deploy` aplica só as migrations novas.
 *
 * Seguro de repetir. Recusa banco vazio (esse usa `npm run db:setup`). Antes, confira numa
 * cópia do banco que o schema bate: `npx drizzle-kit push --strict` deve dizer "No changes
 * detected" (se houver diferença ele só mostra e pede confirmação — responda não).
 *
 *   DIRECT_URL="<string direta>" node scripts/db-baseline.mjs
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";

const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!url) {
  console.error("Defina DIRECT_URL (string direta, sem pooler).");
  process.exit(1);
}

const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8"));
const first = journal.entries[0];
if (first?.tag !== "0000_baseline") {
  console.error("drizzle/meta/_journal.json não começa por 0000_baseline.");
  process.exit(1);
}
const hash = createHash("sha256").update(readFileSync(`drizzle/${first.tag}.sql`)).digest("hex");

const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
const client = new pg.Client({ connectionString: url, ssl: local ? undefined : { rejectUnauthorized: true } });
await client.connect();
try {
  const { rows: t } = await client.query(
    `select count(*)::int as n from information_schema.tables where table_schema = 'public' and table_name in ('months', 'transactions', 'Category')`
  );
  if (t[0].n < 3) {
    console.error("Banco sem as tabelas do app. Para banco vazio use npm run db:setup.");
    process.exit(1);
  }

  await client.query("begin");
  await client.query(`create schema if not exists "drizzle"`);
  await client.query(
    `create table if not exists "drizzle"."__drizzle_migrations" (id serial primary key, hash text not null, created_at bigint)`
  );
  const { rows } = await client.query(`select hash, created_at from "drizzle"."__drizzle_migrations" order by created_at`);
  if (rows.some((r) => r.hash === hash)) {
    await client.query("rollback");
    console.log("Baseline já registrada. Nada a fazer.");
  } else if (rows.length > 0) {
    await client.query("rollback");
    console.error("O banco já tem migrations do Drizzle diferentes da baseline; nada foi alterado.");
    process.exit(1);
  } else {
    await client.query(`insert into "drizzle"."__drizzle_migrations" (hash, created_at) values ($1, $2)`, [hash, first.when]);
    await client.query("commit");
    console.log(`Baseline registrada (${first.tag}, ${hash.slice(0, 12)}…).`);
  }
} finally {
  await client.end();
}
