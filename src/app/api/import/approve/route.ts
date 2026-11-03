import { NextRequest, NextResponse } from "next/server";
import { and, count, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { categories, months as monthsTable, transactions } from "@/db/schema";
import { getSession } from "@/lib/session";
import { MonthStatus, TransactionType } from "@/db/enums";
import { z } from "zod";

const parsedTransactionSchema = z.object({
  description: z.string().min(1).max(200),
  categoryName: z.string(),
  type: z.enum(["RECORRENTE", "PARCELADO", "A_VISTA"]),
  amountPrevisto: z.number().min(0),
  amountRealizado: z.number().nullable(),
  installmentCurrent: z.number().int().min(1).nullable(),
  installmentTotal: z.number().int().min(1).nullable(),
  notes: z.string().optional(),
});

const parsedMonthSchema = z.object({
  year: z.number().int().min(2020).max(2100),
  month: z.number().int().min(1).max(12),
  transactions: z.array(parsedTransactionSchema),
});

const approveSchema = z.object({
  months: z.array(parsedMonthSchema),
});

async function findOrCreateCategory(name: string): Promise<string> {
  const trimmed = name.trim() || "Outros";
  const existing = await db.query.categories.findFirst({
    where: sql`lower(${categories.name}) = lower(${trimmed})`,
  });
  if (existing) return existing.id;

  const [{ n: categoryCount }] = await db.select({ n: count() }).from(categories);
  const [created] = await db
    .insert(categories)
    .values({
      name: trimmed,
      color: "#6B7280",
      icon: "receipt",
      defaultType: "VARIAVEL",
      isSystemDefault: false,
      sortOrder: categoryCount + 1,
    })
    .returning({ id: categories.id });
  return created.id;
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const parsed = approveSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados inválidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { months } = parsed.data;
    const created: { year: number; month: number; transactions: number }[] = [];
    const skipped: { year: number; month: number; reason: string }[] = [];

    for (const m of months) {
      if (m.transactions.length === 0) {
        skipped.push({
          year: m.year,
          month: m.month,
          reason: "Sem transações",
        });
        continue;
      }

      const existing = await db.query.months.findFirst({
        where: and(eq(monthsTable.year, m.year), eq(monthsTable.month, m.month)),
      });
      if (existing) {
        skipped.push({
          year: m.year,
          month: m.month,
          reason: "Mês já existe",
        });
        continue;
      }

      const [monthRecord] = await db
        .insert(monthsTable)
        .values({
          year: m.year,
          month: m.month,
          status: MonthStatus.RASCUNHO,
        })
        .returning();

      let txCount = 0;
      for (const t of m.transactions) {
        const categoryId = await findOrCreateCategory(t.categoryName);
        await db.insert(transactions).values({
            monthId: monthRecord.id,
            description: t.description,
            categoryId,
            type: t.type as TransactionType,
            amountPrevisto: t.amountPrevisto,
            amountRealizado: t.amountRealizado ?? null,
            installmentCurrent: t.installmentCurrent ?? null,
            installmentTotal: t.installmentTotal ?? null,
            notes: t.notes ?? null,
            isLateEntry: true,
        });
        txCount++;
      }

      created.push({ year: m.year, month: m.month, transactions: txCount });
    }

    return NextResponse.json({
      success: true,
      created,
      skipped,
      message: `${created.length} mês(es) importado(s), ${skipped.length} ignorado(s).`,
    });
  } catch (error) {
    console.error("POST /api/import/approve:", error);
    return NextResponse.json(
      { error: "Erro ao salvar importação" },
      { status: 500 }
    );
  }
}
