"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Download,
  AlertTriangle,
  CheckCircle,
} from "lucide-react";
import { computePositionCostBasisAndQuantity } from "@/lib/investment-average-cost";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

interface Investment {
  id: string;
  ticker: string;
  name: string;
  assetType: string;
  balanceOnlyPosition?: boolean;
  quantity: number;
  averagePrice: number;
  invested: number;
  currentValue?: number;
  operations: Array<{
    id: string;
    type: string;
    date: string;
    quantity: number;
    unitPrice: number;
    total: number;
    fee?: number;
  }>;
}

/** Quantidade sem ruído de ponto flutuante (0.0014991000000003 → 0,0014991); até 8 casas para cripto. */
function formatQuantity(q: number) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 8 }).format(q);
}

function getYearEndTimestamp(year: number) {
  return Date.UTC(year, 11, 31, 23, 59, 59, 999);
}

function parseCalendarDate(value: string) {
  if (!value) return null;

  const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return {
      year: Number(isoMatch[1]),
      month: Number(isoMatch[2]),
      day: Number(isoMatch[3]),
    };
  }

  const brMatch = value.match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{4})$/);
  if (brMatch) {
    return {
      year: Number(brMatch[3]),
      month: Number(brMatch[2]),
      day: Number(brMatch[1]),
    };
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return {
    year: parsed.getUTCFullYear(),
    month: parsed.getUTCMonth() + 1,
    day: parsed.getUTCDate(),
  };
}

function getDateSortTimestamp(value: string) {
  const parsed = parseCalendarDate(value);
  if (parsed) {
    return Date.UTC(parsed.year, parsed.month - 1, parsed.day, 12, 0, 0, 0);
  }
  const fallback = new Date(value).getTime();
  return Number.isNaN(fallback) ? Number.MAX_SAFE_INTEGER : fallback;
}

function formatDatePtBr(value: string) {
  const parsed = parseCalendarDate(value);
  if (!parsed) return value;
  return `${String(parsed.day).padStart(2, "0")}/${String(parsed.month).padStart(2, "0")}/${parsed.year}`;
}

function getYearFromDate(value: string) {
  const parsed = parseCalendarDate(value);
  return parsed ? parsed.year : null;
}

function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

const IRRF_WITHHOLDING_RATE = 0.00005;

interface SaleResult {
  id: string;
  ticker: string;
  name: string;
  assetType: string;
  taxClass: TaxClass;
  date: string;
  quantity: number;
  unitPrice: number;
  averagePriceAtSale: number;
  proceeds: number;
  withholdingTax: number;
  cost: number;
  gain: number;
  year: number | null;
  month: number | null;
}

type TaxClass = "ACOES" | "FII" | "CRIPTO" | "RENDA_FIXA" | "OUTROS";
type SalesTaxFilter = "TODOS" | TaxClass;

const TAX_CLASS_ORDER: TaxClass[] = [
  "ACOES",
  "FII",
  "CRIPTO",
  "RENDA_FIXA",
  "OUTROS",
];

const TAX_CLASS_LABEL: Record<TaxClass, string> = {
  ACOES: "Acoes/ETF",
  FII: "FII",
  CRIPTO: "Cripto",
  RENDA_FIXA: "Renda Fixa",
  OUTROS: "Outros",
};

function getTaxClass(assetType: string): TaxClass {
  if (assetType === "ACOES" || assetType === "ETF") return "ACOES";
  if (assetType === "FII") return "FII";
  if (assetType === "BITCOIN" || assetType === "USDC") return "CRIPTO";
  if (assetType === "RENDA_FIXA" || assetType === "POUPANCA_CAIXINHA") return "RENDA_FIXA";
  return "OUTROS";
}

function getMonthFromDate(value: string) {
  const parsed = parseCalendarDate(value);
  return parsed ? parsed.month : null;
}

function getMonthLabel(month: number) {
  const labels = [
    "janeiro",
    "fevereiro",
    "marco",
    "abril",
    "maio",
    "junho",
    "julho",
    "agosto",
    "setembro",
    "outubro",
    "novembro",
    "dezembro",
  ];
  return labels[Math.min(11, Math.max(0, month - 1))] ?? "";
}

