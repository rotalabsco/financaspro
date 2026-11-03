/** Formato comum do resultado de uma importação (hoje, só o CSV do template). */
export interface ParsedTransaction {
  description: string;
  categoryName: string;
  type: "RECORRENTE" | "PARCELADO" | "A_VISTA";
  amountPrevisto: number;
  amountRealizado: number | null;
  installmentCurrent: number | null;
  installmentTotal: number | null;
  notes?: string;
}

export interface ParsedMonth {
  year: number;
  month: number;
  transactions: ParsedTransaction[];
  totalPrevisto: number;
  totalRealizado: number;
  totalDespesas: number;
  totalReceitas: number;
  count: number;
}

export interface ParseResult {
  months: ParsedMonth[];
  warnings: string[];
}
