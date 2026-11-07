"use client";

import { useState, useEffect } from "react";
import type { TransactionWithCategory, TransactionSource } from "@/lib/types";
import { parseCurrencyBR } from "@/lib/currency";

interface Category {
  id: string;
  name: string;
  color: string;
  defaultType: string;
  isReceita?: boolean;
}

interface BankAccount {
  id: string;
  name: string;
  institution?: string | null;
}

interface CreditCard {
  id: string;
  name: string;
  institution?: string | null;
}

interface AddTransactionModalProps {
  monthId: string;
  categories: Category[];
  bankAccounts?: BankAccount[];
  year?: number;
  monthNum?: number;
  transaction?: TransactionWithCategory | null;
  isReceita?: boolean;
  onClose: () => void;
  onSuccess: () => void;
  formatCurrency: (value: number) => string;
}

/** Primeira categoria de despesa (exclui Receita e Cofre). Evita usar categories[0], que pode ser Receita. */
function firstExpenseCategoryId(cats: Category[]): string {
  const row = cats.find(
    (c) => c.defaultType !== "COFRE" && !c.isReceita
  );
  return row?.id ?? "";
}

const TYPES = [
  { value: "A_VISTA", label: "À vista — pagamento único" },
  { value: "RECORRENTE", label: "Recorrente — se repete, pode variar" },
  { value: "PARCELADO", label: "Parcelado — parcelas fixas (ex: financiamento)" },
];

const SOURCES: { value: TransactionSource; label: string }[] = [
  { value: "CONTA_CORRENTE", label: "Conta Corrente (sai direto)" },
  { value: "CARTAO_CREDITO", label: "Cartão de Crédito" },
  { value: "DINHEIRO", label: "Dinheiro" },
];

/** Referência estável — evita loop infinito no useEffect quando o pai não passa `bankAccounts` (default `[]` seria novo a cada render). */
const EMPTY_BANK_ACCOUNTS: BankAccount[] = [];

