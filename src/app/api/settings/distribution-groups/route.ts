import { NextRequest, NextResponse } from "next/server";
import { asc } from "drizzle-orm";
import { db } from "@/db";
import { distributionGroupAssets, distributionGroups } from "@/db/schema";
import { getSession } from "@/lib/session";
import { INVESTMENT_ASSET_TYPES_ORDERED } from "@/lib/investment-asset-types";
import { InvestmentAssetType } from "@/db/enums";
import { z } from "zod";

const groupInputSchema = z.object({
  name: z.string().min(1).max(120),
  sortOrder: z.number().int().min(0).max(999),
  assetTypes: z
    .array(z.enum(["RENDA_FIXA", "POUPANCA_CAIXINHA", "ACOES", "FII", "ETF", "BITCOIN", "USDC", "OUTROS"]))
    .min(1),
});

const putSchema = z.object({
  groups: z.array(groupInputSchema).min(1),
});

function validatePartition(groups: z.infer<typeof putSchema>["groups"]): string | null {
  const seen = new Set<InvestmentAssetType>();
  for (const g of groups) {
    for (const at of g.assetTypes) {
      if (seen.has(at)) {
        return `Tipo de ativo duplicado: ${at}`;
      }
      seen.add(at);
    }
  }
  for (const required of INVESTMENT_ASSET_TYPES_ORDERED) {
    if (!seen.has(required)) {
      return `Falta atribuir o tipo: ${required}`;
    }
  }
  if (seen.size !== INVESTMENT_ASSET_TYPES_ORDERED.length) {
    return "Tipos de ativo inválidos ou em excesso";
  }
  return null;
}

export async function GET() {
  try {
    const session = await getSession();
    if (!session.userId) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const groups = await db.query.distributionGroups.findMany({
      orderBy: [asc(distributionGroups.sortOrder), asc(distributionGroups.name)],
      with: {
        assets: { columns: { assetType: true } },
      },
    });

    return NextResponse.json({
      groups: groups.map((g) => ({
        id: g.id,
        name: g.name,
        sortOrder: g.sortOrder,
        assetTypes: g.assets.map((a) => a.assetType),
      })),
    });
  } catch (error) {
    console.error("GET /api/settings/distribution-groups:", error);
    return NextResponse.json(
      { error: "Falha ao carregar grupos de distribuição" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session.userId) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = putSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados inválidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const partitionError = validatePartition(parsed.data.groups);
    if (partitionError) {
      return NextResponse.json({ error: partitionError }, { status: 400 });
    }

    await db.transaction(async (tx) => {
      await tx.delete(distributionGroupAssets);
      await tx.delete(distributionGroups);
      for (const g of parsed.data.groups) {
        const [group] = await tx
          .insert(distributionGroups)
          .values({ name: g.name.trim(), sortOrder: g.sortOrder })
          .returning({ id: distributionGroups.id });
        // Create aninhado do Prisma: os ativos entram logo depois do grupo.
        if (g.assetTypes.length > 0) {
          await tx
            .insert(distributionGroupAssets)
            .values(g.assetTypes.map((assetType) => ({ groupId: group.id, assetType })));
        }
      }
    });

    const groups = await db.query.distributionGroups.findMany({
      orderBy: [asc(distributionGroups.sortOrder), asc(distributionGroups.name)],
      with: {
        assets: { columns: { assetType: true } },
      },
    });

    return NextResponse.json({
      groups: groups.map((gr) => ({
        id: gr.id,
        name: gr.name,
        sortOrder: gr.sortOrder,
        assetTypes: gr.assets.map((a) => a.assetType),
      })),
    });
  } catch (error) {
    console.error("PUT /api/settings/distribution-groups:", error);
    return NextResponse.json(
      { error: "Falha ao salvar grupos de distribuição" },
      { status: 500 }
    );
  }
}
