import { asc, desc, eq } from "drizzle-orm";
import type { DbOrTx } from "@/db";
import { investmentOperations, systemConfig } from "@/db/schema";
import {
  computePositionCostBasisAndQuantity,
  earliestAcquisitionCalendarDay,
} from "@/lib/investment-average-cost";

const GROWTH_CONFIG_KEY = "investment_portfolio_growth_v1";
/** Limite de meses na série (um snapshot consolidado por mês). */
const MAX_GROWTH_POINTS = 240;

interface GrowthPoint {
  date: string;
  invested: number;
  current: number;
}

interface PortfolioInvestment {
  assetType: string;
  balanceOnlyPosition: boolean;
  currentUnitPrice: unknown;
  operations: Array<{
    id: string;
    date: Date;
    type: string;
    quantity: unknown;
    total: unknown;
    fee: unknown;
  }>;
}

function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function normalizeGrowthValue(value: string | null): GrowthPoint[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const row = item as Record<string, unknown>;
        const date = typeof row.date === "string" ? row.date : "";
        const invested = toNumber(row.invested);
        const current = toNumber(row.current);
        if (!date) return null;
        return { date, invested, current };
      })
      .filter((row): row is GrowthPoint => row !== null);
  } catch {
    return [];
  }
}

/** `YYYY-MM` a partir de ISO 8601. */
function calendarMonthKeyFromIso(iso: string): string | null {
  if (!/^\d{4}-\d{2}/.test(iso)) return null;
  return iso.slice(0, 7);
}

/** Um ponto por mês civil: mantém o último snapshot de cada mês (maior data dentro do mês). */
export function aggregateGrowthPointsMonthly(points: GrowthPoint[]): GrowthPoint[] {
  const byMonth = new Map<string, GrowthPoint>();
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  for (const p of sorted) {
    const key = calendarMonthKeyFromIso(p.date);
    if (!key) continue;
    const canonicalDate = `${key}-01T12:00:00.000Z`;
    byMonth.set(key, { ...p, date: canonicalDate });
  }
  return Array.from(byMonth.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, v]) => v);
}

export function computePortfolioTotals(investments: PortfolioInvestment[]) {
  let totalInvested = 0;
  let totalCurrent = 0;

  for (const inv of investments) {
    const feeVal = (op: { fee?: unknown }) => toNumber(op.fee);
    const isCrypto = inv.assetType === "BITCOIN" || inv.assetType === "USDC";
    const isBalanceOnly =
      !isCrypto && (inv.balanceOnlyPosition === true || inv.assetType === "POUPANCA_CAIXINHA");
    const isCurrentFromBalance = isBalanceOnly || inv.assetType === "RENDA_FIXA";

    if (isBalanceOnly) {
      const investedPrincipal =
        inv.operations
          .filter((op) => op.type === "BUY" || op.type === "SUBSCRIPTION")
          .reduce((sum, op) => sum + toNumber(op.total) + feeVal(op), 0) -
        inv.operations
          .filter((op) => op.type === "SELL")
          .reduce((sum, op) => sum + toNumber(op.total) - feeVal(op), 0);
      totalInvested += investedPrincipal;
      totalCurrent += toNumber(inv.currentUnitPrice);
      continue;
    }

    const pos = computePositionCostBasisAndQuantity(inv.operations, feeVal);
    totalInvested += pos.costBasis;

    const currentPrice = toNumber(inv.currentUnitPrice);
    totalCurrent += isCurrentFromBalance
      ? currentPrice
      : pos.quantity * currentPrice;
  }

  return { invested: totalInvested, current: totalCurrent };
}

function opDayIso(op: { date: Date | string }): string {
  return new Date(op.date).toISOString().slice(0, 10);
}

/** Último dia do mês civil (UTC) `YYYY-MM-DD`. */
function lastCalendarDayIsoOfMonth(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  const d = new Date(Date.UTC(y, m, 0));
  return d.toISOString().slice(0, 10);
}

function incrementMonthKey(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  if (m === 12) return `${y + 1}-01`;
  return `${y}-${String(m + 1).padStart(2, "0")}`;
}

/** Menor `YYYY-MM` com pelo menos uma compra/subscrição/bonificação na carteira. */
function earliestPortfolioMonth(investments: PortfolioInvestment[]): string | null {
  let min: string | null = null;
  for (const inv of investments) {
    const d = earliestAcquisitionCalendarDay(inv.operations);
    if (!d) continue;
    const mk = d.slice(0, 7);
    if (!min || mk < min) min = mk;
  }
  return min;
}

/**
 * Custo / principal investido até o fim do dia `capDayInclusive` (comparação por dia UTC).
 * Base para a evolução mensal desde a primeira aquisição.
 */
