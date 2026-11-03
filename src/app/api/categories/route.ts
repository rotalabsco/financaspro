import { NextRequest, NextResponse } from "next/server";
import { asc, eq, max } from "drizzle-orm";
import { db } from "@/db";
import { CategoryDefaultType } from "@/db/enums";
import { categories as categoriesTable } from "@/db/schema";
import { z } from "zod";

const createCategorySchema = z.object({
  name: z.string().min(1).max(100),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional().default("#6B7280"),
  icon: z.string().max(50).optional().default("receipt"),
  group: z.string().max(50).optional(),
  defaultType: z.enum(["FIXO", "VARIAVEL", "RECORRENTE", "COFRE"]).optional().default("VARIAVEL"),
  monthlyGoal: z.number().min(0).optional(),
  sortOrder: z.number().int().min(0).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const includeArchived = searchParams.get("archived") === "true";

    const categories = await db.query.categories.findMany({
      where: includeArchived ? undefined : eq(categoriesTable.isArchived, false),
      orderBy: [asc(categoriesTable.sortOrder), asc(categoriesTable.name)],
    });

    return NextResponse.json(
      categories.map((c) => ({
        ...c,
        monthlyGoal: c.monthlyGoal != null ? Number(c.monthlyGoal) : null,
      }))
    );
  } catch (error) {
    console.error("GET /api/categories:", error);
    return NextResponse.json(
      { error: "Falha ao listar categorias" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = createCategorySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados inválidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    // Sem sortOrder explícito, a nova categoria vai para o fim da lista.
    let sortOrder = parsed.data.sortOrder;
    if (sortOrder == null) {
      const [agg] = await db.select({ maxSortOrder: max(categoriesTable.sortOrder) }).from(categoriesTable);
      sortOrder = (agg?.maxSortOrder ?? -1) + 1;
    }

    const [category] = await db
      .insert(categoriesTable)
      .values({
        name: parsed.data.name.trim(),
        color: parsed.data.color,
        icon: parsed.data.icon,
        group: parsed.data.group?.trim() ?? null,
        defaultType: parsed.data.defaultType as CategoryDefaultType,
        monthlyGoal: parsed.data.monthlyGoal ?? null,
        sortOrder,
      })
      .returning();
    return NextResponse.json({
      ...category,
      monthlyGoal: category.monthlyGoal != null ? Number(category.monthlyGoal) : null,
    });
  } catch (error) {
    console.error("POST /api/categories:", error);
    return NextResponse.json(
      { error: "Falha ao criar categoria" },
      { status: 500 }
    );
  }
}
