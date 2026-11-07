"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { useMonth } from "@/contexts/MonthContext";
import {
  TrendingUp,
  TrendingDown,
  Plus,
  ChevronDown,
  ChevronRight,
  Pencil,
  Trash2,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  History,
} from "lucide-react";
import { KPICard } from "@/components/ui/KPICard";
import { toast } from "sonner";
import { parseDecimalBR } from "@/lib/currency";
import { ASSET_TYPE_LABELS } from "@/lib/investment-asset-types";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
} from "recharts";

const DISTRIBUTION_PIE_COLORS = [
  "#f97316",
  "#22c55e",
  "#3b82f6",
  "#a855f7",
  "#eab308",
  "#ec4899",
  "#14b8a6",
  "#64748b",
];

const RENTABILIDADE_LABELS: Record<string, string> = {
  PRE_FIXADO: "Pré-Fixado",
  POS_FIXADO: "Pós-Fixado",
};

const INDICE_OPCOES = ["CDI", "IPCA", "Selic", "IGPM", "Outro"];


const TOOLBAR_BTN =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-[hsl(var(--surface-hover))]";
const TOOLBAR_BTN_PRIMARY =
  "inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-opacity hover:opacity-90";
const TOOLBAR_SEP = "hidden h-7 w-px shrink-0 bg-border sm:block";

function investimentosTabClass(isActive: boolean) {
  return `shrink-0 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-all ${
    isActive
      ? "bg-background text-foreground shadow-sm ring-1 ring-border/70"
      : "text-muted-foreground hover:bg-background/70 hover:text-foreground"
  }`;
}

const OP_LABELS: Record<string, string> = {
  BUY: "Compra",
  SELL: "Venda",
  SUBSCRIPTION: "Subscrição",
  BONUS: "Bonificação",
  DIVIDEND: "Dividendo",
};