export function computePortfolioInvestedAsOf(
  investments: PortfolioInvestment[],
  capDayInclusive: string
): number {
  let totalInvested = 0;

  for (const inv of investments) {
    const feeVal = (op: { fee?: unknown }) => toNumber(op.fee);
    const ops = inv.operations.filter((op) => opDayIso(op) <= capDayInclusive);
    const isCrypto = inv.assetType === "BITCOIN" || inv.assetType === "USDC";
    const isBalanceOnly =
      !isCrypto && (inv.balanceOnlyPosition === true || inv.assetType === "POUPANCA_CAIXINHA");

    if (isBalanceOnly) {
      const investedPrincipal =
        ops
          .filter((op) => op.type === "BUY" || op.type === "SUBSCRIPTION")
          .reduce((sum, op) => sum + toNumber(op.total) + feeVal(op), 0) -
        ops
          .filter((op) => op.type === "SELL")
          .reduce((sum, op) => sum + toNumber(op.total) - feeVal(op), 0);
      totalInvested += investedPrincipal;
      continue;
    }

    const pos = computePositionCostBasisAndQuantity(ops, feeVal);
    totalInvested += pos.costBasis;
  }

  return Math.round(totalInvested * 100) / 100;
}

/**
 * Série mensal desde o mês da primeira compra: investido recalculado por mês;
 * valor atual usa snapshot gravado quando existe, senão iguala ao investido (sem MTM histórico)
 * ou valor vivo no mês corrente.
 */
function buildMonthlyGrowthFromFirstBuy(
  investments: PortfolioInvestment[],
  storedMonthly: GrowthPoint[]
): GrowthPoint[] {
  const firstMonth = earliestPortfolioMonth(investments);
  if (!firstMonth) {
    return storedMonthly;
  }

  const now = new Date();
  const lastMonthKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

  if (firstMonth > lastMonthKey) {
    return storedMonthly;
  }

  const snapByMonth = new Map(
    storedMonthly
      .map((p) => {
        const k = calendarMonthKeyFromIso(p.date);
        return k ? ([k, p] as const) : null;
      })
      .filter((x): x is [string, GrowthPoint] => x !== null)
  );

  const merged: GrowthPoint[] = [];
  for (let mk = firstMonth; mk <= lastMonthKey; mk = incrementMonthKey(mk)) {
    const capDay = lastCalendarDayIsoOfMonth(mk);
    const invested = computePortfolioInvestedAsOf(investments, capDay);
    const snap = snapByMonth.get(mk);
    let current: number;
    if (snap != null) {
      current = snap.current;
    } else if (mk === lastMonthKey) {
      current = computePortfolioTotals(investments).current;
    } else {
      current = invested;
    }
    merged.push({
      date: `${mk}-01T12:00:00.000Z`,
      invested,
      current,
    });
  }

  return merged.length > MAX_GROWTH_POINTS ? merged.slice(-MAX_GROWTH_POINTS) : merged;
}

export async function appendGrowthSnapshot(db: DbOrTx) {
  const investments = await db.query.investments.findMany({
    with: {
      operations: {
        orderBy: [desc(investmentOperations.date)],
        columns: { id: true, date: true, type: true, quantity: true, total: true, fee: true },
      },
    },
  });

  const totals = computePortfolioTotals(investments);
  const row = await db.query.systemConfig.findFirst({
    where: eq(systemConfig.key, GROWTH_CONFIG_KEY),
  });
  let points = normalizeGrowthValue(row?.value ?? null);
  points = aggregateGrowthPointsMonthly(points);

  const now = new Date();
  const y = now.getUTCFullYear();
  const mo = now.getUTCMonth() + 1;
  const monthKey = `${y}-${String(mo).padStart(2, "0")}`;
  const canonicalDate = `${monthKey}-01T12:00:00.000Z`;
  const snap: GrowthPoint = {
    date: canonicalDate,
    invested: totals.invested,
    current: totals.current,
  };
  const idx = points.findIndex((p) => calendarMonthKeyFromIso(p.date) === monthKey);
  if (idx >= 0) {
    points[idx] = snap;
  } else {
    points.push(snap);
  }
  points.sort((a, b) => a.date.localeCompare(b.date));
  const trimmed = points.slice(-MAX_GROWTH_POINTS);

  await db
    .insert(systemConfig)
    .values({ key: GROWTH_CONFIG_KEY, value: JSON.stringify(trimmed) })
    .onConflictDoUpdate({ target: systemConfig.key, set: { value: JSON.stringify(trimmed) } });

  return trimmed;
}

export async function readGrowthSnapshots(db: DbOrTx) {
  const investments = await db.query.investments.findMany({
    with: {
      operations: {
        orderBy: [asc(investmentOperations.date)],
        columns: { id: true, date: true, type: true, quantity: true, total: true, fee: true },
      },
    },
  });

  const row = await db.query.systemConfig.findFirst({
    where: eq(systemConfig.key, GROWTH_CONFIG_KEY),
  });
  const raw = normalizeGrowthValue(row?.value ?? null);
  const storedMonthly = aggregateGrowthPointsMonthly(raw);

  return buildMonthlyGrowthFromFirstBuy(investments, storedMonthly);
}
