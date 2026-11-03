"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

interface MonthData {
  id: string;
  year: number;
  month: number;
  status: string;
  transactions: { amountPrevisto: number; amountRealizado: number | null; amountReembolso?: number | null }[];
  bankBalanceAtClose?: number | null;
}

interface BankAccount {
  id: string;
  name: string;
  institution?: string | null;
  isActive: boolean;
}

function parseToInput(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "";
  return value.toFixed(2).replace(".", ",");
}

function FechamentoContent() {
  const searchParams = useSearchParams();
  const monthId = searchParams.get("monthId");

  const [month, setMonth] = useState<MonthData | null>(null);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [accountBalances, setAccountBalances] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const monthPromise = monthId ? fetch(`/api/months/${monthId}`) : Promise.resolve<Response | null>(null);
        const accountsPromise = fetch("/api/bank-accounts");

        const [monthRes, accountsRes] = await Promise.all([monthPromise, accountsPromise]);

        let loadedMonth: MonthData | null = null;
        let loadedAccounts: BankAccount[] = [];

        if (monthRes && monthRes.ok) {
          loadedMonth = (await monthRes.json()) as MonthData;
        }

        if (accountsRes.ok) {
          loadedAccounts = (await accountsRes.json()) as BankAccount[];
        }

        if (cancelled) return;

        setMonth(loadedMonth);
        setAccounts(loadedAccounts);
        setAccountBalances((prev) => {
          const next: Record<string, string> = {};
          for (const account of loadedAccounts) {
            next[account.id] = prev[account.id] ?? "";
          }

          if (loadedMonth?.bankBalanceAtClose != null && loadedAccounts.length === 1) {
            const single = loadedAccounts[0];
            if (single && !(next[single.id] ?? "").trim()) {
              next[single.id] = parseToInput(loadedMonth.bankBalanceAtClose);
            }
          }

          return next;
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [monthId]);

  const totalPrevisto = month?.transactions.reduce((sum, tx) => sum + tx.amountPrevisto, 0) ?? 0;
  const totalRealizado =
    month?.transactions.reduce((sum, tx) => {
      const real = tx.amountRealizado != null ? Number(tx.amountRealizado) : 0;
      const reemb = tx.amountReembolso != null ? Number(tx.amountReembolso) : 0;
      return sum + real - reemb;
    }, 0) ?? 0;
  const semRealizado = month?.transactions.filter((tx) => tx.amountRealizado == null) ?? [];

  const parseCurrency = (value: string) => {
    const digits = value.replace(/\D/g, "");
    if (!digits) return 0;
    const parsed = parseInt(digits, 10) / 100;
    return Number.isNaN(parsed) ? 0 : parsed;
  };

  const totalBankBalance = accounts.reduce(
    (sum, account) => sum + parseCurrency(accountBalances[account.id] ?? ""),
    0
  );

  const handleBalanceChange = (accountId: string, value: string) => {
    setAccountBalances((prev) => ({ ...prev, [accountId]: value }));
  };

  const handleFechar = async () => {
    if (!monthId) return;

    if (accounts.length === 0) {
      alert("Cadastre ao menos uma conta bancaria para fechar o mes.");
      return;
    }

    const missing = accounts.filter((account) => !(accountBalances[account.id] ?? "").trim());
    if (missing.length > 0) {
      alert("Informe o saldo de todas as contas bancarias cadastradas.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/months/${monthId}/fechar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bankBalanceAtClose: totalBankBalance,
        }),
      });

      if (res.ok) {
        const updated = await fetch(`/api/months/${monthId}`).then((r) => r.json());
        setMonth(updated);
      } else {
        const err = await res.json();
        alert(err.error ?? "Erro ao fechar mes");
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <p className="text-muted-foreground">Carregando...</p>
      </div>
    );
  }

  if (!monthId || !month) {
    return (
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Fechamento do Mes</h1>
        <p className="mt-4 text-muted-foreground">
          Selecione um mes no Dashboard e clique em &quot;Fechar Mes&quot; ou acesse pelo link.
        </p>
        <Link
          href="/dashboard"
          className="mt-4 inline-block px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:opacity-90"
        >
          Ir para Dashboard
        </Link>
      </div>
    );
  }

  if (month.status === "FECHADO") {
    return (
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Fechamento do Mes</h1>
        <p className="mt-4 text-success">Este mes ja esta fechado.</p>
        <Link
          href="/dashboard"
          className="mt-4 inline-block px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:opacity-90"
        >
          Voltar ao Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-foreground mb-6">
        Fechamento do Mes - {month.month}/{month.year}
      </h1>

      <div className="space-y-6 max-w-2xl">
        <div className="card-surface p-4">
          <h2 className="label-style mb-3">Resumo</h2>
          <p className="text-foreground">
            Previsto: <span className="font-mono-nums font-medium">{formatCurrency(totalPrevisto)}</span>
          </p>
          <p className="text-foreground mt-1">
            Realizado: <span className="font-mono-nums font-medium">{formatCurrency(totalRealizado)}</span>
          </p>
          {semRealizado.length > 0 && (
            <p className="text-destructive text-sm mt-2">
              {semRealizado.length} lancamento(s) sem valor realizado.
            </p>
          )}
        </div>

        <div className="card-surface p-4">
          <h2 className="label-style mb-3">Consolidacao de contas</h2>
          <p className="text-xs text-muted-foreground mb-3">
            Informe o saldo atual de cada conta bancaria cadastrada. O total sera levado como saldo do mes.
          </p>

          <div className="space-y-3">
            {accounts.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhuma conta ativa cadastrada. Cadastre em{" "}
                <Link href="/dashboard/contas" className="underline">
                  Contas Bancarias
                </Link>
                .
              </p>
            ) : (
              accounts.map((account) => (
                <div key={account.id}>
                  <label className="block text-sm text-muted-foreground mb-1">
                    {account.name}
                    {account.institution ? ` (${account.institution})` : ""}
                  </label>
                  <input
                    type="text"
                    value={accountBalances[account.id] ?? ""}
                    onChange={(e) => handleBalanceChange(account.id, e.target.value)}
                    placeholder="0,00"
                    className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground font-mono-nums"
                  />
                </div>
              ))
            )}

            <div className="pt-2 border-t border-border">
              <p className="text-sm text-muted-foreground">
                Total das contas:{" "}
                <span className="font-mono-nums text-foreground font-medium">
                  {formatCurrency(totalBankBalance)}
                </span>
              </p>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={handleFechar}
          disabled={submitting || accounts.length === 0}
          className="px-6 py-3 bg-primary text-white font-medium rounded-lg hover:opacity-90 disabled:opacity-50"
        >
          {submitting ? "Fechando..." : "Fechar Mes"}
        </button>
      </div>
    </div>
  );
}

export default function FechamentoPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-[200px]">
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      }
    >
      <FechamentoContent />
    </Suspense>
  );
}

