import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { isAPIError } from "better-auth/api";
import { db } from "@/db";
import { transactions } from "@/db/schema";
import { getAuth } from "@/lib/auth";
import { getSession } from "@/lib/session";

/**
 * Apaga TODOS os lançamentos. Por ser irreversível, além da sessão exige a senha atual
 * (uma sessão roubada ou esquecida aberta não basta) e limita as tentativas erradas.
 */
const bodySchema = z.object({
  confirm: z.literal("LIMPAR"),
  password: z.string().min(1),
});

const WINDOW_MS = 60_000;
const MAX_FAILURES = 5;
const failures = new Map<string, number[]>();

function recentFailures(userId: string) {
  const now = Date.now();
  const list = (failures.get(userId) ?? []).filter((t) => now - t < WINDOW_MS);
  failures.set(userId, list);
  return list;
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session.userId) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Digite "LIMPAR" e a sua senha atual para executar.' },
        { status: 400 }
      );
    }

    if (recentFailures(session.userId).length >= MAX_FAILURES) {
      return NextResponse.json(
        { error: "Muitas tentativas com senha errada. Aguarde um minuto." },
        { status: 429 }
      );
    }

    try {
      await getAuth().api.verifyPassword({
        body: { password: parsed.data.password },
        headers: await headers(),
      });
    } catch (err) {
      if (isAPIError(err) && err.body?.code === "INVALID_PASSWORD") {
        recentFailures(session.userId).push(Date.now());
        return NextResponse.json({ error: "Senha incorreta." }, { status: 403 });
      }
      if (isAPIError(err) && err.status === "UNAUTHORIZED") {
        return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
      }
      throw err;
    }

    const result = await db.delete(transactions);
    return NextResponse.json({ deleted: result.rowCount ?? 0 });
  } catch (error) {
    console.error("POST /api/admin/clear-transactions:", error);
    return NextResponse.json(
      { error: "Falha ao limpar lançamentos" },
      { status: 500 }
    );
  }
}
