import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq, ne } from "drizzle-orm";
import { db as rootDb } from "@/db";
import type { TransactionType, TransactionSource } from "@/db/enums";
import { bankAccounts, categories, creditCards, months, transactions as txTable } from "@/db/schema";
import { z } from "zod";
import { addMonths, getOrCreateMonth } from "@/lib/months";
import { randomUUID } from "crypto";
import { propagateNewSeriesToExistingMonths } from "@/lib/recurring-transactions";
import { todayDateOnly } from "@/lib/dates";
import { ensureSystemCategory } from "@/lib/system-categories";


const MAX_INSTALLMENTS = 420;

const createTransactionSchema = z.object({
  description: z.string().min(1).max(200),
  categoryId: z.string().min(1).optional().nullable(),
  bankAccountId: z.string().min(1).optional().nullable(),
  creditCardId: z.string().min(1).optional().nullable(),
  type: z.enum(["RECORRENTE", "PARCELADO", "A_VISTA"]),
  source: z.enum(["CONTA_CORRENTE", "CARTAO_CREDITO", "DINHEIRO"]).optional(),
  amountPrevisto: z.number().min(0),
  amountRealizado: z.number().optional().nullable(),
  amountReembolso: z.number().min(0).optional().nullable(),
  installmentCurrent: z.number().int().min(1).optional(),
  // Teto de 420 parcelas (35 anos, financiamento imobiliário): sem ele, um total
  // gigante criaria um mês por parcela até lotar o banco.
  installmentTotal: z.number().int().min(1).max(MAX_INSTALLMENTS).optional(),
  notes: z.string().optional(),
  transactionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
});

