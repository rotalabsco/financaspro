"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { useMonth } from "@/contexts/MonthContext";
import type { MonthData, TransactionWithCategory, VaultWithBalance } from "@/lib/types";
import { mergePatchedTransactionIntoMonth } from "@/lib/merge-patched-transaction";
import { TransactionPanel } from "@/components/dashboard/TransactionPanel";
import { AddTransactionModal } from "@/components/dashboard/AddTransactionModal";
import { AddInvestmentTransactionModal } from "@/components/dashboard/AddInvestmentTransactionModal";
import { AnteciparModal } from "@/components/dashboard/AnteciparModal";
import { VaultCard } from "@/components/ui/VaultCard";

interface Category {
  id: string;
  name: string;
  color: string;
  defaultType: string;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function groupTransactions(transactions: TransactionWithCategory[]) {
  const receitas: TransactionWithCategory[] = [];
  const variaveis: TransactionWithCategory[] = [];
  const parcelas: TransactionWithCategory[] = [];
  const recorrentes: TransactionWithCategory[] = [];
  const previstos: TransactionWithCategory[] = [];
  const investimentos: TransactionWithCategory[] = [];

  for (const t of transactions) {
    if (t.investmentOperationId) {
      // Legado: rendimentos USDC gerados automaticamente (recurso removido) não aparecem no painel
      if (t.category?.name !== "Rendimento USDC") {
        investimentos.push(t);
      }
      continue;
    }

    const isConciliado = t.isConciliado ?? false;
    const temRealizado = t.amountRealizado != null;
    const isReceita = !!t.category?.isReceita;
    const vaiParaPrevisto = !isReceita && temRealizado && !isConciliado;

    if (isReceita) {
      receitas.push(t);
    } else if (vaiParaPrevisto) {
      previstos.push(t);
    } else {
      if (t.type === "PARCELADO") {
        parcelas.push(t);
      } else if (t.type === "RECORRENTE") {
        recorrentes.push(t);
      } else {
        variaveis.push(t);
      }
    }
  }

  return { receitas, variaveis, parcelas, recorrentes, previstos, investimentos };
}

function EmptyLancamentosState({
  onCreateMonth,
}: {
  onCreateMonth: () => Promise<void>;
}) {
  const [creating, setCreating] = useState(false);
  const handleCreate = async () => {
    setCreating(true);
    try {
      await onCreateMonth();
    } finally {
      setCreating(false);
    }
  };
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-foreground">Lançamentos</h1>
      <p className="mt-4 text-muted-foreground">
        Nenhum mês cadastrado. Crie o primeiro mês para começar a registrar suas
        finanças.
      </p>
      <button
        type="button"
        onClick={handleCreate}
        disabled={creating}
        className="mt-4 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50"
      >
        {creating ? "Criando..." : "Criar primeiro mês"}
      </button>
    </div>
  );
}

interface PrevisaoData {
  receitaPrevisto: number;
  receitaFromCurrentMonth?: boolean;
  totalDespesasPrevisto: number;
  despesasPorCategoria: {
    categoryId: string;
    name: string;
    color: string;
    media: number;
    mesesUsados: number;
  }[];
  isFuture: boolean;
}

