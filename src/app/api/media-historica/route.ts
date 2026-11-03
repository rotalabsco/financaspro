import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { months, transactions as transactionsTable } from "@/db/schema";
import { currentYearMonth } from "@/lib/dates";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const categoryId = searchParams.get("categoryId");
    const monthsParam = searchParams.get("months");
    const yearParam = searchParams.get("year");
    const monthParam = searchParams.get("month");

    const parsedCount = monthsParam ? parseInt(monthsParam, 10) : 3;
    const monthsCount = Number.isFinite(parsedCount) ? Math.min(24, Math.max(1, parsedCount)) : 3;
    const now = currentYearMonth();
    const year = yearParam ? parseInt(yearParam, 10) : now.year;
    const month = monthParam ? parseInt(monthParam, 10) : now.month;

    if (!categoryId) {
      return NextResponse.json(
        { error: "categoryId é obrigatório" },
        { status: 400 }
      );
    }

    // orderBy pela relação month → join explícito.
    const transactions = await db
      .select({
        amountPrevisto: transactionsTable.amountPrevisto,
        amountRealizado: transactionsTable.amountRealizado,
        month: { year: months.year, month: months.month },
      })
      .from(transactionsTable)
      .innerJoin(months, eq(months.id, transactionsTable.monthId))
      .where(eq(transactionsTable.categoryId, categoryId))
      .orderBy(desc(months.year), desc(months.month));

    const byMonth = new Map<string, number>();
    for (const t of transactions) {
      const key = `${t.month.year}-${String(t.month.month).padStart(2, "0")}`;
      const val =
        t.amountRealizado != null
          ? Number(t.amountRealizado)
          : Number(t.amountPrevisto);
      if (val > 0) {
        byMonth.set(key, (byMonth.get(key) ?? 0) + val);
      }
    }

    // Só meses anteriores ao mês de referência e que já aconteceram: parcelas e
    // recorrentes pré-criam meses futuros, que não são histórico.
    const key = (y: number, m: number) => `${y}-${String(m).padStart(2, "0")}`;
    const refKey = key(year, month);
    const currentKey = key(now.year, now.month);
    const sortedMonths = Array.from(byMonth.entries())
      .filter(([k]) => k < refKey && k <= currentKey)
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, monthsCount);
    const values = sortedMonths.map(([, v]) => v);
    const media =
      values.length > 0
        ? values.reduce((a, b) => a + b, 0) / values.length
        : 0;

    return NextResponse.json({
      categoryId,
      media: Math.round(media * 100) / 100,
      sampleSize: values.length,
      monthsUsed: monthsCount,
    });
  } catch (error) {
    console.error("GET /api/media-historica:", error);
    return NextResponse.json(
      { error: "Falha ao calcular média" },
      { status: 500 }
    );
  }
}
