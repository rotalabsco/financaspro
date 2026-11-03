import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { transactions } from "@/db/schema";
import { getSession } from "@/lib/session";
import { endRecurrenceSeries, monthKey } from "@/lib/recurring-transactions";
import { currentYearMonth } from "@/lib/dates";

export const dynamic = "force-dynamic";

const endSchema = z.object({
  /** YYYY-MM — encerra a partir deste mês (inclusive). Default: mês atual. */
  fromMonth: z.string().regex(/^\d{4}-\d{2}$/).optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ groupId: string }> }
) {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  try {
    const { groupId } = await params;
    if (!groupId) {
      return NextResponse.json({ error: "groupId obrigatório" }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const parsed = endSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados inválidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const anyRow = await db.query.transactions.findFirst({
      where: and(eq(transactions.recurrenceGroupId, groupId), eq(transactions.type, "RECORRENTE")),
      columns: { id: true },
    });
    if (!anyRow) {
      return NextResponse.json({ error: "Série não encontrada" }, { status: 404 });
    }

    const now = currentYearMonth();
    const fromMonth = parsed.data.fromMonth ?? monthKey(now.year, now.month);

    const result = await endRecurrenceSeries(db, groupId, fromMonth);

    return NextResponse.json({
      success: true,
      recurrenceGroupId: groupId,
      fromMonth,
      ...result,
      message: `Série encerrada a partir de ${fromMonth}. ${result.deletedFuture} lançamento(s) futuro(s) removido(s).`,
    });
  } catch (error) {
    console.error("POST /api/recurring/[groupId]/end:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao encerrar série" },
      { status: 500 }
    );
  }
}
