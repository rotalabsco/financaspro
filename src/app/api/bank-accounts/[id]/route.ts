import { NextRequest, NextResponse } from "next/server";
import { count, eq } from "drizzle-orm";
import { db } from "@/db";
import { bankAccounts, transactions } from "@/db/schema";
import { z } from "zod";

const updateBankAccountSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  institution: z.string().max(100).optional().nullable(),
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
    const parsed = updateBankAccountSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados inválidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data: Record<string, unknown> = {};
    if (parsed.data.name !== undefined) data.name = parsed.data.name.trim();
    if (parsed.data.institution !== undefined) data.institution = parsed.data.institution?.trim() ?? null;
    if (parsed.data.isActive !== undefined) data.isActive = parsed.data.isActive;
    if (parsed.data.sortOrder !== undefined) data.sortOrder = parsed.data.sortOrder;

    // PATCH sem campos: o Prisma só tocava o updatedAt; o Drizzle recusa set vazio.
    const [account] = await db
      .update(bankAccounts)
      .set(Object.keys(data).length > 0 ? data : { updatedAt: new Date() })
      .where(eq(bankAccounts.id, id))
      .returning();
    if (!account) return NextResponse.json({ error: "Conta não encontrada" }, { status: 404 });
    return NextResponse.json(account);
  } catch (error) {
    console.error("PATCH /api/bank-accounts/[id]:", error);
    return NextResponse.json(
      { error: "Falha ao atualizar conta" },
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
      .where(eq(transactions.bankAccountId, id));
    if (linked > 0) {
      return NextResponse.json(
        { error: `Existem ${linked} lançamento(s) vinculado(s) a esta conta. Remova ou altere-os antes de excluir.` },
        { status: 400 }
      );
    }
    const deleted = await db.delete(bankAccounts).where(eq(bankAccounts.id, id)).returning({ id: bankAccounts.id });
    if (deleted.length === 0) return NextResponse.json({ error: "Conta não encontrada" }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/bank-accounts/[id]:", error);
    return NextResponse.json(
      { error: "Falha ao remover conta" },
      { status: 500 }
    );
  }
}
