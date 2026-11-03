import { NextRequest, NextResponse } from "next/server";
import { asc, count, eq } from "drizzle-orm";
import { db } from "@/db";
import { bankAccounts } from "@/db/schema";
import { z } from "zod";

const createBankAccountSchema = z.object({
  name: z.string().min(1).max(100),
  institution: z.string().max(100).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const includeInactive = searchParams.get("inactive") === "true";

    const accounts = await db.query.bankAccounts.findMany({
      where: includeInactive ? undefined : eq(bankAccounts.isActive, true),
      orderBy: [asc(bankAccounts.sortOrder), asc(bankAccounts.name)],
    });
    return NextResponse.json(accounts);
  } catch (error) {
    console.error("GET /api/bank-accounts:", error);
    return NextResponse.json(
      { error: "Falha ao listar contas" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = createBankAccountSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados inválidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const [{ total }] = await db.select({ total: count() }).from(bankAccounts);
    const [account] = await db
      .insert(bankAccounts)
      .values({
        name: parsed.data.name.trim(),
        institution: parsed.data.institution?.trim() ?? null,
        sortOrder: total,
      })
      .returning();
    return NextResponse.json(account);
  } catch (error) {
    console.error("POST /api/bank-accounts:", error);
    return NextResponse.json(
      { error: "Falha ao criar conta" },
      { status: 500 }
    );
  }
}
