import { NextRequest, NextResponse } from "next/server";
import { count, eq } from "drizzle-orm";
import { db } from "@/db";
import { creditCards, transactions } from "@/db/schema";
import { z } from "zod";

const updateCreditCardSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  institution: z.string().max(100).optional().nullable(),
  closingDay: z.number().int().min(1).max(31).optional().nullable(),
  dueDay: z.number().int().min(1).max(31).optional().nullable(),
  creditLimit: z.number().min(0).optional().nullable(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const parsed = updateCreditCardSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados inválidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data: Record<string, unknown> = {};
    if (parsed.data.name !== undefined) data.name = parsed.data.name.trim();
    if (parsed.data.institution !== undefined) data.institution = parsed.data.institution?.trim() ?? null;
    if (parsed.data.closingDay !== undefined) data.closingDay = parsed.data.closingDay;
    if (parsed.data.dueDay !== undefined) data.dueDay = parsed.data.dueDay;
    if (parsed.data.creditLimit !== undefined) data.creditLimit = parsed.data.creditLimit;
    if (parsed.data.isActive !== undefined) data.isActive = parsed.data.isActive;
    if (parsed.data.sortOrder !== undefined) data.sortOrder = parsed.data.sortOrder;

    // PATCH sem campos: o Prisma só tocava o updatedAt; o Drizzle recusa set vazio.
    const [card] = await db
      .update(creditCards)
      .set(Object.keys(data).length > 0 ? data : { updatedAt: new Date() })
      .where(eq(creditCards.id, id))
      .returning();
    if (!card) return NextResponse.json({ error: "Cartão não encontrado" }, { status: 404 });
    return NextResponse.json({
      ...card,
      creditLimit: card.creditLimit != null ? Number(card.creditLimit) : null,
    });
  } catch (error) {
    console.error("PATCH /api/credit-cards/[id]:", error);
    return NextResponse.json(
      { error: "Falha ao atualizar cartão" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const [{ total: linked }] = await db
      .select({ total: count() })
      .from(transactions)
      .where(eq(transactions.creditCardId, id));
    if (linked > 0) {
      return NextResponse.json(
        { error: `Existem ${linked} lançamento(s) vinculado(s) a este cartão. Remova ou altere-os antes de excluir.` },
        { status: 400 }
      );
    }
    const deleted = await db.delete(creditCards).where(eq(creditCards.id, id)).returning({ id: creditCards.id });
    if (deleted.length === 0) return NextResponse.json({ error: "Cartão não encontrado" }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/credit-cards/[id]:", error);
    return NextResponse.json(
      { error: "Falha ao remover cartão" },
      { status: 500 }
    );
  }
}
