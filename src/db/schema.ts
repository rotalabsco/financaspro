/**
 * Schema do banco (Drizzle). Gerado por `drizzle-kit pull` a partir do banco que já
 * existia (criado pelo Prisma), sem mudar nenhuma tabela. Ajustes feitos à mão, que o
 * banco não guarda e o Prisma fazia no cliente:
 * - `id`: gerado no app (o Prisma usava cuid(); ids são TEXT, formatos misturados ok);
 * - `updatedAt`: preenchido no insert e no update;
 * - datas como Date e numéricos como number, como as rotas já esperam.
 */
import { pgTable, uniqueIndex, text, integer, timestamp, varchar, numeric, boolean, foreignKey, date, index, pgEnum } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { randomUUID } from "node:crypto"

export const categoryDefaultType = pgEnum("CategoryDefaultType", ['FIXO', 'VARIAVEL', 'RECORRENTE', 'COFRE'])
export const categorySystemRole = pgEnum("CategorySystemRole", ['RECEITA_PADRAO', 'SALDO_FECHAMENTO', 'INVESTIMENTOS'])
export const dividendType = pgEnum("DividendType", ['DIVIDEND', 'JCP', 'RENDIMENTO'])
export const investmentAssetType = pgEnum("InvestmentAssetType", ['RENDA_FIXA', 'POUPANCA_CAIXINHA', 'ACOES', 'FII', 'ETF', 'BITCOIN', 'USDC', 'OUTROS'])
export const investmentOperationType = pgEnum("InvestmentOperationType", ['BUY', 'SELL', 'SUBSCRIPTION', 'BONUS', 'DIVIDEND'])
export const monthStatus = pgEnum("MonthStatus", ['RASCUNHO', 'ATIVO', 'FECHADO'])
export const rentabilidadeType = pgEnum("RentabilidadeType", ['PRE_FIXADO', 'POS_FIXADO'])
export const swapFeeCurrency = pgEnum("SwapFeeCurrency", ['FROM', 'TO'])
export const transactionSource = pgEnum("TransactionSource", ['CONTA_CORRENTE', 'CARTAO_CREDITO', 'DINHEIRO'])
export const transactionType = pgEnum("TransactionType", ['RECORRENTE', 'PARCELADO', 'A_VISTA'])


