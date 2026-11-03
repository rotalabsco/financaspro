/**
 * Relações para as consultas com `with` (db.query.*). Os nomes repetem os do schema
 * Prisma antigo para que as respostas da API mantenham as mesmas chaves.
 */
import { relations } from "drizzle-orm";
import {
  bankAccounts,
  carteiras,
  categories,
  creditCards,
  cryptoSwaps,
  distributionGroupAssets,
  distributionGroups,
  dividendRecords,
  forecastCategories,
  investmentOperations,
  investments,
  months,
  transactions,
  vaults,
  vaultSnapshots,
} from "./schema";

export const carteirasRelations = relations(carteiras, ({ many }) => ({
  operations: many(investmentOperations),
}));

export const categoriesRelations = relations(categories, ({ many }) => ({
  transactions: many(transactions),
  vaults: many(vaults),
  forecastConfigs: many(forecastCategories),
}));

export const forecastCategoriesRelations = relations(forecastCategories, ({ one }) => ({
  category: one(categories, { fields: [forecastCategories.categoryId], references: [categories.id] }),
}));

export const distributionGroupsRelations = relations(distributionGroups, ({ many }) => ({
  assets: many(distributionGroupAssets),
}));

export const distributionGroupAssetsRelations = relations(distributionGroupAssets, ({ one }) => ({
  group: one(distributionGroups, { fields: [distributionGroupAssets.groupId], references: [distributionGroups.id] }),
}));

export const monthsRelations = relations(months, ({ many }) => ({
  transactions: many(transactions),
  vaultSnapshots: many(vaultSnapshots),
}));

export const bankAccountsRelations = relations(bankAccounts, ({ many }) => ({
  transactions: many(transactions),
}));

export const creditCardsRelations = relations(creditCards, ({ many }) => ({
  transactions: many(transactions),
}));

export const transactionsRelations = relations(transactions, ({ one }) => ({
  month: one(months, { fields: [transactions.monthId], references: [months.id] }),
  category: one(categories, { fields: [transactions.categoryId], references: [categories.id] }),
  bankAccount: one(bankAccounts, { fields: [transactions.bankAccountId], references: [bankAccounts.id] }),
  creditCard: one(creditCards, { fields: [transactions.creditCardId], references: [creditCards.id] }),
  investment: one(investments, { fields: [transactions.investmentId], references: [investments.id] }),
  investmentOperation: one(investmentOperations, {
    fields: [transactions.investmentOperationId],
    references: [investmentOperations.id],
  }),
}));

export const vaultsRelations = relations(vaults, ({ one, many }) => ({
  snapshots: many(vaultSnapshots),
  category: one(categories, { fields: [vaults.categoryId], references: [categories.id] }),
}));

export const vaultSnapshotsRelations = relations(vaultSnapshots, ({ one }) => ({
  vault: one(vaults, { fields: [vaultSnapshots.vaultId], references: [vaults.id] }),
  month: one(months, { fields: [vaultSnapshots.monthId], references: [months.id] }),
}));

export const investmentsRelations = relations(investments, ({ many }) => ({
  operations: many(investmentOperations),
  dividends: many(dividendRecords),
  swapsFrom: many(cryptoSwaps, { relationName: "SwapsFrom" }),
  swapsTo: many(cryptoSwaps, { relationName: "SwapsTo" }),
  transactions: many(transactions),
}));

export const cryptoSwapsRelations = relations(cryptoSwaps, ({ one, many }) => ({
  fromInvestment: one(investments, {
    fields: [cryptoSwaps.fromInvestmentId],
    references: [investments.id],
    relationName: "SwapsFrom",
  }),
  toInvestment: one(investments, {
    fields: [cryptoSwaps.toInvestmentId],
    references: [investments.id],
    relationName: "SwapsTo",
  }),
  operations: many(investmentOperations),
}));

export const investmentOperationsRelations = relations(investmentOperations, ({ one }) => ({
  investment: one(investments, { fields: [investmentOperations.investmentId], references: [investments.id] }),
  carteira: one(carteiras, { fields: [investmentOperations.carteiraId], references: [carteiras.id] }),
  cryptoSwap: one(cryptoSwaps, { fields: [investmentOperations.cryptoSwapId], references: [cryptoSwaps.id] }),
  transaction: one(transactions, {
    fields: [investmentOperations.id],
    references: [transactions.investmentOperationId],
  }),
}));

export const dividendRecordsRelations = relations(dividendRecords, ({ one }) => ({
  investment: one(investments, { fields: [dividendRecords.investmentId], references: [investments.id] }),
}));
