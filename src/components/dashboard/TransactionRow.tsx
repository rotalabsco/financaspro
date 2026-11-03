"use client";

import Link from "next/link";
import { CalendarPlus, ExternalLink } from "lucide-react";
import { CategoryBadge } from "@/components/ui/CategoryBadge";
import { parseCurrencyBR } from "@/lib/currency";
import type { TransactionWithCategory, TransactionSource } from "@/lib/types";

export type TransactionStatus = "nao_lancado" | "parcial" | "conciliado";

const SOURCE_LABELS: Record<TransactionSource, string> = {
  CONTA_CORRENTE: "CC",
  CARTAO_CREDITO: "Cartão",
  DINHEIRO: "Dinheiro",
};

interface TransactionRowProps {
  transaction: TransactionWithCategory;
  onEditRealizado: (id: string, value: number | null) => void;
  onEditReembolso?: (id: string, value: number | null) => void;
  onAntecipar?: (transaction: TransactionWithCategory) => void;
  onConciliar?: (id: string) => void;
  onDesconciliar?: (id: string) => void;
  onDelete?: (id: string) => void;
  onEdit?: (transaction: TransactionWithCategory) => void;
  onEditInvestmentDate?: (id: string, date: string | null) => void;
  /** Receita recorrente: copiar valor para o mês seguinte como lançamento a conciliar */
  onCarryReceitaNextMonth?: (id: string) => void;
  formatCurrency: (value: number) => string;
}

function getStatusBadge(status: TransactionStatus) {
  switch (status) {
    case "conciliado":
      return (
        <span className="text-xs px-2 py-0.5 rounded bg-green-900/30 text-green-400">
          Conciliado
        </span>
      );
    case "parcial":
      return (
        <span className="text-xs px-2 py-0.5 rounded bg-amber-900/30 text-amber-400">
          Informado
        </span>
      );
    default:
      return (
        <span className="text-xs px-2 py-0.5 rounded bg-[hsl(var(--surface-hover))] text-muted-foreground">
          Não lançado
        </span>
      );
  }
}

function getStatus(
  amountRealizado: number | null,
  isConciliado: boolean
): TransactionStatus {
  if (amountRealizado == null) return "nao_lancado";
  return isConciliado ? "conciliado" : "parcial";
}