export function AddTransactionModal({
  monthId,
  categories,
  bankAccounts = EMPTY_BANK_ACCOUNTS,
  year,
  monthNum,
  transaction: transactionToEdit,
  isReceita = false,
  onClose,
  onSuccess,
  formatCurrency,
}: AddTransactionModalProps) {
  const isEdit = !!transactionToEdit;
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState(() =>
    firstExpenseCategoryId(categories)
  );
  const [bankAccountsList, setBankAccountsList] = useState<BankAccount[]>(bankAccounts);
  const [creditCardsList, setCreditCardsList] = useState<CreditCard[]>([]);
  const [bankAccountId, setBankAccountId] = useState(bankAccounts[0]?.id ?? "");
  const [creditCardId, setCreditCardId] = useState("");
  const [type, setType] = useState<"A_VISTA" | "RECORRENTE" | "PARCELADO">("A_VISTA");
  const [source, setSource] = useState<TransactionSource>("CARTAO_CREDITO");
  const [amount, setAmount] = useState("");
  const [amountReembolso, setAmountReembolso] = useState("");
  const [showReembolso, setShowReembolso] = useState(false);
  const [installmentCurrent, setInstallmentCurrent] = useState("");
  const [installmentTotal, setInstallmentTotal] = useState("");
  const [investmentDate, setInvestmentDate] = useState("");
  const [continuarLancando, setContinuarLancando] = useState(true);

  const resetForm = () => {
    setDescription("");
    // Mantém a categoria selecionada para facilitar lançamentos em sequência.
    setAmount("");
    setAmountReembolso("");
    setShowReembolso(false);
    setInstallmentCurrent("");
    setInstallmentTotal("");
    setError(null);
  };

  useEffect(() => {
    if (isReceita) {
      if (bankAccounts.length > 0) {
        setBankAccountsList(bankAccounts);
        setBankAccountId((prev) => prev || (bankAccounts[0]?.id ?? ""));
      } else {
        fetch("/api/bank-accounts")
          .then((r) => r.json())
          .then((data) => {
            const list = Array.isArray(data) ? data : [];
            setBankAccountsList(list);
            setBankAccountId((prev) => prev || (list[0]?.id ?? ""));
          })
          .catch(() => setBankAccountsList([]));
      }
    } else {
      Promise.all([
        fetch("/api/bank-accounts").then((r) => r.json()).then((d) => (Array.isArray(d) ? d : [])),
        fetch("/api/credit-cards").then((r) => r.json()).then((d) => (Array.isArray(d) ? d : [])),
      ]).then(([banks, cards]) => {
        setBankAccountsList(banks);
        setCreditCardsList(cards);
        // Cartão padrão: o primeiro na ordem do cadastro (a API ordena por sortOrder).
        if (!isEdit) setCreditCardId((cards as CreditCard[])[0]?.id ?? "");
      }).catch(() => {});
    }
  }, [isReceita, bankAccounts]);

  useEffect(() => {
    if (isReceita || isEdit) return;
    const expenseCats = categories.filter(
      (c) => c.defaultType !== "COFRE" && !c.isReceita
    );
    if (expenseCats.length === 0) return;
    const isValid = expenseCats.some((c) => c.id === categoryId);
    if (!isValid) {
      setCategoryId(expenseCats[0].id);
    }
  }, [categories, categoryId, isReceita, isEdit]);

  useEffect(() => {
    if (transactionToEdit) {
      setDescription(transactionToEdit.description);
      setCategoryId(transactionToEdit.categoryId);
      setBankAccountId(transactionToEdit.bankAccount?.id ?? "");
      setCreditCardId(transactionToEdit.creditCard?.id ?? "");
      setType(transactionToEdit.type as "A_VISTA" | "RECORRENTE" | "PARCELADO");
      setSource((transactionToEdit.source as TransactionSource) ?? "CONTA_CORRENTE");
      const val =
        transactionToEdit.amountRealizado != null
          ? transactionToEdit.amountRealizado
          : transactionToEdit.amountPrevisto;
      setAmount(val.toFixed(2).replace(".", ","));
      setInstallmentCurrent(
        transactionToEdit.installmentCurrent != null
          ? String(transactionToEdit.installmentCurrent)
          : ""
      );
      setInstallmentTotal(
        transactionToEdit.installmentTotal != null
          ? String(transactionToEdit.installmentTotal)
          : ""
      );
      const hasReembolso = transactionToEdit.amountReembolso != null && transactionToEdit.amountReembolso > 0;
      setAmountReembolso(
        hasReembolso
          ? transactionToEdit.amountReembolso!.toFixed(2).replace(".", ",")
          : ""
      );
      setShowReembolso(hasReembolso);
      setInvestmentDate(transactionToEdit.investmentDate ?? "");
    }
  }, [transactionToEdit]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mediaHistorica, setMediaHistorica] = useState<number | null>(null);

  useEffect(() => {
    if (!categoryId || isEdit) return;
    const params = new URLSearchParams({ categoryId, months: "3" });
    if (year && monthNum) {
      params.set("year", String(year));
      params.set("month", String(monthNum));
    }
    fetch(`/api/media-historica?${params}`)
      .then((r) => r.json())
      .then((d) => (d.media > 0 ? setMediaHistorica(d.media) : setMediaHistorica(null)))
      .catch(() => setMediaHistorica(null));
  }, [categoryId, year, monthNum, isEdit]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!description.trim()) {
      setError("Descrição é obrigatória.");
      return;
    }
    if (isReceita ? !bankAccountId : !categoryId) {
      setError(isReceita ? "Selecione a conta de destino." : "Selecione a categoria.");
      return;
    }
    if (!isReceita && source === "CONTA_CORRENTE" && !bankAccountId) {
      setError("Selecione a conta corrente.");
      return;
    }
    if (!isReceita && source === "CARTAO_CREDITO" && !creditCardId) {
      setError("Selecione o cartão de crédito.");
      return;
    }

    const val = parseCurrencyBR(amount) || 0;
    if (val <= 0) {
      setError("Informe o valor.");
      return;
    }

    setSubmitting(true);
    try {
      const body: Record<string, unknown> = isReceita
        ? {
            description: description.trim(),
            bankAccountId,
            type,
            source: "CONTA_CORRENTE",
            amountPrevisto: val,
            amountRealizado: val,
          }
        : {
            description: description.trim(),
            categoryId,
            type,
            source,
            bankAccountId: source === "CONTA_CORRENTE" ? bankAccountId || null : null,
            creditCardId: source === "CARTAO_CREDITO" ? creditCardId || null : null,
            amountPrevisto: val,
            amountRealizado: val,
            amountReembolso: source === "CARTAO_CREDITO" && amountReembolso.trim() ? parseCurrencyBR(amountReembolso) || null : null,
          };
      if (!isReceita && type === "PARCELADO") {
        const cur = parseInt(installmentCurrent, 10);
        const tot = parseInt(installmentTotal, 10);
        if (!isNaN(cur) && !isNaN(tot)) {
          body.installmentCurrent = cur;
          body.installmentTotal = tot;
        }
      }

      if (isEdit && transactionToEdit?.investment) {
        body.investmentDate = investmentDate.trim() || null;
      }

      const url = isEdit
        ? `/api/transactions/${transactionToEdit!.id}`
        : `/api/months/${monthId}/transactions`;
      const res = await fetch(url, {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? (isEdit ? "Erro ao atualizar lançamento" : "Erro ao criar lançamento"));
        return;
      }
      onSuccess();
      if (!isEdit && continuarLancando) {
        resetForm();
      } else {
        onClose();
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="card-surface w-full max-w-md p-6 mx-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground">
            {isEdit ? "Editar Lançamento" : "Novo Lançamento"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Fechar"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>

        {error && (
          <p className="mb-4 text-sm text-destructive">{error}</p>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block label-style mb-1">Descrição</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground"
              placeholder="Ex: Mercado, Aluguel..."
              required
            />
          </div>

          {!isReceita && (
            <div>
              <label className="block label-style mb-1">Categoria</label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground"
                required
              >
                {categories
                  .filter((c) => c.defaultType !== "COFRE" && !c.isReceita)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </div>
          )}

          {isReceita && (
            <div>
              <label className="block label-style mb-1">Conta (destino da receita)</label>
              <select
                value={bankAccountId}
                onChange={(e) => setBankAccountId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground"
                required
              >
                {bankAccountsList.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.institution ? `${a.name} (${a.institution})` : a.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {!isReceita && (
            <div>
              <label className="block label-style mb-1">Origem</label>
              <select
                value={source}
                onChange={(e) => {
                  const newSource = e.target.value as TransactionSource;
                  setSource(newSource);
                  if (newSource === "CONTA_CORRENTE") setCreditCardId("");
                  else if (newSource === "CARTAO_CREDITO") setBankAccountId("");
                }}
                className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground"
              >
                {SOURCES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {!isReceita && source === "CONTA_CORRENTE" && (
            <div>
              <label className="block label-style mb-1">Conta corrente</label>
              <select
                value={bankAccountId}
                onChange={(e) => setBankAccountId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground"
                required
              >
                <option value="">Selecione a conta</option>
                {bankAccountsList.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.institution ? `${a.name} (${a.institution})` : a.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {!isReceita && source === "CARTAO_CREDITO" && (
            <div>
              <label className="block label-style mb-1">Cartão de crédito</label>
              <select
                value={creditCardId}
                onChange={(e) => setCreditCardId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground"
                required
              >
                <option value="">Selecione o cartão</option>
                {creditCardsList.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.institution ? `${c.name} (${c.institution})` : c.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {isReceita && (
            <div>
              <label className="block label-style mb-1">Tipo</label>
              <select
                value={type === "PARCELADO" ? "A_VISTA" : type}
                onChange={(e) =>
                  setType(e.target.value as "A_VISTA" | "RECORRENTE")
                }
                className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground"
              >
                <option value="A_VISTA">À vista — só neste mês</option>
                <option value="RECORRENTE">Recorrente — repete nos próximos meses (ex.: salário)</option>
              </select>
            </div>
          )}

          {!isReceita && (
          <div>
            <label className="block label-style mb-1">Tipo</label>
            <select
              value={type}
              onChange={(e) =>
                setType(e.target.value as "A_VISTA" | "RECORRENTE" | "PARCELADO")
              }
              className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground"
            >
              {TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          )}

          {transactionToEdit?.investment && (
            <div>
              <label className="block label-style mb-1">
                Data do investimento{" "}
                <span className="text-muted-foreground font-normal text-xs">
                  (obrigatória para conciliar)
                </span>
              </label>
              <input
                type="date"
                value={investmentDate}
                onChange={(e) => setInvestmentDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground"
              />
            </div>
          )}
          {type === "PARCELADO" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block label-style mb-1">Parcela atual</label>
                <input
                  type="number"
                  min={1}
                  value={installmentCurrent}
                  onChange={(e) => setInstallmentCurrent(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground font-mono-nums"
                />
              </div>
              <div>
                <label className="block label-style mb-1">Total parcelas</label>
                <input
                  type="number"
                  min={1}
                  value={installmentTotal}
                  onChange={(e) => setInstallmentTotal(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground font-mono-nums"
                />
              </div>
            </div>
          )}

          {!isReceita && source === "CARTAO_CREDITO" && (
            <label className="flex items-center gap-2 cursor-pointer text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={showReembolso}
                onChange={(e) => {
                  setShowReembolso(e.target.checked);
                  if (!e.target.checked) setAmountReembolso("");
                }}
                className="rounded border-border"
              />
              Tem reembolso (cashback, seguro...)
            </label>
          )}

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block label-style">Valor (R$)</label>
              {!isEdit && mediaHistorica != null && mediaHistorica > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    setAmount(
                      mediaHistorica.toFixed(2).replace(".", ",")
                    )
                  }
                  className="text-xs text-primary hover:underline"
                >
                  Usar média ({formatCurrency(mediaHistorica)})
                </button>
              )}
            </div>
            <input
              type="text"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground font-mono-nums"
              placeholder="3550 ou 35,50"
              inputMode="decimal"
              required
            />
            {!isEdit && (
              <p className="text-xs text-muted-foreground mt-0.5">
                Digite o valor em reais (ex: 3550 ou 35,50). Use Conciliar para conferência.
              </p>
            )}
          </div>

          {!isReceita && source === "CARTAO_CREDITO" && showReembolso && (
            <div>
              <label className="block label-style mb-1">Reembolso (R$)</label>
              <input
                type="text"
                value={amountReembolso}
                onChange={(e) => setAmountReembolso(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground font-mono-nums"
                placeholder="0 ou 0,00"
              />
              <p className="text-xs text-muted-foreground mt-0.5">
                Valor reembolsado, total ou parcial (ex: cashback, seguro).
              </p>
            </div>
          )}

          {!isEdit && (
            <label className="flex items-center gap-2 cursor-pointer text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={continuarLancando}
                onChange={(e) => setContinuarLancando(e.target.checked)}
                className="rounded border-border"
              />
              Continuar lançando após adicionar
            </label>
          )}

          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 px-4 py-2 rounded-lg bg-primary text-white font-medium hover:opacity-90 disabled:opacity-50"
            >
              {submitting ? "Salvando..." : isEdit ? "Salvar" : "Adicionar"}
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
