import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { investmentOperations, investments } from "@/db/schema";
import { getSession } from "@/lib/session";
import { z } from "zod";
import { appendGrowthSnapshot } from "@/lib/investment-growth";

const updateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  ticker: z.string().min(1).max(20).optional(),
  assetType: z
    .enum([
      "RENDA_FIXA",
      "POUPANCA_CAIXINHA",
      "ACOES",
      "FII",
      "ETF",
      "BITCOIN",
      "USDC",
      "OUTROS",
    ])
    .optional(),
  currentUnitPrice: z.number().min(0).optional(),
  balanceOnlyPosition: z.boolean().optional(),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  try {
    const investment = await db.query.investments.findFirst({
      where: eq(investments.id, (await params).id),
      with: {
        operations: { orderBy: [desc(investmentOperations.date), desc(investmentOperations.createdAt), desc(investmentOperations.id)] },
      },
    });
    if (!investment) {
      return NextResponse.json({ error: "Investimento não encontrado" }, { status: 404 });
    }
    return NextResponse.json(investment);
  } catch (error) {
    console.error("GET /api/investments/[id]:", error);
    return NextResponse.json({ error: "Erro ao buscar investimento" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados inválidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = {
      ...parsed.data,
      ...(parsed.data.assetType === "POUPANCA_CAIXINHA"
        ? { balanceOnlyPosition: true }
        : {}),
    };

    // PATCH sem campos: só toca o updatedAt, como antes (o Drizzle recusa set vazio).
    const [investment] = await db
      .update(investments)
      .set(Object.keys(data).length > 0 ? data : { updatedAt: new Date() })
      .where(eq(investments.id, (await params).id))
      .returning();
    if (!investment) {
      return NextResponse.json({ error: "Investimento não encontrado" }, { status: 404 });
    }
    if (parsed.data.currentUnitPrice !== undefined) {
      await appendGrowthSnapshot(db);
    }
    return NextResponse.json(investment);
  } catch (error) {
    console.error("PATCH /api/investments/[id]:", error);
    return NextResponse.json({ error: "Erro ao atualizar investimento" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  try {
    const deleted = await db
      .delete(investments)
      .where(eq(investments.id, (await params).id))
      .returning({ id: investments.id });
    if (deleted.length === 0) {
      return NextResponse.json({ error: "Investimento não encontrado" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/investments/[id]:", error);
    return NextResponse.json({ error: "Erro ao excluir investimento" }, { status: 500 });
  }
}
