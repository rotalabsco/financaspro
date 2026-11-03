import type { InvestmentAssetType } from "@/db/enums";

/** Ordem estável para formulários e validação de partição na distribuição. */
export const INVESTMENT_ASSET_TYPES_ORDERED: readonly InvestmentAssetType[] = [
  "RENDA_FIXA",
  "POUPANCA_CAIXINHA",
  "ACOES",
  "FII",
  "ETF",
  "BITCOIN",
  "USDC",
  "OUTROS",
] as const;

export const ASSET_TYPE_LABELS: Record<InvestmentAssetType, string> = {
  RENDA_FIXA: "Renda fixa",
  POUPANCA_CAIXINHA: "Poupança e caixinhas",
  ACOES: "Ações",
  FII: "FII",
  ETF: "ETF",
  BITCOIN: "Bitcoin",
  USDC: "USDC",
  OUTROS: "Outros",
};
