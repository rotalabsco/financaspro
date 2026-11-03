import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { investmentOperations, transactions } from "@/db/schema";
import { z } from "zod";
import {
  effectiveRecurringAmount,
  endRecurrenceSeries,
  monthKey,
  propagateRecurringAmountForward,
} from "@/lib/recurring-transactions";
import { todayDateOnly } from "@/lib/dates";

const updateTransactionSchema = z.object({
  description: z.string().min(1).max(200).optional(),
  categoryId: z.string().min(1).optional(),
  bankAccountId: z.string().min(1).optional().nullable(),
  creditCardId: z.string().min(1).optional().nullable(),
  type: z.enum(["RECORRENTE", "PARCELADO", "A_VISTA"]).optional(),
  source: z.enum(["CONTA_CORRENTE", "CARTAO_CREDITO", "DINHEIRO"]).optional(),
  amountPrevisto: z.number().min(0).optional(),
  amountRealizado: z.number().optional().nullable(),
  amountReembolso: z.number().min(0).optional().nullable(),
  isConciliado: z.boolean().optional(),
  investmentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  transactionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  installmentCurrent: z.number().int().min(1).optional(),
  installmentTotal: z.number().int().min(1).max(420).optional(),
  notes: z.string().optional(),
  /** Se false, não propaga valor para meses futuros da série. Default: true para RECORRENTE. */
  propagateRecurringForward: z.boolean().optional(),
});

