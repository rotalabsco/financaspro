import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { categories, transactions } from "@/db/schema";
import { getSession } from "@/lib/session";
import { getOrCreateMonth } from "@/lib/months";
import {
  isRecurrenceEndedAt,
  parseMonthKey,
  propagateRecurringAmountForward,
} from "@/lib/recurring-transactions";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  amount: z.number().positive(),
  /** Competência a partir da qual o novo valor vale (YYYY-MM). */
  fromCompetencia: z.string().regex(/^\d{4}-\d{2}$/),
});

/**
 * Altera o valor da série de receita a partir de uma competência:
 * atualiza/cria o lançamento naquele mês e propaga para os meses seguintes.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ groupId: string }> }
) {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  try {
    const { groupId } = await params;
    const body = await request.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados inválidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { amount, fromCompetencia } = parsed.data;
    const from = parseMonthKey(fromCompetencia);
    if (!from) {
      return NextResponse.json({ error: "Competência inválida" }, { status: 400 });
    }

    const template = await db.query.transactions.findFirst({
      where: and(
        eq(transactions.recurrenceGroupId, groupId),
        eq(transactions.type, "RECORRENTE"),
        inArray(transactions.categoryId, db.select({ id: categories.id }).from(categories).where(eq(categories.isReceita, true)))
      ),
      with: { category: { columns: { id: true, isReceita: true, name: true } } },
      orderBy: [asc(transactions.createdAt)],
    });

    if (!template) {
      return NextResponse.json(
        { error: "Série de receita não encontrada" },
        { status: 404 }
      );
    }

    if (isRecurrenceEndedAt(template.recurrenceEndsAtMonth, from.year, from.month)) {
      return NextResponse.json(
        {
          error: `Série já encerrada a partir de ${template.recurrenceEndsAtMonth}. Não é possível alterar ${fromCompetencia}.`,
        },
        { status: 400 }
      );
    }

    const month = await getOrCreateMonth(from.year, from.month);
    const realizado = amount;

    const existingInMonth = await db.query.transactions.findFirst({
      where: and(
        eq(transactions.monthId, month.id),
        eq(transactions.recurrenceGroupId, groupId),
        eq(transactions.type, "RECORRENTE")
      ),
    });

    if (existingInMonth) {
      await db
        .update(transactions)
        .set({ amountPrevisto: amount, amountRealizado: realizado })
        .where(eq(transactions.id, existingInMonth.id));
    } else {
      await db.insert(transactions).values({
          monthId: month.id,
          description: template.description,
          categoryId: template.categoryId,
          bankAccountId: template.bankAccountId,
          creditCardId: template.creditCardId,
          type: "RECORRENTE",
          source: template.source ?? "CONTA_CORRENTE",
          amountPrevisto: amount,
          amountRealizado: realizado,
          isConciliado: false,
          notes: template.notes,
          recurrenceGroupId: groupId,
          recurrenceEndsAtMonth: template.recurrenceEndsAtMonth,
          transactionDate: new Date(Date.UTC(from.year, from.month - 1, 1)),
      });
    }

    const propagated = await propagateRecurringAmountForward(db, {
      groupId,
      fromYear: from.year,
      fromMonth: from.month,
      amount,
    });

    return NextResponse.json({
      success: true,
      recurrenceGroupId: groupId,
      fromCompetencia,
      amount,
      propagatedFutureMonths: propagated,
      message: `Valor R$ ${amount.toFixed(2)} aplicado a partir de ${fromCompetencia} (${propagated} mês(es) seguinte(s) atualizado(s)).`,
    });
  } catch (error) {
    console.error("PATCH /api/receitas/[groupId]:", error);
    return NextResponse.json(
      { error: "Falha ao atualizar receita" },
      { status: 500 }
    );
  }
}
