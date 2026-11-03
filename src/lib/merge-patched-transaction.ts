import type { MonthData, TransactionWithCategory } from "@/lib/types";

function normalizeDayField(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== "string") return null;
  return value.length >= 10 ? value.slice(0, 10) : value;
}

/**
 * Atualiza um único lançamento no MonthData a partir do JSON retornado por PATCH /api/transactions/[id].
 * Evita refetch completo de GET /api/months/[id] após cada edição.
 */
export function mergePatchedTransactionIntoMonth(
  month: MonthData,
  patch: Record<string, unknown>
): MonthData {
  const id = patch.id as string | undefined;
  if (!id) return month;

  const idx = month.transactions.findIndex((t) => t.id === id);
  if (idx === -1) return month;

  const prev = month.transactions[idx];

  const category =
    (patch.category as TransactionWithCategory["category"] | undefined) ??
    prev.category;

  const next: TransactionWithCategory = {
    ...prev,
    description:
      typeof patch.description === "string" ? patch.description : prev.description,
    categoryId:
      typeof patch.categoryId === "string" ? patch.categoryId : prev.categoryId,
    type: typeof patch.type === "string" ? patch.type : prev.type,
    source:
      patch.source === undefined || patch.source === null
        ? prev.source
        : (patch.source as TransactionWithCategory["source"]),
    amountPrevisto:
      typeof patch.amountPrevisto === "number"
        ? patch.amountPrevisto
        : prev.amountPrevisto,
    amountRealizado:
      patch.amountRealizado === undefined
        ? prev.amountRealizado
        : (patch.amountRealizado as number | null),
    amountReembolso:
      patch.amountReembolso === undefined
        ? prev.amountReembolso
        : (patch.amountReembolso as number | null),
    isConciliado:
      patch.isConciliado === undefined
        ? prev.isConciliado
        : Boolean(patch.isConciliado),
    isAntecipado:
      patch.isAntecipado === undefined
        ? prev.isAntecipado
        : Boolean(patch.isAntecipado),
    installmentCurrent:
      patch.installmentCurrent === undefined
        ? prev.installmentCurrent
        : (patch.installmentCurrent as number | null),
    installmentTotal:
      patch.installmentTotal === undefined
        ? prev.installmentTotal
        : (patch.installmentTotal as number | null),
    isLateEntry:
      patch.isLateEntry === undefined
        ? prev.isLateEntry
        : Boolean(patch.isLateEntry),
    notes:
      patch.notes === undefined ? prev.notes : (patch.notes as string | null),
    transactionDate:
      patch.transactionDate === undefined
        ? prev.transactionDate
        : normalizeDayField(patch.transactionDate),
    investmentDate:
      patch.investmentDate === undefined
        ? prev.investmentDate
        : normalizeDayField(patch.investmentDate),
    parceladoGroupId:
      patch.parceladoGroupId === undefined
        ? prev.parceladoGroupId
        : (patch.parceladoGroupId as string | null),
    investmentOperationId:
      patch.investmentOperationId === undefined
        ? prev.investmentOperationId
        : (patch.investmentOperationId as string | null),
    category,
    bankAccount:
      patch.bankAccount === undefined
        ? prev.bankAccount
        : (patch.bankAccount as TransactionWithCategory["bankAccount"]),
    creditCard:
      patch.creditCard === undefined
        ? prev.creditCard
        : (patch.creditCard as TransactionWithCategory["creditCard"]),
    investment:
      patch.investment === undefined
        ? prev.investment
        : (patch.investment as TransactionWithCategory["investment"]),
  };

  const transactions = [...month.transactions];
  transactions[idx] = next;
  return { ...month, transactions };
}
