import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { investmentOperations, investments } from "@/db/schema";
import { getSession } from "@/lib/session";
import { z } from "zod";

const operationSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  type: z.enum(["BUY", "SELL", "SUBSCRIPTION", "BONUS", "DIVIDEND"]),
  quantity: z.number().positive(),
  unitPrice: z.number().min(0),
  total: z.number().min(0).optional(),
  fee: z.number().min(0).optional(),
  notes: z.string().max(500).optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const investment = await db.query.investments.findFirst({
      where: eq(investments.id, id),
    });
    if (!investment) {
      return NextResponse.json({ error: "Investimento não encontrado" }, { status: 404 });
    }

    const body = await request.json();
    const parsed = operationSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados inválidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { date, type, quantity, unitPrice, total: totalInput, fee = 0, notes } = parsed.data;
    const at = investment?.assetType ?? "";
    const decimals = at === "BITCOIN" || at === "USDC" ? 8 : 4;
    const roundTo = (v: number, d: number) => Math.round(v * Math.pow(10, d)) / Math.pow(10, d);
    const totalDecimals = decimals >= 6 ? decimals : 2;
    const total = roundTo(totalInput ?? quantity * unitPrice, totalDecimals);
    const feeVal = typeof fee === "number" ? fee : 0;

    const [op] = await db
      .insert(investmentOperations)
      .values({
        investmentId: id,
        date: new Date(date),
        type,
        quantity: roundTo(quantity, decimals),
        unitPrice: roundTo(unitPrice, decimals),
        total,
        fee: feeVal,
        notes: notes || null,
      })
      .returning();
    return NextResponse.json(op);
  } catch (error) {
    console.error("POST /api/investments/[id]/operations:", error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "Erro ao registrar operação", details: process.env.NODE_ENV === "development" ? message : undefined },
      { status: 500 }
    );
  }
}
