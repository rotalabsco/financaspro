import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq, isNotNull, ne } from "drizzle-orm";
import { db } from "@/db";
import { MonthStatus, TransactionSource, TransactionType } from "@/db/enums";
import { months, transactions, vaults as vaultsTable, vaultSnapshots } from "@/db/schema";
import {
  backfillRecurrenceGroupIds,
  copyRecurringTransactionToMonth,
} from "@/lib/recurring-transactions";
import { parseNumberLoose } from "@/lib/currency";
import { AUTO_BALANCE_CARRY_NOTE, ensureSystemCategory, isBalanceCarryRow } from "@/lib/system-categories";

export const dynamic = "force-dynamic";

function parseClosureValue(v: unknown): number | null {
  if (typeof v === "number" && !Number.isNaN(v)) return v;
  if (typeof v === "string") return parseNumberLoose(v);
  return null;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const bankBalanceAtClose = parseClosureValue(body.bankBalanceAtClose);

    const month = await db.query.months.findFirst({
      where: eq(months.id, id),
      with: {
        transactions: { orderBy: [asc(transactions.createdAt), asc(transactions.id)] },
        vaultSnapshots: true,
      },
    });

    if (!month) {
      return NextResponse.json({ error: "Mes nao encontrado" }, { status: 404 });
    }

    if (month.status === MonthStatus.FECHADO) {
      return NextResponse.json(
        { error: "Mes ja esta fechado" },
        { status: 400 }
      );
    }

    const vaults = await db.query.vaults.findMany({
      where: isNotNull(vaultsTable.categoryId),
      orderBy: asc(vaultsTable.sortOrder),
      with: { category: true },
    });

    const [prevYear, prevMonth] = month.month === 1
      ? [month.year - 1, 12]
      : [month.year, month.month - 1];

    const prevSnapshots = (
      await db
        .select({ snapshot: vaultSnapshots })
        .from(vaultSnapshots)
        .innerJoin(months, eq(months.id, vaultSnapshots.monthId))
        .where(and(eq(months.year, prevYear), eq(months.month, prevMonth)))
    ).map((r) => r.snapshot);

    const vaultSnapshotsToCreate: {
      vaultId: string;
      monthId: string;
      openingBalance: number;
      closingBalance: number;
      totalExpenses: number;
    }[] = [];

    for (const vault of vaults) {
      if (!vault.categoryId) continue;

      const prevSnapshot = prevSnapshots.find((s) => s.vaultId === vault.id);
      const openingBalance = prevSnapshot
        ? prevSnapshot.closingBalance
        : vault.initialBalance;

      const catExpenses = month.transactions
        .filter((t) => t.categoryId === vault.categoryId)
        .reduce(
          (sum, t) =>
            sum + (t.amountRealizado != null ? Number(t.amountRealizado) : 0),
          0
        );

      const closingBalance =
        Number(openingBalance) + Number(vault.monthlyDeposit) - catExpenses;

      vaultSnapshotsToCreate.push({
        vaultId: vault.id,
        monthId: id,
        openingBalance,
        closingBalance,
        totalExpenses: catExpenses,
      });
    }

    const [nextYear, nextMonth] =
      month.month === 12
        ? [month.year + 1, 1]
        : [month.year, month.month + 1];
    const carryDescription = `Saldo inicial (fechamento ${String(month.month).padStart(2, "0")}/${month.year})`;

    let receitasCopiadas = 0;
    let recorrentesCopiados = 0;

    await backfillRecurrenceGroupIds(db);

    await db.transaction(
      async (tx) => {
      // upsert: um mês reaberto já tem snapshots, e o create batia no @@unique([vaultId, monthId]).
      for (const snapshot of vaultSnapshotsToCreate) {
        const { vaultId: _v, monthId: _m, ...values } = snapshot;
        await tx
          .insert(vaultSnapshots)
          .values(snapshot)
          .onConflictDoUpdate({ target: [vaultSnapshots.vaultId, vaultSnapshots.monthId], set: values });
      }

      await tx
        .update(months)
        .set({
          status: MonthStatus.FECHADO,
          closedAt: new Date(),
          ...(bankBalanceAtClose != null && { bankBalanceAtClose }),
        })
        .where(eq(months.id, id));

      // Prisma: upsert com update vazio. Cria o mês seguinte se não existir (sem materializar).
      await tx
        .insert(months)
        .values({ year: nextYear, month: nextMonth, status: MonthStatus.RASCUNHO })
        .onConflictDoNothing({ target: [months.year, months.month] });
      const [nextMonthRecord] = await tx
        .select({ id: months.id, year: months.year, month: months.month })
        .from(months)
        .where(and(eq(months.year, nextYear), eq(months.month, nextMonth)));

      const recorrentes = await tx.query.transactions.findMany({
        where: and(
          eq(transactions.monthId, id),
          eq(transactions.type, TransactionType.RECORRENTE),
          ne(transactions.isAntecipado, true)
        ),
        with: { category: { columns: { name: true, isReceita: true, systemRole: true } } },
      });

      for (const t of recorrentes) {
        if (isBalanceCarryRow(t)) continue;

        const result = await copyRecurringTransactionToMonth(
          tx,
          t,
          nextMonthRecord
        );
        if (result === "created") {
          recorrentesCopiados += 1;
          if (t.category.isReceita) receitasCopiadas += 1;
        }
      }

      if (bankBalanceAtClose != null && bankBalanceAtClose > 0) {
        const receitaCategoryId = (await ensureSystemCategory(tx, "SALDO_FECHAMENTO")).id;

        const existingCarry = await tx.query.transactions.findFirst({
          where: and(eq(transactions.monthId, nextMonthRecord.id), eq(transactions.notes, AUTO_BALANCE_CARRY_NOTE)),
          columns: { id: true },
        });

        const carryData = {
          description: carryDescription,
          categoryId: receitaCategoryId,
          type: TransactionType.A_VISTA,
          source: TransactionSource.CONTA_CORRENTE,
          amountPrevisto: bankBalanceAtClose,
          amountRealizado: bankBalanceAtClose,
          isConciliado: true,
          notes: AUTO_BALANCE_CARRY_NOTE,
        };

        if (existingCarry) {
          await tx.update(transactions).set(carryData).where(eq(transactions.id, existingCarry.id));
        } else {
          await tx.insert(transactions).values({ monthId: nextMonthRecord.id, ...carryData });
        }
      }
      }
    );

    return NextResponse.json({
      success: true,
      receitasCopiadas,
      recorrentesCopiados,
    });
  } catch (error) {
    console.error("POST /api/months/[id]/fechar:", error);
    return NextResponse.json(
      { error: "Falha ao fechar mes" },
      { status: 500 }
    );
  }
}

