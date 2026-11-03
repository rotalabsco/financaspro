import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, inArray, ne, or } from "drizzle-orm";
import { db } from "@/db";
import { months, systemConfig, transactions } from "@/db/schema";
import { currentYearMonth } from "@/lib/dates";
import { isBalanceCarryRow } from "@/lib/system-categories";
import type { CategorySystemRole } from "@/db/enums";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const yearParam = searchParams.get("year");
    const monthParam = searchParams.get("month");

    const now = currentYearMonth();
    const year = yearParam ? parseInt(yearParam, 10) : now.year;
    const month = monthParam ? parseInt(monthParam, 10) : now.month;

    if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
      return NextResponse.json(
        { error: "year e month inválidos" },
        { status: 400 }
      );
    }

    const refRow = await db.query.systemConfig.findFirst({ where: eq(systemConfig.key, "forecast_reference") });
    let refYear = now.year;
    let refMonth = now.month;
    if (refRow?.value) {
      try {
        const ref = JSON.parse(refRow.value) as { year: number; month: number };
        if (ref?.year && ref?.month) {
          refYear = ref.year;
          refMonth = ref.month;
        }
      } catch {
        /* usa o mês corrente */
      }
    }

    const isFutureMonth =
      year > refYear || (year === refYear && month > refMonth);

    if (!isFutureMonth) {
      return NextResponse.json({
        receitaPrevisto: 0,
        despesasPorCategoria: [],
        totalDespesasPrevisto: 0,
        isFuture: false,
      });
    }

    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;

    const [currentMonthRecord, prevMonthRecord] = await Promise.all([
      db.query.months.findFirst({
        where: and(eq(months.year, year), eq(months.month, month)),
        with: { transactions: { where: ne(transactions.isAntecipado, true), with: { category: true } } },
      }),
      db.query.months.findFirst({
        where: and(eq(months.year, prevYear), eq(months.month, prevMonth)),
        with: { transactions: { where: ne(transactions.isAntecipado, true), with: { category: true } } },
      }),
    ]);

    type MonthTx = { category: { isReceita: boolean | null; name: string; systemRole: CategorySystemRole | null } | null; notes: string | null; amountRealizado: unknown; amountPrevisto: unknown; amountReembolso: unknown };

    const isBalanceCarryTx = (t: MonthTx) => isBalanceCarryRow(t);

    /** Receitas recorrentes (salário etc.) — usado ao espelhar o mês anterior. */
    const filterReceitasOperacionais = (txs: MonthTx[]) =>
      txs.filter((t) => t.category?.isReceita && !isBalanceCarryTx(t));

    /** Todas as receitas do mês, inclusive saldo inicial do fechamento anterior. */
    const filterReceitasMesAtual = (txs: MonthTx[]) =>
      txs.filter((t) => t.category?.isReceita);

    const sumReceitas = (rxs: MonthTx[]) =>
      rxs.reduce((s, t) => {
        const val = t.amountRealizado != null ? Number(t.amountRealizado) : Number(t.amountPrevisto);
        const reemb = t.amountReembolso != null ? Number(t.amountReembolso) : 0;
        return s + val - reemb;
      }, 0);

    let receitaPrevisto = 0;
    let receitaFromCurrentMonth = false;

    if (currentMonthRecord) {
      const receitasAtual = filterReceitasMesAtual(currentMonthRecord.transactions);
      const receitasOperacionaisAtual = filterReceitasOperacionais(
        currentMonthRecord.transactions
      );
      if (receitasOperacionaisAtual.length > 0) {
        receitaPrevisto = sumReceitas(receitasAtual);
        receitaFromCurrentMonth = true;
      } else {
        // Só há saldo inicial de fechamento (ou nada): soma-o ao espelho do mês anterior.
        const saldoInicial = sumReceitas(receitasAtual.filter(isBalanceCarryTx));
        const espelho = prevMonthRecord
          ? sumReceitas(filterReceitasOperacionais(prevMonthRecord.transactions))
          : 0;
        receitaPrevisto = saldoInicial + espelho;
      }
    } else if (prevMonthRecord) {
      receitaPrevisto = sumReceitas(filterReceitasOperacionais(prevMonthRecord.transactions));
    }

    const forecastConfigs = await db.query.forecastCategories.findMany({ with: { category: true } });
    const categoryIds = forecastConfigs.map((c) => c.categoryId);

    if (categoryIds.length === 0) {
      return NextResponse.json({
        receitaPrevisto,
        receitaFromCurrentMonth,
        despesasPorCategoria: [],
        totalDespesasPrevisto: 0,
        isFuture: true,
      });
    }

    const prev3Months: { year: number; month: number }[] = [];
    for (let i = 1; i <= 3; i++) {
      let m = prevMonth - (i - 1);
      let y = prevYear;
      while (m < 1) {
        m += 12;
        y -= 1;
      }
      prev3Months.push({ year: y, month: m });
    }

    const monthsRange = await db.query.months.findMany({
      where: or(...prev3Months.map(({ year: y, month: m }) => and(eq(months.year, y), eq(months.month, m)))),
      with: {
        transactions: {
          where: and(inArray(transactions.categoryId, categoryIds), ne(transactions.isAntecipado, true)),
          columns: { categoryId: true, amountRealizado: true, amountPrevisto: true, amountReembolso: true },
        },
      },
      orderBy: [desc(months.year), desc(months.month)],
    });

    const monthsByKey = new Map(monthsRange.map((m) => [`${m.year}-${m.month}`, m]));

    // Por categoria: só entram meses em que essa categoria teve despesa líquida > 0.
    // Não reutilizar o mesmo "número de meses" de outras categorias (ex.: Habitação com 1 mês
    // não deve ser diluída porque Mercado teve 2 meses).
    const valuesByCategory: Record<string, number[]> = {};
    for (const { year: y, month: m } of prev3Months) {
      const rec = monthsByKey.get(`${y}-${m}`);
      if (!rec) continue;

      const byCat: Record<string, number> = {};
      for (const t of rec.transactions) {
        const val = t.amountRealizado != null ? Number(t.amountRealizado) : Number(t.amountPrevisto);
        const reemb = t.amountReembolso != null ? Number(t.amountReembolso) : 0;
        const total = val - reemb;
        if (total > 0) {
          byCat[t.categoryId] = (byCat[t.categoryId] ?? 0) + total;
        }
      }
      for (const catId of categoryIds) {
        const amount = byCat[catId] ?? 0;
        if (amount <= 0) continue;
        if (!valuesByCategory[catId]) valuesByCategory[catId] = [];
        valuesByCategory[catId].push(amount);
      }
    }

    const despesasPorCategoria = categoryIds.map((categoryId) => {
      const cfg = forecastConfigs.find((c) => c.categoryId === categoryId);
      const values = valuesByCategory[categoryId] ?? [];
      const media =
        values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
      return {
        categoryId,
        name: cfg?.category.name ?? "",
        color: cfg?.category.color ?? "#6B7280",
        media: Math.round(media * 100) / 100,
        mesesUsados: values.length,
      };
    });

    const totalDespesasPrevisto = despesasPorCategoria.reduce((s, c) => s + c.media, 0);

    return NextResponse.json({
      receitaPrevisto,
      receitaFromCurrentMonth,
      despesasPorCategoria,
      totalDespesasPrevisto,
      isFuture: true,
    });
  } catch (error) {
    console.error("GET /api/previsao:", error);
    return NextResponse.json(
      { error: "Falha ao calcular previsão" },
      { status: 500 }
    );
  }
}
