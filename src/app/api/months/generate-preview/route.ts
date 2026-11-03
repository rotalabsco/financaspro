import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { MonthStatus, TransactionSource, TransactionType } from "@/db/enums";
import { months, transactions } from "@/db/schema";

/** Mês com os lançamentos e a categoria de cada um (o antigo include). */
function findMonthWithTransactions(where: SQL | undefined) {
  return db.query.months.findFirst({
    where,
    with: {
      transactions: {
        with: { category: true },
        orderBy: [asc(transactions.createdAt), asc(transactions.id)],
      },
    },
  });
}
import {
  backfillRecurrenceGroupIds,
  copyRecurringTransactionToMonth,
} from "@/lib/recurring-transactions";
import { currentYearMonth } from "@/lib/dates";
import { AUTO_BALANCE_CARRY_NOTE, ensureSystemCategory, isBalanceCarryRow } from "@/lib/system-categories";

function getNextMonth(year: number, month: number): { year: number; month: number } {
  if (month === 12) return { year: year + 1, month: 1 };
  return { year, month: month + 1 };
}

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const now = currentYearMonth();
    const year = body.year === undefined ? now.year : body.year;
    const month = body.month === undefined ? now.month : body.month;
    if (!Number.isInteger(year) || year < 2000 || year > 2100 || !Number.isInteger(month) || month < 1 || month > 12) {
      return NextResponse.json({ error: "Ano ou mês inválido" }, { status: 400 });
    }

    const { year: nextYear, month: nextMonth } = getNextMonth(year, month);

    const existingNext = await findMonthWithTransactions(and(eq(months.year, nextYear), eq(months.month, nextMonth)));
    if (existingNext) {
      return NextResponse.json({
        ...existingNext,
        bankBalanceAtClose:
          existingNext.bankBalanceAtClose != null
            ? Number(existingNext.bankBalanceAtClose)
            : null,
        creditCardAtClose:
          existingNext.creditCardAtClose != null
            ? Number(existingNext.creditCardAtClose)
            : null,
        transactions: existingNext.transactions.map((tx) => ({
          ...tx,
          amountPrevisto: Number(tx.amountPrevisto),
          amountRealizado: tx.amountRealizado != null ? Number(tx.amountRealizado) : null,
        })),
      });
    }

    const sourceMonth = await findMonthWithTransactions(and(eq(months.year, year), eq(months.month, month)));

    if (!sourceMonth) {
      return NextResponse.json(
        { error: `Mes ${month}/${year} nao encontrado. Crie um mes primeiro.` },
        { status: 404 }
      );
    }

    await backfillRecurrenceGroupIds(db);

    const [newMonth] = await db
      .insert(months)
      .values({ year: nextYear, month: nextMonth, status: MonthStatus.RASCUNHO })
      .returning();

    const carryOverBalance =
      sourceMonth.status === MonthStatus.FECHADO &&
      sourceMonth.bankBalanceAtClose != null
        ? Number(sourceMonth.bankBalanceAtClose)
        : 0;

    if (carryOverBalance > 0) {
      const receitaCategoryId = (await ensureSystemCategory(db, "SALDO_FECHAMENTO")).id;

      await db.insert(transactions).values({
          monthId: newMonth.id,
          description: `Saldo inicial (fechamento ${String(sourceMonth.month).padStart(2, "0")}/${sourceMonth.year})`,
          categoryId: receitaCategoryId,
          type: TransactionType.A_VISTA,
          source: TransactionSource.CONTA_CORRENTE,
          amountPrevisto: carryOverBalance,
          amountRealizado: carryOverBalance,
          isConciliado: true,
          notes: AUTO_BALANCE_CARRY_NOTE,
      });
    }

    // Recarrega fonte após backfill (groupIds)
    const sourceFresh = await findMonthWithTransactions(eq(months.id, sourceMonth.id));

    const txs = sourceFresh?.transactions ?? sourceMonth.transactions;

    for (const t of txs) {
      if (t.type === TransactionType.A_VISTA) continue;

      if (t.type === TransactionType.PARCELADO) {
        const cur = t.installmentCurrent ?? 0;
        const tot = t.installmentTotal ?? 0;
        if (!(tot > 0 && cur < tot)) continue;
        const nextInstallment = cur + 1;
        if (nextInstallment > tot) continue;
        await db.insert(transactions).values({
            monthId: newMonth.id,
            parceladoGroupId: t.parceladoGroupId,
            description: t.description,
            categoryId: t.categoryId,
            bankAccountId: t.bankAccountId,
            creditCardId: t.creditCardId,
            type: t.type,
            source: t.source,
            amountPrevisto: Number(t.amountPrevisto),
            installmentCurrent: nextInstallment,
            installmentTotal: tot,
            notes: t.notes,
        });
        continue;
      }

      if (t.type === TransactionType.RECORRENTE) {
        if (isBalanceCarryRow(t)) continue;
        await copyRecurringTransactionToMonth(
          db,
          t,
          { id: newMonth.id, year: nextYear, month: nextMonth }
        );
      }
    }

    const created = await findMonthWithTransactions(eq(months.id, newMonth.id));

    return NextResponse.json({
      ...created,
      bankBalanceAtClose:
        created?.bankBalanceAtClose != null ? Number(created.bankBalanceAtClose) : null,
      creditCardAtClose:
        created?.creditCardAtClose != null ? Number(created.creditCardAtClose) : null,
      transactions:
        created?.transactions.map((tx) => ({
          ...tx,
          amountPrevisto: Number(tx.amountPrevisto),
          amountRealizado: tx.amountRealizado != null ? Number(tx.amountRealizado) : null,
        })) ?? [],
    });
  } catch (error) {
    console.error("POST /api/months/generate-preview:", error);
    return NextResponse.json(
      { error: "Falha ao gerar previsao" },
      { status: 500 }
    );
  }
}
