/**
 * Primeira instalação: cria o schema num banco VAZIO aplicando as migrations do Drizzle
 * (drizzle/0000_baseline.sql em diante). Depois, atualizações chegam por `npm run db:deploy`.
 *
 * Recusa qualquer banco que já tenha as tabelas do app: nunca toca num banco em uso.
 * Banco criado pela versão antiga (Prisma) usa `npm run db:baseline` uma vez, não este.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import pg from "pg";

function loadEnv(file) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const key = t.slice(0, t.indexOf("=")).trim();
    let value = t.slice(t.indexOf("=") + 1).trim();
    if (/^(".*"|'.*')$/.test(value)) value = value.slice(1, -1);
    if (!process.env[key]) process.env[key] = value;
  }
}
loadEnv(".env.local");
loadEnv(".env");

const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!url) {
  console.error("Defina DIRECT_URL (ou DATABASE_URL) no ambiente ou no .env.");
  process.exit(1);
}

const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url) || /[?&]sslmode=disable(&|$)/.test(url);
const client = new pg.Client({ connectionString: url, ssl: local ? undefined : { rejectUnauthorized: true } });
await client.connect();
const { rows } = await client.query(
  `select count(*)::int as n from information_schema.tables where table_schema = 'public' and table_name in ('months', 'transactions', 'Category')`
);
await client.end();
if (rows[0].n > 0) {
  console.error(
    "O banco já tem as tabelas do app. db:setup é só para banco vazio; para atualizar use npm run db:deploy" +
      " (banco da versão com Prisma: npm run db:baseline uma vez antes)."
  );
  process.exit(1);
}

execFileSync("npx", ["drizzle-kit", "migrate"], { stdio: "inherit", env: { ...process.env, DIRECT_URL: url } });
console.log("Banco pronto. Rode npm run db:seed (categorias e contas padrão) e crie o primeiro usuário em /setup.");
