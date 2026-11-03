import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "crypto";
import { and, asc, eq, inArray, isNull, ne, or } from "drizzle-orm";
import { db } from "@/db";
import { bankAccounts as bankAccountsTable, categories, transactions } from "@/db/schema";
import { getSession } from "@/lib/session";
import { getOrCreateMonth } from "@/lib/months";
import {
  backfillRecurrenceGroupIds,
  effectiveRecurringAmount,
  monthKey,
  propagateNewSeriesToExistingMonths,
} from "@/lib/recurring-transactions";
import { AUTO_BALANCE_CARRY_NOTE, ensureSystemCategory } from "@/lib/system-categories";

export const dynamic = "force-dynamic";


const createSchema = z.object({
  description: z.string().min(1).max(200),
  bankAccountId: z.string().min(1),
  amount: z.number().positive(),
  type: z.enum(["A_VISTA", "RECORRENTE"]).default("RECORRENTE"),
  /** Competência inicial YYYY-MM */
  competencia: z.string().regex(/^\d{4}-\d{2}$/),
});

/**
 * Lista séries de receita + avulsos recentes (exclui saldo de fechamento).
 */
export async function GET() {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  try {
    await backfillRecurrenceGroupIds(db);

    // Não usar NOT { notes: X }: em SQL isso também exclui notes IS NULL.
    const rows = await db.query.transactions.findMany({
      where: and(
        inArray(
          transactions.categoryId,
          db
            .select({ id: categories.id })
            .from(categories)
            .where(
              and(
                eq(categories.isReceita, true),
                // Saldo de fechamento fica de fora (papel ou, em bancos antigos, pela nota abaixo).
                or(isNull(categories.systemRole), ne(categories.systemRole, "SALDO_FECHAMENTO"))
              )
            )
        ),
        ne(transactions.isAntecipado, true),
        or(isNull(transactions.notes), ne(transactions.notes, AUTO_BALANCE_CARRY_NOTE))
      ),
      with: {
        category: { columns: { id: true, name: true, color: true, isReceita: true } },
        bankAccount: { columns: { id: true, name: true } },
        month: { columns: { id: true, year: true, month: true, status: true } },
      },
      orderBy: [asc(transactions.createdAt), asc(transactions.id)],
    });

    type Series = {
      recurrenceGroupId: string;
      description: string;
      category: (typeof rows)[number]["category"];
      bankAccount: (typeof rows)[number]["bankAccount"];
      type: string;
      recurrenceEndsAtMonth: string | null;
      monthsCount: number;
      firstMonth: string;
      lastMonth: string;
      lastAmount: number;
      sampleTransactionId: string;
    };

    const seriesMap = new Map<string, Series>();
    const avulsos: {
      id: string;
      description: string;
      bankAccount: (typeof rows)[number]["bankAccount"];
      month: string;
      amount: number;
      isConciliado: boolean;
    }[] = [];

    for (const row of rows) {
      const mk = monthKey(row.month.year, row.month.month);
      const amount = effectiveRecurringAmount(row);

      if (row.type === "RECORRENTE" && row.recurrenceGroupId) {
        const existing = seriesMap.get(row.recurrenceGroupId);
        if (!existing) {
          seriesMap.set(row.recurrenceGroupId, {
            recurrenceGroupId: row.recurrenceGroupId,
            description: row.description,
            category: row.category,
            bankAccount: row.bankAccount,
            type: row.type,
            recurrenceEndsAtMonth: row.recurrenceEndsAtMonth,
            monthsCount: 1,
            firstMonth: mk,
            lastMonth: mk,
            lastAmount: amount,
            sampleTransactionId: row.id,
          });
        } else {
          existing.monthsCount += 1;
          if (mk < existing.firstMonth) existing.firstMonth = mk;
          if (mk > existing.lastMonth) {
            existing.lastMonth = mk;
            existing.lastAmount = amount;
            existing.sampleTransactionId = row.id;
          }
          if (row.recurrenceEndsAtMonth) {
            existing.recurrenceEndsAtMonth = row.recurrenceEndsAtMonth;
          }
        }
        continue;
      }

      if (row.type !== "RECORRENTE") {
        avulsos.push({
          id: row.id,
          description: row.description,
          bankAccount: row.bankAccount,
          month: mk,
          amount,
          isConciliado: row.isConciliado,
        });
      }
    }

    const series = Array.from(seriesMap.values()).sort((a, b) =>
      a.description.localeCompare(b.description, "pt-BR")
    );

    avulsos.sort((a, b) => b.month.localeCompare(a.month));

    const bankAccounts = await db.query.bankAccounts.findMany({
      orderBy: asc(bankAccountsTable.name),
      columns: { id: true, name: true, institution: true },
    });

    return NextResponse.json({
      seriesAtivas: series.filter((s) => !s.recurrenceEndsAtMonth),
      seriesEncerradas: series.filter((s) => Boolean(s.recurrenceEndsAtMonth)),
      avulsos: avulsos.slice(0, 40),
      bankAccounts,
    });
  } catch (error) {
    console.error("GET /api/receitas:", error);
    return NextResponse.json({ error: "Falha ao listar receitas" }, { status: 500 });
  }
}

/**
 * Cria receita na competência informada (à vista ou recorrente).
 */
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados inválidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { description, bankAccountId, amount, type, competencia } = parsed.data;
    const [ys, ms] = competencia.split("-").map(Number);
    if (!ys || !ms || ms < 1 || ms > 12) {
      return NextResponse.json({ error: "Competência inválida" }, { status: 400 });
    }

    const acc = await db.query.bankAccounts.findFirst({ where: eq(bankAccountsTable.id, bankAccountId) });
    if (!acc) {
      return NextResponse.json({ error: "Conta bancária não encontrada" }, { status: 404 });
    }

    const category = await ensureSystemCategory(db, "RECEITA_PADRAO");
    const month = await getOrCreateMonth(ys, ms);
    const recurrenceGroupId = type === "RECORRENTE" ? randomUUID() : null;

    const [inserted] = await db.insert(transactions).values({
        monthId: month.id,
        description: description.trim(),
        categoryId: category.id,
        bankAccountId,
        type,
        source: "CONTA_CORRENTE",
        amountPrevisto: amount,
        // Nasce lançada e não conciliada; conciliar = dinheiro recebido
        amountRealizado: amount,
        isConciliado: false,
        recurrenceGroupId,
        transactionDate: new Date(Date.UTC(ys, ms - 1, 1)),
    }).returning();
    const created = (await db.query.transactions.findFirst({
      where: eq(transactions.id, inserted.id),
      with: { category: true, bankAccount: true, month: { columns: { year: true, month: true } } },
    }))!;

    const propagated =
      type === "RECORRENTE" ? await propagateNewSeriesToExistingMonths(db, created.id) : 0;

    return NextResponse.json({
      id: created.id,
      description: created.description,
      type: created.type,
      recurrenceGroupId: created.recurrenceGroupId,
      competencia: monthKey(created.month.year, created.month.month),
      amount: Number(created.amountRealizado ?? created.amountPrevisto),
      message:
        type === "RECORRENTE"
          ? `Receita recorrente criada a partir de ${competencia} (${propagated} mês(es) seguinte(s) já existente(s) preenchido(s)).`
          : `Receita à vista lançada em ${competencia}.`,
    });
  } catch (error) {
    console.error("POST /api/receitas:", error);
    return NextResponse.json({ error: "Falha ao criar receita" }, { status: 500 });
  }
}
