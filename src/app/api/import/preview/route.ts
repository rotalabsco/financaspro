import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { parseCsvTemplate } from "@/lib/parse-csv-template";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json(
        { error: "Nenhum arquivo enviado" },
        { status: 400 }
      );
    }

    if (!file.name.toLowerCase().endsWith(".csv")) {
      return NextResponse.json(
        { error: "Formato não suportado. Use o .csv do template." },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "Arquivo muito grande (máx. 5MB)" },
        { status: 400 }
      );
    }

    const result = parseCsvTemplate(await file.text());

    if (result.months.length === 0) {
      return NextResponse.json(
        {
          error: "Nenhum mês encontrado no arquivo",
          hints: [
            "Use o template: a 1ª linha é o cabeçalho, com colunas separadas por ponto e vírgula (ou vírgula)",
            "Preencha Ano e Mês em toda linha (mês de 1 a 12)",
          ],
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      months: result.months,
      warnings: result.warnings,
    });
  } catch (error) {
    console.error("POST /api/import/preview:", error);
    return NextResponse.json(
      { error: "Erro ao processar o arquivo" },
      { status: 500 }
    );
  }
}
