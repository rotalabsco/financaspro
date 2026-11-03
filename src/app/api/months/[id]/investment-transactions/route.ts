import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { bankAccounts, categories, investmentOperations, investments, months, transactions } from "@/db/schema";
import { getSession } from "@/lib/session";
import { TransactionType } from "@/db/enums";
import { z } from "zod";
import { todayDateOnly } from "@/lib/dates";
import { ensureSystemCategory } from "@/lib/system-categories";

const createInvestmentTransactionSchema = z.object({
  investmentId: z.string().min(1),
  operationType: z.enum(["BUY", "SELL"]),
  description: z.string().min(1).max(200).optional(),
  amount: z.number().positive(),
  bankAccountId: z.string().min(1),
  investmentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  notes: z.string().max(500).optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  try {
    const { id: monthId } = await params;
    const body = await request.json();
    const parsed = createInvestmentTransactionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados inválidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const {
      investmentId,
      operationType,
      description,
      amount,
      bankAccountId,
      investmentDate,
      notes,
    } = parsed.data;

    const month = await db.query.months.findFirst({ where: eq(months.id, monthId) });
    if (!month) {
      return NextResponse.json({ error: "Mês não encontrado" }, { status: 404 });
    }

    const investment = await db.query.investments.findFirst({ where: eq(investments.id, investmentId) });
    if (!investment) {
      return NextResponse.json({ error: "Investimento não encontrado" }, { status: 404 });
    }

    const bankAccount = await db.query.bankAccounts.findFirst({ where: eq(bankAccounts.id, bankAccountId) });
    if (!bankAccount) {
      return NextResponse.json({ error: "Conta bancária não encontrada" }, { status: 404 });
    }

    const isBuy = operationType === "BUY";
    let categoryId: string;

    if (isBuy) {
      categoryId = (await ensureSystemCategory(db, "INVESTIMENTOS")).id;
    } else {
      const receitaCat = await db.query.categories.findFirst({ where: eq(categories.isReceita, true) });
      if (!receitaCat) {
        return NextResponse.json(
          { error: "Categoria de receita não encontrada. Execute o seed." },
          { status: 500 }
        );
      }
      categoryId = receitaCat.id;
    }

    const opDate = investmentDate
      ? new Date(investmentDate)
      : todayDateOnly();

    const total = Math.round(amount * 100) / 100;
    const quantity = 1;
    const unitPrice = total;

    const desc =
      description?.trim() ??
      (isBuy
        ? `Aplicação ${investment.ticker} - ${investment.name}`
        : `Resgate ${investment.ticker} - ${investment.name}`);

    // Operação e lançamento juntos: antes a operação podia ficar sem o lançamento.
    const transactionId = await db.transaction(async (tx) => {
      const [operation] = await tx
        .insert(investmentOperations)
        .values({
          investmentId,
          date: opDate,
          type: operationType,
          quantity,
          unitPrice,
          total,
          fee: 0,
          notes: notes?.trim() ?? null,
        })
        .returning();
      const [created] = await tx
        .insert(transactions)
        .values({
          monthId,
          description: desc,
          categoryId,
          bankAccountId,
          type: TransactionType.A_VISTA,
          source: "CONTA_CORRENTE",
          amountPrevisto: total,
          amountRealizado: total,
          investmentId,
          investmentOperationId: operation.id,
          investmentDate: investmentDate ? new Date(investmentDate) : null,
          installmentCurrent: 1,
          installmentTotal: 1,
          notes: notes?.trim() ?? null,
        })
        .returning({ id: transactions.id });
      return created.id;
    });
    const transaction = (await db.query.transactions.findFirst({
      where: eq(transactions.id, transactionId),
      with: { category: true, bankAccount: true, creditCard: true, investment: true, investmentOperation: true },
    }))!;

    return NextResponse.json({
      ...transaction,
      amountPrevisto: Number(transaction.amountPrevisto),
      amountRealizado: transaction.amountRealizado
        ? Number(transaction.amountRealizado)
        : null,
      amountReembolso: transaction.amountReembolso
        ? Number(transaction.amountReembolso)
        : null,
      bankAccount: transaction.bankAccount
        ? { id: transaction.bankAccount.id, name: transaction.bankAccount.name }
        : null,
      creditCard: null,
      investment: transaction.investment
        ? {
            id: transaction.investment.id,
            name: transaction.investment.name,
            ticker: transaction.investment.ticker,
          }
        : null,
      investmentDate: transaction.investmentDate?.toISOString().slice(0, 10) ?? null,
    });
  } catch (error) {
    console.error("POST /api/months/[id]/investment-transactions:", error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      {
        error: "Erro ao registrar lançamento de investimento",
        details: process.env.NODE_ENV === "development" ? message : undefined,
      },
      { status: 500 }
    );
  }
}
