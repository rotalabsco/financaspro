import type { InvestmentAssetType } from "@/db/enums";

/** Payload padrão alinhado ao seed: BTC e USDC no grupo internacional. */
export function getDefaultDistributionGroupsPayload(): {
  groups: Array<{
    name: string;
    sortOrder: number;
    assetTypes: InvestmentAssetType[];
  }>;
} {
  return {
    groups: [
      {
        name: "Internacional (BTC, USDC)",
        sortOrder: 0,
        assetTypes: ["BITCOIN", "USDC"],
      },
      { name: "Renda fixa", sortOrder: 1, assetTypes: ["RENDA_FIXA"] },
      {
        name: "Poupança e caixinhas",
        sortOrder: 2,
        assetTypes: ["POUPANCA_CAIXINHA"],
      },
      { name: "Ações", sortOrder: 3, assetTypes: ["ACOES"] },
      { name: "FII", sortOrder: 4, assetTypes: ["FII"] },
      { name: "ETF", sortOrder: 5, assetTypes: ["ETF"] },
      { name: "Outros", sortOrder: 6, assetTypes: ["OUTROS"] },
    ],
  };
}