function computeSalesForInvestment(inv: Investment): SaleResult[] {
  const operations = [...(inv.operations || [])].sort((a, b) => {
    const da = getDateSortTimestamp(a.date);
    const db = getDateSortTimestamp(b.date);
    if (da !== db) return da - db;
    return String(a.id).localeCompare(String(b.id));
  });

  let quantity = 0;
  let costBasis = 0;
  const sales: SaleResult[] = [];
  const taxClass = getTaxClass(inv.assetType);

  for (const op of operations) {
    const q = Number(op.quantity ?? 0);
    const unitPrice = Number(op.unitPrice ?? 0);
    const total = Number(op.total ?? unitPrice * q);
    const fee = Number(op.fee ?? 0);

    if (!Number.isFinite(q) || q <= 0) continue;

    if (op.type === "BUY" || op.type === "SUBSCRIPTION" || op.type === "BONUS") {
      quantity += q;
      costBasis += total + fee;
      continue;
    }

    if (op.type !== "SELL" || quantity <= 0) continue;

    const soldQty = Math.min(q, quantity);
    const proportion = q > 0 ? soldQty / q : 1;
    const avgPriceAtSale = quantity > 0 ? costBasis / quantity : 0;
    const allocatedCost = soldQty * avgPriceAtSale;
    const allocatedGross = total * proportion;
    const allocatedFee = fee * proportion;
    const proceeds = allocatedGross - allocatedFee;
    const withholdingTax = allocatedGross * IRRF_WITHHOLDING_RATE;
    const gain = proceeds - allocatedCost;

    sales.push({
      id: op.id,
      ticker: inv.ticker,
      name: inv.name,
      assetType: inv.assetType,
      taxClass,
      date: op.date,
      quantity: roundCurrency(soldQty),
      unitPrice: roundCurrency(unitPrice),
      averagePriceAtSale: roundCurrency(avgPriceAtSale),
      proceeds: roundCurrency(proceeds),
      withholdingTax: roundCurrency(withholdingTax),
      cost: roundCurrency(allocatedCost),
      gain: roundCurrency(gain),
      year: getYearFromDate(op.date),
      month: getMonthFromDate(op.date),
    });

    quantity -= soldQty;
    costBasis -= allocatedCost;
    if (quantity <= 1e-8) {
      quantity = 0;
      costBasis = 0;
    }
  }

  return sales;
}

