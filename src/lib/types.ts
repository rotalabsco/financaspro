export type TransactionSource = "CONTA_CORRENTE" | "CARTAO_CREDITO" | "DINHEIRO";

export interface TransactionWithCategory {
  id: string;
  monthId: string;
  parceladoGroupId?: string | null;
  recurrenceGroupId?: string | null;
  recurrenceEndsAtMonth?: string | null;
  description: string;
  categoryId: string;
  type: string;
  source?: TransactionSource | null;
  amountPrevisto: number;
  amountRealizado: number | null;
  amountReembolso?: number | null;
  isConciliado: boolean;
  isAntecipado?: boolean;
  installmentCurrent: number | null;
  installmentTotal: number | null;
  isLateEntry: boolean;
  notes: string | null;
  investmentOperationId?: string | null;
  investmentDate?: string | null;
  transactionDate?: string | null;
  category: {
    id: string;
    name: string;
    color: string;
    icon: string;
    isReceita?: boolean;
  };
  bankAccount?: { id: string; name: string } | null;
  creditCard?: { id: string; name: string } | null;
  investment?: { id: string; name: string; ticker: string } | null;
}

export interface MonthData {
  id: string;
  year: number;
  month: number;
  status: string;
  notes: string | null;
  closedAt: string | null;
  bankBalanceAtClose: number | null;
  creditCardAtClose: number | null;
  transactions: TransactionWithCategory[];
}

export interface VaultWithBalance {
  id: string;
  name: string;
  monthlyDeposit: number;
  initialBalance: number;
  currentBalance?: number;
  totalExpensesThisMonth?: number;
}