export const carteiras = pgTable("carteiras", {
	id: text().primaryKey().$defaultFn(() => randomUUID()),
	name: text().notNull(),
	corretora: text().notNull(),
	responsavel: text().notNull(),
	sortOrder: integer("sort_order").default(0).notNull(),
	createdAt: timestamp("created_at", { precision: 3, mode: "date" }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: timestamp("updated_at", { precision: 3, mode: "date" }).notNull().$defaultFn(() => new Date()).$onUpdate(() => new Date()),
}, (table) => [
	uniqueIndex("carteiras_name_key").using("btree", table.name.asc().nullsLast().op("text_ops")),
]);

export const creditCards = pgTable("credit_cards", {
	id: text().primaryKey().$defaultFn(() => randomUUID()),
	name: text().notNull(),
	institution: varchar({ length: 100 }),
	closingDay: integer("closing_day"),
	dueDay: integer("due_day"),
	creditLimit: numeric("credit_limit", { mode: "number", precision: 12, scale:  2 }),
	isActive: boolean("is_active").default(true).notNull(),
	sortOrder: integer("sort_order").default(0).notNull(),
	createdAt: timestamp("created_at", { precision: 3, mode: "date" }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: timestamp("updated_at", { precision: 3, mode: "date" }).notNull().$defaultFn(() => new Date()).$onUpdate(() => new Date()),
});

export const bankAccounts = pgTable("bank_accounts", {
	id: text().primaryKey().$defaultFn(() => randomUUID()),
	name: text().notNull(),
	institution: varchar({ length: 100 }),
	isActive: boolean("is_active").default(true).notNull(),
	sortOrder: integer("sort_order").default(0).notNull(),
	createdAt: timestamp("created_at", { precision: 3, mode: "date" }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: timestamp("updated_at", { precision: 3, mode: "date" }).notNull().$defaultFn(() => new Date()).$onUpdate(() => new Date()),
});

export const months = pgTable("months", {
	id: text().primaryKey().$defaultFn(() => randomUUID()),
	year: integer().notNull(),
	month: integer().notNull(),
	status: monthStatus().default('RASCUNHO').notNull(),
	notes: text(),
	closedAt: timestamp("closed_at", { precision: 3, mode: "date" }),
	bankBalanceAtClose: numeric("bank_balance_at_close", { mode: "number", precision: 12, scale:  2 }),
	creditCardAtClose: numeric("credit_card_at_close", { mode: "number", precision: 12, scale:  2 }),
	investmentBalanceAtClose: numeric("investment_balance_at_close", { mode: "number", precision: 12, scale:  2 }),
	irpfReserveAtClose: numeric("irpf_reserve_at_close", { mode: "number", precision: 12, scale:  2 }),
	createdAt: timestamp("created_at", { precision: 3, mode: "date" }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: timestamp("updated_at", { precision: 3, mode: "date" }).notNull().$defaultFn(() => new Date()).$onUpdate(() => new Date()),
}, (table) => [
	uniqueIndex("months_year_month_key").using("btree", table.year.asc().nullsLast().op("int4_ops"), table.month.asc().nullsLast().op("int4_ops")),
]);

export const distributionGroups = pgTable("distribution_groups", {
	id: text().primaryKey().$defaultFn(() => randomUUID()),
	name: text().notNull(),
	sortOrder: integer("sort_order").default(0).notNull(),
	createdAt: timestamp("created_at", { precision: 3, mode: "date" }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: timestamp("updated_at", { precision: 3, mode: "date" }).notNull().$defaultFn(() => new Date()).$onUpdate(() => new Date()),
});

export const dividendRecords = pgTable("dividend_records", {
	id: text().primaryKey().$defaultFn(() => randomUUID()),
	investmentId: text("investment_id").notNull(),
	ticker: text().notNull(),
	investmentName: text("investment_name").notNull(),
	date: date({ mode: "date" }).notNull(),
	type: dividendType().notNull(),
	grossValue: numeric("gross_value", { mode: "number", precision: 12, scale:  2 }).notNull(),
	taxWithheld: numeric("tax_withheld", { mode: "number", precision: 12, scale:  2 }).default(sql`'0'`).notNull(),
	netValue: numeric("net_value", { mode: "number", precision: 12, scale:  2 }).notNull(),
	createdAt: timestamp("created_at", { precision: 3, mode: "date" }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	quantityAtPayment: numeric("quantity_at_payment", { mode: "number", precision: 18, scale:  8 }),
	ratePerShare: numeric("rate_per_share", { mode: "number", precision: 18, scale:  10 }),
}, (table) => [
	foreignKey({
			columns: [table.investmentId],
			foreignColumns: [investments.id],
			name: "dividend_records_investment_id_fkey"
		}).onUpdate("cascade").onDelete("cascade"),
]);

export const forecastCategories = pgTable("forecast_categories", {
	id: text().primaryKey().$defaultFn(() => randomUUID()),
	categoryId: text("category_id").notNull(),
	createdAt: timestamp("created_at", { precision: 3, mode: "date" }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
	uniqueIndex("forecast_categories_category_id_key").using("btree", table.categoryId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.categoryId],
			foreignColumns: [categories.id],
			name: "forecast_categories_category_id_fkey"
		}).onUpdate("cascade").onDelete("cascade"),
]);

export const investmentOperations = pgTable("investment_operations", {
	id: text().primaryKey().$defaultFn(() => randomUUID()),
	investmentId: text("investment_id").notNull(),
	carteiraId: text("carteira_id"),
	date: date({ mode: "date" }).notNull(),
	type: investmentOperationType().notNull(),
	quantity: numeric({ mode: "number", precision: 18, scale:  8 }).notNull(),
	unitPrice: numeric("unit_price", { mode: "number", precision: 18, scale:  8 }).notNull(),
	total: numeric({ mode: "number", precision: 18, scale:  8 }).notNull(),
	fee: numeric({ mode: "number", precision: 12, scale:  2 }).default(sql`'0'`),
	notes: text(),
	createdAt: timestamp("created_at", { precision: 3, mode: "date" }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	cryptoSwapId: text("crypto_swap_id"),
}, (table) => [
	foreignKey({
			columns: [table.carteiraId],
			foreignColumns: [carteiras.id],
			name: "investment_operations_carteira_id_fkey"
		}).onUpdate("cascade").onDelete("set null"),
	foreignKey({
			columns: [table.cryptoSwapId],
			foreignColumns: [cryptoSwaps.id],
			name: "investment_operations_crypto_swap_id_fkey"
		}).onUpdate("cascade").onDelete("set null"),
	foreignKey({
			columns: [table.investmentId],
			foreignColumns: [investments.id],
			name: "investment_operations_investment_id_fkey"
		}).onUpdate("cascade").onDelete("cascade"),
]);

export const categories = pgTable("Category", {
	id: text().primaryKey().$defaultFn(() => randomUUID()),
	name: text().notNull(),
	color: text().default('#6B7280').notNull(),
	icon: text().default('receipt').notNull(),
	group: text(),
	isReceita: boolean("is_receita").default(false).notNull(),
	defaultType: categoryDefaultType("default_type").default('VARIAVEL').notNull(),
	monthlyGoal: numeric("monthly_goal", { mode: "number", precision: 12, scale:  2 }),
	isArchived: boolean("is_archived").default(false).notNull(),
	isSystemDefault: boolean("is_system_default").default(false).notNull(),
	sortOrder: integer("sort_order").default(0).notNull(),
	createdAt: timestamp("created_at", { precision: 3, mode: "date" }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: timestamp("updated_at", { precision: 3, mode: "date" }).notNull().$defaultFn(() => new Date()).$onUpdate(() => new Date()),
	systemRole: categorySystemRole("system_role"),
}, (table) => [
	uniqueIndex("Category_system_role_key").using("btree", table.systemRole.asc().nullsLast().op("enum_ops")),
]);

export const distributionGroupAssets = pgTable("distribution_group_assets", {
	id: text().primaryKey().$defaultFn(() => randomUUID()),
	groupId: text("group_id").notNull(),
	assetType: investmentAssetType("asset_type").notNull(),
}, (table) => [
	uniqueIndex("distribution_group_assets_asset_type_key").using("btree", table.assetType.asc().nullsLast().op("enum_ops")),
	foreignKey({
			columns: [table.groupId],
			foreignColumns: [distributionGroups.id],
			name: "distribution_group_assets_group_id_fkey"
		}).onUpdate("cascade").onDelete("cascade"),
]);

export const investments = pgTable("investments", {
	id: text().primaryKey().$defaultFn(() => randomUUID()),
	name: text().notNull(),
	ticker: text().notNull(),
	assetType: investmentAssetType("asset_type").default('OUTROS').notNull(),
	currentUnitPrice: numeric("current_unit_price", { mode: "number", precision: 12, scale:  4 }).default(sql`'0'`).notNull(),
	sortOrder: integer("sort_order").default(0).notNull(),
	rentabilidadeType: rentabilidadeType("rentabilidade_type"),
	taxaPercent: numeric("taxa_percent", { mode: "number", precision: 8, scale:  4 }),
	indiceReferencia: text("indice_referencia"),
	balanceOnlyPosition: boolean("balance_only_position").default(false).notNull(),
	createdAt: timestamp("created_at", { precision: 3, mode: "date" }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: timestamp("updated_at", { precision: 3, mode: "date" }).notNull().$defaultFn(() => new Date()).$onUpdate(() => new Date()),
});

export const systemConfig = pgTable("system_config", {
	key: text().primaryKey().notNull(),
	value: text().notNull(),
});

export const vaultSnapshots = pgTable("vault_snapshots", {
	id: text().primaryKey().$defaultFn(() => randomUUID()),
	vaultId: text("vault_id").notNull(),
	monthId: text("month_id").notNull(),
	openingBalance: numeric("opening_balance", { mode: "number", precision: 12, scale:  2 }).notNull(),
	closingBalance: numeric("closing_balance", { mode: "number", precision: 12, scale:  2 }).notNull(),
	totalExpenses: numeric("total_expenses", { mode: "number", precision: 12, scale:  2 }).default(sql`'0'`).notNull(),
	createdAt: timestamp("created_at", { precision: 3, mode: "date" }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
	uniqueIndex("vault_snapshots_vault_id_month_id_key").using("btree", table.vaultId.asc().nullsLast().op("text_ops"), table.monthId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.monthId],
			foreignColumns: [months.id],
			name: "vault_snapshots_month_id_fkey"
		}).onUpdate("cascade").onDelete("cascade"),
	foreignKey({
			columns: [table.vaultId],
			foreignColumns: [vaults.id],
			name: "vault_snapshots_vault_id_fkey"
		}).onUpdate("cascade").onDelete("cascade"),
]);

export const users = pgTable("users", {
	id: text().primaryKey().$defaultFn(() => randomUUID()),
	email: text().notNull(),
	passwordHash: text("password_hash").notNull(),
	name: text(),
	createdAt: timestamp("created_at", { precision: 3, mode: "date" }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: timestamp("updated_at", { precision: 3, mode: "date" }).notNull().$defaultFn(() => new Date()).$onUpdate(() => new Date()),
}, (table) => [
	uniqueIndex("users_email_key").using("btree", table.email.asc().nullsLast().op("text_ops")),
]);

export const vaults = pgTable("vaults", {
	id: text().primaryKey().$defaultFn(() => randomUUID()),
	name: text().notNull(),
	monthlyDeposit: numeric("monthly_deposit", { mode: "number", precision: 12, scale:  2 }).default(sql`'0'`).notNull(),
	initialBalance: numeric("initial_balance", { mode: "number", precision: 12, scale:  2 }).default(sql`'0'`).notNull(),
	sortOrder: integer("sort_order").default(0).notNull(),
	categoryId: text("category_id"),
	createdAt: timestamp("created_at", { precision: 3, mode: "date" }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: timestamp("updated_at", { precision: 3, mode: "date" }).notNull().$defaultFn(() => new Date()).$onUpdate(() => new Date()),
}, (table) => [
	foreignKey({
			columns: [table.categoryId],
			foreignColumns: [categories.id],
			name: "vaults_category_id_fkey"
		}).onUpdate("cascade").onDelete("set null"),
]);

export const cryptoSwaps = pgTable("crypto_swaps", {
	id: text().primaryKey().$defaultFn(() => randomUUID()),
	fromInvestmentId: text("from_investment_id").notNull(),
	toInvestmentId: text("to_investment_id").notNull(),
	date: date({ mode: "date" }).notNull(),
	amountFrom: numeric("amount_from", { mode: "number", precision: 18, scale:  8 }).notNull(),
	amountTo: numeric("amount_to", { mode: "number", precision: 18, scale:  8 }).notNull(),
	feeAmount: numeric("fee_amount", { mode: "number", precision: 18, scale:  8 }).notNull(),
	feeCurrency: swapFeeCurrency("fee_currency").notNull(),
	rateFromTo: numeric("rate_from_to", { mode: "number", precision: 20, scale:  12 }),
	usdcBrlRate: numeric("usdc_brl_rate", { mode: "number", precision: 10, scale:  4 }),
	notes: text(),
	createdAt: timestamp("created_at", { precision: 3, mode: "date" }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
	foreignKey({
			columns: [table.fromInvestmentId],
			foreignColumns: [investments.id],
			name: "crypto_swaps_from_investment_id_fkey"
		}).onUpdate("cascade").onDelete("cascade"),
	foreignKey({
			columns: [table.toInvestmentId],
			foreignColumns: [investments.id],
			name: "crypto_swaps_to_investment_id_fkey"
		}).onUpdate("cascade").onDelete("cascade"),
]);

export const transactions = pgTable("transactions", {
	id: text().primaryKey().$defaultFn(() => randomUUID()),
	monthId: text("month_id").notNull(),
	parceladoGroupId: text("parcelado_group_id"),
	description: text().notNull(),
	transactionDate: date("transaction_date", { mode: "date" }),
	categoryId: text("category_id").notNull(),
	bankAccountId: text("bank_account_id"),
	creditCardId: text("credit_card_id"),
	investmentId: text("investment_id"),
	investmentOperationId: text("investment_operation_id"),
	investmentDate: date("investment_date", { mode: "date" }),
	type: transactionType().notNull(),
	source: transactionSource().default('CONTA_CORRENTE'),
	amountPrevisto: numeric("amount_previsto", { mode: "number", precision: 18, scale:  8 }).default(sql`'0'`).notNull(),
	amountRealizado: numeric("amount_realizado", { mode: "number", precision: 18, scale:  8 }),
	amountReembolso: numeric("amount_reembolso", { mode: "number", precision: 18, scale:  8 }),
	isConciliado: boolean("is_conciliado").default(false).notNull(),
	isAntecipado: boolean("is_antecipado").default(false).notNull(),
	installmentCurrent: integer("installment_current"),
	installmentTotal: integer("installment_total"),
	isLateEntry: boolean("is_late_entry").default(false).notNull(),
	notes: text(),
	createdAt: timestamp("created_at", { precision: 3, mode: "date" }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: timestamp("updated_at", { precision: 3, mode: "date" }).notNull().$defaultFn(() => new Date()).$onUpdate(() => new Date()),
	recurrenceEndsAtMonth: text("recurrence_ends_at_month"),
	recurrenceGroupId: text("recurrence_group_id"),
}, (table) => [
	uniqueIndex("transactions_investment_operation_id_key").using("btree", table.investmentOperationId.asc().nullsLast().op("text_ops")),
	index("transactions_recurrence_group_id_idx").using("btree", table.recurrenceGroupId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.bankAccountId],
			foreignColumns: [bankAccounts.id],
			name: "transactions_bank_account_id_fkey"
		}).onUpdate("cascade").onDelete("set null"),
	foreignKey({
			columns: [table.categoryId],
			foreignColumns: [categories.id],
			name: "transactions_category_id_fkey"
		}).onUpdate("cascade").onDelete("restrict"),
	foreignKey({
			columns: [table.creditCardId],
			foreignColumns: [creditCards.id],
			name: "transactions_credit_card_id_fkey"
		}).onUpdate("cascade").onDelete("set null"),
	foreignKey({
			columns: [table.investmentId],
			foreignColumns: [investments.id],
			name: "transactions_investment_id_fkey"
		}).onUpdate("cascade").onDelete("set null"),
	foreignKey({
			columns: [table.investmentOperationId],
			foreignColumns: [investmentOperations.id],
			name: "transactions_investment_operation_id_fkey"
		}).onUpdate("cascade").onDelete("set null"),
	foreignKey({
			columns: [table.monthId],
			foreignColumns: [months.id],
			name: "transactions_month_id_fkey"
		}).onUpdate("cascade").onDelete("cascade"),
]);

/*
 * Better Auth (núcleo: user, session, account, verification), no formato do OfficeParty.
 * Substituem a tabela `users` (iron-session), que fica no banco como histórico: a migration
 * copia cada usuário para `user` e o hash bcrypt da senha para `account` (provider credential).
 */
export const authUser = pgTable("user", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	email: text("email").notNull().unique(),
	emailVerified: boolean("email_verified").notNull().default(false),
	image: text("image"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const authSession = pgTable("session", {
	id: text("id").primaryKey(),
	expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
	token: text("token").notNull().unique(),
	ipAddress: text("ip_address"),
	userAgent: text("user_agent"),
	userId: text("user_id").notNull().references(() => authUser.id, { onDelete: "cascade" }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [index("idx_session_user").on(t.userId)]);

export const authAccount = pgTable("account", {
	id: text("id").primaryKey(),
	accountId: text("account_id").notNull(),
	providerId: text("provider_id").notNull(),
	userId: text("user_id").notNull().references(() => authUser.id, { onDelete: "cascade" }),
	accessToken: text("access_token"),
	refreshToken: text("refresh_token"),
	idToken: text("id_token"),
	accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true, mode: "date" }),
	refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true, mode: "date" }),
	scope: text("scope"),
	password: text("password"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [index("idx_account_user").on(t.userId)]);

export const authVerification = pgTable("verification", {
	id: text("id").primaryKey(),
	identifier: text("identifier").notNull(),
	value: text("value").notNull(),
	expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [index("idx_verification_identifier").on(t.identifier)]);
