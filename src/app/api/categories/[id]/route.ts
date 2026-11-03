import { NextRequest, NextResponse } from "next/server";
import { count, eq } from "drizzle-orm";
import { db } from "@/db";
import { CategoryDefaultType } from "@/db/enums";
import { categories, transactions, vaults } from "@/db/schema";
import { z } from "zod";

const updateCategorySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  icon: z.string().max(50).optional(),
  group: z.string().max(50).optional().nullable(),
  defaultType: z.enum(["FIXO", "VARIAVEL", "RECORRENTE", "COFRE"]).optional(),
  monthlyGoal: z.number().min(0).optional().nullable(),
  isArchived: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const parsed = updateCategorySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados inválidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data: Record<string, unknown> = {};
    if (parsed.data.name !== undefined) data.name = parsed.data.name.trim();
    if (parsed.data.color !== undefined) data.color = parsed.data.color;
    if (parsed.data.icon !== undefined) data.icon = parsed.data.icon;
    if (parsed.data.group !== undefined) data.group = parsed.data.group;
    if (parsed.data.defaultType !== undefined) data.defaultType = parsed.data.defaultType as CategoryDefaultType;
    if (parsed.data.monthlyGoal !== undefined) data.monthlyGoal = parsed.data.monthlyGoal;
    if (parsed.data.isArchived !== undefined) data.isArchived = parsed.data.isArchived;
    if (parsed.data.sortOrder !== undefined) data.sortOrder = parsed.data.sortOrder;

    // PATCH sem campos: o Prisma só tocava o updatedAt; o Drizzle recusa set vazio.
    const [category] = await db
      .update(categories)
      .set(Object.keys(data).length > 0 ? data : { updatedAt: new Date() })
      .where(eq(categories.id, id))
      .returning();
    if (!category) return NextResponse.json({ error: "Categoria não encontrada" }, { status: 404 });
    return NextResponse.json({
      ...category,
      monthlyGoal: category.monthlyGoal != null ? Number(category.monthlyGoal) : null,
    });
  } catch (error) {
    console.error("PATCH /api/categories/[id]:", error);
    return NextResponse.json(
      { error: "Falha ao atualizar categoria" },
      { status: 500 }
    );
  }
}

const deleteBodySchema = z.object({
  reassignToCategoryId: z.string().min(1).optional(),
});

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    let reassignToCategoryId: string | undefined;
    try {
      const body = await request.json().catch(() => ({}));
      const parsed = deleteBodySchema.safeParse(body);
      if (parsed.success && parsed.data.reassignToCategoryId) {
        reassignToCategoryId = parsed.data.reassignToCategoryId;
      }
    } catch {
      // Body vazio ou inválido - sem reassign
    }

    const category = await db.query.categories.findFirst({
      where: eq(categories.id, id),
    });
    if (!category) {
      return NextResponse.json({ error: "Categoria não encontrada" }, { status: 404 });
    }
    const [[{ n: transactionCount }], [{ n: vaultCount }]] = await Promise.all([
      db.select({ n: count() }).from(transactions).where(eq(transactions.categoryId, id)),
      db.select({ n: count() }).from(vaults).where(eq(vaults.categoryId, id)),
    ]);
    const _count = { transactions: transactionCount, vaults: vaultCount };
    if (category.isSystemDefault) {
      return NextResponse.json(
        { error: "Categorias padrão não podem ser excluídas. Arquivar em vez disso." },
        { status: 400 }
      );
    }

    const hasData =
      _count.transactions > 0 || _count.vaults > 0;
    if (hasData && !reassignToCategoryId) {
      return NextResponse.json(
        {
          error: "Informe a categoria de destino para os lançamentos e cofres desta categoria.",
          needsReassign: true,
          transactionCount: _count.transactions,
          vaultCount: _count.vaults,
        },
        { status: 400 }
      );
    }

    if (reassignToCategoryId) {
      if (reassignToCategoryId === id) {
        return NextResponse.json(
          { error: "A categoria de destino deve ser diferente da que está sendo excluída." },
          { status: 400 }
        );
      }
      const targetExists = await db.query.categories.findFirst({
        where: eq(categories.id, reassignToCategoryId),
      });
      if (!targetExists) {
        return NextResponse.json(
          { error: "Categoria de destino não encontrada." },
          { status: 400 }
        );
      }

      const targetId = reassignToCategoryId;
      await db.transaction(async (tx) => {
        await tx.update(transactions).set({ categoryId: targetId }).where(eq(transactions.categoryId, id));
        await tx.update(vaults).set({ categoryId: targetId }).where(eq(vaults.categoryId, id));
        await tx.delete(categories).where(eq(categories.id, id));
      });
    } else {
      await db.delete(categories).where(eq(categories.id, id));
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/categories/[id]:", error);
    return NextResponse.json(
      { error: "Falha ao remover categoria" },
      { status: 500 }
    );
  }
}
