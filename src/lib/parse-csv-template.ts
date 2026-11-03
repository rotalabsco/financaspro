import type { ParsedMonth, ParsedTransaction, ParseResult } from "./import-types";
import { parseNumberLoose } from "./currency";

/**
 * Parse CSV no formato do template: Ano;Mês;Descrição;Categoria;Tipo;Previsto;Realizado;Parcela;Observações
 */
export function parseCsvTemplate(text: string): ParseResult {
  const warnings: string[] = [];
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) {
    return { months: [], warnings: ["Arquivo vazio ou sem dados"] };
  }
  const sep = lines[0].includes(";") ? ";" : ",";
  const headers = lines[0].split(sep).map((h) => h.trim().toLowerCase());
  const idxAno = headers.findIndex((h) => h.includes("ano"));
  const idxMes = headers.findIndex((h) => h.includes("mês") || h.includes("mes"));
  const idxDesc = headers.findIndex((h) => h.includes("descri"));
  const idxCat = headers.findIndex((h) => h.includes("categoria") || h.includes("cat"));
  const idxTipo = headers.findIndex((h) => h.includes("tipo"));
  const idxPrev = headers.findIndex((h) => h.includes("previsto"));
  const idxReal = headers.findIndex((h) => h.includes("realizado"));
  const idxParc = headers.findIndex((h) => h.includes("parcela"));
  const idxObs = headers.findIndex((h) => h.includes("observ"));

  if (idxDesc < 0 || idxPrev < 0) {
    return { months: [], warnings: ["Colunas Descrição e Previsto são obrigatórias"] };
  }

  const byKey = new Map<string, ParsedTransaction[]>();
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(sep).map((c) => c.trim());
    const desc = idxDesc >= 0 ? cells[idxDesc] ?? "" : "";
    if (!desc) continue;
    const year = idxAno >= 0 ? parseInt(cells[idxAno] ?? "0", 10) : new Date().getFullYear();
    const month = idxMes >= 0 ? parseInt(cells[idxMes] ?? "1", 10) : 1;
    const cat = idxCat >= 0 ? cells[idxCat] ?? "Outros" : "Outros";
    const tipoRaw = idxTipo >= 0 ? cells[idxTipo] ?? "A_VISTA" : "A_VISTA";
    const tipo = ["RECORRENTE", "PARCELADO", "A_VISTA"].includes(tipoRaw)
      ? (tipoRaw as "RECORRENTE" | "PARCELADO" | "A_VISTA")
      : tipoRaw === "FIXO"
        ? "RECORRENTE"
        : "A_VISTA";
    const prev =
      parseNumberLoose(idxPrev >= 0 ? cells[idxPrev] : null) ?? 0;
    const realStr = idxReal >= 0 ? cells[idxReal] ?? "" : "";
    const real = parseNumberLoose(realStr);
    const parcStr = idxParc >= 0 ? cells[idxParc] ?? "" : "";
    const obs = idxObs >= 0 && cells[idxObs] ? cells[idxObs] : undefined;

    const instMatch = parcStr.match(/(\d+)\s*\/\s*(\d+)/);
    const instCur = instMatch ? parseInt(instMatch[1], 10) : null;
    const instTot = instMatch ? parseInt(instMatch[2], 10) : null;

    const tx: ParsedTransaction = {
      description: desc.slice(0, 200),
      categoryName: cat,
      type: tipo,
      amountPrevisto: Math.abs(prev),
      amountRealizado: real != null ? Math.abs(real) : null,
      installmentCurrent: instCur,
      installmentTotal: instTot,
      notes: obs,
    };
    const key = `${year}-${month}`;
    const arr = byKey.get(key) ?? [];
    arr.push(tx);
    byKey.set(key, arr);
  }

  const months: ParsedMonth[] = [];
  for (const [key, txs] of Array.from(byKey.entries())) {
    const [y, m] = key.split("-").map(Number);
    const totalPrevisto = txs.reduce((s, t) => s + t.amountPrevisto, 0);
    const totalRealizado = txs.reduce((s, t) => s + (t.amountRealizado ?? 0), 0);
    const totalDespesas = txs
      .filter((t) => t.categoryName.toLowerCase() !== "receita")
      .reduce((s, t) => s + t.amountPrevisto, 0);
    const totalReceitas = txs
      .filter((t) => t.categoryName.toLowerCase() === "receita")
      .reduce((s, t) => s + t.amountPrevisto, 0);
    months.push({
      year: y,
      month: m,
      transactions: txs,
      totalPrevisto,
      totalRealizado,
      totalDespesas,
      totalReceitas,
      count: txs.length,
    });
  }
  months.sort((a, b) => a.year - b.year || a.month - b.month);
  return { months, warnings };
}
