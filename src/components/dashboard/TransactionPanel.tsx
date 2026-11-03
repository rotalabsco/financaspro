"use client";

import { useState } from "react";
import { TransactionRow } from "./TransactionRow";
import type { TransactionWithCategory } from "@/lib/types";

interface TransactionPanelProps {
  title: string;
  transactions: TransactionWithCategory[];
  onEditRealizado: (id: string, value: number | null) => void;
  onAntecipar?: (transaction: TransactionWithCategory) => void;
  onConciliar?: (id: string) => void;
  onDesconciliar?: (id: string) => void;
  onDelete?: (id: string) => void;
  onEdit?: (transaction: TransactionWithCategory) => void;
  onEditInvestmentDate?: (id: string, date: string | null) => void;
  onCarryReceitaNextMonth?: (id: string) => void;
  formatCurrency: (value: number) => string;
  defaultOpen?: boolean;
}

export function TransactionPanel({
  title,
  transactions,
  onEditRealizado,
  onAntecipar,
  onConciliar,
  onDesconciliar,
  onDelete,
  onEdit,
  onEditInvestmentDate,
  onCarryReceitaNextMonth,
  formatCurrency,
  defaultOpen = true,
}: TransactionPanelProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const totalValor = transactions.reduce((s, t) => {
    const val = t.amountRealizado != null ? Number(t.amountRealizado) : Number(t.amountPrevisto);
    const reemb = t.amountReembolso != null ? Number(t.amountReembolso) : 0;
    return s + val - reemb;
  }, 0);

  return (
    <section className="bg-surface rounded-xl border border-border overflow-hidden shadow-sm shrink-0">
      <button
        type="button"
        onClick={() => setIsOpen((o) => !o)}
        className={`w-full px-4 py-2.5 text-left text-sm font-semibold text-foreground bg-background hover:bg-[hsl(var(--surface-hover))] flex items-center justify-between gap-2 ${isOpen ? "border-b border-border" : ""}`}
      >
        <span>{title}</span>
        <span className="text-muted-foreground shrink-0">
          {isOpen ? (
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6"/></svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 18 6-6-6-6"/></svg>
          )}
        </span>
      </button>
      {isOpen && (
        <div className="min-w-0">
          <div className="border-b border-border" aria-hidden />
          <div className="overflow-x-auto">
            {transactions.length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted-foreground">
                Nenhum lançamento
              </p>
            ) : (
              <table className="w-full table-fixed">
                <colgroup>
                  <col style={{ width: "38%" }} />
                  <col style={{ width: "18%" }} />
                  <col style={{ width: "9rem" }} />
                  <col style={{ width: "auto" }} />
                  <col style={{ width: "5rem" }} />
                </colgroup>
                <thead>
                  <tr className="text-xs text-muted-foreground">
                    <th className="py-2.5 px-3 text-left font-medium">Descrição</th>
                    <th className="py-2.5 px-3 text-left font-medium">Categoria</th>
                    <th className="py-2.5 px-3 text-right font-medium">Valor</th>
                    <th className="py-2.5 px-3 text-left font-medium">Status</th>
                    <th className="py-2.5 px-3 w-[5rem]"></th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((t) => (
                    <TransactionRow
                      key={t.id}
                      transaction={t}
                      onEditRealizado={onEditRealizado}
                      onAntecipar={onAntecipar}
                      onConciliar={onConciliar}
                      onDesconciliar={onDesconciliar}
                      onDelete={onDelete}
                      onEdit={onEdit}
                      onEditInvestmentDate={onEditInvestmentDate}
                      onCarryReceitaNextMonth={onCarryReceitaNextMonth}
                      formatCurrency={formatCurrency}
                    />
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-background border-t border-border">
                    <td colSpan={2} className="py-2.5 px-3 text-sm text-muted-foreground font-medium">
                      Sub-total
                    </td>
                    <td className="py-2.5 px-3 text-right text-sm font-semibold text-foreground tabular-nums">
                      {formatCurrency(totalValor)}
                    </td>
                    <td colSpan={2} className="py-2.5 px-3"></td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
