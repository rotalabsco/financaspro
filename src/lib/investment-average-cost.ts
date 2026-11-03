/**
 * Custo médio móvel (média proporcional às quantidades): processa operações em ordem
 * cronológica. Em cada venda, reduz o custo na proporção do PM vigente (não é média
 * aritmética simples dos preços unitários).
 */
export interface OpForAverageCost {
  id: string;
  date: Date | string;
  type: string;
  quantity: unknown;
  total: unknown;
  fee?: unknown;
}

export function computePositionCostBasisAndQuantity(
  operations: OpForAverageCost[],
  getFee: (op: OpForAverageCost) => number
): { quantity: number; costBasis: number } {
  const sorted = [...operations].sort((a, b) => {
    const da = new Date(a.date).getTime();
    const db = new Date(b.date).getTime();
    if (da !== db) return da - db;
    return String(a.id).localeCompare(String(b.id));
  });

  let qty = 0;
  let costBasis = 0;

  for (const op of sorted) {
    const q = Number(op.quantity);
    if (op.type === "BUY" || op.type === "SUBSCRIPTION" || op.type === "BONUS") {
      costBasis += Number(op.total) + getFee(op);
      qty += q;
    } else if (op.type === "SELL" && q > 0 && qty > 0) {
      const avgCostPerUnit = costBasis / qty;
      const sellQty = Math.min(q, qty);
      costBasis -= sellQty * avgCostPerUnit;
      qty -= sellQty;
    }
  }

  const roundedCost = Math.round(Math.max(0, costBasis) * 100) / 100;

  return { quantity: Math.max(0, qty), costBasis: roundedCost };
}

/**
 * Quantidade líquida após todas as operações cuja data (calendário UTC YYYY-MM-DD)
 * é anterior ou igual à data do provento (comparação por dia).
 */
export function quantityHeldOnOrBeforeCalendarDay(
  operations: OpForAverageCost[],
  paymentDay: Date
): number {
  const cap = paymentDay.toISOString().slice(0, 10);
  const sorted = [...operations].sort((a, b) => {
    const da = new Date(a.date).getTime();
    const db = new Date(b.date).getTime();
    if (da !== db) return da - db;
    return String(a.id).localeCompare(String(b.id));
  });

  let qty = 0;
  for (const op of sorted) {
    const opDay = new Date(op.date).toISOString().slice(0, 10);
    if (opDay > cap) break;
    const q = Number(op.quantity);
    if (op.type === "BUY" || op.type === "SUBSCRIPTION" || op.type === "BONUS") {
      qty += q;
    } else if (op.type === "SELL" && q > 0 && qty > 0) {
      qty -= Math.min(q, qty);
    }
  }
  return Math.max(0, qty);
}

/** Primeira data de aquisição (compra/subscrição/bonificação) para filtro de proventos. */
export function earliestAcquisitionCalendarDay(
  operations: OpForAverageCost[]
): string | null {
  let min: string | null = null;
  for (const op of operations) {
    if (op.type !== "BUY" && op.type !== "SUBSCRIPTION" && op.type !== "BONUS") {
      continue;
    }
    const q = Number(op.quantity);
    if (!Number.isFinite(q) || q <= 0) continue;
    const day = new Date(op.date).toISOString().slice(0, 10);
    if (!min || day < min) min = day;
  }
  return min;
}
