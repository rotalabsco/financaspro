import { NextRequest, NextResponse } from "next/server";
import { and, asc, count, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { MonthStatus, TransactionSource, TransactionType } from "@/db/enums";
import { months as monthsTable, transactions } from "@/db/schema";
import { z } from "zod";
import { materializeRecurringIntoMonth } from "@/lib/recurring-transactions";
import { AUTO_BALANCE_CARRY_NOTE, ensureSystemCategory } from "@/lib/system-categories";


const createMonthSchema = z.object({
  year: z.number().int().min(2020).max(2100),
  month: z.number().int().min(1).max(12),
});

function serializeMonth(month: { id: string; year: number; month: number; status: string; notes: string | null; closedAt: Date | null; bankBalanceAtClose: unknown; creditCardAtClose: unknown; createdAt: Date; updatedAt: Date }) {
  return {
    ...month,
    bankBalanceAtClose: month.bankBalanceAtClose != null ? Number(month.bankBalanceAtClose) : null,
    creditCardAtClose: month.creditCardAtClose != null ? Number(month.creditCardAtClose) : null,
  };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const yearParam = searchParams.get("year");
    const monthParam = searchParams.get("month");

    if (yearParam && monthParam) {
      const year = parseInt(yearParam, 10);
      const month = parseInt(monthParam, 10);
      const monthRecord = await db.query.months.findFirst({
        where: and(eq(monthsTable.year, year), eq(monthsTable.month, month)),
        with: {
          transactions: {
            with: { category: true },
            orderBy: [asc(transactions.createdAt), asc(transactions.id)],
          },
        },
      });
      if (!monthRecord) return NextResponse.json(null);
      return NextResponse.json({
        ...serializeMonth(monthRecord),
        transactions: monthRecord.transactions.map((t) => ({
          ...t,
          amountPrevisto: Number(t.amountPrevisto),
          amountRealizado: t.amountRealizado != null ? Number(t.amountRealizado) : null,
        })),
      });
    }

    const months = await db.query.months.findMany({
      orderBy: [desc(monthsTable.year), desc(monthsTable.month)],
      limit: 120,
    });
    if (months.length === 0) {
      return NextResponse.json([]);
    }
    const reconciledCounts = await db
      .select({ monthId: transactions.monthId, n: count() })
      .from(transactions)
      .where(and(inArray(transactions.monthId, months.map((m) => m.id)), eq(transactions.isConciliado, true)))
      .groupBy(transactions.monthId);
    const reconciledByMonthId = new Map(reconciledCounts.map((r) => [r.monthId, r.n]));
    return NextResponse.json(
      months.map((m) => ({
        ...serializeMonth(m),
        reconciledCount: reconciledByMonthId.get(m.id) ?? 0,
      }))
    );
  } catch (error) {
    console.error("GET /api/months:", error);
    return NextResponse.json(
      { error: "Falha ao listar meses" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = createMonthSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados invalidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const { year, month } = parsed.data;

    const existing = await db.query.months.findFirst({
      where: and(eq(monthsTable.year, year), eq(monthsTable.month, month)),
    });
    if (existing) {
      return NextResponse.json(
        { error: "Mes ja existe" },
        { status: 409 }
      );
    }

    const [prevYear, prevMonth] =
      month === 1 ? [year - 1, 12] : [year, month - 1];
    const previousMonth = await db.query.months.findFirst({
      where: and(eq(monthsTable.year, prevYear), eq(monthsTable.month, prevMonth)),
      columns: { status: true, bankBalanceAtClose: true },
    });
    const carryOverBalance =
      previousMonth?.status === MonthStatus.FECHADO &&
      previousMonth.bankBalanceAtClose != null
        ? Number(previousMonth.bankBalanceAtClose)
        : 0;

    const created = await db.transaction(async (tx) => {
      const [monthRecord] = await tx
        .insert(monthsTable)
        .values({ year, month, status: MonthStatus.RASCUNHO })
        .returning();

      if (carryOverBalance > 0) {
        const receitaCategoryId = (await ensureSystemCategory(tx, "SALDO_FECHAMENTO")).id;

        await tx.insert(transactions).values({
            monthId: monthRecord.id,
            description: `Saldo inicial (fechamento ${String(prevMonth).padStart(2, "0")}/${prevYear})`,
            categoryId: receitaCategoryId,
            type: TransactionType.A_VISTA,
            source: TransactionSource.CONTA_CORRENTE,
            amountPrevisto: carryOverBalance,
            amountRealizado: carryOverBalance,
            isConciliado: true,
            notes: AUTO_BALANCE_CARRY_NOTE,
        });
      }

      await materializeRecurringIntoMonth(tx, monthRecord);

      return monthRecord;
    });

    return NextResponse.json(serializeMonth(created));
  } catch (error) {
    console.error("POST /api/months:", error);
    return NextResponse.json(
      { error: "Falha ao criar mes" },
      { status: 500 }
    );
  }
}

