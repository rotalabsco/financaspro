import { and, eq } from "drizzle-orm";
import { db as rootDb, isUniqueViolation, type DbOrTx } from "@/db";
import { months } from "@/db/schema";
import { materializeRecurringIntoMonth } from "@/lib/recurring-transactions";
export function addMonths(year: number, month: number, count: number): { year: number; month: number } {
  let m = month + count;
  let y = year;
  while (m > 12) {
    m -= 12;
    y += 1;
  }
  while (m < 1) {
    m += 12;
    y -= 1;
  }
  return { year: y, month: m };
}

/**
 * Busca o mês ou cria com as séries recorrentes já materializadas.
 *
 * Criação e materialização andam juntas numa transação (dentro de outra transação o
 * Drizzle usa SAVEPOINT): se a materialização falhasse depois do insert, o mês ficaria
 * sem recorrentes para sempre. Duas requisições criando o mesmo mês (duplo clique, duas
 * abas) batem no @@unique([year, month]); a perdedora desfaz o savepoint e relê o mês.
 */
export async function getOrCreateMonth(year: number, month: number, db: DbOrTx = rootDb) {
  const find = async () =>
    (await db.select().from(months).where(and(eq(months.year, year), eq(months.month, month))).limit(1))[0];

  const existing = await find();
  if (existing) return existing;

  try {
    return await db.transaction(async (tx) => {
      const [record] = await tx.insert(months).values({ year, month, status: "RASCUNHO" }).returning();
      await materializeRecurringIntoMonth(tx, record);
      return record;
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      const raced = await find();
      if (raced) return raced;
    }
    throw error;
  }
}
