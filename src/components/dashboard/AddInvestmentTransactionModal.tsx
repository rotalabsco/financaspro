"use client";

import { useState, useEffect } from "react";
import { parseCurrencyBR } from "@/lib/currency";

interface Investment {
  id: string;
  name: string;
  ticker: string;
  assetType?: string;
  currentValue?: number;
  quantity?: number;
}

interface BankAccount {
  id: string;
  name: string;
  institution?: string | null;
}

interface AddInvestmentTransactionModalProps {
  monthId: string;
  onClose: () => void;
  onSuccess: () => void;
  formatCurrency: (value: number) => string;
}

export function AddInvestmentTransactionModal({
  monthId,
  onClose,
  onSuccess,
  formatCurrency,
}: AddInvestmentTransactionModalProps) {
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [investmentId, setInvestmentId] = useState("");
  const [operationType, setOperationType] = useState<"BUY" | "SELL">("BUY");
  const [amount, setAmount] = useState("");
  const [bankAccountId, setBankAccountId] = useState("");
  const [investmentDate, setInvestmentDate] = useState("");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/investments").then((r) => r.json()),
      fetch("/api/bank-accounts").then((r) => r.json()),
    ]).then(([invData, bankData]) => {
      if (!Array.isArray(invData)) {
        setLoadError("Não foi possível carregar os investimentos. Tente fechar e reabrir.");
        return;
      }
      const sorted = [...invData].sort((a, b) => {
        const aHasBal = (a.currentValue ?? 0) > 0 || (a.quantity ?? 0) > 0;
        const bHasBal = (b.currentValue ?? 0) > 0 || (b.quantity ?? 0) > 0;
        if (aHasBal && !bHasBal) return -1;
        if (!aHasBal && bHasBal) return 1;
        return (a.ticker ?? "").localeCompare(b.ticker ?? "");
      });
      const bankList = Array.isArray(bankData) ? bankData : [];
      setInvestments(sorted);
      setBankAccounts(bankList);
      if (sorted.length > 0 && !investmentId) setInvestmentId(sorted[0].id);
      if (bankList.length > 0 && !bankAccountId) setBankAccountId(bankList[0].id);
    }).catch(() => {
      setLoadError("Erro de conexão ao carregar investimentos.");
    });
  }, []);

  useEffect(() => {
    if (investments.length > 0 && !investmentId) setInvestmentId(investments[0].id);
  }, [investments, investmentId]);

  useEffect(() => {
    if (bankAccounts.length > 0 && !bankAccountId) setBankAccountId(bankAccounts[0].id);
  }, [bankAccounts, bankAccountId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!investmentId) {
      setError("Selecione o investimento.");
      return;
    }
    if (!bankAccountId) {
      setError("Selecione a conta.");
      return;
    }
    const val = parseCurrencyBR(amount) || 0;
    if (val <= 0) {
      setError("Informe o valor.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/months/${monthId}/investment-transactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          investmentId,
          operationType,
          amount: val,
          bankAccountId,
          investmentDate: investmentDate || null,
          description: description.trim() || undefined,
          notes: notes.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Erro ao registrar investimento");
        return;
      }
      onSuccess();
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  const inv = investments.find((i) => i.id === investmentId);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="card-surface w-full max-w-md p-6 mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-foreground mb-4">
          Lançar Investimento
        </h2>

        {loadError && (
          <p className="mb-4 text-sm text-destructive">{loadError}</p>
        )}
        {error && (
          <p className="mb-4 text-sm text-destructive">{error}</p>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block label-style mb-1">Investimento</label>
            <select
              value={investmentId}
              onChange={(e) => setInvestmentId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground"
              required
            >
              <option value="">
                {investments.length === 0 && !loadError ? "Carregando..." : "Selecione..."}
              </option>
              {investments.map((i) => {
                const hasBal = (i.currentValue ?? 0) > 0 || (i.quantity ?? 0) > 0;
                const balLabel = i.currentValue != null && i.currentValue > 0
                  ? ` • ${formatCurrency(i.currentValue)}`
                  : "";
                return (
                  <option key={i.id} value={i.id}>
                    {hasBal ? "★ " : ""}{i.ticker} — {i.name}{balLabel}
                  </option>
                );
              })}
            </select>
            {investments.length === 0 && !loadError && (
              <p className="text-xs text-muted-foreground mt-1">Nenhum investimento cadastrado.</p>
            )}
          </div>

          <div>
            <label className="block label-style mb-1">Tipo</label>
            <select
              value={operationType}
              onChange={(e) => setOperationType(e.target.value as "BUY" | "SELL")}
              className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground"
            >
              <option value="BUY">Aplicação (saída)</option>
              <option value="SELL">Resgate (entrada)</option>
            </select>
            <p className="text-xs text-muted-foreground mt-0.5">
              {operationType === "BUY"
                ? "Dinheiro sai da conta e entra no investimento."
                : "Dinheiro sai do investimento e entra na conta."}
            </p>
          </div>

          <div>
            <label className="block label-style mb-1">Conta</label>
            <select
              value={bankAccountId}
              onChange={(e) => setBankAccountId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground"
              required
            >
              <option value="">Selecione a conta</option>
              {bankAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.institution ? `${a.name} (${a.institution})` : a.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block label-style mb-1">Valor (R$)</label>
            <input
              type="text"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground font-mono-nums"
              placeholder="600 ou 600,00"
              required
            />
          </div>

          <div>
            <label className="block label-style mb-1">
              Data do investimento{" "}
              <span className="text-muted-foreground font-normal">
                (opcional; obrigatória para conciliar)
              </span>
            </label>
            <input
              type="date"
              value={investmentDate}
              onChange={(e) => setInvestmentDate(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground"
            />
          </div>

          <div>
            <label className="block label-style mb-1">Descrição (opcional)</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground"
              placeholder={
                inv
                  ? operationType === "BUY"
                    ? `Aplicação ${inv.ticker} - ${inv.name}`
                    : `Resgate ${inv.ticker} - ${inv.name}`
                  : "Ex: CDB 110% CDI"
              }
            />
          </div>

          <div>
            <label className="block label-style mb-1">Observações (opcional)</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground"
              placeholder="Ex: vencimento em 12/2026"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium hover:opacity-90 disabled:opacity-50"
            >
              {submitting ? "Salvando..." : "Lançar"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-border text-foreground font-medium hover:bg-[hsl(var(--surface-hover))]"
            >
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
