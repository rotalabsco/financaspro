import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { investmentOperations } from "@/db/schema";
import { getSession } from "@/lib/session";
import { z } from "zod";

const updateOpSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  type: z.enum(["BUY", "SELL", "SUBSCRIPTION", "BONUS", "DIVIDEND"]).optional(),
  quantity: z.number().positive().optional(),
  unitPrice: z.number().min(0).optional(),
  total: z.number().min(0).optional(),
  fee: z.number().min(0).optional(),
  notes: z.string().max(500).optional().nullable(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; opId: string }> }
) {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  try {
    const { id: investmentId, opId } = await params;
    const op = await db.query.investmentOperations.findFirst({
      where: and(eq(investmentOperations.id, opId), eq(investmentOperations.investmentId, investmentId)),
      with: { investment: true },
    });
    if (!op) {
      return NextResponse.json({ error: "Operação não encontrada" }, { status: 404 });
    }

    const body = await request.json();
    const parsed = updateOpSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados inválidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const at = op.investment?.assetType ?? "";
    const decimals = at === "BITCOIN" || at === "USDC" ? 8 : 4;
    const roundTo = (v: number, d: number) => Math.round(v * Math.pow(10, d)) / Math.pow(10, d);

    const data: Partial<typeof investmentOperations.$inferInsert> = {};
    if (parsed.data.date !== undefined) data.date = new Date(parsed.data.date);
    if (parsed.data.type !== undefined) data.type = parsed.data.type;
    if (parsed.data.quantity !== undefined) data.quantity = roundTo(parsed.data.quantity, decimals);
    if (parsed.data.unitPrice !== undefined) data.unitPrice = roundTo(parsed.data.unitPrice, decimals);
    if (parsed.data.fee !== undefined) data.fee = parsed.data.fee;
    if (parsed.data.notes !== undefined) data.notes = parsed.data.notes;
    const totalDecimals = decimals >= 6 ? decimals : 2;
    if (parsed.data.total !== undefined) {
      data.total = roundTo(parsed.data.total, totalDecimals);
    } else if (
      parsed.data.quantity !== undefined ||
      parsed.data.unitPrice !== undefined
    ) {
      const q = (parsed.data.quantity ?? Number(op.quantity)) as number;
      const p = (parsed.data.unitPrice ?? Number(op.unitPrice)) as number;
      data.total = roundTo(q * p, totalDecimals);
    }

    // PATCH sem campos: devolve a operação sem alterar nada (o Drizzle recusa set vazio).
    const [updated] =
      Object.keys(data).length > 0
        ? await db
            .update(investmentOperations)
            .set(data)
            .where(eq(investmentOperations.id, opId))
            .returning()
        : await db.select().from(investmentOperations).where(eq(investmentOperations.id, opId));
    if (!updated) {
      return NextResponse.json({ error: "Operação não encontrada" }, { status: 404 });
    }
    return NextResponse.json(updated);
  } catch (error) {
    console.error("PATCH /api/investments/[id]/operations/[opId]:", error);
    return NextResponse.json({ error: "Erro ao atualizar operação" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; opId: string }> }
) {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  try {
    const { id: investmentId, opId } = await params;
    const op = await db.query.investmentOperations.findFirst({
      where: and(eq(investmentOperations.id, opId), eq(investmentOperations.investmentId, investmentId)),
    });
    if (!op) {
      return NextResponse.json({ error: "Operação não encontrada" }, { status: 404 });
    }

    await db.delete(investmentOperations).where(eq(investmentOperations.id, opId));
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/investments/[id]/operations/[opId]:", error);
    return NextResponse.json({ error: "Erro ao excluir operação" }, { status: 500 });
  }
}
