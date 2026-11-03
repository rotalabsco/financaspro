import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { systemConfig } from "@/db/schema";
import { z } from "zod";
import { currentYearMonth } from "@/lib/dates";

export const dynamic = "force-dynamic";

// Instalação nova: começa no mês corrente. Depois de salvo, vale o que está em system_config.
const defaultMonth = () => currentYearMonth();

async function getConfig(key: string): Promise<string | null> {
  const row = await db.query.systemConfig.findFirst({
    where: eq(systemConfig.key, key),
  });
  return row?.value ?? null;
}

async function setConfig(key: string, value: string) {
  await db
    .insert(systemConfig)
    .values({ key, value })
    .onConflictDoUpdate({ target: systemConfig.key, set: { value } });
}

export async function GET() {
  try {
    let [initialStr, refStr] = await Promise.all([
      getConfig("system_initial"),
      getConfig("forecast_reference"),
    ]);
    if (!initialStr || !refStr) {
      await Promise.all([
        !initialStr && setConfig("system_initial", JSON.stringify(defaultMonth())),
        !refStr && setConfig("forecast_reference", JSON.stringify(defaultMonth())),
      ]);
      if (!initialStr) initialStr = JSON.stringify(defaultMonth());
      if (!refStr) refStr = JSON.stringify(defaultMonth());
    }
    let systemInitial = defaultMonth();
    let forecastReference = defaultMonth();
    if (initialStr) {
      try {
        const p = JSON.parse(initialStr) as { year: number; month: number };
        if (p.year && p.month) systemInitial = p;
      } catch {
        /* keep default */
      }
    }
    if (refStr) {
      try {
        const p = JSON.parse(refStr) as { year: number; month: number };
        if (p.year && p.month) forecastReference = p;
      } catch {
        /* keep default */
      }
    }
    return NextResponse.json({
      systemInitial,
      forecastReference,
    });
  } catch (error) {
    console.error("GET /api/settings/system:", error);
    return NextResponse.json(
      { error: "Falha ao buscar configuração" },
      { status: 500 }
    );
  }
}

const updateSchema = z.object({
  systemInitial: z.object({
    year: z.number().int().min(2020).max(2100),
    month: z.number().int().min(1).max(12),
  }),
  forecastReference: z.object({
    year: z.number().int().min(2020).max(2100),
    month: z.number().int().min(1).max(12),
  }),
});

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados inválidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    await Promise.all([
      setConfig("system_initial", JSON.stringify(parsed.data.systemInitial)),
      setConfig("forecast_reference", JSON.stringify(parsed.data.forecastReference)),
    ]);
    return NextResponse.json({
      systemInitial: parsed.data.systemInitial,
      forecastReference: parsed.data.forecastReference,
    });
  } catch (error) {
    console.error("PUT /api/settings/system:", error);
    return NextResponse.json(
      { error: "Falha ao atualizar configuração" },
      { status: 500 }
    );
  }
}
