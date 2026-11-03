import { NextResponse } from "next/server";
import { count } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { authUser } from "@/db/schema";
import { createPasswordUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Primeiro acesso: cria o usuário inicial. Pública (o proxy deixa passar), mas só
 * funciona enquanto não existe nenhum usuário — depois disso responde 403 para sempre.
 * Numa instalação exposta, faça o setup logo após o deploy (ou use SEED_ADMIN_* no seed).
 */
async function hasUsers() {
  const [row] = await db.select({ n: count() }).from(authUser);
  return row.n > 0;
}

export async function GET() {
  return NextResponse.json({ needed: !(await hasUsers()) });
}

const setupSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().email(),
  password: z.string().min(8).max(200),
});

export async function POST(request: Request) {
  try {
    if (await hasUsers()) {
      return NextResponse.json({ error: "O app já foi configurado. Entre pela tela de login." }, { status: 403 });
    }
    const parsed = setupSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: "Nome, e-mail válido e senha com 8 caracteres ou mais." }, { status: 400 });
    }
    await createPasswordUser(parsed.data);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("POST /api/setup:", error);
    return NextResponse.json({ error: "Falha ao criar o usuário inicial" }, { status: 500 });
  }
}
