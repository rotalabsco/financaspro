import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq, gt, inArray, lte, ne } from "drizzle-orm";
import { db as rootDb } from "@/db";
import { transactions } from "@/db/schema";
import { z } from "zod";

const bodySchema = z.object({
  quantidade: z.number().int().min(1),
  desconto: z.number().min(0).default(0),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await bodySchema.parseAsync(await request.json());

    const tx = await rootDb.query.transactions.findFirst({
      where: eq(transactions.id, id),
      with: { month: true },
    });
    if (!tx || tx.type !== "PARCELADO" || !tx.parceladoGroupId || !tx.installmentCurrent || !tx.installmentTotal) {
      return NextResponse.json({ error: "Transação parcelada não encontrada" }, { status: 404 });
    }

    const { quantidade, desconto } = body;
    const cur = tx.installmentCurrent;
    const tot = tx.installmentTotal;
    const valorParcela = Number(tx.amountPrevisto);
    // Só parcelas futuras que ainda não foram antecipadas: um segundo clique não cobra de novo.
    const pendentes = await rootDb
      .select({ id: transactions.id, installmentCurrent: transactions.installmentCurrent })
      .from(transactions)
      .where(
        and(
          eq(transactions.parceladoGroupId, tx.parceladoGroupId),
          gt(transactions.installmentCurrent, cur),
          lte(transactions.installmentCurrent, tot),
          ne(transactions.isAntecipado, true)
        )
      )
      .orderBy(asc(transactions.installmentCurrent))
      .limit(quantidade);
    const maxAntecipar = pendentes.length;
    if (maxAntecipar <= 0) {
      return NextResponse.json({ error: "Não há parcelas futuras para antecipar" }, { status: 400 });
    }

    const valorTotal = valorParcela * maxAntecipar - desconto;
    if (valorTotal <= 0) {
      return NextResponse.json({ error: "Valor com desconto deve ser positivo" }, { status: 400 });
    }

    const idsAntecipar = pendentes.map((p) => p.id);

    const descricao = maxAntecipar === 1
      ? `${tx.description} — Antecipação parcela ${pendentes[0].installmentCurrent}/${tot}`
      : `${tx.description} — Antecipação ${maxAntecipar} parcelas`;

    const antecipacao = await rootDb.transaction(async (db) => {
      const marcadas = await db
        .update(transactions)
        .set({ isAntecipado: true })
        .where(and(inArray(transactions.id, idsAntecipar), ne(transactions.isAntecipado, true)));
      // Outra requisição antecipou as mesmas parcelas no meio do caminho.
      if (marcadas.rowCount !== idsAntecipar.length) throw new AntecipacaoConcorrente();
      const [created] = await db.insert(transactions).values({
        monthId: tx.monthId,
        parceladoGroupId: tx.parceladoGroupId,
        description: descricao,
        categoryId: tx.categoryId,
        bankAccountId: tx.bankAccountId,
        creditCardId: tx.creditCardId,
        type: tx.type,
        source: tx.source,
        amountPrevisto: valorTotal,
        amountRealizado: valorTotal,
        amountReembolso: null,
        installmentCurrent: null,
        installmentTotal: null,
        notes: desconto > 0 ? `Desconto: R$ ${desconto.toFixed(2)}` : null,
      }).returning();
      return (await db.query.transactions.findFirst({
        where: eq(transactions.id, created.id),
        with: { category: true, bankAccount: true, creditCard: true },
      }))!;
    });

    return NextResponse.json({
      ...antecipacao,
      amountPrevisto: Number(antecipacao.amountPrevisto),
      amountRealizado: Number(antecipacao.amountRealizado),
    });
  } catch (error) {
    if (error instanceof AntecipacaoConcorrente) {
      return NextResponse.json({ error: "Essas parcelas já foram antecipadas" }, { status: 409 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Dados inválidos", details: error.flatten() }, { status: 400 });
    }
    console.error("POST /api/transactions/[id]/antecipar:", error);
    return NextResponse.json(
      { error: "Falha ao antecipar parcelas" },
      { status: 500 }
    );
  }
}

class AntecipacaoConcorrente extends Error {}
