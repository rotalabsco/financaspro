/**
 * Início do container (docker-compose.yml): prepara tudo e sobe o app.
 *
 * 1. Chave do login: sem BETTER_AUTH_SECRET, gera uma na primeira vez e guarda no volume
 *    /app/data (sobrevive a atualizações; apagar o volume desloga todo mundo).
 * 2. Espera o banco aceitar conexões.
 * 3. Aplica as migrations pendentes (no primeiro start, cria todas as tabelas).
 * 4. Seed: categorias, contas e grupos padrão, só o que ainda não existe.
 * 5. Sobe o Next na porta PORT.
 */
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import pg from "pg";

const DATA_DIR = process.env.FINANCASPRO_DATA_DIR || "/app/data";
const PORT = process.env.PORT || "3000";
const url = process.env.DIRECT_URL || process.env.DATABASE_URL;

function log(msg) {
  console.log(`[financaspro] ${msg}`);
}

function run(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: "inherit", env: process.env });
  if (r.status !== 0) {
    console.error(`[financaspro] falhou: ${cmd} ${args.join(" ")}`);
    process.exit(r.status ?? 1);
  }
}

if (!url) {
  console.error("[financaspro] defina DATABASE_URL (o docker-compose.yml já define).");
  process.exit(1);
}

if (!process.env.BETTER_AUTH_SECRET?.trim()) {
  mkdirSync(DATA_DIR, { recursive: true });
  const file = `${DATA_DIR}/auth-secret`;
  if (!existsSync(file)) {
    writeFileSync(file, randomBytes(48).toString("base64"), { mode: 0o600 });
    log("chave de login gerada");
  }
  process.env.BETTER_AUTH_SECRET = readFileSync(file, "utf8").trim();
}

for (let attempt = 1; ; attempt++) {
  const client = new pg.Client({ connectionString: url });
  try {
    await client.connect();
    await client.end();
    break;
  } catch (err) {
    await client.end().catch(() => {});
    if (attempt >= 60) {
      console.error("[financaspro] o banco não respondeu em 60 s:", err.message);
      process.exit(1);
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
}

log("aplicando migrations");
run("npx", ["drizzle-kit", "migrate"]);
log("conferindo dados padrão");
run("npx", ["tsx", "src/db/seed.ts"]);

log(`pronto: abra ${process.env.BETTER_AUTH_URL || `http://localhost:${PORT}`}`);
const app = spawn("npx", ["next", "start", "-p", PORT, "-H", "0.0.0.0"], { stdio: "inherit", env: process.env });
for (const sig of ["SIGTERM", "SIGINT"]) process.on(sig, () => app.kill(sig));
app.on("exit", (code) => process.exit(code ?? 0));
