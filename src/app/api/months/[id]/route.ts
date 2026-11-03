import { NextRequest, NextResponse } from "next/server";
import { asc, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import type { MonthStatus } from "@/db/enums";
import { months, transactions } from "@/db/schema";
import { z } from "zod";

const updateMonthSchema = z.object({
  status: z.enum(["RASCUNHO", "ATIVO", "FECHADO"]).optional(),
  notes: z.string().optional(),
  bankBalanceAtClose: z.number().optional(),
  creditCardAtClose: z.number().optional(),
});

function serializeMonth(m: { id: string; year: number; month: number; status: string; notes: string | null; closedAt: Date | null; bankBalanceAtClose: unknown; creditCardAtClose: unknown; createdAt: Date; updatedAt: Date }) {
  return {
    ...m,
    bankBalanceAtClose: m.bankBalanceAtClose != null ? Number(m.bankBalanceAtClose) : null,
    creditCardAtClose: m.creditCardAtClose != null ? Number(m.creditCardAtClose) : null,
  };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const month = await db.query.months.findFirst({
      where: eq(months.id, id),
      with: {
        transactions: {
          where: ne(transactions.isAntecipado, true),
          with: {
            category: true,
            bankAccount: true,
            creditCard: true,
            investment: true,
          },
          orderBy: [asc(transactions.createdAt), asc(transactions.id)],
        },
      },
    });
    if (!month) {
      return NextResponse.json({ error: "Mês não encontrado" }, { status: 404 });
    }
    const serialized = {
      ...serializeMonth(month),
      transactions: month.transactions.map((t) => ({
        ...t,
        amountPrevisto: Number(t.amountPrevisto),
        amountRealizado: t.amountRealizado != null ? Number(t.amountRealizado) : null,
        amountReembolso: t.amountReembolso != null ? Number(t.amountReembolso) : null,
        bankAccount: t.bankAccount ? { id: t.bankAccount.id, name: t.bankAccount.name } : null,
        creditCard: t.creditCard ? { id: t.creditCard.id, name: t.creditCard.name } : null,
        investment: t.investment
          ? { id: t.investment.id, name: t.investment.name, ticker: t.investment.ticker }
          : null,
        investmentOperationId: t.investmentOperationId ?? null,
        investmentDate: t.investmentDate?.toISOString().slice(0, 10) ?? null,
        transactionDate: t.transactionDate?.toISOString().slice(0, 10) ?? null,
      })),
    };
    return NextResponse.json(serialized);
  } catch (error) {
    console.error("GET /api/months/[id]:", error);
    return NextResponse.json(
      { error: "Falha ao buscar mês" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const parsed = updateMonthSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados inválidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    // Fechar passa por POST /api/months/[id]/fechar, que grava snapshots, saldo e o mês seguinte.
    if (parsed.data.status === "FECHADO") {
      return NextResponse.json(
        { error: "Use o fechamento do mês para marcar como fechado" },
        { status: 400 }
      );
    }

    const data: Record<string, unknown> = {};
    if (parsed.data.status !== undefined) data.status = parsed.data.status as MonthStatus;
    if (parsed.data.notes !== undefined) data.notes = parsed.data.notes;
    if (parsed.data.bankBalanceAtClose !== undefined) data.bankBalanceAtClose = parsed.data.bankBalanceAtClose;
    if (parsed.data.creditCardAtClose !== undefined) data.creditCardAtClose = parsed.data.creditCardAtClose;
    if (parsed.data.status !== undefined) data.closedAt = null; // reabrir

    // PATCH sem campos: o Prisma só tocava o updatedAt; o Drizzle recusa set vazio.
    const [month] = await db
      .update(months)
      .set(Object.keys(data).length > 0 ? data : { updatedAt: new Date() })
      .where(eq(months.id, id))
      .returning();
    if (!month) return NextResponse.json({ error: "Mês não encontrado" }, { status: 404 });
    return NextResponse.json(serializeMonth(month));
  } catch (error) {
    console.error("PATCH /api/months/[id]:", error);
    return NextResponse.json(
      { error: "Falha ao atualizar mês" },
      { status: 500 }
    );
  }
}
