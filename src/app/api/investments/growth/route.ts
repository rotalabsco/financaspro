import { NextResponse } from "next/server";
import { db } from "@/db";
import { getSession } from "@/lib/session";
import { readGrowthSnapshots } from "@/lib/investment-growth";

export async function GET() {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  try {
    const points = await readGrowthSnapshots(db);
    return NextResponse.json(points);
  } catch (error) {
    console.error("GET /api/investments/growth:", error);
    return NextResponse.json(
      { error: "Erro ao carregar série de crescimento" },
      { status: 500 }
    );
  }
}