export function TransactionRow({
  transaction,
  onEditRealizado,
  onEditReembolso,
  onAntecipar,
  onEdit,
  onEditInvestmentDate,
  onConciliar,
  onDesconciliar,
  onDelete,
  onCarryReceitaNextMonth,
  formatCurrency,
}: TransactionRowProps) {
  const {
    id,
    description,
    amountPrevisto,
    amountRealizado,
    amountReembolso,
    isConciliado,
    installmentCurrent,
    installmentTotal,
    parceladoGroupId,
    source,
  } = transaction;
  const isReceita = transaction.category?.isReceita;
  const categoryName = transaction.category.name;
  const categoryColor = transaction.category.color;
  const status = getStatus(amountRealizado, isConciliado ?? false);
  const installmentInfo =
    installmentCurrent != null && installmentTotal != null
      ? `${installmentCurrent}/${installmentTotal}`
      : undefined;
  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    if (!onEditRealizado) return;
    const raw = e.target.value.trim();
    const value = raw ? parseCurrencyBR(raw) : null;
    onEditRealizado(id, value);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.currentTarget.blur();
    }
  };

  const valorEfetivo = amountRealizado ?? amountPrevisto;
  const inputDefault =
    valorEfetivo != null ? valorEfetivo.toFixed(2).replace(".", ",") : "";
  const isParceladoAntecipavel =
    transaction.type === "PARCELADO" && parceladoGroupId && installmentCurrent != null && installmentTotal != null && installmentCurrent < installmentTotal;
  const launchedDate = transaction.transactionDate
    ? new Date(`${transaction.transactionDate}T00:00:00`)
    : null;

  return (
    <tr className="border-b border-border hover:bg-[hsl(var(--surface-hover))]">
      <td className="py-2.5 px-3 align-middle">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <span className="font-medium text-foreground shrink-0">
            {description}
          </span>
          <span className="inline-flex items-center gap-2 shrink-0">
            {transaction.investment && (
              <span
                className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-200 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300"
                title={`Investimento: ${transaction.investment.ticker}`}
              >
                {transaction.investment.ticker}
              </span>
            )}
            <span
              className="text-[10px] px-1.5 py-0.5 rounded bg-[hsl(var(--surface-hover))] text-muted-foreground"
              title={
                transaction.source === "CARTAO_CREDITO" && transaction.creditCard
                  ? `Cartão: ${transaction.creditCard.name}`
                  : transaction.source === "CARTAO_CREDITO"
                    ? "Cartão de Crédito"
                    : transaction.source === "DINHEIRO"
                      ? "Dinheiro"
                      : transaction.bankAccount
                        ? `Conta: ${transaction.bankAccount.name}`
                        : "Conta Corrente"
              }
            >
              {transaction.source === "CARTAO_CREDITO" && transaction.creditCard
                ? transaction.creditCard.name
                : SOURCE_LABELS[(transaction.source as TransactionSource) ?? "CONTA_CORRENTE"]}
            </span>
            {installmentInfo && (
              <span className="text-xs text-gray-500">{installmentInfo}</span>
            )}
          </span>
        </div>
      </td>
      <td className="py-2.5 px-3 align-middle">
        <CategoryBadge name={categoryName} color={categoryColor} />
      </td>
      <td className="py-2.5 px-3 align-middle text-right">
        <div className="flex flex-col items-end gap-0.5 min-w-0">
          <input
            type="text"
            defaultValue={inputDefault}
            placeholder="0"
            title="Valor: não conciliado = previsto, conciliado = realizado"
            className="w-full max-w-[7rem] text-right px-2 py-1 border border-border rounded bg-background text-foreground tabular-nums text-sm"
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
          />
          {amountReembolso != null && amountReembolso > 0 && (
            <span className="text-xs text-green-600 dark:text-green-400">
              -{formatCurrency(amountReembolso)} reemb.
            </span>
          )}
        </div>
      </td>
      <td className="py-2.5 px-3 align-middle">
        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
          {transaction.investment &&
            onEditInvestmentDate &&
            !transaction.isConciliado &&
            transaction.amountRealizado != null && (
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-muted-foreground">Data:</span>
                <input
                  type="date"
                  defaultValue={transaction.investmentDate ?? ""}
                  onBlur={(e) => onEditInvestmentDate(transaction.id, e.target.value || null)}
                  className="text-[11px] px-1.5 py-0.5 rounded border border-border bg-background text-foreground"
                  title="Data do investimento (obrigatória para conciliar)"
                />
              </div>
            )}
          {getStatusBadge(status)}
          {launchedDate && (
            <span
              className="text-[10px] px-1.5 py-0.5 rounded bg-[hsl(var(--surface-hover))] text-muted-foreground"
              title="Data em que o lançamento foi informado"
            >
              Lançado em {launchedDate.toLocaleDateString("pt-BR")}
            </span>
          )}
          {onConciliar &&
            amountRealizado != null &&
            !isConciliado &&
            status === "parcial" && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onConciliar(id);
                }}
                className="text-xs px-2 py-0.5 rounded border border-primary/50 text-primary hover:bg-primary/10"
                title="Marcar como conciliado"
              >
                Conciliar
              </button>
            )}
          {onDesconciliar && isConciliado && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDesconciliar(id);
              }}
              className="text-xs px-2 py-0.5 rounded border border-amber-500/50 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10"
              title="Desfazer conciliação"
            >
              Desconciliar
            </button>
          )}
          {onAntecipar && isParceladoAntecipavel && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onAntecipar(transaction);
              }}
              className="text-xs px-2 py-0.5 rounded border border-blue-500/50 text-blue-600 dark:text-blue-400 hover:bg-blue-500/10"
              title="Antecipar parcelas"
            >
              Antecipar
            </button>
          )}
        </div>
      </td>
      <td className="py-2.5 px-3 align-middle">
        <div className="flex items-center justify-end gap-1">
          {isReceita && (
            <Link
              href={
                transaction.recurrenceGroupId
                  ? `/dashboard/receitas?group=${encodeURIComponent(transaction.recurrenceGroupId)}`
                  : "/dashboard/receitas"
              }
              onClick={(e) => e.stopPropagation()}
              className="p-1.5 rounded text-muted-foreground hover:text-emerald-400 hover:bg-emerald-500/10"
              title="Gerenciar em Receitas"
              aria-label="Gerenciar em Receitas"
            >
              <ExternalLink className="w-4 h-4" aria-hidden />
            </Link>
          )}
          {isReceita &&
            transaction.type === "RECORRENTE" &&
            onCarryReceitaNextMonth && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onCarryReceitaNextMonth(id);
                }}
                className="p-1.5 rounded text-muted-foreground hover:text-emerald-400 hover:bg-emerald-500/10"
                title="Levar esta receita ao mês seguinte (previsto + lançado; concilie quando quiser)"
                aria-label="Levar receita ao mês seguinte"
              >
                <CalendarPlus className="w-4 h-4" aria-hidden />
              </button>
            )}
          {onEdit && (
            <button
              type="button"
              onClick={() => onEdit(transaction)}
              className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-[hsl(var(--surface-hover))]"
              title="Editar lançamento"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(id);
              }}
              className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10"
              title="Excluir lançamento"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}
