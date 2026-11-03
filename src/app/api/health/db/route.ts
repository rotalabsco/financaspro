import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";

export const dynamic = "force-dynamic";

/**
 * Confere a conexão com o banco. Público, sem dados: usado no pós-deploy.
 */
export async function GET() {
  const started = Date.now();
  try {
    await db.execute(sql`select 1`);
    return NextResponse.json({ ok: true, latencyMs: Date.now() - started });
  } catch (error) {
    console.error("GET /api/health/db:", error);
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
