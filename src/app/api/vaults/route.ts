import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { months, transactions as transactionsTable, vaults as vaultsTable } from "@/db/schema";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const monthId = searchParams.get("monthId");

    const vaults = await db.query.vaults.findMany({
      orderBy: asc(vaultsTable.sortOrder),
      with: { category: true },
    });

    if (!monthId) {
      return NextResponse.json(
        vaults.map((v) => ({
          ...v,
          monthlyDeposit: Number(v.monthlyDeposit),
          initialBalance: Number(v.initialBalance),
        }))
      );
    }

    const month = await db.query.months.findFirst({
      where: eq(months.id, monthId),
      with: { vaultSnapshots: true },
    });
    if (!month) {
      return NextResponse.json({ error: "Mês não encontrado" }, { status: 404 });
    }

    const vaultCofres = vaults.filter((v) => v.categoryId != null);
    const cofreCategoryIds = vaultCofres.map((v) => v.categoryId!).filter(Boolean);
    // inArray com lista vazia lança no Drizzle; o Prisma devolvia [] nesse caso.
    const transactions =
      cofreCategoryIds.length === 0
        ? []
        : await db.query.transactions.findMany({
            where: and(
              eq(transactionsTable.monthId, monthId),
              inArray(transactionsTable.categoryId, cofreCategoryIds)
            ),
            orderBy: [asc(transactionsTable.createdAt), asc(transactionsTable.id)],
          });

    const result = vaults.map((v) => {
      const deposit = Number(v.monthlyDeposit);
      const initial = Number(v.initialBalance);
      const snapshot = month.vaultSnapshots.find((s) => s.vaultId === v.id);
      const prevClosing = snapshot ? Number(snapshot.closingBalance) : initial;
      const catExpenses = transactions
        .filter((t) => t.categoryId === v.categoryId)
        .reduce((sum, t) => sum + (t.amountRealizado != null ? Number(t.amountRealizado) : 0), 0);
      const currentBalance = prevClosing + deposit - catExpenses;
      return {
        ...v,
        monthlyDeposit: deposit,
        initialBalance: initial,
        currentBalance,
        totalExpensesThisMonth: catExpenses,
      };
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("GET /api/vaults:", error);
    return NextResponse.json(
      { error: "Falha ao listar cofres" },
      { status: 500 }
    );
  }
}