export default function LancamentosPage() {
  const { selectedMonth: ctxMonth, months, refetchMonths, setYearMonth } = useMonth();
  const [monthData, setMonthData] = useState<MonthData | null>(null);
  const [previsao, setPrevisao] = useState<PrevisaoData | null>(null);
  const [vaults, setVaults] = useState<VaultWithBalance[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showInvestmentModal, setShowInvestmentModal] = useState(false);
  const [addAsReceita, setAddAsReceita] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<TransactionWithCategory | null>(null);
  const [anteciparTransaction, setAnteciparTransaction] = useState<TransactionWithCategory | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);

  const filterBySearch = useCallback((txs: TransactionWithCategory[], q: string): TransactionWithCategory[] => {
    if (!q.trim()) return txs;
    const lower = q.trim().toLowerCase();
    return txs.filter((t) => {
      const desc = t.description.toLowerCase();
      const cat = t.category?.name?.toLowerCase() ?? "";
      const acc = t.bankAccount?.name?.toLowerCase() ?? "";
      const card = t.creditCard?.name?.toLowerCase() ?? "";
      return desc.includes(lower) || cat.includes(lower) || acc.includes(lower) || card.includes(lower);
    });
  }, []);

  const fetchMonth = useCallback(async (monthId: string) => {
    const res = await fetch(`/api/months/${monthId}`);
    if (!res.ok) return null;
    return res.json() as Promise<MonthData>;
  }, []);

  const fetchVaults = useCallback(async (monthId: string) => {
    const res = await fetch(`/api/vaults?monthId=${monthId}`);
    if (!res.ok) return [];
    return res.json() as Promise<VaultWithBalance[]>;
  }, []);

  const fetchCategories = useCallback(async () => {
    const res = await fetch("/api/categories?archived=true");
    if (!res.ok) return [];
    return res.json() as Promise<Category[]>;
  }, []);

  useEffect(() => {
    async function loadCategories() {
      const cats = await fetchCategories();
      setCategories(cats);
    }
    loadCategories();
  }, [fetchCategories]);

  useEffect(() => {
    if (!ctxMonth) {
      setMonthData(null);
      setVaults([]);
      setPrevisao(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchMonth(ctxMonth.id)
      .then((data) => {
        if (!cancelled) setMonthData(data ?? null);
        return data;
      })
      .then(async (data) => {
        if (data && !cancelled) {
          const v = await fetchVaults(data.id);
          if (!cancelled) setVaults(v);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [ctxMonth?.id, fetchMonth, fetchVaults]);

  useEffect(() => {
    if (!ctxMonth) return;
    let cancelled = false;
    fetch(`/api/previsao?year=${ctxMonth.year}&month=${ctxMonth.month}`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && data.isFuture) {
          setPrevisao({
            receitaPrevisto: data.receitaPrevisto ?? 0,
            receitaFromCurrentMonth: data.receitaFromCurrentMonth ?? false,
            totalDespesasPrevisto: data.totalDespesasPrevisto ?? 0,
            despesasPorCategoria: (data.despesasPorCategoria ?? []).map((c: { categoryId: string; name: string; color: string; media: number; mesesUsados?: number }) => ({
              ...c,
              mesesUsados: c.mesesUsados ?? 0,
            })),
            isFuture: true,
          });
        } else {
          setPrevisao(null);
        }
      })
      .catch(() => {
        if (!cancelled) setPrevisao(null);
      });
    return () => { cancelled = true; };
  }, [ctxMonth?.year, ctxMonth?.month]);

  const handleEditRealizado = async (id: string, value: number | null) => {
    if (!monthData || !ctxMonth) return;
    const res = await fetch(`/api/transactions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amountRealizado: value }),
    });
    if (!res.ok) return;
    const json = (await res.json()) as Record<string, unknown>;
    setMonthData((prev) =>
      prev ? mergePatchedTransactionIntoMonth(prev, json) : null
    );
    fetchVaults(ctxMonth.id).then(setVaults);
  };

  const handleConciliar = async (id: string) => {
    if (!monthData || !ctxMonth) return;
    const res = await fetch(`/api/transactions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isConciliado: true }),
    });
    if (!res.ok) return;
    const json = (await res.json()) as Record<string, unknown>;
    setMonthData((prev) =>
      prev ? mergePatchedTransactionIntoMonth(prev, json) : null
    );
  };

  const handleDesconciliar = async (id: string) => {
    if (!monthData || !ctxMonth) return;
    const res = await fetch(`/api/transactions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isConciliado: false }),
    });
    if (!res.ok) return;
    const json = (await res.json()) as Record<string, unknown>;
    setMonthData((prev) =>
      prev ? mergePatchedTransactionIntoMonth(prev, json) : null
    );
  };

  const handleEditInvestmentDate = async (id: string, date: string | null) => {
    if (!monthData || !ctxMonth) return;
    const res = await fetch(`/api/transactions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ investmentDate: date || null }),
    });
    if (!res.ok) return;
    const json = (await res.json()) as Record<string, unknown>;
    setMonthData((prev) =>
      prev ? mergePatchedTransactionIntoMonth(prev, json) : null
    );
  };

  const handleDelete = async (id: string) => {
    if (!monthData || !ctxMonth) return;
    const tx = monthData.transactions.find((t) => t.id === id);
    let url = `/api/transactions/${id}`;
    if (tx?.type === "RECORRENTE" && tx.recurrenceGroupId) {
      const endSeries = window.confirm(
        "Este lançamento é recorrente.\n\nOK = encerrar a série a partir deste mês (remove futuros e não recria)\nCancelar = excluir só este mês"
      );
      if (endSeries) {
        url = `/api/transactions/${id}?scope=series-end`;
      } else if (!window.confirm("Excluir apenas este mês?")) {
        return;
      }
    } else if (!window.confirm("Excluir este lançamento?")) {
      return;
    }

    const res = await fetch(url, { method: "DELETE" });
    if (!res.ok) return;
    const updated = await fetchMonth(ctxMonth.id);
    if (updated) setMonthData(updated);
    fetchVaults(ctxMonth.id).then(setVaults);
  };

  const handleAddSuccess = useCallback(async () => {
    if (!ctxMonth) return;
    const updated = await fetchMonth(ctxMonth.id);
    if (updated) setMonthData(updated);
    const v = await fetchVaults(ctxMonth.id);
    setVaults(v);
  }, [ctxMonth, fetchMonth, fetchVaults]);

  const handleAnteciparSuccess = useCallback(async () => {
    if (!ctxMonth) return;
    const updated = await fetchMonth(ctxMonth.id);
    if (updated) setMonthData(updated);
    const v = await fetchVaults(ctxMonth.id);
    setVaults(v);
  }, [ctxMonth, fetchMonth, fetchVaults]);

  const handleCarryReceitaNextMonth = useCallback(
    async (id: string) => {
      if (!ctxMonth) return;
      const res = await fetch(
        `/api/transactions/${id}/carry-receita-next-month`,
        { method: "POST" }
      );
      const data = (await res.json()) as {
        error?: string;
        targetYear?: number;
        targetMonth?: number;
        alreadyExisted?: boolean;
      };
      if (!res.ok) {
        toast.error(
          data.error ?? "Não foi possível levar a receita ao mês seguinte."
        );
        return;
      }
      await refetchMonths();
      if (data.targetYear != null && data.targetMonth != null) {
        await setYearMonth(data.targetYear, data.targetMonth);
      }
      toast.success(
        data.alreadyExisted
          ? "Esta receita já está no mês seguinte (mesma série)."
          : "Receita copiada no mês seguinte (previsto e lançado). Revise e concilie."
      );
    },
    [ctxMonth, refetchMonths, setYearMonth]
  );

  const month = monthData ?? null;
  const { receitas, variaveis, parcelas, recorrentes, previstos, investimentos } = useMemo(
    () =>
      month
        ? groupTransactions(month.transactions)
        : {
            receitas: [] as TransactionWithCategory[],
            variaveis: [] as TransactionWithCategory[],
            parcelas: [] as TransactionWithCategory[],
            recorrentes: [] as TransactionWithCategory[],
            previstos: [] as TransactionWithCategory[],
            investimentos: [] as TransactionWithCategory[],
          },
    [month]
  );

  const despesas = useMemo(
    () => [...variaveis, ...parcelas, ...recorrentes, ...previstos],
    [variaveis, parcelas, recorrentes, previstos]
  );

  const { totalPrevisto, totalRealizado, totalReceitaPrevisto } = useMemo(() => {
    const tp = despesas.reduce((s, t) => {
      const real = t.amountRealizado != null ? t.amountRealizado : t.amountPrevisto;
      const reemb = t.amountReembolso != null ? t.amountReembolso : 0;
      return s + real - reemb;
    }, 0);
    const tr = despesas.reduce((s, t) => {
      if (!(t.isConciliado ?? false)) return s;
      const real = t.amountRealizado != null ? t.amountRealizado : 0;
      const reemb = t.amountReembolso != null ? t.amountReembolso : 0;
      return s + real - reemb;
    }, 0);
    const trp = receitas.reduce((s, t) => {
      const val = t.amountRealizado != null ? t.amountRealizado : t.amountPrevisto;
      const reemb = t.amountReembolso != null ? t.amountReembolso : 0;
      return s + val - reemb;
    }, 0);
    return {
      totalPrevisto: tp,
      totalRealizado: tr,
      totalReceitaPrevisto: trp,
    };
  }, [despesas, receitas]);

  const usePrevisao = previsao?.isFuture ?? false;
  // Tudo o que já está lançado no mês por categoria (pago ou não): é o que a média não precisa cobrir.
  const lancadoPorCategoria = useMemo(() => {
    const byCategory: Record<string, number> = {};
    for (const t of despesas) {
      if (t.category?.isReceita) continue;
      const val = t.amountRealizado != null ? t.amountRealizado : t.amountPrevisto;
      const reemb = t.amountReembolso != null ? t.amountReembolso : 0;
      byCategory[t.categoryId] = (byCategory[t.categoryId] ?? 0) + (val - reemb);
    }
    return byCategory;
  }, [despesas]);

  const previsaoAjustadaPorCategoria = useMemo(() => {
    if (!usePrevisao || !previsao) return [];
    return previsao.despesasPorCategoria.map((cat) => {
      const lancado = lancadoPorCategoria[cat.categoryId] ?? 0;
      const restante = cat.media - lancado; // pode ser negativo (gastou mais que a média)
      return { ...cat, media: restante };
    });
  }, [usePrevisao, previsao, lancadoPorCategoria]);

  // Previsto = todos os lançamentos do mês + o que falta da média das categorias variáveis.
  // Antes, em modo previsão, só a média entrava: financiamento, parcelas e recorrentes
  // de outras categorias sumiam do saldo.
  const totalPrevistoAjustado = useMemo(() => {
    if (!usePrevisao) return totalPrevisto;
    // categorias negativas não reduzem o total (só mostram que gastou mais que a média)
    const restanteMedia = previsaoAjustadaPorCategoria.reduce((sum, c) => sum + Math.max(c.media, 0), 0);
    return totalPrevisto + restanteMedia;
  }, [usePrevisao, totalPrevisto, previsaoAjustadaPorCategoria]);

  const totalLancadoNaoConciliado = useMemo(() => {
    return despesas.reduce((sum, t) => {
      if (t.isConciliado ?? false) return sum;
      if (t.amountRealizado == null) return sum;
      const reemb = t.amountReembolso != null ? t.amountReembolso : 0;
      return sum + (t.amountRealizado - reemb);
    }, 0);
  }, [despesas]);

  const displayTotalPrevisto = totalPrevistoAjustado;
  // Sempre usa o total das receitas do mês atual (incl. saldo inicial do fechamento).
  // A previsão só espelha o mês anterior quando ainda não há nenhuma receita lançada.
  const displayTotalReceitaPrevisto =
    usePrevisao && !previsao!.receitaFromCurrentMonth && receitas.length === 0
      ? previsao!.receitaPrevisto
      : totalReceitaPrevisto;
  // displayTotalPrevisto já contém cada lançamento uma vez (realizado ?? previsto);
  // subtrair de novo o realizado/lançado contava a mesma despesa duas vezes.
  const displaySaldoProjetado = displayTotalReceitaPrevisto - displayTotalPrevisto;

  const diferenca = totalLancadoNaoConciliado;

  const { porConta, porCartao, dinheiro } = useMemo(() => {
    type Item = { conciliado: number; previsto: number };
    const contaMap: Record<string, Item> = {};
    const cartaoMap: Record<string, Item> = {};
    const dinheiroItem: Item = { conciliado: 0, previsto: 0 };
    const addToMap = (m: Record<string, Item>, k: string, conciliado: number, previsto: number) => {
      if (!m[k]) m[k] = { conciliado: 0, previsto: 0 };
      m[k].conciliado += conciliado;
      m[k].previsto += previsto;
    };
    for (const t of despesas) {
      const val = t.amountRealizado != null ? t.amountRealizado : t.amountPrevisto;
      const reemb = t.amountReembolso != null ? t.amountReembolso : 0;
      const total = val - reemb;
      const isConc = t.isConciliado ?? false;
      const conciliado = isConc ? total : 0;
      const previsto = !isConc ? total : 0;
      const src = (t.source as string) ?? "CONTA_CORRENTE";
      if (src === "CONTA_CORRENTE" && t.bankAccount) {
        addToMap(contaMap, t.bankAccount.name, conciliado, previsto);
      } else if (src === "CARTAO_CREDITO" && t.creditCard) {
        addToMap(cartaoMap, t.creditCard.name, conciliado, previsto);
      } else if (src === "DINHEIRO") {
        dinheiroItem.conciliado += conciliado;
        dinheiroItem.previsto += previsto;
      } else if (src === "CONTA_CORRENTE" && !t.bankAccount) {
        addToMap(contaMap, "Conta corrente", conciliado, previsto);
      } else if (src === "CARTAO_CREDITO" && !t.creditCard) {
        addToMap(cartaoMap, "Cartão", conciliado, previsto);
      }
    }
    return {
      porConta: Object.entries(contaMap).map(([name, v]) => ({ name, conciliado: v.conciliado, previsto: v.previsto })),
      porCartao: Object.entries(cartaoMap).map(([name, v]) => ({ name, conciliado: v.conciliado, previsto: v.previsto })),
      dinheiro: dinheiroItem,
    };
  }, [despesas]);

  const receitasPorConta = useMemo(() => {
    const m: Record<string, number> = {};
    for (const t of receitas) {
      const val = t.amountRealizado != null ? t.amountRealizado : t.amountPrevisto;
      const reemb = t.amountReembolso != null ? t.amountReembolso : 0;
      const total = val - reemb;
      const k = t.bankAccount?.name ?? "Outros";
      m[k] = (m[k] ?? 0) + total;
    }
    return Object.entries(m).map(([name, value]) => ({ name, value }));
  }, [receitas]);

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[200px]">
        <p className="text-muted-foreground">Carregando...</p>
      </div>
    );
  }

  if (months.length === 0) {
    return (
      <EmptyLancamentosState
        onCreateMonth={async () => {
          const now = new Date();
          const res = await fetch("/api/months", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              year: now.getFullYear(),
              month: now.getMonth() + 1,
            }),
          });
          if (res.ok) await refetchMonths();
        }}
      />
    );
  }

  const statusLabels: Record<string, string> = {
    RASCUNHO: "Rascunho",
    ATIVO: "Em andamento",
    FECHADO: "Fechado",
  };

  const vaultCofres = vaults.filter(
    (v) => v.currentBalance !== undefined
  ) as (VaultWithBalance & { currentBalance: number })[];

  return (
    <div className="p-4 flex flex-col">
      <div className="flex items-center justify-between mb-3 shrink-0">
        <span className="text-muted-foreground text-sm">
          {month ? `${statusLabels[month.status] ?? month.status}` : ""}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              setShowAddModal(true);
              setAddAsReceita(false);
            }}
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90"
          >
            + Despesa
          </button>
          <button
            type="button"
            onClick={() => {
              setShowAddModal(true);
              setAddAsReceita(true);
            }}
            className="px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700"
          >
            + Receita
          </button>
          <button
            type="button"
            onClick={() => setShowInvestmentModal(true)}
            className="px-4 py-2 rounded-lg bg-emerald-700 text-white text-sm font-medium hover:bg-emerald-800"
          >
            + Investimento
          </button>
          <Link
            href={`/dashboard/fechamento?monthId=${month?.id ?? ""}`}
            className="px-4 py-2 rounded-lg border border-border text-foreground text-sm font-medium hover:bg-[hsl(var(--surface-hover))]"
          >
            Fechar Mês
          </Link>
        </div>
      </div>

      <div className="mb-4 p-5 rounded-xl bg-surface border border-border shrink-0">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4 pb-4 border-b border-border">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">
              Previsto {usePrevisao && <span className="text-emerald-400">(previsão)</span>}
            </p>
            <p className="text-base font-semibold text-foreground tabular-nums">{formatCurrency(displayTotalPrevisto)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">A conciliar</p>
            <p className={`text-base font-semibold tabular-nums ${diferenca >= 0 ? "text-green-400" : "text-destructive"}`}>
              {formatCurrency(diferenca)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Realizado</p>
            <p className="text-base font-semibold text-foreground tabular-nums">{formatCurrency(totalRealizado)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">
              Receita{" "}
              {receitas.length > 0 ? (
                <span className="text-emerald-400">(mês atual)</span>
              ) : usePrevisao ? (
                <span className="text-emerald-400">
                  {previsao?.receitaFromCurrentMonth ? "(mês atual)" : "(espelho mês ant.)"}
                </span>
              ) : null}
            </p>
            <p className="text-base font-semibold text-green-400 tabular-nums">{formatCurrency(displayTotalReceitaPrevisto)}</p>
          </div>

          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Saldo Projetado</p>
            <p className={`text-base font-semibold tabular-nums ${displaySaldoProjetado >= 0 ? "text-green-400" : "text-destructive"}`}>
              {formatCurrency(displaySaldoProjetado)}
            </p>
          </div>
        </div>
        {((porConta.length > 0 || porCartao.length > 0 || dinheiro.conciliado > 0 || dinheiro.previsto > 0) || (usePrevisao && previsaoAjustadaPorCategoria.length > 0) || receitasPorConta.length > 0) && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 text-sm">
            {(usePrevisao && previsaoAjustadaPorCategoria.length > 0) && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                  Média de até 3 meses ainda não lançada
                </p>
                <div className="space-y-2">
                  {previsaoAjustadaPorCategoria.map(({ categoryId, name, color, media, mesesUsados }) => (
                    <div key={categoryId} className="flex justify-between items-center gap-2">
                      <span className="flex items-center gap-2 min-w-0">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                        <span className="text-muted-foreground truncate">{name}</span>
                        <span className="text-[10px] text-muted-foreground shrink-0">
                          ({mesesUsados} {mesesUsados === 1 ? "mês" : "meses"})
                        </span>
                      </span>
                      <span className={`font-medium tabular-nums shrink-0 ${media < 0 ? "text-destructive" : "text-foreground"}`}>
                        {formatCurrency(media)}
                        {media < 0 && <span className="text-[10px] ml-1">acima</span>}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {(porConta.length > 0 || porCartao.length > 0 || dinheiro.conciliado > 0 || dinheiro.previsto > 0) && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Despesas por origem</p>
                <div className="space-y-2">
                  {porConta.map(({ name, conciliado, previsto }) => (
                    <div key={name} className="flex flex-col gap-0.5">
                      <div className="flex justify-between items-center gap-2">
                        <span className="text-muted-foreground truncate">Conta: {name}</span>
                        <span className="font-medium text-foreground tabular-nums shrink-0">
                          {formatCurrency(conciliado + previsto)}
                        </span>
                      </div>
                      {(conciliado > 0 || previsto > 0) && (
                        <div className="flex justify-end gap-3 text-xs text-muted-foreground">
                          {conciliado > 0 && (
                            <span className="tabular-nums">{formatCurrency(conciliado)} <span className="text-green-400">conciliado</span></span>
                          )}
                          {previsto > 0 && (
                            <span className="tabular-nums">{formatCurrency(previsto)} previsto</span>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                  {porCartao.map(({ name, conciliado, previsto }) => (
                    <div key={name} className="flex flex-col gap-0.5">
                      <div className="flex justify-between items-center gap-2">
                        <span className="text-muted-foreground truncate">Cartão: {name}</span>
                        <span className="font-medium text-foreground tabular-nums shrink-0">
                          {formatCurrency(conciliado + previsto)}
                        </span>
                      </div>
                      {(conciliado > 0 || previsto > 0) && (
                        <div className="flex justify-end gap-3 text-xs text-muted-foreground">
                          {conciliado > 0 && (
                            <span className="tabular-nums">{formatCurrency(conciliado)} <span className="text-green-400">conciliado</span></span>
                          )}
                          {previsto > 0 && (
                            <span className="tabular-nums">{formatCurrency(previsto)} previsto</span>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                  {(dinheiro.conciliado > 0 || dinheiro.previsto > 0) && (
                    <div className="flex flex-col gap-0.5">
                      <div className="flex justify-between items-center gap-2">
                        <span className="text-muted-foreground">Dinheiro</span>
                        <span className="font-medium text-foreground tabular-nums shrink-0">
                          {formatCurrency(dinheiro.conciliado + dinheiro.previsto)}
                        </span>
                      </div>
                      <div className="flex justify-end gap-3 text-xs text-muted-foreground">
                        {dinheiro.conciliado > 0 && (
                          <span className="tabular-nums">{formatCurrency(dinheiro.conciliado)} <span className="text-green-400">conciliado</span></span>
                        )}
                        {dinheiro.previsto > 0 && (
                          <span className="tabular-nums">{formatCurrency(dinheiro.previsto)} previsto</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
            {receitasPorConta.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Receitas por destino</p>
                <div className="space-y-1.5">
                  {receitasPorConta.map(({ name, value }) => (
                    <div key={name} className="flex justify-between items-center gap-2">
                      <span className="text-muted-foreground truncate">{name}</span>
                      <span className="font-medium text-green-400 tabular-nums shrink-0">{formatCurrency(value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="mb-3 shrink-0">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Pesquisar lançamento (descrição, categoria, conta, cartão)..."
          className="w-full max-w-md px-4 py-2 rounded-lg bg-background border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>

      <div className="flex flex-col gap-3 mb-4">
        <TransactionPanel
          title="Receitas"
          transactions={filterBySearch(receitas, searchQuery)}
          onEditRealizado={handleEditRealizado}
          onAntecipar={setAnteciparTransaction}
          onConciliar={handleConciliar}
          onDesconciliar={handleDesconciliar}
          onDelete={handleDelete}
          onEdit={setEditingTransaction}
          onEditInvestmentDate={handleEditInvestmentDate}
          onCarryReceitaNextMonth={handleCarryReceitaNextMonth}
          formatCurrency={formatCurrency}
          defaultOpen={true}
        />
        <TransactionPanel
          title="Despesas Variáveis"
          transactions={filterBySearch(variaveis, searchQuery)}
          onEditRealizado={handleEditRealizado}
          onAntecipar={setAnteciparTransaction}
          onConciliar={handleConciliar}
          onDesconciliar={handleDesconciliar}
          onDelete={handleDelete}
          onEdit={setEditingTransaction}
          onEditInvestmentDate={handleEditInvestmentDate}
          formatCurrency={formatCurrency}
          defaultOpen={true}
        />
        <TransactionPanel
          title="Parcelas e Recorrentes"
          transactions={filterBySearch([...parcelas, ...recorrentes], searchQuery)}
          onEditRealizado={handleEditRealizado}
          onAntecipar={setAnteciparTransaction}
          onConciliar={handleConciliar}
          onDesconciliar={handleDesconciliar}
          onDelete={handleDelete}
          onEdit={setEditingTransaction}
          onEditInvestmentDate={handleEditInvestmentDate}
          formatCurrency={formatCurrency}
          defaultOpen={false}
        />
        {previstos.length > 0 && (
          <TransactionPanel
            title="Previsto (a conciliar)"
            transactions={filterBySearch(previstos, searchQuery)}
            onEditRealizado={handleEditRealizado}
            onAntecipar={setAnteciparTransaction}
            onConciliar={handleConciliar}
            onDesconciliar={handleDesconciliar}
            onDelete={handleDelete}
            onEdit={setEditingTransaction}
            onEditInvestmentDate={handleEditInvestmentDate}
            formatCurrency={formatCurrency}
            defaultOpen={true}
          />
        )}
        {investimentos.length > 0 && (
          <TransactionPanel
            title="Investimentos (aplicações e resgates)"
            transactions={filterBySearch(investimentos, searchQuery)}
            onEditRealizado={handleEditRealizado}
            onConciliar={handleConciliar}
            onDesconciliar={handleDesconciliar}
            onDelete={handleDelete}
            onEditInvestmentDate={handleEditInvestmentDate}
            formatCurrency={formatCurrency}
            defaultOpen={true}
          />
        )}
      </div>

      <div className="flex flex-wrap gap-3 shrink-0">
        {vaultCofres.map((v) => (
          <VaultCard
            key={v.id}
            name={v.name}
            balance={v.currentBalance}
            monthlyDeposit={v.monthlyDeposit}
          />
        ))}
      </div>

      {anteciparTransaction && month && (
        <AnteciparModal
          transaction={anteciparTransaction}
          onClose={() => setAnteciparTransaction(null)}
          onSuccess={handleAnteciparSuccess}
          formatCurrency={formatCurrency}
        />
      )}
      {showInvestmentModal && month && (
        <AddInvestmentTransactionModal
          monthId={month.id}
          onClose={() => setShowInvestmentModal(false)}
          onSuccess={handleAddSuccess}
          formatCurrency={formatCurrency}
        />
      )}
      {(showAddModal || editingTransaction) && month && (
        <AddTransactionModal
          monthId={month.id}
          categories={categories}
          year={month.year}
          monthNum={month.month}
          transaction={editingTransaction}
          isReceita={editingTransaction ? !!editingTransaction.category?.isReceita : addAsReceita}
          onClose={() => {
            setShowAddModal(false);
            setEditingTransaction(null);
          }}
          onSuccess={handleAddSuccess}
          formatCurrency={formatCurrency}
        />
      )}
    </div>
  );
}
