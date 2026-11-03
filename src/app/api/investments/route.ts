import { NextResponse } from "next/server";
import { asc, count as countFn, desc } from "drizzle-orm";
import { db } from "@/db";
import { investmentOperations, investments as investmentsTable } from "@/db/schema";
import { getSession } from "@/lib/session";
import { computePositionCostBasisAndQuantity } from "@/lib/investment-average-cost";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().min(1).max(200),
  ticker: z.string().min(1).max(20),
  assetType: z.enum([
    "RENDA_FIXA",
    "POUPANCA_CAIXINHA",
    "ACOES",
    "FII",
    "ETF",
    "BITCOIN",
    "USDC",
    "OUTROS",
  ]),
  currentUnitPrice: z.number().min(0).optional(),
  rentabilidadeType: z.enum(["PRE_FIXADO", "POS_FIXADO"]).optional(),
  taxaPercent: z.number().min(0).optional(),
  indiceReferencia: z.string().max(50).optional(),
  balanceOnlyPosition: z.boolean().optional(),
});

export async function GET() {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  try {
    const fullQuery = () =>
      db.query.investments.findMany({
        orderBy: [asc(investmentsTable.sortOrder), asc(investmentsTable.ticker)],
        with: {
          operations: { orderBy: [desc(investmentOperations.date), desc(investmentOperations.createdAt), desc(investmentOperations.id)], with: { carteira: true } },
        },
      });
    type InvWithRelations = Awaited<ReturnType<typeof fullQuery>>[number];
    let investments: InvWithRelations[];
    try {
      investments = await fullQuery();
    } catch (fullQueryErr) {
      console.error("Full investments query failed, retrying without carteira:", fullQueryErr);
      const partial = await db.query.investments.findMany({
        orderBy: [asc(investmentsTable.sortOrder), asc(investmentsTable.ticker)],
        with: { operations: { orderBy: [desc(investmentOperations.date), desc(investmentOperations.createdAt), desc(investmentOperations.id)] } },
      });
      investments = partial.map((inv) => ({
        ...inv,
        operations: inv.operations.map((op) => ({ ...op, carteira: null })),
      }));
    }

    const enriched = investments.map((inv) => {
      const feeVal = (op: { fee?: unknown }) => Number(op.fee ?? 0);
      const isCrypto = inv.assetType === "BITCOIN" || inv.assetType === "USDC";
      const balanceOnly =
        !isCrypto && (inv.balanceOnlyPosition === true || inv.assetType === "POUPANCA_CAIXINHA");
      const currentValueFromBalance =
        balanceOnly || inv.assetType === "RENDA_FIXA";

      /** Capital líquido aportado (sem rendimento BONUS/DIVIDEND) — usado no modo saldo */
      const investedPrincipal =
        inv.operations
          .filter((op) => op.type === "BUY" || op.type === "SUBSCRIPTION")
          .reduce((s, op) => s + Number(op.total) + feeVal(op), 0)
        - inv.operations
            .filter((op) => op.type === "SELL")
            .reduce((s, op) => s + Number(op.total) - feeVal(op), 0);

      let quantity = 0;
      let costBasis = 0;
      let averagePrice = 0;
      let invested = 0;

      if (balanceOnly) {
        quantity = 0;
        invested = investedPrincipal;
      } else {
        const pos = computePositionCostBasisAndQuantity(inv.operations, feeVal);
        quantity = pos.quantity;
        costBasis = pos.costBasis;
        invested = costBasis;
        averagePrice = quantity > 0 ? costBasis / quantity : 0;
      }

      // O ORM anterior devolvia Decimal (objeto, sempre truthy, inclusive 0); a coluna é NOT NULL,
      // então o ramo do preço gravado vale sempre, mesmo com preço 0.
      const currentPrice = inv.currentUnitPrice != null
        ? Number(inv.currentUnitPrice)
        : currentValueFromBalance
          ? 0
          : averagePrice;
      const currentValue = currentValueFromBalance
        ? Number(inv.currentUnitPrice)
        : quantity * currentPrice;

      let returnPercent = 0;
      if (currentValueFromBalance) {
        returnPercent =
          invested > 0 ? ((currentValue - invested) / invested) * 100 : 0;
      } else if (costBasis > 0) {
        returnPercent = ((currentValue - costBasis) / costBasis) * 100;
      } else if (quantity > 0 && currentValue > 0) {
        returnPercent = 100;
      }

      return {
        ...inv,
        quantity,
        invested,
        averagePrice,
        currentValue,
        currentUnitPrice: currentPrice,
        returnPercent,
      };
    });

    return NextResponse.json(enriched);
  } catch (error) {
    console.error("GET /api/investments:", error);
    return NextResponse.json({ error: "Erro ao listar investimentos" }, { status: 500 });
  }
}

export async function POST(request: Request) {
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

    const {
      name,
      ticker,
      assetType,
      currentUnitPrice,
      rentabilidadeType,
      taxaPercent,
      indiceReferencia,
      balanceOnlyPosition,
    } = parsed.data;
    const [{ n: count }] = await db.select({ n: countFn() }).from(investmentsTable);
    const [investment] = await db
      .insert(investmentsTable)
      .values({
        name,
        ticker,
        assetType,
        currentUnitPrice: currentUnitPrice ?? 0,
        sortOrder: count,
        rentabilidadeType: rentabilidadeType ?? null,
        taxaPercent: taxaPercent ?? null,
        indiceReferencia: indiceReferencia?.trim() || null,
        balanceOnlyPosition:
          assetType === "POUPANCA_CAIXINHA" || (balanceOnlyPosition ?? false),
      })
      .returning();
    return NextResponse.json(investment);
  } catch (error) {
    console.error("POST /api/investments:", error);
    const message =
      error instanceof Error
        ? error.message
        : "Erro ao criar investimento";
    return NextResponse.json(
      {
        error: "Erro ao criar investimento",
        details: process.env.NODE_ENV === "development" ? message : undefined,
      },
      { status: 500 }
    );
  }
}