export default function IRPFPage() {
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"bens" | "vendas">("bens");
  const irpfYear = new Date().getFullYear() - 1;
  const [salesYear, setSalesYear] = useState(irpfYear);
  const [salesTaxFilter, setSalesTaxFilter] = useState<SalesTaxFilter>("TODOS");
  const yearEndTimestamp = getYearEndTimestamp(irpfYear);

  const fetchInvestments = () =>
    fetch("/api/investments")
      .then((r) => r.json())
      .then((data) => setInvestments(data))
      .catch(() => {})
      .finally(() => setLoading(false));

  useEffect(() => {
    fetchInvestments();
  }, []);

  const investmentsWithBalance = investments
    .map((inv) => {
      const operationsAtYearEnd = (inv.operations || []).filter((op) => {
        const opTime = new Date(op.date).getTime();
        return !Number.isNaN(opTime) && opTime <= yearEndTimestamp;
      });

      const isBalanceBased =
        inv.assetType === "RENDA_FIXA" ||
        inv.assetType === "POUPANCA_CAIXINHA" ||
        inv.balanceOnlyPosition === true;

      if (isBalanceBased) {
        const declaredValue = operationsAtYearEnd.reduce((sum, op) => {
          const total = Number(op.total ?? 0);
          const fee = Number(op.fee ?? 0);
          if (op.type === "BUY" || op.type === "SUBSCRIPTION" || op.type === "BONUS") {
            return sum + total + fee;
          }
          if (op.type === "SELL") {
            return sum - (total - fee);
          }
          return sum;
        }, 0);

        const roundedDeclaredValue = Math.max(
          0,
          Math.round(declaredValue * 100) / 100
        );

        return {
          ...inv,
          irpfQuantity: 0,
          irpfAveragePrice: 0,
          irpfDeclaredValue: roundedDeclaredValue,
          irpfHasPosition: roundedDeclaredValue > 0,
        };
      }

      const pos = computePositionCostBasisAndQuantity(
        operationsAtYearEnd,
        (op) => Number(op.fee ?? 0)
      );

      const irpfQuantity = Number(pos.quantity ?? 0);
      const irpfDeclaredValue = Number(pos.costBasis ?? 0);
      const irpfAveragePrice =
        irpfQuantity > 0 ? irpfDeclaredValue / irpfQuantity : 0;

      return {
        ...inv,
        irpfQuantity,
        irpfAveragePrice,
        irpfDeclaredValue,
        irpfHasPosition: irpfQuantity > 0,
      };
    })
    .filter((inv) => inv.irpfHasPosition);

  const totalPatrimonio = investmentsWithBalance.reduce(
    (s, i) => s + i.irpfDeclaredValue,
    0
  );
  const allSales = investments.flatMap((inv) => computeSalesForInvestment(inv));
  const availableSaleYears = Array.from(
    new Set(allSales.map((sale) => sale.year).filter((year): year is number => year != null))
  ).sort((a, b) => b - a);

  useEffect(() => {
    if (availableSaleYears.length === 0) return;
    if (!availableSaleYears.includes(salesYear)) {
      setSalesYear(availableSaleYears[0]);
    }
  }, [salesYear, availableSaleYears]);

  const classYearlyNet = TAX_CLASS_ORDER.reduce((acc, taxClass) => {
    acc[taxClass] = {};
    return acc;
  }, {} as Record<TaxClass, Record<number, number>>);

  for (const sale of allSales) {
    if (sale.year == null) continue;
    const prev = classYearlyNet[sale.taxClass][sale.year] ?? 0;
    classYearlyNet[sale.taxClass][sale.year] = roundCurrency(prev + sale.gain);
  }

  const vendas = allSales
    .filter((sale) => sale.year === salesYear)
    .sort((a, b) => {
      const da = getDateSortTimestamp(a.date);
      const db = getDateSortTimestamp(b.date);
      return db - da;
    });
  const visibleTaxClasses =
    salesTaxFilter === "TODOS" ? TAX_CLASS_ORDER : [salesTaxFilter];
  const filteredVendas =
    salesTaxFilter === "TODOS"
      ? vendas
      : vendas.filter((sale) => sale.taxClass === salesTaxFilter);

  const totalGain = roundCurrency(filteredVendas.reduce((s, v) => s + v.gain, 0));
  const totalSaleProfits = roundCurrency(
    filteredVendas.filter((v) => v.gain > 0).reduce((s, v) => s + v.gain, 0)
  );
  const totalSaleLosses = roundCurrency(
    filteredVendas.filter((v) => v.gain < 0).reduce((s, v) => s + Math.abs(v.gain), 0)
  );

  const salesByTaxClass = visibleTaxClasses.map((taxClass) => {
    const sales = filteredVendas.filter((sale) => sale.taxClass === taxClass);
    const profits = roundCurrency(
      sales.filter((sale) => sale.gain > 0).reduce((sum, sale) => sum + sale.gain, 0)
    );
    const losses = roundCurrency(
      sales
        .filter((sale) => sale.gain < 0)
        .reduce((sum, sale) => sum + Math.abs(sale.gain), 0)
    );
    const net = roundCurrency(profits - losses);

    const prevCarry = Object.entries(classYearlyNet[taxClass])
      .map(([year, yearNet]) => ({ year: Number(year), yearNet }))
      .filter((yearInfo) => yearInfo.year < salesYear)
      .sort((a, b) => a.year - b.year)
      .reduce((carryLoss, yearInfo) => {
        if (yearInfo.yearNet < 0) return roundCurrency(carryLoss + Math.abs(yearInfo.yearNet));
        return roundCurrency(Math.max(0, carryLoss - yearInfo.yearNet));
      }, 0);

    const compensationUsed = net > 0 ? roundCurrency(Math.min(prevCarry, net)) : 0;
    const taxableAfterCompensation = roundCurrency(Math.max(0, net - compensationUsed));
    const carryToNextYears = roundCurrency(
      net >= 0 ? Math.max(0, prevCarry - net) : prevCarry + Math.abs(net)
    );

    return {
      taxClass,
      label: TAX_CLASS_LABEL[taxClass],
      operationCount: sales.length,
      profits,
      losses,
      net,
      prevCarry,
      compensationUsed,
      taxableAfterCompensation,
      carryToNextYears,
    };
  });

  const vendasByMonth = Array.from({ length: 12 }, (_, index) => index + 1)
    .map((month) => {
      const sales = filteredVendas
        .filter((sale) => sale.month === month)
        .sort((a, b) => {
          const da = getDateSortTimestamp(a.date);
          const db = getDateSortTimestamp(b.date);
          return da - db;
        });
      if (sales.length === 0) return null;
      const monthProfits = roundCurrency(
        sales.filter((sale) => sale.gain > 0).reduce((sum, sale) => sum + sale.gain, 0)
      );
      const monthLosses = roundCurrency(
        sales
          .filter((sale) => sale.gain < 0)
          .reduce((sum, sale) => sum + Math.abs(sale.gain), 0)
      );
      const monthWithholdingTax = roundCurrency(
        sales.reduce((sum, sale) => sum + sale.withholdingTax, 0)
      );
      const byTaxClass = visibleTaxClasses.map((taxClass) => {
        const classSales = sales.filter((sale) => sale.taxClass === taxClass);
        if (classSales.length === 0) return null;
        const classNet = roundCurrency(classSales.reduce((sum, sale) => sum + sale.gain, 0));
        return {
          taxClass,
          label: TAX_CLASS_LABEL[taxClass],
          operationCount: classSales.length,
          net: classNet,
        };
      }).filter((entry): entry is { taxClass: TaxClass; label: string; operationCount: number; net: number } => entry != null);

      return {
        month,
        label: getMonthLabel(month),
        sales,
        monthProfits,
        monthLosses,
        monthWithholdingTax,
        monthNet: roundCurrency(monthProfits - monthLosses),
        byTaxClass,
      };
    })
    .filter(
      (
        monthGroup
      ): monthGroup is {
        month: number;
        label: string;
        sales: SaleResult[];
        monthProfits: number;
        monthLosses: number;
        monthWithholdingTax: number;
        monthNet: number;
        byTaxClass: Array<{
          taxClass: TaxClass;
          label: string;
          operationCount: number;
          net: number;
        }>;
      } => monthGroup != null
    )
    .sort((a, b) => a.month - b.month);

  const getGrupoCodigo = (assetType: string) => {
    if (assetType === "FII") return { grupo: "Grupo 07 - Fundos", codigo: "73" };
    if (assetType === "ACOES") return { grupo: "Grupo 03 - Participacoes", codigo: "31" };
    if (assetType === "ETF") return { grupo: "Grupo 07 - Fundos", codigo: "74" };
    return { grupo: "Grupo 04 - Aplicacoes", codigo: "45" };
  };

  const handleExport = () => {
    const lines = [
      "Relatorio IRPF - FinancasPro",
      `Data: ${new Date().toLocaleDateString("pt-BR")}`,
      "",
      `Bens e Direitos (31/12/${irpfYear})`,
      ...investmentsWithBalance.map((i) => {
        const { codigo, grupo } = getGrupoCodigo(i.assetType);
        return `${codigo};${i.ticker} - ${i.name};${formatQuantity(i.irpfQuantity)} un.;${formatCurrency(i.irpfDeclaredValue)};${grupo}`;
      }),
      "",
      `Resumo de Vendas ${salesYear}`,
      `Filtro tipo;${salesTaxFilter === "TODOS" ? "Todos" : TAX_CLASS_LABEL[salesTaxFilter]}`,
      `Ganhos no ano;${formatCurrency(totalSaleProfits)}`,
      `Prejuizos no ano;${formatCurrency(totalSaleLosses)}`,
      `Resultado liquido no ano;${formatCurrency(totalGain)}`,
      `IRRF retido no ano (0,005%);${formatCurrency(roundCurrency(filteredVendas.reduce((sum, sale) => sum + sale.withholdingTax, 0)))}`,
      "Separacao por tipo de ativo",
      ...salesByTaxClass.map(
        (summary) =>
          `${summary.label};Operacoes ${summary.operationCount};Ganhos ${formatCurrency(summary.profits)};Prejuizos ${formatCurrency(summary.losses)};Liquido ${formatCurrency(summary.net)};Prej. ate ${salesYear - 1} ${formatCurrency(summary.prevCarry)};Compensado ${formatCurrency(summary.compensationUsed)};Prej. a compensar ${formatCurrency(summary.carryToNextYears)}`
      ),
      "",
      `Vendas (Ganho de Capital) - ${salesYear}`,
      ...filteredVendas.map((v) => `${v.ticker};${formatDatePtBr(v.date)};${TAX_CLASS_LABEL[v.taxClass]};Qtd ${v.quantity};Venda ${formatCurrency(v.unitPrice)};PM ${formatCurrency(v.averagePriceAtSale)};IRRF ${formatCurrency(v.withholdingTax)};${formatCurrency(v.gain)}`),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `irpf-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Declaracao IRPF
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Organize seus dados para a declaracao de Imposto de Renda
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleExport}
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90 text-sm font-medium"
          >
            <Download className="w-4 h-4 inline mr-2" />
            Exportar relatorio
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <div className="card-surface p-5">
            <span className="label-style">Patrimonio Declarado</span>
            <h3 className="text-xl font-mono-nums font-semibold text-foreground mt-2">
              {formatCurrency(totalPatrimonio)}
            </h3>
          </div>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
        >
          <div className="card-surface p-5">
            <span className="label-style">Resultado de vendas em {salesYear}</span>
            <h3 className={`text-xl font-mono-nums font-semibold mt-2 ${totalGain >= 0 ? "text-success" : "text-destructive"}`}>
              {formatCurrency(totalGain)}
            </h3>
          </div>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
        >
          <div className="card-surface p-5">
            <span className="label-style">Ativos na Carteira</span>
            <h3 className="text-xl font-mono-nums font-semibold text-foreground mt-2">
              {investmentsWithBalance.length}
            </h3>
          </div>
        </motion.div>
      </div>

      <div className="flex gap-2 border-b border-border pb-2">
        {(["bens", "vendas"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${
              tab === t
                ? "bg-primary/20 text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "bens" && "Bens e Direitos"}
            {t === "vendas" && "Operacoes de Venda"}
          </button>
        ))}
      </div>

      {tab === "bens" && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Posicao em 31/12/{irpfYear} para declaracao de Bens e Direitos no IRPF.
          </p>
          <div className="card-surface overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="py-3 px-4">Codigo</th>
                  <th className="py-3 px-4">Descricao</th>
                  <th className="py-3 px-4">CNPJ</th>
                  <th className="py-3 px-4 text-right">Situacao em 31/12</th>
                  <th className="py-3 px-4">Grupo</th>
                </tr>
              </thead>
              <tbody>
                {investmentsWithBalance.map((inv) => {
                  const { grupo, codigo } = getGrupoCodigo(inv.assetType);
                  return (
                    <tr key={inv.id} className="border-b border-border/50">
                      <td className="py-3 px-4 font-mono-nums">{codigo}</td>
                      <td className="py-3 px-4">
                        <p className="font-medium text-foreground">
                          {inv.ticker} - {inv.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {inv.irpfQuantity > 0
                            ? `${formatQuantity(inv.irpfQuantity)} unidades - PM: ${formatCurrency(inv.irpfAveragePrice)}`
                            : "Posicao por saldo em 31/12"}
                        </p>
                      </td>
                      <td className="py-3 px-4 text-muted-foreground">-</td>
                      <td className="py-3 px-4 text-right font-mono-nums font-medium">
                        {formatCurrency(inv.irpfDeclaredValue)}
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-xs px-2 py-0.5 rounded border border-border">
                          {grupo}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "vendas" && (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <p className="text-sm text-muted-foreground">
              Operacoes de venda em {salesYear} para apuracao de ganho de capital.
            </p>
            <div className="flex flex-col gap-2 md:flex-row md:items-center">
              <label className="text-sm text-muted-foreground flex items-center gap-2">
                Ano
                <select
                  value={salesYear}
                  onChange={(e) => setSalesYear(Number(e.target.value))}
                  className="px-3 py-2 rounded-lg border border-border bg-background text-foreground"
                >
                  {(availableSaleYears.length > 0 ? availableSaleYears : [irpfYear]).map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm text-muted-foreground flex items-center gap-2">
                Tipo
                <select
                  value={salesTaxFilter}
                  onChange={(e) => setSalesTaxFilter(e.target.value as SalesTaxFilter)}
                  className="px-3 py-2 rounded-lg border border-border bg-background text-foreground"
                >
                  <option value="TODOS">Todos</option>
                  {TAX_CLASS_ORDER.map((taxClass) => (
                    <option key={taxClass} value={taxClass}>
                      {TAX_CLASS_LABEL[taxClass]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="card-surface px-4 py-3">
              <span className="label-style">Ganhos no Ano</span>
              <div className="text-sm font-mono-nums font-semibold text-success mt-1">
                {formatCurrency(totalSaleProfits)}
              </div>
            </div>
            <div className="card-surface px-4 py-3">
              <span className="label-style">Prejuizos no Ano</span>
              <div className="text-sm font-mono-nums font-semibold text-destructive mt-1">
                {formatCurrency(totalSaleLosses)}
              </div>
            </div>
            <div className="card-surface px-4 py-3">
              <span className="label-style">Resultado Liquido</span>
              <div
                className={`text-sm font-mono-nums font-semibold mt-1 ${
                  totalGain >= 0 ? "text-success" : "text-destructive"
                }`}
              >
                {formatCurrency(totalGain)}
              </div>
            </div>
          </div>

          <div className="card-surface overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="py-3 px-4">Tipo de Ativo</th>
                  <th className="py-3 px-4 text-right">Operacoes</th>
                  <th className="py-3 px-4 text-right">Ganhos</th>
                  <th className="py-3 px-4 text-right">Prejuizos</th>
                  <th className="py-3 px-4 text-right">Liquido</th>
                  <th className="py-3 px-4 text-right">Prej. ate {salesYear - 1}</th>
                  <th className="py-3 px-4 text-right">Compensado no Ano</th>
                  <th className="py-3 px-4 text-right">Prej. a Compensar</th>
                </tr>
              </thead>
              <tbody>
                {salesByTaxClass.map((summary) => (
                  <tr key={summary.taxClass} className="border-b border-border/50">
                    <td className="py-3 px-4 font-medium text-foreground">{summary.label}</td>
                    <td className="py-3 px-4 text-right font-mono-nums">{summary.operationCount}</td>
                    <td className="py-3 px-4 text-right font-mono-nums text-success">
                      {formatCurrency(summary.profits)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono-nums text-destructive">
                      {formatCurrency(summary.losses)}
                    </td>
                    <td
                      className={`py-3 px-4 text-right font-mono-nums font-medium ${
                        summary.net >= 0 ? "text-success" : "text-destructive"
                      }`}
                    >
                      {formatCurrency(summary.net)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono-nums">
                      {formatCurrency(summary.prevCarry)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono-nums">
                      {formatCurrency(summary.compensationUsed)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono-nums">
                      {formatCurrency(summary.carryToNextYears)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {vendasByMonth.length === 0 ? (
            <div className="card-surface p-8 text-center">
              <CheckCircle className="w-8 h-8 mx-auto text-success mb-2" />
              <p className="text-sm text-muted-foreground">
                Nenhuma operacao de venda em {salesYear} para o filtro selecionado.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {vendasByMonth.map((monthGroup) => (
                <div key={monthGroup.month} className="card-surface overflow-hidden">
                  <div className="px-4 py-3 border-b border-border flex flex-wrap items-center gap-x-6 gap-y-2">
                    <p className="font-medium text-foreground">
                      {monthGroup.label} / {salesYear}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Ganhos:{" "}
                      <span className="font-mono-nums text-success">
                        {formatCurrency(monthGroup.monthProfits)}
                      </span>
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Prejuizos:{" "}
                      <span className="font-mono-nums text-destructive">
                        {formatCurrency(monthGroup.monthLosses)}
                      </span>
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Liquido:{" "}
                      <span
                        className={`font-mono-nums ${
                          monthGroup.monthNet >= 0 ? "text-success" : "text-destructive"
                        }`}
                      >
                        {formatCurrency(monthGroup.monthNet)}
                      </span>
                    </p>
                    <p className="text-sm text-muted-foreground">
                      IRRF retido:{" "}
                      <span className="font-mono-nums text-foreground">
                        {formatCurrency(monthGroup.monthWithholdingTax)}
                      </span>
                    </p>
                  </div>
                  <div className="px-4 py-2 border-b border-border/50 flex flex-wrap gap-2">
                    {monthGroup.byTaxClass.map((entry) => (
                      <span
                        key={`${monthGroup.month}-${entry.taxClass}`}
                        className="text-xs px-2 py-0.5 rounded border border-border"
                      >
                        {entry.label}: {entry.operationCount} op - {formatCurrency(entry.net)}
                      </span>
                    ))}
                  </div>
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border text-left text-xs text-muted-foreground">
                        <th className="py-3 px-4">Ativo</th>
                        <th className="py-3 px-4">Tipo</th>
                        <th className="py-3 px-4">Data</th>
                        <th className="py-3 px-4 text-right">Qtd</th>
                        <th className="py-3 px-4 text-right">Preco Venda</th>
                        <th className="py-3 px-4 text-right">PM na Venda</th>
                        <th className="py-3 px-4 text-right">Custo</th>
                        <th className="py-3 px-4 text-right">Provento</th>
                        <th className="py-3 px-4 text-right">IRRF (0,005%)</th>
                        <th className="py-3 px-4 text-right">Resultado</th>
                        <th className="py-3 px-4">Situacao</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monthGroup.sales.map((v, i) => (
                        <tr key={`${v.ticker}-${v.date}-${i}`} className="border-b border-border/50">
                          <td className="py-3 px-4">
                            <span className="font-medium text-foreground">{v.ticker}</span>
                            <span className="text-xs text-muted-foreground ml-2">{v.name}</span>
                          </td>
                          <td className="py-3 px-4 text-muted-foreground">
                            {TAX_CLASS_LABEL[v.taxClass]}
                          </td>
                          <td className="py-3 px-4 font-mono-nums">
                            {formatDatePtBr(v.date)}
                          </td>
                          <td className="py-3 px-4 text-right font-mono-nums">{v.quantity}</td>
                          <td className="py-3 px-4 text-right font-mono-nums">
                            {formatCurrency(v.unitPrice)}
                          </td>
                          <td className="py-3 px-4 text-right font-mono-nums">
                            {formatCurrency(v.averagePriceAtSale)}
                          </td>
                          <td className="py-3 px-4 text-right font-mono-nums">
                            {formatCurrency(v.cost)}
                          </td>
                          <td className="py-3 px-4 text-right font-mono-nums">
                            {formatCurrency(v.proceeds)}
                          </td>
                          <td className="py-3 px-4 text-right font-mono-nums">
                            {formatCurrency(v.withholdingTax)}
                          </td>
                          <td
                            className={`py-3 px-4 text-right font-mono-nums font-medium ${
                              v.gain >= 0 ? "text-success" : "text-destructive"
                            }`}
                          >
                            {formatCurrency(v.gain)}
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className={`text-xs px-2 py-0.5 rounded border ${
                                v.gain < 0
                                  ? "border-destructive/40 text-destructive"
                                  : v.gain > 0
                                    ? "border-emerald-500/40 text-emerald-600"
                                    : "border-border text-muted-foreground"
                              }`}
                            >
                              {v.gain < 0 ? "Prejuizo" : v.gain > 0 ? "Lucro" : "Neutro"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}
          <div className="card-surface p-4 border-l-4 border-amber-500/80">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-foreground mb-1">
                  Atencao - Isencao e Compensacao
                </p>
                <p className="text-muted-foreground">
                  Esta tela considera lucro/prejuizo mesmo para ativos sem saldo atual.
                  A compensacao exibida e uma visao anual para facilitar o controle; para
                  apuracao fiscal final, valide as regras mensais e por tipo de ativo.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

