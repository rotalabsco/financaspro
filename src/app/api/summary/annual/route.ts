import { NextRequest, NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { categories as categoriesTable, months as monthsTable, transactions } from "@/db/schema";
import { currentYearMonth } from "@/lib/dates";

export const dynamic = "force-dynamic";

interface RealizadoEntry {
  id: string;
  description: string;
  value: number;
  transactionDate: string | null;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const yearParam = searchParams.get("year");
    const year = yearParam ? parseInt(yearParam, 10) : currentYearMonth().year;

    const months = await db.query.months.findMany({
      where: eq(monthsTable.year, year),
      orderBy: asc(monthsTable.month),
      with: {
        transactions: { with: { category: true }, orderBy: [asc(transactions.createdAt), asc(transactions.id)] },
      },
    });

    const categories = await db.query.categories.findMany({
      where: eq(categoriesTable.isArchived, false),
      orderBy: asc(categoriesTable.sortOrder),
    });

    const data = categories.map((cat) => {
      const byMonth: Record<
        number,
        { previsto: number; realizado: number; realizadoEntries: RealizadoEntry[] }
      > = {};
      for (let m = 1; m <= 12; m++) {
        byMonth[m] = { previsto: 0, realizado: 0, realizadoEntries: [] };
      }

      for (const monthData of months) {
        const catTx = monthData.transactions.filter(
          (t) =>
            t.categoryId === cat.id &&
            t.isAntecipado !== true
        );
        for (const t of catTx) {
          const realizedValue =
            t.amountRealizado != null
              ? Number(t.amountRealizado)
              : Number(t.amountPrevisto);
          byMonth[monthData.month].previsto += Number(t.amountPrevisto);
          byMonth[monthData.month].realizado += realizedValue;
          byMonth[monthData.month].realizadoEntries.push({
            id: t.id,
            description: t.description,
            value: realizedValue,
            transactionDate: t.transactionDate
              ? t.transactionDate.toISOString().slice(0, 10)
              : null,
          });
        }
      }

      return {
        categoryId: cat.id,
        categoryName: cat.name,
        categoryColor: cat.color,
        byMonth,
        totalPrevisto: Object.values(byMonth).reduce((s, v) => s + v.previsto, 0),
        totalRealizado: Object.values(byMonth).reduce(
          (s, v) => s + v.realizado,
          0
        ),
      };
    });

    const monthsList = months.map((m) => ({
      id: m.id,
      year: m.year,
      month: m.month,
      status: m.status,
    }));

    return NextResponse.json({
      year,
      categories: data,
      months: monthsList,
    });
  } catch (error) {
    console.error("GET /api/summary/annual:", error);
    return NextResponse.json(
      { error: "Falha ao gerar resumo anual" },
      { status: 500 }
    );
  }
}
