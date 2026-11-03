import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";

/**
 * GET /api/import/template
 * Retorna CSV de template para importação de lançamentos.
 * Formato: Ano;Mês;Descrição;Categoria;Tipo;Previsto;Realizado;Parcela;Observações
 */
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const sep = ";";
  const header = ["Ano", "Mês", "Descrição", "Categoria", "Tipo", "Previsto", "Realizado", "Parcela", "Observações"].join(sep);
  const examples = [
    ["2025", "1", "Mercado", "Mercado", "A_VISTA", "500,00", "480,00", "", "Exemplo"],
    ["2025", "1", "Aluguel", "Habitacao", "RECORRENTE", "2500,00", "", "", ""],
    ["2025", "1", "Netflix", "Assinaturas", "RECORRENTE", "55,90", "", "", ""],
    ["2025", "1", "Curso", "Educação", "PARCELADO", "297,00", "", "1/12", ""],
  ];
  const body = [header, ...examples.map((r) => r.join(sep))].join("\n");
  const csv = "\uFEFF" + body; // BOM para Excel reconhecer UTF-8

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="financaspro-template-importacao.csv"',
    },
  });
}
