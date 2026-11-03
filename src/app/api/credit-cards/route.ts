import { NextRequest, NextResponse } from "next/server";
import { asc, count, eq } from "drizzle-orm";
import { db } from "@/db";
import { creditCards } from "@/db/schema";
import { z } from "zod";

const createCreditCardSchema = z.object({
  name: z.string().min(1).max(100),
  institution: z.string().max(100).optional(),
  closingDay: z.number().int().min(1).max(31).optional().nullable(),
  dueDay: z.number().int().min(1).max(31).optional().nullable(),
  creditLimit: z.number().min(0).optional().nullable(),
});

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const includeInactive = searchParams.get("inactive") === "true";

    const cards = await db.query.creditCards.findMany({
      where: includeInactive ? undefined : eq(creditCards.isActive, true),
      orderBy: [asc(creditCards.sortOrder), asc(creditCards.name)],
    });
    return NextResponse.json(
      cards.map((c) => ({
        ...c,
        creditLimit: c.creditLimit != null ? Number(c.creditLimit) : null,
      }))
    );
  } catch (error) {
    console.error("GET /api/credit-cards:", error);
    return NextResponse.json(
      { error: "Falha ao listar cartões" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = createCreditCardSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados inválidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const [{ total }] = await db.select({ total: count() }).from(creditCards);
    const [card] = await db
      .insert(creditCards)
      .values({
        name: parsed.data.name.trim(),
        institution: parsed.data.institution?.trim() ?? null,
        closingDay: parsed.data.closingDay ?? null,
        dueDay: parsed.data.dueDay ?? null,
        creditLimit: parsed.data.creditLimit ?? null,
        sortOrder: total,
      })
      .returning();
    return NextResponse.json({
      ...card,
      creditLimit: card.creditLimit != null ? Number(card.creditLimit) : null,
    });
  } catch (error) {
    console.error("POST /api/credit-cards:", error);
    return NextResponse.json(
      { error: "Falha ao criar cartão" },
      { status: 500 }
    );
  }
}