/** Tipos exibidos no modal de operações em modo apenas saldo (caixinha/poupança). */
const BALANCE_ONLY_OP_LABELS: Record<string, string> = {
  BUY: "Aporte / depósito",
  SELL: "Resgate / saque",
  BONUS: "Rendimento creditado",
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function formatPercentDecimal(value: number, digits = 2) {
  const pct = value * 100;
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(digits)}%`;
}

interface Operation {
  id: string;
  date: string;
  type: string;
  quantity: number;
  unitPrice: number;
  total: number;
  fee?: number;
  notes?: string;
  carteira?: { name: string; corretora: string; responsavel: string } | null;
}

interface Investment {
  id: string;
  name: string;
  ticker: string;
  assetType: string;
  /** Poupança/caixinha: saldo total em currentUnitPrice; sem cotas na UI */
  balanceOnlyPosition?: boolean;
  quantity: number;
  invested: number;
  averagePrice: number;
  currentValue: number;
  currentUnitPrice: number;
  returnPercent: number;
  operations: Operation[];
}

interface GrowthPoint {
  date: string;
  invested: number;
  current: number;
}

/** Poupança/caixinhas (tipo dedicado) ou flag legada em outros tipos — cripto nunca usa modo saldo */
function isBalanceOnlyInvestment(
  inv: Pick<Investment, "assetType" | "balanceOnlyPosition">
): boolean {
  if (inv.assetType === "BITCOIN" || inv.assetType === "USDC") return false;
  return inv.assetType === "POUPANCA_CAIXINHA" || inv.balanceOnlyPosition === true;
}

type PortfolioSortKey =
  | "ativo"
  | "assetType"
  | "quantity"
  | "averagePrice"
  | "currentUnitPrice"
  | "invested"
  | "currentValue"
  | "returnPercent";

function comparePortfolioSort(
  a: Investment,
  b: Investment,
  key: PortfolioSortKey,
  dir: "asc" | "desc"
): number {
  const m = dir === "asc" ? 1 : -1;
  switch (key) {
    case "ativo":
      return (
        m *
        `${a.ticker} ${a.name}`.localeCompare(`${b.ticker} ${b.name}`, "pt-BR", {
          sensitivity: "base",
        })
      );
    case "assetType":
      return m * (a.assetType || "").localeCompare(b.assetType || "", "pt-BR");
    case "quantity":
      return m *
        ((isBalanceOnlyInvestment(a) ? a.currentValue : a.quantity) -
          (isBalanceOnlyInvestment(b) ? b.currentValue : b.quantity));
    case "averagePrice":
      return m *
        ((isBalanceOnlyInvestment(a) ? a.invested : a.averagePrice) -
          (isBalanceOnlyInvestment(b) ? b.invested : b.averagePrice));
    case "currentUnitPrice":
      return m * (a.currentUnitPrice - b.currentUnitPrice);
    case "invested":
      return m * (a.invested - b.invested);
    case "currentValue":
      return m * (a.currentValue - b.currentValue);
    case "returnPercent":
      return m * (a.returnPercent - b.returnPercent);
    default:
      return 0;
  }
}

function PortfolioSortHeader({
  label,
  sortKey,
  currentKey,
  sortDir,
  onSort,
  align = "left",
  title: headerTitle,
}: {
  label: string;
  sortKey: PortfolioSortKey;
  currentKey: PortfolioSortKey;
  sortDir: "asc" | "desc";
  onSort: (k: PortfolioSortKey) => void;
  align?: "left" | "right";
  title?: string;
}) {
  const active = currentKey === sortKey;
  return (
    <th
      className={`py-3 px-4 ${align === "right" ? "text-right" : "text-left"}`}
      title={headerTitle}
    >
      <button
        type="button"
        title={headerTitle}
        onClick={() => onSort(sortKey)}
        className={`inline-flex items-center gap-1 font-medium hover:text-foreground transition-colors ${
          active ? "text-foreground" : "text-muted-foreground"
        }`}
      >
        {label}
        {active ? (
          sortDir === "asc" ? (
            <ArrowUp className="w-3.5 h-3.5 shrink-0" />
          ) : (
            <ArrowDown className="w-3.5 h-3.5 shrink-0" />
          )
        ) : (
          <ArrowUpDown className="w-3.5 h-3.5 shrink-0 opacity-50" />
        )}
      </button>
    </th>
  );
}

/** Formata data sem conversão de timezone (evita 22/03 virar 21/03). */
function formatDateOnly(val: Date | string): string {
  if (typeof val === "string") {
    const [yr, mo, dy] = val.slice(0, 10).split("-").map(Number);
    return `${String(dy).padStart(2, "0")}/${String(mo).padStart(2, "0")}/${yr}`;
  }
  const y = val.getUTCFullYear();
  const m = val.getUTCMonth() + 1;
  const d = val.getUTCDate();
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
}

/** Ponto canônico mensal `YYYY-MM-01` → rótulo tipo "mai. de 2025" (UTC). */
function formatMonthYearPt(val: Date | string): string {
  const iso = typeof val === "string" ? val : val.toISOString();
  const [yr, mo] = iso.slice(0, 10).split("-").map(Number);
  const d = new Date(Date.UTC(yr, mo - 1, 1));
  return d.toLocaleDateString("pt-BR", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatQtyByAssetType(qty: number, assetType: string): string {
  const dec8 = { minimumFractionDigits: 8, maximumFractionDigits: 8 };
  if (assetType === "BITCOIN") return `${qty.toLocaleString("pt-BR", dec8)} BTC`;
  if (assetType === "USDC") return `${qty.toLocaleString("pt-BR", dec8)} USDC`;
  if (assetType === "FII") return `${qty.toLocaleString("pt-BR")} cotas`;
  if (assetType === "ETF") return `${qty.toLocaleString("pt-BR")} cotas`;
  if (assetType === "ACOES") return `${qty.toLocaleString("pt-BR")} ações`;
  if (assetType === "RENDA_FIXA") return `${qty.toLocaleString("pt-BR")} un.`;
  return `${qty.toLocaleString("pt-BR")} un.`;
}

/** Rótulo do campo quantidade conforme o tipo de ativo (unidade da moeda/ativo). */
function getQuantityLabel(assetType: string): string {
  if (assetType === "BITCOIN") return "Quantidade (BTC)";
  if (assetType === "USDC") return "Quantidade (USDC)";
  if (assetType === "FII") return "Quantidade (cotas)";
  if (assetType === "ACOES") return "Quantidade (ações)";
  if (assetType === "ETF") return "Quantidade (cotas)";
  return "Quantidade";
}

/** Placeholder sugerido para quantidade conforme o tipo de ativo. */
function getQuantityPlaceholder(assetType: string): string {
  if (assetType === "BITCOIN") return "Ex: 0,00024510";
  if (assetType === "USDC") return "Ex: 0,00251234";
  if (assetType === "FII" || assetType === "ACOES" || assetType === "ETF") return "Ex: 100";
  return "0";
}

/** Máximo de casas decimais para quantidade por tipo de ativo. */
function getQuantityDecimals(assetType: string): number {
  if (assetType === "BITCOIN") return 8;
  if (assetType === "USDC") return 8;
  return 2;
}

function InvestmentRow({
  inv,
  variant = "default",
  onAddOp,
  onUpdatePrice,
  onEdit,
  onDelete,
  onEditOp,
  onDeleteOp,
  onRefresh,
}: {
  inv: Investment;
  variant?: "default" | "inactive";
  onAddOp: () => void;
  onUpdatePrice: (price: number) => void;
  onEdit: () => void;
  onDelete: () => void;
  onEditOp: (op: Operation) => void;
  onDeleteOp: (op: Operation) => void;
  onRefresh: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [showBonusOps, setShowBonusOps] = useState(false);
  const [priceInput, setPriceInput] = useState(inv.currentUnitPrice.toString());
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    setPriceInput(inv.currentUnitPrice.toString());
  }, [inv.currentUnitPrice]);

  const handleSavePrice = () => {
    const n = parseFloat(priceInput.replace(",", "."));
    if (!isNaN(n) && n >= 0) {
      onUpdatePrice(n);
      setEditing(false);
    }
  };

  const isInactive = variant === "inactive";
  const balanceOnly = isBalanceOnlyInvestment(inv);
  const currentValueFromBalance =
    balanceOnly || inv.assetType === "RENDA_FIXA";

  return (
    <>
      <tr
        className={`cursor-pointer border-b border-border/50 hover:bg-[hsl(var(--surface-hover))] ${
          isInactive ? "opacity-[0.92] bg-muted/10" : ""
        }`}
        onClick={() => setOpen(!open)}
      >
        <td className="py-3 px-4 w-8">
          <div className="flex items-center gap-0.5">
            {isInactive && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen((v) => !v);
                }}
                className="p-1 rounded-md hover:bg-[hsl(var(--surface-hover))] text-primary shrink-0"
                title="Ver histórico de operações"
                aria-label="Histórico"
              >
                <History className="w-4 h-4" />
              </button>
            )}
            {open ? (
              <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
            ) : (
              <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
            )}
          </div>
        </td>
        <td className="py-3 px-4">
          <div className="flex items-start gap-2 flex-wrap">
            {isInactive && (
              <span className="text-[10px] px-1.5 py-0.5 rounded border border-border/60 text-muted-foreground shrink-0">
                Zerado
              </span>
            )}
            <div>
              <span className="font-medium text-foreground">{inv.ticker}</span>
              <p className="text-xs text-muted-foreground">{inv.name}</p>
            </div>
          </div>
        </td>
        <td className="py-3 px-4">
          <span className="text-xs px-2 py-0.5 rounded bg-primary/20 text-primary">
            {ASSET_TYPE_LABELS[inv.assetType as keyof typeof ASSET_TYPE_LABELS] ??
              inv.assetType}
          </span>
        </td>
        <td className="py-3 px-4 text-right font-mono-nums">
          {balanceOnly ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            <>
              {formatQtyByAssetType(inv.quantity, inv.assetType)}
              {(inv.assetType === "BITCOIN" || inv.assetType === "USDC") && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {formatCurrency(inv.currentValue)}
                </p>
              )}
            </>
          )}
        </td>
        <td className="py-3 px-4 text-right font-mono-nums">
          {balanceOnly ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            formatCurrency(inv.averagePrice)
          )}
        </td>
        <td className="py-3 px-4 text-right font-mono-nums">
          {currentValueFromBalance && (
            <p className="text-[10px] text-muted-foreground mb-0.5 text-right">Saldo atual</p>
          )}
          {editing ? (
            <input
              type="text"
              value={priceInput}
              onChange={(e) => setPriceInput(e.target.value)}
              onBlur={handleSavePrice}
              onKeyDown={(e) => e.key === "Enter" && handleSavePrice()}
              className={`${currentValueFromBalance ? "w-28" : "w-20"} px-2 py-1 rounded bg-background border border-border text-foreground font-mono-nums text-sm`}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span
              className="cursor-pointer hover:underline"
              onClick={(e) => {
                e.stopPropagation();
                setEditing(true);
              }}
            >
              {formatCurrency(inv.currentUnitPrice)}
            </span>
          )}
        </td>
        <td className="py-3 px-4 text-right font-mono-nums">
          {formatCurrency(inv.invested)}
        </td>
        <td className="py-3 px-4 text-right font-mono-nums">
          {formatCurrency(inv.currentValue)}
        </td>
        <td
          className={`py-3 px-4 text-right font-mono-nums flex items-center gap-1 justify-end ${
            inv.returnPercent >= 0 ? "text-success" : "text-destructive"
          }`}
        >
          {inv.returnPercent >= 0 ? (
            <TrendingUp className="w-3 h-3" />
          ) : (
            <TrendingDown className="w-3 h-3" />
          )}
          {inv.returnPercent >= 0 ? "+" : ""}
          {inv.returnPercent.toFixed(1)}%
        </td>
        <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
          <div className="flex gap-1 justify-end">
            <button
              type="button"
              onClick={() => onEdit()}
              className="p-1.5 rounded hover:bg-[hsl(var(--surface-hover))] text-muted-foreground hover:text-foreground"
              aria-label="Editar"
            >
              <Pencil className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => onDelete()}
              className="p-1.5 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive"
              aria-label="Excluir"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={11} className="p-0">
            <div className="bg-[hsl(var(--surface-hover))]/50 px-8 py-4">
              <p className="label-style mb-2">Histórico de Operações</p>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted-foreground text-xs">
                    <th className="text-left pb-2">Data</th>
                    <th className="text-left pb-2">Tipo</th>
                    <th className="text-left pb-2">Carteira</th>
                    <th className="text-right pb-2">Qtd</th>
                    <th className="text-right pb-2">Preço Unitário</th>
                    <th className="text-right pb-2">Total</th>
                    <th className="text-right pb-2">Tax</th>
                    <th className="text-right pb-2">Total Pago</th>
                    <th className="text-right pb-2" title="Saldo acumulado após esta operação">Saldo</th>
                    <th className="text-left pb-2 w-32">Obs.</th>
                    <th className="w-20 pb-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {[...inv.operations]
                    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
                    .filter((op) => showBonusOps || op.type !== "BONUS")
                    .map((op, idx, sortedOps) => {
                    const feeVal = op.fee ?? 0;
                    const totalPago = Number(op.total) + Number(feeVal);
                    const runningBalance = sortedOps
                      .slice(0, idx + 1)
                      .reduce(
                        (b, o) =>
                          b +
                          (o.type === "BUY" || o.type === "SUBSCRIPTION" || o.type === "BONUS"
                            ? Number(balanceOnly ? o.total : o.quantity)
                            : o.type === "SELL"
                              ? -Number(balanceOnly ? o.total : o.quantity)
                              : 0),
                        0
                      );
                    const runningBalanceAmount = sortedOps
                      .slice(0, idx + 1)
                      .reduce(
                        (b, o) =>
                          b +
                          (o.type === "BUY" || o.type === "SUBSCRIPTION" || o.type === "BONUS"
                            ? Number(o.total)
                            : o.type === "SELL"
                              ? -Number(o.total)
                              : 0),
                        0
                      );
                    return (
                      <tr key={op.id} className="border-t border-border/30">
                        <td className="py-1.5 font-mono-nums">
                          {formatDateOnly(op.date)}
                        </td>
                        <td className="py-1.5">
                          <span className="text-xs">
                            {OP_LABELS[op.type] ?? op.type}
                          </span>
                        </td>
                        <td className="py-1.5 text-muted-foreground text-xs" title={op.carteira ? `${op.carteira.corretora} — ${op.carteira.responsavel}` : undefined}>
                          {op.carteira?.name ?? "—"}
                        </td>
                        <td className="py-1.5 text-right font-mono-nums">
                          {formatQtyByAssetType(op.quantity, inv.assetType)}
                        </td>
                        <td className="py-1.5 text-right font-mono-nums">
                          {formatCurrency(op.unitPrice)}
                        </td>
                        <td className="py-1.5 text-right font-mono-nums">
                          {formatCurrency(op.total)}
                        </td>
                        <td className="py-1.5 text-right font-mono-nums text-muted-foreground">
                          {feeVal > 0 ? formatCurrency(feeVal) : "—"}
                        </td>
                        <td className="py-1.5 text-right font-mono-nums">
                          {formatCurrency(totalPago)}
                        </td>
                        <td className="py-1.5 text-right font-mono-nums font-semibold tabular-nums" title="Saldo após esta operação">
                          {balanceOnly
                            ? formatCurrency(runningBalance)
                            : inv.assetType === "RENDA_FIXA"
                              ? (
                                  <span className="inline-flex flex-col items-end leading-tight">
                                    <span>{formatQtyByAssetType(runningBalance, inv.assetType)}</span>
                                    <span className="text-[11px] font-normal text-muted-foreground">
                                      {formatCurrency(runningBalanceAmount)}
                                    </span>
                                  </span>
                                )
                              : formatQtyByAssetType(runningBalance, inv.assetType)}
                        </td>
                        <td className="py-1.5 text-muted-foreground text-sm max-w-[200px] truncate" title={op.notes || undefined}>
                          {op.notes || "—"}
                        </td>
                        <td className="py-1.5">
                          <div className="flex gap-1">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onEditOp(op);
                              }}
                              className="p-1 rounded hover:bg-[hsl(var(--surface-hover))] text-muted-foreground hover:text-foreground"
                              aria-label="Editar"
                            >
                              <Pencil className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onDeleteOp(op);
                              }}
                              className="p-1 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive"
                              aria-label="Excluir"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {(() => {
                const bonusCount = inv.operations.filter((o) => o.type === "BONUS").length;
                return bonusCount > 0 ? (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setShowBonusOps((v) => !v); }}
                    className="mt-2 mr-4 text-xs text-muted-foreground hover:text-foreground hover:underline"
                  >
                    {showBonusOps ? `Ocultar bonificações (${bonusCount})` : `Mostrar bonificações (${bonusCount})`}
                  </button>
                ) : null;
              })()}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onAddOp();
                }}
                className="mt-2 text-sm text-primary hover:underline"
              >
                + Nova operação
              </button>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function InvestimentosPage() {
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<
    | "portfolio"
    | "evolucao"
    | "distribuicao"
    | "benchmark"
    | "rebalanceamento"
    | "atribuicao"
  >("portfolio");
  const [growthSeries, setGrowthSeries] = useState<GrowthPoint[]>([]);
  const [showAddInv, setShowAddInv] = useState(false);
  const [showAddOp, setShowAddOp] = useState<string | null>(null);
  const { selectedMonth: ctxMonth, refetchMonths } = useMonth();
  const [editingInvestment, setEditingInvestment] = useState<Investment | null>(null);
  const [editingOp, setEditingOp] = useState<{ op: Operation; invId: string; inv: Investment } | null>(null);
  const [distributionConfig, setDistributionConfig] = useState<{
    groups: {
      id: string;
      name: string;
      sortOrder: number;
      assetTypes: string[];
    }[];
  } | null>(null);

  const loadDistributionConfig = useCallback(async () => {
    const res = await fetch("/api/settings/distribution-groups");
    if (res.ok) {
      const data = await res.json();
      if (data?.groups) setDistributionConfig(data);
    }
  }, []);

  const fetchInvestments = async () => {
    try {
      const res = await fetch("/api/investments", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setInvestments(data);
        setLoadError(null);
      } else {
        const data = await res.json().catch(() => ({}));
        setLoadError(data.error ?? `Erro ao carregar investimentos (HTTP ${res.status})`);
      }
    } catch {
      setLoadError("Falha de conexão ao carregar investimentos.");
    }
  };

  const fetchGrowthSeries = useCallback(async () => {
    const res = await fetch("/api/investments/growth");
    if (!res.ok) return;
    const data = (await res.json()) as GrowthPoint[];
    setGrowthSeries(Array.isArray(data) ? data : []);
  }, []);

  useEffect(() => {
    fetchInvestments().finally(() => setLoading(false));
    fetchGrowthSeries();
  }, [fetchGrowthSeries]);

  useEffect(() => {
    if (tab !== "distribuicao" && tab !== "rebalanceamento") return;
    void loadDistributionConfig();
  }, [tab, loadDistributionConfig]);

  const [searchQuery, setSearchQuery] = useState("");
  const [benchmarkCdiAnnual, setBenchmarkCdiAnnual] = useState(10.5);
  const [benchmarkIpcaAnnual, setBenchmarkIpcaAnnual] = useState(4.5);
  const [rebalanceContributionInput, setRebalanceContributionInput] = useState("1000");
  const [rebalanceTargets, setRebalanceTargets] = useState<Record<string, number>>({});
  const [showInactivePositions, setShowInactivePositions] = useState(false);

  const isPositionActive = (i: Investment) =>
    isBalanceOnlyInvestment(i) || i.assetType === "RENDA_FIXA"
      ? i.currentValue > 0 || i.invested > 0
      : Number(i.quantity) > 0;

  const activeInvestments = investments.filter(isPositionActive);
  const inactiveInvestments = investments.filter((i) => !isPositionActive(i));

  const matchesSearch = (inv: Investment, q: string) => {
    if (!q.trim()) return true;
    const term = q.trim().toLowerCase();
    return (
      inv.ticker.toLowerCase().includes(term) ||
      inv.name.toLowerCase().includes(term)
    );
  };

  const filteredActive = activeInvestments.filter((i) => matchesSearch(i, searchQuery));
  const filteredInactive = inactiveInvestments.filter((i) => matchesSearch(i, searchQuery));

  const [portfolioSortKey, setPortfolioSortKey] =
    useState<PortfolioSortKey>("ativo");
  const [portfolioSortDir, setPortfolioSortDir] = useState<"asc" | "desc">("asc");

  const handlePortfolioSort = useCallback((key: PortfolioSortKey) => {
    if (portfolioSortKey === key) {
      setPortfolioSortDir((d) => (d === "asc" ? "desc" : "asc"));
      return;
    }
    setPortfolioSortKey(key);
    setPortfolioSortDir("asc");
  }, [portfolioSortKey]);

  const sortedActive = useMemo(() => {
    const arr = [...filteredActive];
    arr.sort((a, b) =>
      comparePortfolioSort(a, b, portfolioSortKey, portfolioSortDir)
    );
    return arr;
  }, [filteredActive, portfolioSortKey, portfolioSortDir]);

  const sortedInactive = useMemo(() => {
    const arr = [...filteredInactive];
    arr.sort((a, b) =>
      comparePortfolioSort(a, b, portfolioSortKey, portfolioSortDir)
    );
    return arr;
  }, [filteredInactive, portfolioSortKey, portfolioSortDir]);

  const totalInvested = activeInvestments.reduce((s, i) => s + i.invested, 0);
  const totalCurrent = activeInvestments.reduce((s, i) => s + i.currentValue, 0);
  const totalReturn = totalCurrent - totalInvested;
  const totalReturnPercent =
    totalInvested > 0 ? (totalReturn / totalInvested) * 100 : 0;

  const benchmarkStartDate = useMemo(() => {
    const dates = investments.flatMap((inv) => inv.operations.map((op) => new Date(op.date)));
    const valid = dates.filter((d) => !Number.isNaN(d.getTime()));
    if (valid.length === 0) return null;
    return new Date(Math.min(...valid.map((d) => d.getTime())));
  }, [investments]);

  const benchmarkDays = useMemo(() => {
    if (!benchmarkStartDate) return 0;
    const ms = Date.now() - benchmarkStartDate.getTime();
    return Math.max(1, Math.floor(ms / (1000 * 60 * 60 * 24)));
  }, [benchmarkStartDate]);

  const benchmarkFactor = benchmarkDays > 0 ? benchmarkDays / 365 : 0;
  const cdiCumReturn =
    benchmarkDays > 0 ? Math.pow(1 + benchmarkCdiAnnual / 100, benchmarkFactor) - 1 : 0;
  const ipcaCumReturn =
    benchmarkDays > 0 ? Math.pow(1 + benchmarkIpcaAnnual / 100, benchmarkFactor) - 1 : 0;
  const portfolioCumReturn = totalInvested > 0 ? totalCurrent / totalInvested - 1 : 0;
  const portfolioRealReturn = (1 + portfolioCumReturn) / (1 + ipcaCumReturn) - 1;

  const attributionByInvestment = useMemo(() => {
    return investments
      .map((inv) => {
        const feeVal = (op: Operation) => Number(op.fee ?? 0);
        const aportes =
          inv.operations
            .filter((op) => op.type === "BUY" || op.type === "SUBSCRIPTION")
            .reduce((s, op) => s + Number(op.total) + feeVal(op), 0) -
          inv.operations
            .filter((op) => op.type === "SELL")
            .reduce((s, op) => s + Number(op.total) - feeVal(op), 0);
        const patrimonio = Number(inv.currentValue);
        const performance = patrimonio - aportes;
        return {
          id: inv.id,
          ticker: inv.ticker,
          name: inv.name,
          assetType: inv.assetType,
          aportes,
          patrimonio,
          performance,
        };
      })
      .sort((a, b) => b.patrimonio - a.patrimonio);
  }, [investments]);

  const attributionSummary = useMemo(() => {
    return attributionByInvestment.reduce(
      (acc, row) => {
        acc.aportes += row.aportes;
        acc.patrimonio += row.patrimonio;
        acc.performance += row.performance;
        return acc;
      },
      { aportes: 0, patrimonio: 0, performance: 0 }
    );
  }, [attributionByInvestment]);

  const attributionByType = useMemo(() => {
    const map = new Map<
      string,
      { assetType: string; aportes: number; patrimonio: number; performance: number }
    >();
    for (const row of attributionByInvestment) {
      const cur = map.get(row.assetType) ?? {
        assetType: row.assetType,
        aportes: 0,
        patrimonio: 0,
        performance: 0,
      };
      cur.aportes += row.aportes;
      cur.patrimonio += row.patrimonio;
      cur.performance += row.performance;
      map.set(row.assetType, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.patrimonio - a.patrimonio);
  }, [attributionByInvestment]);

  const assetTypeToDistributionGroup = useMemo(() => {
    const m = new Map<
      string,
      { groupId: string; groupName: string; sortOrder: number }
    >();
    for (const g of distributionConfig?.groups ?? []) {
      for (const at of g.assetTypes) {
        m.set(at, {
          groupId: g.id,
          groupName: g.name,
          sortOrder: g.sortOrder,
        });
      }
    }
    return m;
  }, [distributionConfig]);

  const distributionByType = useMemo(() => {
    const map = new Map<
      string,
      { label: string; value: number; sortKey: number }
    >();
    for (const inv of activeInvestments) {
      const t = inv.assetType || "OUTROS";
      const g = assetTypeToDistributionGroup.get(t);
      const rowKey = g?.groupId ?? `fallback:${t}`;
      const label =
        g?.groupName ??
        (ASSET_TYPE_LABELS[t as keyof typeof ASSET_TYPE_LABELS] ?? t);
      const sortKey = g?.sortOrder ?? 999;
      const cur = map.get(rowKey);
      const value = (cur?.value ?? 0) + inv.currentValue;
      map.set(rowKey, { label, value, sortKey });
    }
    const total = Array.from(map.values()).reduce((s, v) => s + v.value, 0);
    const rows = Array.from(map.entries())
      .map(([key, data]) => ({
        key,
        label: data.label,
        value: data.value,
        sortKey: data.sortKey,
        percent: total > 0 ? (data.value / total) * 100 : 0,
      }))
      .sort((a, b) => b.value - a.value);
    return { rows, total };
  }, [activeInvestments, assetTypeToDistributionGroup]);

  const pieChartData = useMemo(
    () =>
      distributionByType.rows.map((r) => ({
        name: r.label,
        value: r.value,
      })),
    [distributionByType.rows]
  );

  useEffect(() => {
    setRebalanceTargets((prev) => {
      const rowKeys = new Set(distributionByType.rows.map((r) => r.key));
      const next: Record<string, number> = {};
      let changed = false;

      for (const row of distributionByType.rows) {
        const prevVal = prev[row.key];
        if (Number.isFinite(prevVal)) {
          next[row.key] = prevVal;
        } else {
          next[row.key] = Number(row.percent.toFixed(2));
          changed = true;
        }
      }
      for (const key of Object.keys(prev)) {
        if (!rowKeys.has(key)) {
          changed = true;
        }
      }
      if (!changed && Object.keys(prev).length === Object.keys(next).length) {
        return prev;
      }
      return next;
    });
  }, [distributionByType.rows]);

  const rebalancePlan = useMemo(() => {
    const rows = distributionByType.rows;
    if (rows.length === 0) {
      return {
        contribution: 0,
        rawTargetSum: 0,
        rows: [] as {
          key: string;
          label: string;
          currentValue: number;
          currentPercent: number;
          targetPercent: number;
          currentGap: number;
          suggestedContribution: number;
          projectedPercent: number;
        }[],
      };
    }

    const contribution = Math.max(0, parseDecimalBR(rebalanceContributionInput, 2));
    const rawTargets = rows.map((row) => Math.max(0, Number(rebalanceTargets[row.key] ?? 0)));
    const rawTargetSum = rawTargets.reduce((s, v) => s + v, 0);
    const targetPercents =
      rawTargetSum > 0
        ? rawTargets.map((v) => (v / rawTargetSum) * 100)
        : rows.map(() => 100 / rows.length);

    const totalCurrentValue = distributionByType.total;
    const totalAfterContribution = totalCurrentValue + contribution;
    const gapsNow = rows.map((row, idx) =>
      Math.max(0, (totalCurrentValue * targetPercents[idx]) / 100 - row.value)
    );
    const totalGapNow = gapsNow.reduce((s, v) => s + v, 0);

    const planRows = rows.map((row, idx) => {
      const targetPercent = targetPercents[idx];
      const currentGap = gapsNow[idx];
      const suggestedContribution =
        contribution <= 0
          ? 0
          : totalGapNow > 0
            ? (contribution * currentGap) / totalGapNow
            : (contribution * targetPercent) / 100;
      const projectedValue = row.value + suggestedContribution;
      const projectedPercent =
        totalAfterContribution > 0 ? (projectedValue / totalAfterContribution) * 100 : 0;

      return {
        key: row.key,
        label: row.label,
        currentValue: row.value,
        currentPercent: row.percent,
        targetPercent,
        currentGap,
        suggestedContribution,
        projectedPercent,
      };
    });

    return {
      contribution,
      rawTargetSum,
      rows: planRows,
    };
  }, [distributionByType, rebalanceContributionInput, rebalanceTargets]);

  const handleUpdatePrice = async (invId: string, price: number) => {
    const res = await fetch(`/api/investments/${invId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentUnitPrice: price }),
    });
    if (res.ok) {
      toast.success("Preço atualizado");
      fetchInvestments();
      fetchGrowthSeries();
    } else {
      toast.error("Erro ao atualizar preço");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <p className="text-muted-foreground">Carregando...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between xl:gap-8">
          <div className="min-w-0 space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Investimentos
            </h1>
            <p className="text-sm text-muted-foreground">
              Posição, preço médio e operações, lançados à mão para conferir com a corretora
            </p>
          </div>

          <div className="flex w-full min-w-0 flex-col gap-2 xl:max-w-[56rem] xl:items-end">
            <div className="flex w-full flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowAddInv(true)}
                className={TOOLBAR_BTN_PRIMARY}
                title="Novo investimento"
              >
                <Plus className="h-4 w-4 shrink-0" />
                <span className="hidden min-[400px]:inline">Novo investimento</span>
                <span className="min-[400px]:hidden">Novo</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <KPICard
            label="Total Investido"
            value={formatCurrency(totalInvested)}
            index={0}
          />
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
        >
          <KPICard
            label="Valor Atual"
            value={formatCurrency(totalCurrent)}
            index={1}
          />
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <KPICard
            label="Rentabilidade"
            value={`${formatCurrency(totalReturn)} (${totalReturnPercent.toFixed(1)}%)`}
            changeType={totalReturn >= 0 ? "positive" : "negative"}
            index={2}
          />
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
        >
          <KPICard
            label="Ativos"
            value={inactiveInvestments.length > 0 ? `${activeInvestments.length} (${inactiveInvestments.length} encerrados)` : String(activeInvestments.length)}
            index={3}
          />
        </motion.div>
      </div>

      <nav
        className="flex flex-wrap gap-1 overflow-x-auto border-b border-border pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        aria-label="Seções de investimentos"
      >
        <button
          type="button"
          onClick={() => setTab("portfolio")}
          className={investimentosTabClass(tab === "portfolio")}
        >
          Portfólio
        </button>
        <button
          type="button"
          onClick={() => setTab("evolucao")}
          className={investimentosTabClass(tab === "evolucao")}
        >
          Evolução
        </button>
        <button
          type="button"
          onClick={() => setTab("distribuicao")}
          className={investimentosTabClass(tab === "distribuicao")}
        >
          Distribuição
        </button>
        <button
          type="button"
          onClick={() => setTab("benchmark")}
          className={investimentosTabClass(tab === "benchmark")}
        >
          Benchmark
        </button>
        <button
          type="button"
          onClick={() => setTab("rebalanceamento")}
          className={investimentosTabClass(tab === "rebalanceamento")}
        >
          Rebalancear
        </button>
        <button
          type="button"
          onClick={() => setTab("atribuicao")}
          className={investimentosTabClass(tab === "atribuicao")}
        >
          Atribuição
        </button>
      </nav>

      {tab === "portfolio" && (
        <div className="space-y-6">
          {loadError && (
            <div className="p-4 rounded-lg border border-destructive/50 bg-destructive/10 text-destructive text-sm">
              <strong>Erro ao carregar investimentos:</strong> {loadError}
              <button
                type="button"
                onClick={() => fetchInvestments()}
                className="ml-3 underline hover:no-underline"
              >
                Tentar novamente
              </button>
            </div>
          )}
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Pesquisar ativo (ticker ou nome)..."
                className="w-full pl-9 pr-4 py-2 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground text-sm"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label="Limpar busca"
                >
                  ×
                </button>
              )}
            </div>
            {searchQuery && (
              <span className="text-sm text-muted-foreground">
                {sortedActive.length + sortedInactive.length} resultado(s)
              </span>
            )}
          </div>

          <div className="card-surface overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="w-8 py-3 px-4"></th>
                  <PortfolioSortHeader
                    label="Ativo"
                    sortKey="ativo"
                    currentKey={portfolioSortKey}
                    sortDir={portfolioSortDir}
                    onSort={handlePortfolioSort}
                  />
                  <PortfolioSortHeader
                    label="Tipo"
                    sortKey="assetType"
                    currentKey={portfolioSortKey}
                    sortDir={portfolioSortDir}
                    onSort={handlePortfolioSort}
                  />
                  <PortfolioSortHeader
                    label="Qtd"
                    sortKey="quantity"
                    currentKey={portfolioSortKey}
                    sortDir={portfolioSortDir}
                    onSort={handlePortfolioSort}
                    align="right"
                  />
                  <PortfolioSortHeader
                    label="PM"
                    sortKey="averagePrice"
                    currentKey={portfolioSortKey}
                    sortDir={portfolioSortDir}
                    onSort={handlePortfolioSort}
                    align="right"
                    title="Preço médio das suas operações."
                  />
                  <PortfolioSortHeader
                    label="Preço / saldo"
                    sortKey="currentUnitPrice"
                    currentKey={portfolioSortKey}
                    sortDir={portfolioSortDir}
                    onSort={handlePortfolioSort}
                    align="right"
                    title="Preço atual ou saldo informado por você — clique no valor para editar."
                  />
                  <PortfolioSortHeader
                    label="Investido"
                    sortKey="invested"
                    currentKey={portfolioSortKey}
                    sortDir={portfolioSortDir}
                    onSort={handlePortfolioSort}
                    align="right"
                  />
                  <PortfolioSortHeader
                    label="Atual"
                    sortKey="currentValue"
                    currentKey={portfolioSortKey}
                    sortDir={portfolioSortDir}
                    onSort={handlePortfolioSort}
                    align="right"
                  />
                  <PortfolioSortHeader
                    label="Rent."
                    sortKey="returnPercent"
                    currentKey={portfolioSortKey}
                    sortDir={portfolioSortDir}
                    onSort={handlePortfolioSort}
                    align="right"
                  />
                  <th className="py-3 px-4 w-24 text-muted-foreground">Ações</th>
                </tr>
              </thead>
              <tbody>
                {sortedActive.map((inv) => (
                  <InvestmentRow
                    key={inv.id}
                    inv={inv}
                    onAddOp={() => setShowAddOp(inv.id)}
                    onUpdatePrice={(p) => handleUpdatePrice(inv.id, p)}
                    onEdit={() => setEditingInvestment(inv)}
                    onDelete={() => {
                      if (window.confirm(`Excluir ${inv.ticker}? Operações serão removidas.`)) {
                        fetch(`/api/investments/${inv.id}`, { method: "DELETE" })
                          .then((r) => { if (r.ok) return fetchInvestments().then(() => toast.success("Excluído")); toast.error("Erro ao excluir"); })
                          .catch(() => toast.error("Erro ao excluir"));
                      }
                    }}
                    onEditOp={(op) => setEditingOp({ op, invId: inv.id, inv })}
                    onDeleteOp={(op) => {
                      if (window.confirm("Excluir esta operação?")) {
                        fetch(`/api/investments/${inv.id}/operations/${op.id}`, { method: "DELETE" })
                          .then((r) => { if (r.ok) return fetchInvestments().then(() => toast.success("Operação excluída")); toast.error("Erro ao excluir"); })
                          .catch(() => toast.error("Erro ao excluir"));
                      }
                    }}
                    onRefresh={fetchInvestments}
                  />
                ))}
                {sortedInactive.length > 0 && (
                  <tr className="bg-muted/25 border-y border-border/40">
                    <td colSpan={11} className="py-2.5 px-4">
                      <button
                        type="button"
                        onClick={() => setShowInactivePositions((v) => !v)}
                        className="inline-flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {showInactivePositions ? (
                          <ChevronDown className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5" />
                        )}
                        <span>
                          Posições encerradas — saldo zerado ({sortedInactive.length})
                        </span>
                      </button>
                    </td>
                  </tr>
                )}
                {showInactivePositions && sortedInactive.map((inv) => (
                  <InvestmentRow
                    key={inv.id}
                    variant="inactive"
                    inv={inv}
                    onAddOp={() => setShowAddOp(inv.id)}
                    onUpdatePrice={(p) => handleUpdatePrice(inv.id, p)}
                    onEdit={() => setEditingInvestment(inv)}
                    onDelete={() => {
                      if (window.confirm(`Excluir ${inv.ticker}? Operações serão removidas.`)) {
                        fetch(`/api/investments/${inv.id}`, { method: "DELETE" })
                          .then((r) => { if (r.ok) return fetchInvestments().then(() => toast.success("Excluído")); toast.error("Erro ao excluir"); })
                          .catch(() => toast.error("Erro ao excluir"));
                      }
                    }}
                    onEditOp={(op) => setEditingOp({ op, invId: inv.id, inv })}
                    onDeleteOp={(op) => {
                      if (window.confirm("Excluir esta operação?")) {
                        fetch(`/api/investments/${inv.id}/operations/${op.id}`, { method: "DELETE" })
                          .then((r) => { if (r.ok) return fetchInvestments().then(() => toast.success("Operação excluída")); toast.error("Erro ao excluir"); })
                          .catch(() => toast.error("Erro ao excluir"));
                      }
                    }}
                    onRefresh={fetchInvestments}
                  />
                ))}
            </tbody>
          </table>
          {(activeInvestments.length === 0 && inactiveInvestments.length === 0) ||
          (searchQuery && sortedActive.length === 0 && sortedInactive.length === 0) ? (
            <div className="p-12 text-center text-muted-foreground">
              {searchQuery
                ? "Nenhum ativo encontrado para esta pesquisa."
                : "Nenhum investimento. Adicione um novo ou importe o extrato da corretora."}
            </div>
          ) : null}
          </div>
        </div>
      )}

      {tab === "evolucao" && (
        <div className="space-y-4">
          {growthSeries.length === 0 ? (
            <div className="card-surface p-12 text-center text-muted-foreground">
              Sem histórico mensal ainda. Cada vez que você atualiza o preço atual de um ativo, gravamos um ponto do mês.
            </div>
          ) : (
            <>
              <div className="card-surface p-4">
                <p className="label-style mb-1">Evolução da carteira (mensal)</p>
                <p className="text-xs text-muted-foreground mb-3 max-w-3xl">
                  Inicia no mês da primeira compra (ou subscrição) registrada, mês a mês. O valor
                  atual usa os pontos gravados quando você atualiza o preço atual de um ativo; nos meses
                  sem ponto, a linha acompanha o investido (sem marcação a mercado retroativa).
                </p>
                <div className="h-[360px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={growthSeries.map((row) => ({
                        ...row,
                        label: formatMonthYearPt(row.date),
                      }))}
                      margin={{ top: 8, right: 20, left: 10, bottom: 6 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="label" minTickGap={28} />
                      <YAxis
                        tickFormatter={(value: number) =>
                          new Intl.NumberFormat("pt-BR", {
                            style: "currency",
                            currency: "BRL",
                            maximumFractionDigits: 0,
                          }).format(value)
                        }
                      />
                      <Tooltip
                        formatter={(value: number) => formatCurrency(value)}
                        labelFormatter={(value) => `Mês: ${value}`}
                      />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="invested"
                        name="Investido"
                        stroke="#64748b"
                        strokeWidth={2}
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="current"
                        name="Valor atual"
                        stroke="#22c55e"
                        strokeWidth={2}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="card-surface overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted-foreground">
                      <th className="py-3 px-4">Mês</th>
                      <th className="py-3 px-4 text-right">Investido</th>
                      <th className="py-3 px-4 text-right">Valor atual</th>
                      <th className="py-3 px-4 text-right">Resultado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...growthSeries]
                      .sort((a, b) => b.date.localeCompare(a.date))
                      .slice(0, 20)
                      .map((row) => {
                        const result = row.current - row.invested;
                        return (
                          <tr key={row.date} className="border-b border-border/50">
                            <td className="py-3 px-4 text-foreground">{formatMonthYearPt(row.date)}</td>
                            <td className="py-3 px-4 text-right font-mono-nums">{formatCurrency(row.invested)}</td>
                            <td className="py-3 px-4 text-right font-mono-nums">{formatCurrency(row.current)}</td>
                            <td
                              className={`py-3 px-4 text-right font-mono-nums ${
                                result >= 0 ? "text-success" : "text-destructive"
                              }`}
                            >
                              {formatCurrency(result)}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {tab === "distribuicao" && (
        <div className="space-y-6">
          {distributionByType.total <= 0 || activeInvestments.length === 0 ? (
            <div className="card-surface p-12 text-center text-muted-foreground">
              Sem posições ativas para exibir. O gráfico considera o valor atual (Atual) de cada
              investimento ativo no portfólio.
            </div>
          ) : (
            <>
              <div className="card-surface p-6">
                <h3 className="text-sm font-medium text-foreground mb-1">
                  Por grupo de distribuição
                </h3>
                <p className="text-xs text-muted-foreground mb-2">
                  Valor atual agregado por grupo ({formatCurrency(distributionByType.total)}).
                  Edite os grupos em{" "}
                  <Link
                    href="/dashboard/config"
                    className="text-primary hover:underline"
                  >
                    Configurações → Distribuição do portfólio
                  </Link>
                  .
                </p>
                <div className="h-[min(360px,50vh)] w-full min-h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieChartData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={120}
                        stroke="hsl(var(--background))"
                        strokeWidth={2}
                        label={({ percent }) =>
                          `${((percent ?? 0) * 100).toFixed(0)}%`
                        }
                      >
                        {pieChartData.map((_, i) => (
                          <Cell
                            key={i}
                            fill={DISTRIBUTION_PIE_COLORS[i % DISTRIBUTION_PIE_COLORS.length]}
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value: number) => formatCurrency(value)}
                        contentStyle={{
                          backgroundColor: "hsl(var(--surface))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "8px",
                          color: "hsl(var(--foreground))",
                          opacity: 1,
                          boxShadow: "0 8px 20px hsl(var(--background) / 0.45)",
                        }}
                        labelStyle={{ color: "hsl(var(--foreground))" }}
                        itemStyle={{ color: "hsl(var(--foreground))" }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="card-surface overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted-foreground">
                      <th className="py-3 px-4">Grupo</th>
                      <th className="py-3 px-4 text-right">Valor atual</th>
                      <th className="py-3 px-4 text-right">% do total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {distributionByType.rows.map((row) => (
                      <tr key={row.key} className="border-b border-border/50">
                        <td className="py-3 px-4 text-foreground">{row.label}</td>
                        <td className="py-3 px-4 text-right font-mono-nums">
                          {formatCurrency(row.value)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono-nums text-muted-foreground">
                          {row.percent.toFixed(1)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {tab === "benchmark" && (
        <div className="space-y-4">
          <div className="card-surface p-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
              <div>
                <p className="label-style">Periodo da analise</p>
                <p className="text-sm text-foreground mt-1">
                  {benchmarkStartDate
                    ? `${formatDateOnly(benchmarkStartDate)} ate ${formatDateOnly(new Date())} (${benchmarkDays} dias)`
                    : "Sem operacoes suficientes para comparar"}
                </p>
              </div>
              <div>
                <label className="block label-style mb-1">CDI anual (%)</label>
                <input
                  type="text"
                  value={benchmarkCdiAnnual.toString().replace(".", ",")}
                  onChange={(e) => {
                    const v = parseDecimalBR(e.target.value, 4);
                    setBenchmarkCdiAnnual(v >= 0 ? v : 0);
                  }}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground font-mono"
                />
              </div>
              <div>
                <label className="block label-style mb-1">IPCA anual (%)</label>
                <input
                  type="text"
                  value={benchmarkIpcaAnnual.toString().replace(".", ",")}
                  onChange={(e) => {
                    const v = parseDecimalBR(e.target.value, 4);
                    setBenchmarkIpcaAnnual(v >= 0 ? v : 0);
                  }}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground font-mono"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="card-surface p-4">
              <p className="label-style">Retorno carteira</p>
              <p className={`text-xl font-mono-nums font-semibold mt-1 ${portfolioCumReturn >= 0 ? "text-success" : "text-destructive"}`}>
                {formatPercentDecimal(portfolioCumReturn)}
              </p>
            </div>
            <div className="card-surface p-4">
              <p className="label-style">CDI acumulado</p>
              <p className="text-xl font-mono-nums font-semibold mt-1 text-foreground">
                {formatPercentDecimal(cdiCumReturn)}
              </p>
            </div>
            <div className="card-surface p-4">
              <p className="label-style">IPCA acumulado</p>
              <p className="text-xl font-mono-nums font-semibold mt-1 text-foreground">
                {formatPercentDecimal(ipcaCumReturn)}
              </p>
            </div>
            <div className="card-surface p-4">
              <p className="label-style">Retorno real</p>
              <p className={`text-xl font-mono-nums font-semibold mt-1 ${portfolioRealReturn >= 0 ? "text-success" : "text-destructive"}`}>
                {formatPercentDecimal(portfolioRealReturn)}
              </p>
            </div>
          </div>

          <div className="card-surface overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="py-3 px-4">Metrica</th>
                  <th className="py-3 px-4 text-right">Acumulado</th>
                  <th className="py-3 px-4 text-right">Dif. (carteira - linha)</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { label: "Carteira", value: portfolioCumReturn, alpha: 0 },
                  { label: "CDI", value: cdiCumReturn, alpha: portfolioCumReturn - cdiCumReturn },
                  { label: "IPCA", value: ipcaCumReturn, alpha: portfolioCumReturn - ipcaCumReturn },
                ].map((row) => (
                  <tr key={row.label} className="border-b border-border/50">
                    <td className="py-3 px-4 text-foreground">{row.label}</td>
                    <td className="py-3 px-4 text-right font-mono-nums">{formatPercentDecimal(row.value)}</td>
                    <td className={`py-3 px-4 text-right font-mono-nums ${row.alpha >= 0 ? "text-success" : "text-destructive"}`}>
                      {formatPercentDecimal(row.alpha)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "rebalanceamento" && (
        <div className="space-y-4">
          {distributionByType.total <= 0 || activeInvestments.length === 0 ? (
            <div className="card-surface p-12 text-center text-muted-foreground">
              Sem posicoes ativas para montar plano de rebalanceamento.
            </div>
          ) : (
            <>
              <div className="card-surface p-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                  <div>
                    <p className="label-style">Total atual da carteira</p>
                    <p className="text-xl font-mono-nums font-semibold text-foreground mt-1">
                      {formatCurrency(distributionByType.total)}
                    </p>
                  </div>
                  <div>
                    <label className="block label-style mb-1">Proximo aporte (R$)</label>
                    <input
                      type="text"
                      value={rebalanceContributionInput}
                      onChange={(e) => setRebalanceContributionInput(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground font-mono"
                      placeholder="0,00"
                      inputMode="decimal"
                    />
                  </div>
                  <div>
                    <p className="label-style">Soma dos alvos</p>
                    <p className={`text-xl font-mono-nums font-semibold mt-1 ${Math.abs(rebalancePlan.rawTargetSum - 100) < 0.01 ? "text-success" : "text-foreground"}`}>
                      {rebalancePlan.rawTargetSum.toFixed(2)}%
                    </p>
                  </div>
                </div>
              </div>

              <div className="card-surface overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted-foreground">
                      <th className="py-3 px-4">Grupo</th>
                      <th className="py-3 px-4 text-right">Atual</th>
                      <th className="py-3 px-4 text-right">Atual %</th>
                      <th className="py-3 px-4 text-right">Alvo %</th>
                      <th className="py-3 px-4 text-right">Gap atual</th>
                      <th className="py-3 px-4 text-right">Sugestao de aporte</th>
                      <th className="py-3 px-4 text-right">% projetado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rebalancePlan.rows.map((row) => (
                      <tr key={row.key} className="border-b border-border/50">
                        <td className="py-3 px-4 text-foreground">{row.label}</td>
                        <td className="py-3 px-4 text-right font-mono-nums">{formatCurrency(row.currentValue)}</td>
                        <td className="py-3 px-4 text-right font-mono-nums text-muted-foreground">{row.currentPercent.toFixed(1)}%</td>
                        <td className="py-3 px-4 text-right">
                          <input
                            type="number"
                            min={0}
                            step={0.1}
                            value={Number(rebalanceTargets[row.key] ?? 0).toString()}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value.replace(",", "."));
                              setRebalanceTargets((prev) => ({
                                ...prev,
                                [row.key]: Number.isFinite(val) ? Math.max(0, val) : 0,
                              }));
                            }}
                            className="w-24 ml-auto px-2 py-1 rounded border border-border bg-background text-foreground text-right font-mono-nums"
                          />
                        </td>
                        <td className="py-3 px-4 text-right font-mono-nums text-muted-foreground">{formatCurrency(row.currentGap)}</td>
                        <td className="py-3 px-4 text-right font-mono-nums text-foreground">{formatCurrency(row.suggestedContribution)}</td>
                        <td className="py-3 px-4 text-right font-mono-nums">{row.projectedPercent.toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {tab === "atribuicao" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="card-surface p-4">
              <p className="label-style">Aporte liquido</p>
              <p className="text-xl font-mono-nums font-semibold text-foreground mt-1">
                {formatCurrency(attributionSummary.aportes)}
              </p>
            </div>
            <div className="card-surface p-4">
              <p className="label-style">Patrimônio</p>
              <p className="text-xl font-mono-nums font-semibold text-foreground mt-1">
                {formatCurrency(attributionSummary.patrimonio)}
              </p>
            </div>
            <div className="card-surface p-4">
              <p className="label-style">Performance acumulada</p>
              <p className={`text-xl font-mono-nums font-semibold mt-1 ${attributionSummary.performance >= 0 ? "text-success" : "text-destructive"}`}>
                {formatCurrency(attributionSummary.performance)}
              </p>
            </div>
          </div>

          <div className="card-surface overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="py-3 px-4">Tipo</th>
                  <th className="py-3 px-4 text-right">Aportes</th>
                  <th className="py-3 px-4 text-right">Patrimônio</th>
                  <th className="py-3 px-4 text-right">Performance</th>
                </tr>
              </thead>
              <tbody>
                {attributionByType.map((row) => (
                  <tr key={row.assetType} className="border-b border-border/50">
                    <td className="py-3 px-4 text-foreground">
                      {ASSET_TYPE_LABELS[row.assetType as keyof typeof ASSET_TYPE_LABELS] ?? row.assetType}
                    </td>
                    <td className="py-3 px-4 text-right font-mono-nums">{formatCurrency(row.aportes)}</td>
                    <td className="py-3 px-4 text-right font-mono-nums">{formatCurrency(row.patrimonio)}</td>
                    <td className={`py-3 px-4 text-right font-mono-nums ${row.performance >= 0 ? "text-success" : "text-destructive"}`}>
                      {formatCurrency(row.performance)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card-surface overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="py-3 px-4">Ativo</th>
                  <th className="py-3 px-4 text-right">Aportes</th>
                  <th className="py-3 px-4 text-right">Patrimônio</th>
                  <th className="py-3 px-4 text-right">Performance</th>
                </tr>
              </thead>
              <tbody>
                {attributionByInvestment.map((row) => (
                  <tr key={row.id} className="border-b border-border/50">
                    <td className="py-3 px-4 text-foreground">
                      <span className="font-medium">{row.ticker}</span>
                      <span className="text-xs text-muted-foreground ml-2">{row.name}</span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono-nums">{formatCurrency(row.aportes)}</td>
                    <td className="py-3 px-4 text-right font-mono-nums">{formatCurrency(row.patrimonio)}</td>
                    <td className={`py-3 px-4 text-right font-mono-nums ${row.performance >= 0 ? "text-success" : "text-destructive"}`}>
                      {formatCurrency(row.performance)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showAddInv && (
        <AddInvestmentModal
          onClose={() => setShowAddInv(false)}
          onSuccess={() => {
            fetchInvestments();
            setShowAddInv(false);
          }}
        />
      )}

      {showAddOp && (
        <AddOperationModal
          investmentId={showAddOp}
          investments={investments}
          onClose={() => setShowAddOp(null)}
          onSuccess={() => {
            fetchInvestments();
            setShowAddOp(null);
          }}
        />
      )}

      {editingInvestment && (
        <EditInvestmentModal
          investment={editingInvestment}
          onClose={() => setEditingInvestment(null)}
          onSuccess={() => {
            fetchInvestments();
            setEditingInvestment(null);
          }}
        />
      )}

      {editingOp && (
        <EditOperationModal
          op={editingOp.op}
          invId={editingOp.invId}
          inv={editingOp.inv}
          onClose={() => setEditingOp(null)}
          onSuccess={() => {
            fetchInvestments();
            setEditingOp(null);
          }}
        />
      )}

    </div>
  );
}

const TICKER_PLACEHOLDER: Record<string, string> = {
  ACOES: "Ex: PETR4, VALE3",
  FII: "Ex: HGLG11, KNRI11",
  ETF: "Ex: BOVA11, IVVB11",
  RENDA_FIXA: "Ex: CDB-Nubank, Tesouro IPCA",
  POUPANCA_CAIXINHA: "Ex: Poupança, Caixinha 120% CDI",
  BITCOIN: "BTC",
  USDC: "USDC",
  OUTROS: "Ex: Código ou identificador",
};

function AddInvestmentModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [assetType, setAssetType] = useState("ACOES");
  const [name, setName] = useState("");
  const [ticker, setTicker] = useState("");
  const [rentabilidadeType, setRentabilidadeType] = useState<"PRE_FIXADO" | "POS_FIXADO">("PRE_FIXADO");
  const [taxaPercent, setTaxaPercent] = useState("");
  const [indiceReferencia, setIndiceReferencia] = useState("");
  const [initialDate, setInitialDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [initialQuantity, setInitialQuantity] = useState("");
  const [initialUnitPrice, setInitialUnitPrice] = useState("");
  const [initialFee, setInitialFee] = useState("");
  const [initialNotes, setInitialNotes] = useState("");
  const [initialAmount, setInitialAmount] = useState("");
  const [balanceOnlyPosition, setBalanceOnlyPosition] = useState(false);

  const isRendaFixa = assetType === "RENDA_FIXA";
  const isPoupancaCaixinha = assetType === "POUPANCA_CAIXINHA";
  const isCripto = assetType === "BITCOIN" || assetType === "USDC";
  /** Apenas em "Outros"; renda fixa e poupança têm fluxos próprios */
  const canBalanceOnly = assetType === "OUTROS";
  /** Formulário do primeiro aporte em valor único (saldo), sem cotas */
  const isBalanceOnlyForm = isPoupancaCaixinha || (canBalanceOnly && balanceOnlyPosition);

  const getTickerValue = () => {
    if (isCripto) return assetType;
    if (isRendaFixa) return ticker.trim().toUpperCase() || `RF-${name.replace(/\s/g, "-").slice(0, 12)}`;
    if (isPoupancaCaixinha) return ticker.trim().toUpperCase() || `PC-${name.replace(/\s/g, "-").slice(0, 12)}`;
    return ticker.trim().toUpperCase() || "";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const tickerValue = getTickerValue();
    if (!tickerValue && !isRendaFixa && !isPoupancaCaixinha) {
      toast.error("Preencha o ticker/código");
      return;
    }
    const body: Record<string, unknown> = {
      name,
      ticker: tickerValue || (isPoupancaCaixinha ? `PC-${Date.now()}` : `RF-${Date.now()}`),
      assetType,
      currentUnitPrice: 0,
    };
    if (isPoupancaCaixinha) {
      body.balanceOnlyPosition = true;
    } else if (canBalanceOnly && balanceOnlyPosition) {
      body.balanceOnlyPosition = true;
    }
    if (isRendaFixa) {
      body.rentabilidadeType = rentabilidadeType;
      const taxa = parseFloat(taxaPercent.replace(",", "."));
      if (!isNaN(taxa)) body.taxaPercent = taxa;
      if (indiceReferencia.trim()) body.indiceReferencia = indiceReferencia.trim();
    }
    const res = await fetch("/api/investments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json();
      toast.error(data.error ?? "Erro ao criar");
      return;
    }

    const created = (await res.json()) as { id: string };

    const decimals = getQuantityDecimals(assetType);
    const q = parseDecimalBR(initialQuantity, decimals);
    const p = parseDecimalBR(initialUnitPrice, decimals);
    const feeVal = parseDecimalBR(initialFee, 2);
    const feeNum = !isNaN(feeVal) && feeVal >= 0 ? feeVal : 0;

    const valorAporte = parseDecimalBR(initialAmount, 2);
    const wantsInitialBalance =
      isBalanceOnlyForm &&
      Boolean(initialDate) &&
      initialAmount.trim() !== "" &&
      valorAporte > 0;

    const wantsInitialStandard =
      !isBalanceOnlyForm &&
      Boolean(initialDate) &&
      initialQuantity.trim() !== "" &&
      initialUnitPrice.trim() !== "" &&
      q > 0 &&
      p > 0;

    if (wantsInitialBalance) {
      const round2 = (v: number) => Math.round(v * 100) / 100;
      const v = round2(valorAporte);
      const opRes = await fetch(`/api/investments/${created.id}/operations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: initialDate,
          type: "BUY",
          quantity: 1,
          unitPrice: v,
          total: v,
          fee: feeNum,
          notes: initialNotes.trim() || undefined,
        }),
      });
      if (!opRes.ok) {
        const err = await opRes.json().catch(() => ({}));
        toast.warning(
          `Investimento criado, mas não foi possível registrar o primeiro aporte: ${err.error ?? "erro na API"}. Registre em Nova operação.`
        );
        onSuccess();
        return;
      }
      const patchRes = await fetch(`/api/investments/${created.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentUnitPrice: v }),
      });
      if (!patchRes.ok) {
        toast.warning(
          'Primeiro aporte registrado. Ajuste o saldo na coluna "Preço / saldo" se não aparecer automaticamente.'
        );
      } else {
        toast.success("Investimento criado com primeiro aporte");
      }
      onSuccess();
      return;
    }

    if (wantsInitialStandard) {
      const roundVal = (v: number) =>
        Math.round(v * Math.pow(10, decimals)) / Math.pow(10, decimals);
      const totalVal = roundVal(q * p);
      const opRes = await fetch(`/api/investments/${created.id}/operations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: initialDate,
          type: "BUY",
          quantity: roundVal(q),
          unitPrice: roundVal(p),
          total: totalVal,
          fee: feeNum,
          notes: initialNotes.trim() || undefined,
        }),
      });
      if (!opRes.ok) {
        const err = await opRes.json().catch(() => ({}));
        toast.warning(
          `Investimento criado, mas não foi possível registrar o primeiro aporte: ${err.error ?? "erro na API"}. Registre em Nova operação.`
        );
        onSuccess();
        return;
      }
      toast.success("Investimento criado com primeiro aporte");
    } else {
      toast.success("Investimento criado");
    }
    onSuccess();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div
        className="card-surface w-full max-w-md p-6 mx-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-foreground mb-4">
          Novo investimento
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block label-style mb-1">Tipo de produto</label>
            <select
              value={assetType}
              onChange={(e) => {
                const newType = e.target.value;
                setAssetType(newType);
                if (newType === "BITCOIN" || newType === "USDC") setTicker("");
                if (newType === "POUPANCA_CAIXINHA") {
                  setBalanceOnlyPosition(true);
                } else if (newType !== "OUTROS") {
                  setBalanceOnlyPosition(false);
                }
              }}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground"
            >
              {Object.entries(ASSET_TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block label-style mb-1">
              {isRendaFixa
                ? "Nome do produto"
                : isPoupancaCaixinha
                  ? "Nome da conta / caixinha"
                  : "Nome"}
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground"
              placeholder={
                isRendaFixa
                  ? "Ex: CDB Nubank, Tesouro IPCA"
                  : isPoupancaCaixinha
                    ? "Ex: Poupança Caixa Nubank, Caixinha 120% CDI"
                    : isCripto
                      ? "Ex: Bitcoin, Reserva USDC"
                      : "Ex: Petrobras PN, XP Renda Fixa"
              }
              required
            />
          </div>

          {isCripto && (
            <p className="text-xs text-muted-foreground">
              Ticker será definido automaticamente ({assetType}).
            </p>
          )}

          {!isCripto && (
            <div>
              <label className="block label-style mb-1">
                {isRendaFixa || isPoupancaCaixinha ? "Código / apelido (opcional)" : "Ticker"}
                {!isRendaFixa && !isPoupancaCaixinha && (
                  <span className="text-destructive ml-0.5">*</span>
                )}
              </label>
              <input
                type="text"
                value={ticker}
                onChange={(e) => setTicker(e.target.value.toUpperCase())}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground font-mono"
                placeholder={TICKER_PLACEHOLDER[assetType] ?? "Ex: código"}
                required={!isRendaFixa && !isPoupancaCaixinha}
              />
              {(isRendaFixa || isPoupancaCaixinha) && (
                <p className="text-xs text-muted-foreground mt-1">
                  Opcional — usado para diferenciar contas ou produtos similares
                </p>
              )}
            </div>
          )}

          {isRendaFixa && (
            <>
              <div>
                <label className="block label-style mb-1">Rentabilidade</label>
                <select
                  value={rentabilidadeType}
                  onChange={(e) =>
                    setRentabilidadeType(e.target.value as "PRE_FIXADO" | "POS_FIXADO")
                  }
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground"
                >
                  <option value="PRE_FIXADO">Pré-Fixado</option>
                  <option value="POS_FIXADO">Pós-Fixado</option>
                </select>
              </div>
              <div>
                <label className="block label-style mb-1">
                  Taxa (% ao ano) {rentabilidadeType === "PRE_FIXADO" ? "" : "- spread"}
                </label>
                <input
                  type="text"
                  value={taxaPercent}
                  onChange={(e) => setTaxaPercent(e.target.value.replace(",", "."))}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground font-mono"
                  placeholder={rentabilidadeType === "PRE_FIXADO" ? "Ex: 12,5" : "Ex: 100 (100% do CDI)"}
                />
              </div>
              {rentabilidadeType === "POS_FIXADO" && (
                <div>
                  <label className="block label-style mb-1">Atrelado ao índice</label>
                  <select
                    value={indiceReferencia}
                    onChange={(e) => setIndiceReferencia(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground"
                  >
                    <option value="">Selecione</option>
                    {INDICE_OPCOES.map((idx) => (
                      <option key={idx} value={idx}>
                        {idx}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </>
          )}

          {canBalanceOnly && (
            <label className="flex items-start gap-2 text-sm text-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={balanceOnlyPosition}
                onChange={(e) => setBalanceOnlyPosition(e.target.checked)}
                className="mt-1 rounded border-border"
              />
              <span>
                Apenas saldo (sem cotas no painel)
                <span className="block text-xs text-muted-foreground mt-0.5">
                  Para poupança e caixinhas use o tipo &quot;Poupança e caixinhas&quot;. Aqui o saldo fica em
                  &quot;Preço / saldo&quot; e o investido nas operações.
                </span>
              </span>
            </label>
          )}

          <div className="border border-border rounded-lg p-4 space-y-3 bg-muted/20">
            <div>
              <p className="text-sm font-medium text-foreground">Primeiro aporte (opcional)</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {isBalanceOnlyForm
                  ? "Informe data e valor em reais. O saldo atual na carteira será atualizado com esse valor."
                  : isRendaFixa
                    ? "Informe data da aplicação, quantidade (geralmente 1) e valor unitário em R$, ou quantidade = valor total e preço unitário = 1."
                    : "Informe a primeira compra para já aparecer quantidade, investido e preço médio."}
              </p>
            </div>
            {isBalanceOnlyForm ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 sm:col-span-1">
                  <label className="block label-style mb-1">Data do aporte</label>
                  <input
                    type="date"
                    value={initialDate}
                    onChange={(e) => setInitialDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block label-style mb-1">Valor (R$)</label>
                  <input
                    type="text"
                    value={initialAmount}
                    onChange={(e) => setInitialAmount(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground font-mono"
                    placeholder="0,00"
                    inputMode="decimal"
                  />
                </div>
                <div>
                  <label className="block label-style mb-1">Taxa (R$)</label>
                  <input
                    type="text"
                    value={initialFee}
                    onChange={(e) => setInitialFee(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground font-mono"
                    placeholder="0,00"
                    inputMode="decimal"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block label-style mb-1">Observações</label>
                  <input
                    type="text"
                    value={initialNotes}
                    onChange={(e) => setInitialNotes(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground"
                    placeholder="Opcional"
                  />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 sm:col-span-1">
                  <label className="block label-style mb-1">Data da compra</label>
                  <input
                    type="date"
                    value={initialDate}
                    onChange={(e) => setInitialDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground"
                  />
                </div>
                <div>
                  <label className="block label-style mb-1">{getQuantityLabel(assetType)}</label>
                  <input
                    type="text"
                    value={initialQuantity}
                    onChange={(e) => setInitialQuantity(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground font-mono"
                    placeholder={getQuantityPlaceholder(assetType)}
                  />
                </div>
                <div>
                  <label className="block label-style mb-1">Preço unitário (R$)</label>
                  <input
                    type="text"
                    value={initialUnitPrice}
                    onChange={(e) => setInitialUnitPrice(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground font-mono"
                    placeholder="0,00"
                    inputMode="decimal"
                  />
                </div>
                <div>
                  <label className="block label-style mb-1">Taxa (R$)</label>
                  <input
                    type="text"
                    value={initialFee}
                    onChange={(e) => setInitialFee(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground font-mono"
                    placeholder="0,00"
                    inputMode="decimal"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block label-style mb-1">Observações</label>
                  <input
                    type="text"
                    value={initialNotes}
                    onChange={(e) => setInitialNotes(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground"
                    placeholder="Opcional"
                  />
                </div>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              {isBalanceOnlyForm
                ? "Deixe o valor em branco para criar só o cadastro e lançar o primeiro aporte depois."
                : "Total da posição = quantidade × preço unitário (+ taxa). Deixe quantidade ou preço vazio para criar só o cadastro."}
            </p>
          </div>

          <div className="flex gap-2 justify-end pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-border hover:bg-[hsl(var(--surface-hover))]"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90"
            >
              Criar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AddOperationModal({
  investmentId,
  investments,
  onClose,
  onSuccess,
}: {
  investmentId: string;
  investments: Investment[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const inv = investments.find((i) => i.id === investmentId);
  const [date, setDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [type, setType] = useState("BUY");
  const [quantity, setQuantity] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [fee, setFee] = useState("");
  const [notes, setNotes] = useState("");
  const [amount, setAmount] = useState("");

  const balanceOnly = inv ? isBalanceOnlyInvestment(inv) : false;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inv) return;

    if (balanceOnly) {
      const valor = parseDecimalBR(amount, 2);
      if (valor <= 0) {
        toast.error("Informe um valor maior que zero");
        return;
      }
      const feeVal = parseDecimalBR(fee, 2);
      const feeNum = !isNaN(feeVal) && feeVal >= 0 ? feeVal : 0;
      const round2 = (v: number) => Math.round(v * 100) / 100;
      const v = round2(valor);
      const res = await fetch(`/api/investments/${investmentId}/operations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          type,
          quantity: 1,
          unitPrice: v,
          total: v,
          fee: feeNum,
          notes: notes.trim() || undefined,
        }),
      });
      if (res.ok) {
        toast.success("Operação registrada");
        onSuccess();
      } else {
        const data = await res.json();
        toast.error(
          data.details ? `${data.error}: ${data.details}` : (data.error ?? "Erro ao registrar")
        );
      }
      return;
    }

    const decimals = getQuantityDecimals(inv.assetType);
    const q = parseDecimalBR(quantity, decimals);
    const p = parseDecimalBR(unitPrice, decimals);
    if (q <= 0 || p < 0) {
      toast.error("Quantidade e preço inválidos");
      return;
    }
    const feeVal = parseDecimalBR(fee, 2);
    const roundVal = (v: number) =>
      Math.round(v * Math.pow(10, decimals)) / Math.pow(10, decimals);
    const totalVal = roundVal(q * p);
    const feeNum = feeVal >= 0 ? feeVal : 0;
    const res = await fetch(`/api/investments/${investmentId}/operations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date,
        type,
        quantity: roundVal(q),
        unitPrice: roundVal(p),
        total: totalVal,
        fee: feeNum,
        notes: notes || undefined,
      }),
    });
    if (res.ok) {
      toast.success("Operação registrada");
      onSuccess();
    } else {
      const data = await res.json();
      toast.error(data.details ? `${data.error}: ${data.details}` : (data.error ?? "Erro ao registrar"));
    }
  };

  if (!inv) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div
        className="card-surface w-full max-w-md p-6 mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-foreground mb-1">
          Nova operação
        </h2>
        <p className="text-sm text-muted-foreground mb-4">
          {inv.ticker} — {inv.name}
        </p>
        {balanceOnly && (
          <p className="text-xs text-muted-foreground mb-4 rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
            Modo apenas saldo: informe a data, o tipo (aporte, resgate ou rendimento) e o valor em reais. O
            saldo atualizado continua na coluna &quot;Preço / saldo&quot; na tabela.
          </p>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block label-style mb-1">Data</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground"
                required
              />
            </div>
            <div>
              <label className="block label-style mb-1">Tipo</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground"
              >
                {balanceOnly
                  ? Object.entries(BALANCE_ONLY_OP_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))
                  : Object.entries(OP_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
              </select>
            </div>
          </div>
          {balanceOnly ? (
            <>
              <div>
                <label className="block label-style mb-1">Valor (R$)</label>
                <input
                  type="text"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground font-mono"
                  placeholder="0,00"
                  inputMode="decimal"
                  required
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Valor do aporte, do resgate ou do rendimento creditado (conforme o tipo acima).
                </p>
              </div>
              <div>
                <label className="block label-style mb-1">Taxa (R$)</label>
                <input
                  type="text"
                  value={fee}
                  onChange={(e) => setFee(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground font-mono"
                  placeholder="0,00"
                  inputMode="decimal"
                />
              </div>
              <div className="w-full px-3 py-2 rounded-lg bg-muted/50 border border-border font-mono text-foreground text-sm">
                {(() => {
                  const valor = parseDecimalBR(amount, 2);
                  const f = parseDecimalBR(fee, 2);
                  const feeNum = !isNaN(f) && f >= 0 ? f : 0;
                  const tot = valor > 0 ? valor : 0;
                  const totalPago = tot + feeNum;
                  return (
                    <span>
                      Valor da operação: {formatCurrency(tot)}
                      {feeNum > 0 && (
                        <span className="text-xs text-muted-foreground block mt-0.5">
                          Com taxas: {formatCurrency(totalPago)} (entra no investido acumulado)
                        </span>
                      )}
                    </span>
                  );
                })()}
              </div>
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block label-style mb-1">{getQuantityLabel(inv.assetType)}</label>
                  <input
                    type="text"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground font-mono"
                    placeholder={getQuantityPlaceholder(inv.assetType)}
                    required
                  />
                </div>
                <div>
                  <label className="block label-style mb-1">Preço unit.</label>
                  <input
                    type="text"
                    value={unitPrice}
                    onChange={(e) => setUnitPrice(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground font-mono"
                    placeholder="0,00"
                    inputMode="decimal"
                    required
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block label-style mb-1">Taxa (R$)</label>
                  <input
                    type="text"
                    value={fee}
                    onChange={(e) => setFee(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground font-mono"
                    placeholder="0,00"
                    inputMode="decimal"
                  />
                </div>
                <div>
                  <label className="block label-style mb-1">Total (R$)</label>
                  <div className="w-full px-3 py-2 rounded-lg bg-muted/50 border border-border font-mono text-foreground min-h-[42px] flex items-center">
                    {(() => {
                      const dec = getQuantityDecimals(inv.assetType);
                      const q = parseDecimalBR(quantity, dec);
                      const p = parseDecimalBR(unitPrice, dec);
                      const f = parseDecimalBR(fee, 2);
                      const tot = q > 0 && p >= 0 ? q * p : 0;
                      const feeNum = !isNaN(f) && f >= 0 ? f : 0;
                      const totalPago = tot + feeNum;
                      return (
                        <span>
                          {formatCurrency(tot)}
                          {feeNum > 0 && (
                            <span className="text-xs text-muted-foreground block mt-0.5">
                              Total pago: {formatCurrency(totalPago)}
                            </span>
                          )}
                        </span>
                      );
                    })()}
                  </div>
                </div>
              </div>
            </>
          )}
          <div>
            <label className="block label-style mb-1">Observações</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground"
              placeholder="Opcional"
            />
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-border hover:bg-[hsl(var(--surface-hover))]"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90"
            >
              Registrar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EditInvestmentModal({
  investment,
  onClose,
  onSuccess,
}: {
  investment: Investment;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [name, setName] = useState(investment.name);
  const [ticker, setTicker] = useState(investment.ticker);
  const [assetType, setAssetType] = useState(investment.assetType);
  const [currentUnitPrice, setCurrentUnitPrice] = useState(investment.currentUnitPrice.toString());
  const [balanceOnlyPosition, setBalanceOnlyPosition] = useState(
    investment.balanceOnlyPosition ?? false
  );
  const isCripto = assetType === "BITCOIN" || assetType === "USDC";
  const isPoupancaCaixinha = assetType === "POUPANCA_CAIXINHA";
  const canBalanceOnly = assetType === "OUTROS";

  useEffect(() => {
    setName(investment.name);
    setTicker(investment.ticker);
    setAssetType(investment.assetType);
    setCurrentUnitPrice(investment.currentUnitPrice.toString());
    setBalanceOnlyPosition(investment.balanceOnlyPosition ?? false);
  }, [investment]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const price = parseFloat(currentUnitPrice.replace(",", "."));
    if (isNaN(price) || price < 0) {
      toast.error("Preço inválido");
      return;
    }
    const res = await fetch(`/api/investments/${investment.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        ticker: isCripto ? assetType : ticker.trim().toUpperCase(),
        assetType,
        currentUnitPrice: price,
        balanceOnlyPosition: isPoupancaCaixinha || (canBalanceOnly && balanceOnlyPosition),
      }),
    });
    if (res.ok) {
      toast.success("Investimento atualizado");
      onSuccess();
    } else {
      const data = await res.json();
      toast.error(data.error ?? "Erro ao atualizar");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div
        className="card-surface w-full max-w-md p-6 mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-foreground mb-4">Editar investimento</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block label-style mb-1">Nome</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground"
              required
            />
          </div>
          {!isCripto && (
            <div>
              <label className="block label-style mb-1">Ticker</label>
              <input
                type="text"
                value={ticker}
                onChange={(e) => setTicker(e.target.value.toUpperCase())}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground font-mono"
                required
              />
            </div>
          )}
          <div>
            <label className="block label-style mb-1">Tipo</label>
            <select
              value={assetType}
              onChange={(e) => {
                const v = e.target.value;
                setAssetType(v);
                if (v === "POUPANCA_CAIXINHA") {
                  setBalanceOnlyPosition(true);
                } else if (v !== "OUTROS") {
                  setBalanceOnlyPosition(false);
                }
              }}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground"
            >
              {Object.entries(ASSET_TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          {canBalanceOnly && (
            <label className="flex items-start gap-2 text-sm text-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={balanceOnlyPosition}
                onChange={(e) => setBalanceOnlyPosition(e.target.checked)}
                className="mt-1 rounded border-border"
              />
              <span>
                Apenas saldo (sem cotas)
                <span className="block text-xs text-muted-foreground mt-0.5">
                  Poupança/caixinhas: use o tipo &quot;Poupança e caixinhas&quot;.
                </span>
              </span>
            </label>
          )}
          <div>
            <label className="block label-style mb-1">
              {isPoupancaCaixinha || assetType === "RENDA_FIXA" || balanceOnlyPosition
                ? "Saldo atual (R$)"
                : "Preço atual (R$)"}
            </label>
            <input
              type="text"
              value={currentUnitPrice}
              onChange={(e) => setCurrentUnitPrice(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground font-mono"
              placeholder="0,00"
              inputMode="decimal"
              required
            />
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-border hover:bg-[hsl(var(--surface-hover))]">
              Cancelar
            </button>
            <button type="submit" className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90">
              Salvar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EditOperationModal({
  op,
  invId,
  inv,
  onClose,
  onSuccess,
}: {
  op: Operation;
  invId: string;
  inv: Investment;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const decimals = getQuantityDecimals(inv.assetType);
  const formatForInput = (val: number) =>
    val.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: decimals });
  const [date, setDate] = useState(op.date.slice(0, 10));
  const [type, setType] = useState(op.type);
  const [quantity, setQuantity] = useState(formatForInput(Number(op.quantity)));
  const [unitPrice, setUnitPrice] = useState(formatForInput(Number(op.unitPrice)));
  const [total, setTotal] = useState(
    Number(op.total) >= 0 ? formatForInput(Number(op.total)) : op.total.toString()
  );
  const [fee, setFee] = useState((op.fee ?? 0).toString());
  const [notes, setNotes] = useState(op.notes ?? "");

  const formatBalanceOpAmount = (o: Operation) => {
    const v = Number(o.total);
    if (Number.isNaN(v)) return "";
    return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const balanceOnly = isBalanceOnlyInvestment(inv);
  const [amount, setAmount] = useState(() =>
    isBalanceOnlyInvestment(inv) ? formatBalanceOpAmount(op) : ""
  );

  useEffect(() => {
    if (!isBalanceOnlyInvestment(inv)) return;
    setAmount(formatBalanceOpAmount(op));
    setDate(op.date.slice(0, 10));
    setType(op.type);
    setFee((op.fee ?? 0).toString());
    setNotes(op.notes ?? "");
  }, [
    inv.assetType,
    inv.balanceOnlyPosition,
    op.id,
    op.date,
    op.type,
    op.total,
    op.fee,
    op.notes,
  ]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (balanceOnly) {
      const valor = parseDecimalBR(amount, 2);
      if (valor <= 0) {
        toast.error("Informe um valor maior que zero");
        return;
      }
      const feeVal = parseDecimalBR(fee, 2);
      const feeNum = !isNaN(feeVal) && feeVal >= 0 ? feeVal : 0;
      const round2 = (v: number) => Math.round(v * 100) / 100;
      const v = round2(valor);
      const res = await fetch(`/api/investments/${invId}/operations/${op.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          type,
          quantity: 1,
          unitPrice: v,
          total: v,
          fee: feeNum,
          notes: notes.trim() || null,
        }),
      });
      if (res.ok) {
        toast.success("Operação atualizada");
        onSuccess();
      } else {
        const data = await res.json();
        toast.error(data.error ?? "Erro ao atualizar");
      }
      return;
    }

    const decimals = getQuantityDecimals(inv.assetType);
    const q = parseDecimalBR(quantity, decimals);
    const p = parseDecimalBR(unitPrice, decimals);
    const totalVal = parseDecimalBR(total, decimals);
    const feeVal = parseDecimalBR(fee, 2);
    if (q <= 0 || p < 0) {
      toast.error("Quantidade e preço inválidos");
      return;
    }
    const roundVal = (v: number) =>
      Math.round(v * Math.pow(10, decimals)) / Math.pow(10, decimals);
    const payload: Record<string, unknown> = {
      date,
      type,
      quantity: roundVal(q),
      unitPrice: roundVal(p),
      notes: notes.trim() || null,
      fee: !isNaN(feeVal) && feeVal >= 0 ? feeVal : 0,
    };
    if (totalVal >= 0) payload.total = roundVal(totalVal);
    const res = await fetch(`/api/investments/${invId}/operations/${op.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      toast.success("Operação atualizada");
      onSuccess();
    } else {
      const data = await res.json();
      toast.error(data.error ?? "Erro ao atualizar");
    }
  };

  const balanceOnlyTypeKeys = new Set(["BUY", "SELL", "BONUS"]);
  const showLegacyOpType = balanceOnly && !balanceOnlyTypeKeys.has(type);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div
        className="card-surface w-full max-w-md p-6 mx-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-foreground mb-1">Editar operação</h2>
        <p className="text-sm text-muted-foreground mb-4">
          {inv.ticker} — {inv.name}
        </p>
        {balanceOnly && (
          <p className="text-xs text-muted-foreground mb-4 rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
            Ajuste data, tipo e valor em reais. Operações antigas com tipo diferente aparecem no seletor até
            você padronizar.
          </p>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block label-style mb-1">Data</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground"
                required
              />
            </div>
            <div>
              <label className="block label-style mb-1">Tipo</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground"
              >
                {balanceOnly ? (
                  <>
                    {showLegacyOpType && (
                      <option value={type}>{OP_LABELS[type] ?? type}</option>
                    )}
                    {Object.entries(BALANCE_ONLY_OP_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </>
                ) : (
                  Object.entries(OP_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))
                )}
              </select>
            </div>
          </div>
          {balanceOnly ? (
            <>
              <div>
                <label className="block label-style mb-1">Valor (R$)</label>
                <input
                  type="text"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground font-mono"
                  placeholder="0,00"
                  inputMode="decimal"
                  required
                />
              </div>
              <div>
                <label className="block label-style mb-1">Taxa (R$)</label>
                <input
                  type="text"
                  value={fee}
                  onChange={(e) => setFee(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground font-mono"
                  placeholder="0,00"
                  inputMode="decimal"
                />
              </div>
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block label-style mb-1">{getQuantityLabel(inv.assetType)}</label>
                  <input
                    type="text"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground font-mono"
                    placeholder={getQuantityPlaceholder(inv.assetType)}
                    required
                  />
                </div>
                <div>
                  <label className="block label-style mb-1">Preço unit.</label>
                  <input
                    type="text"
                    value={unitPrice}
                    onChange={(e) => setUnitPrice(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground font-mono"
                    required
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block label-style mb-1">Total (R$)</label>
                  <input
                    type="text"
                    value={total}
                    onChange={(e) => setTotal(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground font-mono"
                    placeholder="Calculado automaticamente"
                  />
                </div>
                <div>
                  <label className="block label-style mb-1">Taxa (R$)</label>
                  <input
                    type="text"
                    value={fee}
                    onChange={(e) => setFee(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground font-mono"
                    placeholder="0,00"
                    inputMode="decimal"
                  />
                </div>
              </div>
            </>
          )}
          <div>
            <label className="block label-style mb-1">Observações</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground"
            />
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-border hover:bg-[hsl(var(--surface-hover))]">
              Cancelar
            </button>
            <button type="submit" className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90">
              Salvar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