function serializeTransaction(t: {
  id: string;
  monthId: string;
  parceladoGroupId?: string | null;
  recurrenceGroupId?: string | null;
  recurrenceEndsAtMonth?: string | null;
  description: string;
  categoryId: string;
  type: string;
  amountPrevisto: unknown;
  amountRealizado: unknown;
  amountReembolso?: unknown;
  installmentCurrent: number | null;
  installmentTotal: number | null;
  isAntecipado?: boolean;
  isLateEntry: boolean;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    ...t,
    amountPrevisto: Number(t.amountPrevisto),
    amountRealizado: t.amountRealizado != null ? Number(t.amountRealizado) : null,
    amountReembolso: t.amountReembolso != null ? Number(t.amountReembolso) : null,
  };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const transactions = await rootDb.query.transactions.findMany({
      where: and(eq(txTable.monthId, id), ne(txTable.isAntecipado, true)),
      with: { category: true, bankAccount: true, creditCard: true },
      orderBy: [asc(txTable.createdAt), asc(txTable.id)],
    });
    return NextResponse.json(transactions.map((t) => ({
      ...serializeTransaction(t),
      bankAccount: t.bankAccount ? { id: t.bankAccount.id, name: t.bankAccount.name } : null,
      creditCard: t.creditCard ? { id: t.creditCard.id, name: t.creditCard.name } : null,
    })));
  } catch (error) {
    console.error("GET /api/months/[id]/transactions:", error);
    return NextResponse.json(
      { error: "Falha ao listar transações" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const parsed = createTransactionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados inválidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const {
      description,
      categoryId,
      bankAccountId,
      creditCardId,
      type,
      source,
      amountPrevisto,
      amountRealizado,
      amountReembolso,
      installmentCurrent,
      installmentTotal,
      notes,
      transactionDate,
    } = parsed.data;

    const month = await rootDb.query.months.findFirst({ where: eq(months.id, id) });
    if (!month) {
      return NextResponse.json({ error: "Mês não encontrado" }, { status: 404 });
    }

    let finalCategoryId = categoryId;
    // Receita: body sem categoryId + conta. Aceita A_VISTA ou RECORRENTE.
    const isReceitaFlow =
      (categoryId == null || categoryId === "") && Boolean(bankAccountId);
    if (isReceitaFlow) {
      const receitaCat = await ensureSystemCategory(rootDb, "RECEITA_PADRAO");
      finalCategoryId = receitaCat.id;
      const acc = await rootDb.query.bankAccounts.findFirst({ where: eq(bankAccounts.id, bankAccountId!) });
      if (!acc) {
        return NextResponse.json({ error: "Conta bancária não encontrada" }, { status: 404 });
      }
    } else if (!categoryId) {
      return NextResponse.json(
        { error: "Categoria ou conta bancária é obrigatória" },
        { status: 400 }
      );
    } else {
      const category = await rootDb.query.categories.findFirst({ where: eq(categories.id, categoryId) });
      if (!category) {
        return NextResponse.json({ error: "Categoria não encontrada" }, { status: 404 });
      }
      if (category.isReceita) {
        return NextResponse.json(
          {
            error:
              "Categoria de receita não pode ser usada em despesa. Use o botão + Receita.",
          },
          { status: 400 }
        );
      }
      const src = (source as TransactionSource) ?? "CONTA_CORRENTE";
      if (src === "CONTA_CORRENTE") {
        if (!bankAccountId) {
          return NextResponse.json({ error: "Selecione a conta corrente" }, { status: 400 });
        }
        const acc = await rootDb.query.bankAccounts.findFirst({ where: eq(bankAccounts.id, bankAccountId) });
        if (!acc) {
          return NextResponse.json({ error: "Conta bancária não encontrada" }, { status: 404 });
        }
      } else if (src === "CARTAO_CREDITO") {
        if (!creditCardId) {
          return NextResponse.json({ error: "Selecione o cartão de crédito" }, { status: 400 });
        }
        const card = await rootDb.query.creditCards.findFirst({ where: eq(creditCards.id, creditCardId) });
        if (!card) {
          return NextResponse.json({ error: "Cartão não encontrado" }, { status: 404 });
        }
      }
    }

    if (installmentCurrent != null && installmentTotal != null && installmentCurrent > installmentTotal) {
      return NextResponse.json({ error: "Parcela atual maior que o total de parcelas" }, { status: 400 });
    }

    const parceladoGroupId = type === "PARCELADO" ? randomUUID() : null;
    const recurrenceGroupId = type === "RECORRENTE" ? randomUUID() : null;
    const cur = installmentCurrent ?? 1;
    const tot = installmentTotal ?? 1;

    // Todo lançamento nasce lançado (realizado = previsto se não vier outro valor) e não conciliado:
    // conciliar é o pagamento.
    const realizadoForRow = amountRealizado ?? amountPrevisto;
    const explicitTxDate = transactionDate ? new Date(transactionDate) : null;
    const launchDateForRow = explicitTxDate ?? todayDateOnly();

    const createData = {
      parceladoGroupId,
      recurrenceGroupId,
      description: description.trim(),
      categoryId: finalCategoryId!,
      bankAccountId: bankAccountId ?? null,
      creditCardId: creditCardId ?? null,
      type: type as TransactionType,
      source: (source as TransactionSource) ?? "CONTA_CORRENTE",
      amountPrevisto,
      amountRealizado: realizadoForRow,
      amountReembolso: amountReembolso ?? null,
      installmentCurrent: cur,
      installmentTotal: tot,
      notes: notes?.trim() ?? null,
      transactionDate: launchDateForRow,
    };

    // Série inteira numa transação: uma falha no meio deixava a série pela metade, e o
    // reenvio duplicava a 1ª parcela com outro grupo. Meses futuros criados ao mesmo tempo
    // por outra requisição são resolvidos dentro de getOrCreateMonth (savepoint + releitura).
    const transaction = await rootDb.transaction(async (db) => {
      const [inserted] = await db.insert(txTable).values({ monthId: id, ...createData }).returning();

      // RECORRENTE: entra nos meses seguintes que já existem; os que forem criados depois recebem a série ao nascer.
      if (type === "RECORRENTE") {
        await propagateNewSeriesToExistingMonths(db, inserted.id);
      }
      if (type === "PARCELADO" && tot > cur) {
        for (let i = 1; i <= tot - cur; i++) {
          const { year: y, month: m } = addMonths(month.year, month.month, i);
          const nextMonthRecord = await getOrCreateMonth(y, m, db);
          await db.insert(txTable).values({
            monthId: nextMonthRecord.id,
            parceladoGroupId,
            description: description.trim(),
            categoryId: finalCategoryId!,
            bankAccountId: bankAccountId ?? null,
            creditCardId: creditCardId ?? null,
            type: type as TransactionType,
            source: (source as TransactionSource) ?? "CONTA_CORRENTE",
            amountPrevisto,
            amountRealizado: amountPrevisto,
            amountReembolso: null,
            installmentCurrent: cur + i,
            installmentTotal: tot,
            notes: notes?.trim() ?? null,
          });
        }
      }
      return (await db.query.transactions.findFirst({
        where: eq(txTable.id, inserted.id),
        with: { category: true, bankAccount: true, creditCard: true },
      }))!;
    });

    return NextResponse.json(serializeTransaction(transaction));
  } catch (error) {
    console.error("POST /api/months/[id]/transactions:", error);
    return NextResponse.json(
      { error: "Falha ao criar transação" },
      { status: 500 }
    );
  }
}