function serializeTransaction(t: {
  id: string;
  monthId: string;
  description: string;
  categoryId: string;
  type: string;
  amountPrevisto: unknown;
  amountRealizado: unknown;
  amountReembolso?: unknown;
  installmentCurrent: number | null;
  installmentTotal: number | null;
  isLateEntry: boolean;
  notes: string | null;
  recurrenceGroupId?: string | null;
  recurrenceEndsAtMonth?: string | null;
  transactionDate?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    ...t,
    amountPrevisto: Number(t.amountPrevisto),
    amountRealizado: t.amountRealizado != null ? Number(t.amountRealizado) : null,
    amountReembolso: t.amountReembolso != null ? Number(t.amountReembolso) : null,
    transactionDate: t.transactionDate ? t.transactionDate.toISOString().slice(0, 10) : null,
  };
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const parsed = updateTransactionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados inválidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const existing = await db.query.transactions.findFirst({
      where: eq(transactions.id, id),
      columns: {
        investmentId: true,
        investmentDate: true,
        investmentOperationId: true,
        transactionDate: true,
        type: true,
        recurrenceGroupId: true,
      },
      with: {
        category: { columns: { isReceita: true } },
        month: { columns: { year: true, month: true } },
      },
    });

    if (!existing) {
      return NextResponse.json({ error: "Transação não encontrada" }, { status: 404 });
    }

    if (
      parsed.data.isConciliado === true &&
      existing.investmentId &&
      !existing.investmentDate &&
      !parsed.data.investmentDate
    ) {
      return NextResponse.json(
        {
          error:
            "Para conciliar um lançamento de investimento, é obrigatório informar a data do investimento.",
        },
        { status: 400 }
      );
    }

    const { propagateRecurringForward, ...patchFields } = parsed.data;
    const data: Record<string, unknown> = { ...patchFields };
    if (parsed.data.amountRealizado === null) data.amountRealizado = null;
    if (parsed.data.amountReembolso === null) data.amountReembolso = null;
    if (parsed.data.investmentDate !== undefined) {
      data.investmentDate = parsed.data.investmentDate
        ? new Date(parsed.data.investmentDate)
        : null;
    }
    if (parsed.data.transactionDate !== undefined) {
      data.transactionDate = parsed.data.transactionDate
        ? new Date(parsed.data.transactionDate)
        : null;
    }
    if (
      parsed.data.amountRealizado !== undefined &&
      parsed.data.amountRealizado !== null &&
      parsed.data.transactionDate === undefined &&
      !existing.transactionDate
    ) {
      data.transactionDate = todayDateOnly();
    }

    // PATCH sem campos: o Prisma só tocava o updatedAt; o Drizzle recusa set vazio.
    await db
      .update(transactions)
      .set(Object.keys(data).length > 0 ? data : { updatedAt: new Date() })
      .where(eq(transactions.id, id));
    const transaction = (await db.query.transactions.findFirst({
      where: eq(transactions.id, id),
      with: {
        category: true,
        bankAccount: true,
        creditCard: true,
        investment: true,
        month: { columns: { year: true, month: true } },
      },
    }))!;

    const amountChanged =
      parsed.data.amountPrevisto !== undefined ||
      parsed.data.amountRealizado !== undefined;
    const shouldPropagate =
      amountChanged &&
      transaction.type === "RECORRENTE" &&
      Boolean(transaction.recurrenceGroupId) &&
      propagateRecurringForward !== false;

    let propagated = 0;
    if (shouldPropagate && transaction.recurrenceGroupId) {
      const amount = effectiveRecurringAmount(transaction);
      propagated = await propagateRecurringAmountForward(db, {
        groupId: transaction.recurrenceGroupId,
        fromYear: transaction.month.year,
        fromMonth: transaction.month.month,
        amount,
      });
    }

    if (existing.investmentOperationId) {
      const opUpdate: { date?: Date; quantity?: number; total?: number } = {};
      if (parsed.data.transactionDate !== undefined && transaction.transactionDate) {
        opUpdate.date = transaction.transactionDate;
      }
      const amount =
        transaction.amountRealizado != null
          ? Number(transaction.amountRealizado)
          : Number(transaction.amountPrevisto);
      if (
        parsed.data.amountRealizado !== undefined ||
        parsed.data.amountPrevisto !== undefined
      ) {
        opUpdate.quantity = amount;
        opUpdate.total = amount;
      }
      if (Object.keys(opUpdate).length > 0) {
        await db
          .update(investmentOperations)
          .set(opUpdate)
          .where(eq(investmentOperations.id, existing.investmentOperationId));
      }
    }

    return NextResponse.json({
      ...serializeTransaction(transaction),
      bankAccount: transaction.bankAccount
        ? { id: transaction.bankAccount.id, name: transaction.bankAccount.name }
        : null,
      creditCard: transaction.creditCard
        ? { id: transaction.creditCard.id, name: transaction.creditCard.name }
        : null,
      investment: transaction.investment
        ? {
            id: transaction.investment.id,
            name: transaction.investment.name,
            ticker: transaction.investment.ticker,
          }
        : null,
      propagatedFutureMonths: propagated,
    });
  } catch (error) {
    console.error("PATCH /api/transactions/[id]:", error);
    return NextResponse.json(
      { error: "Falha ao atualizar transação" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const scope = new URL(request.url).searchParams.get("scope");

    const tx = await db.query.transactions.findFirst({
      where: eq(transactions.id, id),
      columns: { investmentOperationId: true, type: true, recurrenceGroupId: true },
      with: { month: { columns: { year: true, month: true } } },
    });

    if (!tx) {
      return NextResponse.json({ error: "Transação não encontrada" }, { status: 404 });
    }

    if (
      tx.type === "RECORRENTE" &&
      tx.recurrenceGroupId &&
      (scope === "series-future" || scope === "series-end")
    ) {
      const fromKey = monthKey(tx.month.year, tx.month.month);
      const result = await endRecurrenceSeries(db, tx.recurrenceGroupId, fromKey);
      return NextResponse.json({
        success: true,
        endedSeries: true,
        ...result,
      });
    }

    if (tx.investmentOperationId) {
      const opId = tx.investmentOperationId;
      await db
        .update(transactions)
        .set({ investmentOperationId: null, investmentId: null, investmentDate: null })
        .where(eq(transactions.id, id));
      await db.delete(investmentOperations).where(eq(investmentOperations.id, opId));
    }
    await db.delete(transactions).where(eq(transactions.id, id));
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/transactions/[id]:", error);
    return NextResponse.json(
      { error: "Falha ao remover transação" },
      { status: 500 }
    );
  }
}
