"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  LayoutDashboard,
  Receipt,
  Wallet,
  FileCheck,
  ArrowRight,
} from "lucide-react";
import { useMonth } from "@/contexts/MonthContext";
import type { MonthData, TransactionWithCategory } from "@/lib/types";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function EmptyDashboardState({
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
    <div className="md:p-6 max-w-2xl">
      <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
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

export default function DashboardPage() {
  const { selectedMonth: ctxMonth, months, refetchMonths } = useMonth();
  const [monthData, setMonthData] = useState<MonthData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchMonth = useCallback(async (monthId: string) => {
    const res = await fetch(`/api/months/${monthId}`);
    if (!res.ok) return null;
    return res.json() as Promise<MonthData>;
  }, []);

  useEffect(() => {
    if (!ctxMonth) {
      setMonthData(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchMonth(ctxMonth.id)
      .then((data) => {
        if (!cancelled) setMonthData(data ?? null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [ctxMonth?.id, fetchMonth]);

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[200px]">
        <p className="text-muted-foreground">Carregando...</p>
      </div>
    );
  }

  if (months.length === 0) {
    return (
      <EmptyDashboardState
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

  const month = monthData ?? null;
  const transactions = month?.transactions ?? [];

  const receitaTotal = transactions
    .filter((t) => t.category?.isReceita && !t.investmentOperationId)
    .reduce((s, t) => {
      const real = t.amountRealizado != null ? t.amountRealizado : 0;
      const reemb = t.amountReembolso != null ? t.amountReembolso : 0;
      return s + real - reemb;
    }, 0);

  const despesaTotal = transactions
    .filter((t) => !t.category?.isReceita && !t.investmentOperationId)
    .reduce((s, t) => {
      const real = t.amountRealizado != null ? t.amountRealizado : 0;
      const reemb = t.amountReembolso != null ? t.amountReembolso : 0;
      return s + real - reemb;
    }, 0);

  const saldo = receitaTotal - despesaTotal;
  const conciliados = transactions.filter((t) => t.isConciliado).length;
  const pendentes = transactions.filter(
    (t) => t.amountRealizado != null && !t.isConciliado
  ).length;

  const statusLabels: Record<string, string> = {
    RASCUNHO: "Rascunho",
    ATIVO: "Em andamento",
    FECHADO: "Fechado",
  };

  return (
    <div className="md:p-4 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground">Visão Geral</h1>
        <span className="text-sm text-muted-foreground">
          {month ? `${month.month}/${month.year} · ${statusLabels[month.status] ?? month.status}` : ""}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
            <Receipt className="w-4 h-4" />
            Receitas
          </div>
          <p className="text-xl font-semibold text-green-600 dark:text-green-400">
            {formatCurrency(receitaTotal)}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
            <Wallet className="w-4 h-4" />
            Despesas
          </div>
          <p className="text-xl font-semibold text-red-600 dark:text-red-400">
            {formatCurrency(despesaTotal)}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
            <LayoutDashboard className="w-4 h-4" />
            Saldo
          </div>
          <p
            className={`text-xl font-semibold ${
              saldo >= 0
                ? "text-green-600 dark:text-green-400"
                : "text-red-600 dark:text-red-400"
            }`}
          >
            {formatCurrency(saldo)}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
            <FileCheck className="w-4 h-4" />
            Conciliação
          </div>
          <p className="text-xl font-semibold text-foreground">
            {conciliados}/{conciliados + pendentes}{" "}
            <span className="text-sm font-normal text-muted-foreground">
              conciliados
            </span>
          </p>
        </div>
      </div>

      <Link
        href="/dashboard/lancamentos"
        className="group inline-flex rounded-xl border border-border bg-card p-6 shadow-sm hover:bg-[hsl(var(--surface-hover))] transition-colors"
      >
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-foreground">Lançamentos</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Ver e gerenciar receitas, despesas, previsão e cofres do mês
            </p>
          </div>
          <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors ml-4" />
        </div>
      </Link>

      {month && month.status !== "FECHADO" && (
        <Link
          href={`/dashboard/fechamento?monthId=${month.id}`}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-primary/30 text-primary hover:bg-primary/10 text-sm font-medium transition-colors"
        >
          <FileCheck className="w-4 h-4" />
          Ir para Fechamento do mês
        </Link>
      )}
    </div>
  );
}
