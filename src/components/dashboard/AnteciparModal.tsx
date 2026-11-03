"use client";

import { useState } from "react";
import { parseCurrencyBR } from "@/lib/currency";
import type { TransactionWithCategory } from "@/lib/types";

interface AnteciparModalProps {
  transaction: TransactionWithCategory;
  onClose: () => void;
  onSuccess: () => void;
  formatCurrency: (value: number) => string;
}

export function AnteciparModal({
  transaction,
  onClose,
  onSuccess,
  formatCurrency,
}: AnteciparModalProps) {
  const [quantidade, setQuantidade] = useState("1");
  const [desconto, setDesconto] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cur = transaction.installmentCurrent ?? 0;
  const tot = transaction.installmentTotal ?? 0;
  const maxAntecipar = Math.max(0, tot - cur);
  const valorParcela = transaction.amountPrevisto ?? 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const qty = parseInt(quantidade, 10);
    if (isNaN(qty) || qty < 1 || qty > maxAntecipar) {
      setError(`Informe entre 1 e ${maxAntecipar} parcelas.`);
      return;
    }
    const desc = parseCurrencyBR(desconto) || 0;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/transactions/${transaction.id}/antecipar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantidade: qty, desconto: desc }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Erro ao antecipar");
        return;
      }
      onSuccess();
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="card-surface w-full max-w-sm p-6 mx-4" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-foreground mb-2">Antecipar parcelas</h2>
        <p className="text-sm text-muted-foreground mb-4">
          {transaction.description} — parcela {cur}/{tot} ({formatCurrency(valorParcela)}/mês)
        </p>
        {maxAntecipar <= 0 ? (
          <p className="text-sm text-muted-foreground">Não há parcelas futuras para antecipar.</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div>
              <label className="block label-style mb-1">Quantidade de parcelas</label>
              <input
                type="number"
                min={1}
                max={maxAntecipar}
                value={quantidade}
                onChange={(e) => setQuantidade(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground"
              />
              <p className="text-xs text-muted-foreground mt-0.5">
                Máximo: {maxAntecipar} (parcelas {cur + 1} a {tot})
              </p>
            </div>
            <div>
              <label className="block label-style mb-1">Desconto (R$)</label>
              <input
                type="text"
                value={desconto}
                onChange={(e) => setDesconto(e.target.value)}
                placeholder="0 ou 0,00"
                className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground font-mono-nums"
              />
            </div>
            <div className="flex gap-2 pt-2">
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 px-4 py-2 rounded-lg bg-primary text-white font-medium hover:opacity-90 disabled:opacity-50"
              >
                {submitting ? "Antecipando..." : "Antecipar"}
              </button>
              <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-border">
                Cancelar
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
