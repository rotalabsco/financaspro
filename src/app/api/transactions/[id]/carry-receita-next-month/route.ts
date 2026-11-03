import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { TransactionType } from "@/db/enums";
import { transactions } from "@/db/schema";
import { addMonths, getOrCreateMonth } from "@/lib/months";
import { copyRecurringTransactionToMonth } from "@/lib/recurring-transactions";

/**
 * Garante a receita recorrente no mês seguinte, na mesma série (mesmo recurrenceGroupId).
 * Com a série materializada ao criar meses, normalmente ela já está lá.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const tx = await db.query.transactions.findFirst({
      where: eq(transactions.id, id),
      with: {
        category: { columns: { name: true, isReceita: true } },
        month: { columns: { year: true, month: true } },
      },
    });

    if (!tx) {
      return NextResponse.json({ error: "Lançamento não encontrado" }, { status: 404 });
    }

    if (!tx.category.isReceita) {
      return NextResponse.json(
        { error: "Somente receitas podem ser levadas ao mês seguinte por esta ação." },
        { status: 400 }
      );
    }

    if (tx.type !== TransactionType.RECORRENTE) {
      return NextResponse.json(
        {
          error:
            "Use esta ação apenas em receitas marcadas como recorrentes (tipo Recorrente).",
        },
        { status: 400 }
      );
    }

    const { year: nextYear, month: nextMonthNum } = addMonths(
      tx.month.year,
      tx.month.month,
      1
    );

    const targetMonthRecord = await getOrCreateMonth(nextYear, nextMonthNum);
    const result = await copyRecurringTransactionToMonth(db, tx, targetMonthRecord);

    if (result === "skipped_ended") {
      return NextResponse.json(
        { error: `A série desta receita foi encerrada a partir de ${tx.recurrenceEndsAtMonth}.` },
        { status: 409 }
      );
    }

    return NextResponse.json({
      targetYear: nextYear,
      targetMonth: nextMonthNum,
      targetMonthId: targetMonthRecord.id,
      alreadyExisted: result === "skipped_exists",
    });
  } catch (error) {
    console.error("POST /api/transactions/[id]/carry-receita-next-month:", error);
    return NextResponse.json(
      { error: "Falha ao duplicar receita para o mês seguinte" },
      { status: 500 }
    );
  }
}
