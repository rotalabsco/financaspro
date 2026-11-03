import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { categories as categoriesTable, forecastCategories } from "@/db/schema";

/** Configs com a categoria, na ordem da categoria (orderBy por relação → join). */
function listForecastConfigs() {
  return db
    .select({
      id: forecastCategories.id,
      categoryId: forecastCategories.categoryId,
      category: {
        id: categoriesTable.id,
        name: categoriesTable.name,
        color: categoriesTable.color,
        isReceita: categoriesTable.isReceita,
      },
    })
    .from(forecastCategories)
    .innerJoin(categoriesTable, eq(categoriesTable.id, forecastCategories.categoryId))
    .orderBy(asc(categoriesTable.sortOrder));
}
import { z } from "zod";

export async function GET() {
  try {
    const configs = await listForecastConfigs();
    return NextResponse.json(
      configs.map((c) => ({
        id: c.id,
        categoryId: c.categoryId,
        category: {
          id: c.category.id,
          name: c.category.name,
          color: c.category.color,
          isReceita: c.category.isReceita,
        },
      }))
    );
  } catch (error) {
    console.error("GET /api/settings/forecast-categories:", error);
    return NextResponse.json(
      { error: "Falha ao listar categorias de previsão" },
      { status: 500 }
    );
  }
}

const updateSchema = z.object({
  categoryIds: z.array(z.string().min(1)),
});

async function handleUpsertForecastCategories(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados inválidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { categoryIds } = parsed.data;
    const uniqueIds = Array.from(new Set(categoryIds));

    // inArray com lista vazia lança no Drizzle; o Prisma devolvia [] (categoryIds: [] limpa tudo).
    const categories =
      uniqueIds.length === 0
        ? []
        : await db
            .select({ id: categoriesTable.id })
            .from(categoriesTable)
            .where(and(inArray(categoriesTable.id, uniqueIds), eq(categoriesTable.isReceita, false)));
    const validIds = categories.map((c) => c.id);

    await db.transaction(async (tx) => {
      await tx.delete(forecastCategories);
      if (validIds.length > 0) {
        await tx.insert(forecastCategories).values(validIds.map((categoryId) => ({ categoryId })));
      }
    });

    const configs = await listForecastConfigs();
    return NextResponse.json(
      configs.map((c) => ({
        id: c.id,
        categoryId: c.categoryId,
        category: {
          id: c.category.id,
          name: c.category.name,
          color: c.category.color,
          isReceita: c.category.isReceita,
        },
      }))
    );
  } catch (error) {
    console.error("PUT /api/settings/forecast-categories:", error);
    return NextResponse.json(
      { error: "Falha ao atualizar categorias de previsão" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  return handleUpsertForecastCategories(request);
}

export async function POST(request: NextRequest) {
  return handleUpsertForecastCategories(request);
}
