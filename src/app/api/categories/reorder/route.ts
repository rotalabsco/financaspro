import { NextRequest, NextResponse } from "next/server";
import { eq, TransactionRollbackError } from "drizzle-orm";
import { db } from "@/db";
import { categories } from "@/db/schema";
import { z } from "zod";

const reorderSchema = z.object({
  ids: z.array(z.string().min(1)).min(1),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = reorderSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "ids é obrigatório (array de IDs)" },
        { status: 400 }
      );
    }

    const { ids } = parsed.data;
    // O Prisma abortava a transação inteira se um id não existisse; aqui idem, com 404.
    const missing = await db.transaction(async (tx) => {
      for (let index = 0; index < ids.length; index++) {
        const id = ids[index];
        const updated = await tx
          .update(categories)
          .set({ sortOrder: index })
          .where(eq(categories.id, id))
          .returning({ id: categories.id });
        if (updated.length === 0) {
          tx.rollback();
        }
      }
      return false;
    }).catch((error: unknown) => {
      if (error instanceof TransactionRollbackError) return true;
      throw error;
    });
    if (missing) {
      return NextResponse.json({ error: "Categoria não encontrada" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("POST /api/categories/reorder:", error);
    return NextResponse.json(
      { error: "Falha ao reordenar categorias" },
      { status: 500 }
    );
  }
}
