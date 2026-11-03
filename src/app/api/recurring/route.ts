import { NextResponse } from "next/server";
import { and, asc, eq, inArray, ne } from "drizzle-orm";
import { db } from "@/db";
import { categories, transactions } from "@/db/schema";
import { getSession } from "@/lib/session";
import {
  backfillRecurrenceGroupIds,
  effectiveRecurringAmount,
  monthKey,
} from "@/lib/recurring-transactions";

export const dynamic = "force-dynamic";

/**
 * Lista séries RECORRENTE agrupadas por recurrenceGroupId.
 */
export async function GET() {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  try {
    const backfilled = await backfillRecurrenceGroupIds(db);

    // Receitas têm tela própria (/dashboard/receitas) — não listar aqui.
    const rows = await db.query.transactions.findMany({
      where: and(
        eq(transactions.type, "RECORRENTE"),
        ne(transactions.isAntecipado, true),
        inArray(transactions.categoryId, db.select({ id: categories.id }).from(categories).where(eq(categories.isReceita, false)))
      ),
      with: {
        category: { columns: { id: true, name: true, color: true, isReceita: true } },
        bankAccount: { columns: { id: true, name: true } },
        creditCard: { columns: { id: true, name: true } },
        month: { columns: { id: true, year: true, month: true, status: true } },
      },
      orderBy: [asc(transactions.createdAt), asc(transactions.id)],
    });

    type SeriesAcc = {
      recurrenceGroupId: string;
      description: string;
      category: (typeof rows)[number]["category"];
      bankAccount: (typeof rows)[number]["bankAccount"];
      creditCard: (typeof rows)[number]["creditCard"];
      source: string | null;
      isReceita: boolean;
      recurrenceEndsAtMonth: string | null;
      monthsCount: number;
      firstMonth: string;
      lastMonth: string;
      lastAmount: number;
      sampleTransactionId: string;
    };

    const map = new Map<string, SeriesAcc>();

    for (const row of rows) {
      const groupId = row.recurrenceGroupId;
      if (!groupId) continue;
      const mk = monthKey(row.month.year, row.month.month);
      const amount = effectiveRecurringAmount(row);
      const existing = map.get(groupId);
      if (!existing) {
        map.set(groupId, {
          recurrenceGroupId: groupId,
          description: row.description,
          category: row.category,
          bankAccount: row.bankAccount,
          creditCard: row.creditCard,
          source: row.source,
          isReceita: row.category.isReceita === true,
          recurrenceEndsAtMonth: row.recurrenceEndsAtMonth,
          monthsCount: 1,
          firstMonth: mk,
          lastMonth: mk,
          lastAmount: amount,
          sampleTransactionId: row.id,
        });
        continue;
      }
      existing.monthsCount += 1;
      if (mk < existing.firstMonth) existing.firstMonth = mk;
      if (mk > existing.lastMonth) {
        existing.lastMonth = mk;
        existing.lastAmount = amount;
        existing.sampleTransactionId = row.id;
      }
      if (row.recurrenceEndsAtMonth) {
        existing.recurrenceEndsAtMonth = row.recurrenceEndsAtMonth;
      }
    }

    const series = Array.from(map.values()).sort((a, b) =>
      a.description.localeCompare(b.description, "pt-BR")
    );

    const active = series.filter((s) => !s.recurrenceEndsAtMonth);
    const ended = series.filter((s) => Boolean(s.recurrenceEndsAtMonth));

    return NextResponse.json({
      backfilled,
      active,
      ended,
      total: series.length,
    });
  } catch (error) {
    console.error("GET /api/recurring:", error);
    return NextResponse.json(
      { error: "Falha ao listar recorrentes" },
      { status: 500 }
    );
  }
}
