/**
 * Bloqueia uso acidental de banco remoto (produção) em desenvolvimento local.
 * Confere DATABASE_URL e DIRECT_URL (usadas pelo app e pelo drizzle-kit). Rodado em predev (package.json).
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function loadEnvFile(filename) {
  const filePath = resolve(process.cwd(), filename);
  if (!existsSync(filePath)) return;
  for (const line of readFileSync(filePath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const i = trimmed.indexOf('=');
    if (i === -1) continue;
    const key = trimmed.slice(0, i).trim();
    let value = trimmed.slice(i + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

// Mesma precedência do Next: .env.local vence .env (loadEnvFile não sobrescreve).
loadEnvFile('.env.local');
loadEnvFile('.env');

if (process.env.NODE_ENV === 'production') {
  process.exit(0);
}

if (process.env.SKIP_DEV_DB_GUARD === 'true') {
  process.exit(0);
}

const isLocal = (url) =>
  url.includes('localhost') || url.includes('127.0.0.1') || url.includes('@postgres:');

const remote = ['DATABASE_URL', 'DIRECT_URL']
  .map((name) => [name, process.env[name]?.trim() ?? ''])
  .filter(([, url]) => url && !isLocal(url));

if (remote.length > 0) {
  console.error(
    `[guard-dev-database] ${remote.map(([name]) => name).join(', ')} aponta para um banco remoto.`,
    'O dev usa só o Postgres local (npm run db:local:up). Ver README.md.',
  );
  process.exit(1);
}
