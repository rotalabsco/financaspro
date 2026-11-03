/**
 * Cliente do banco (Drizzle + node-postgres), no padrão do OfficeParty.
 * DATABASE_URL: string usada pelo app (com pooler, em provedores que têm).
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as tables from "./schema";
import * as relations from "./relations";

export const schema = { ...tables, ...relations };

function hostOf(url: string): string {
  return url.match(/@([^/?:]+)/)?.[1] ?? "";
}

/** SSL verificado fora do Postgres local. */
function sslFor(url: string): { rejectUnauthorized: boolean } | undefined {
  const host = hostOf(url);
  if (host === "localhost" || host === "127.0.0.1") return undefined;
  return process.env.NODE_ENV === "production" ? { rejectUnauthorized: true } : undefined;
}

const globalForDb = globalThis as unknown as { pgPool?: Pool };

function createPool(): Pool {
  // Sem URL o pool só falha na primeira consulta (o build importa as rotas sem banco).
  const connectionString = process.env.DATABASE_URL?.trim() ?? "";
  return new Pool({
    connectionString,
    ssl: sslFor(connectionString),
    max: 5,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  });
}

// Reaproveita o pool entre recargas do dev server (como o singleton do Prisma fazia).
const pool = globalForDb.pgPool ?? createPool();
if (process.env.NODE_ENV !== "production") globalForDb.pgPool = pool;

export const db = drizzle(pool, { schema });

export type Db = typeof db;
/** Cliente dentro de db.transaction(...). */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
/** Aceita o cliente raiz ou uma transação. */
export type DbOrTx = Db | Tx;

/** Erro de chave única do Postgres (equivalente ao P2002 do Prisma). */
export function isUniqueViolation(error: unknown): boolean {
  const e = error as { code?: string; cause?: { code?: string } } | null;
  return e?.code === "23505" || e?.cause?.code === "23505";
}
