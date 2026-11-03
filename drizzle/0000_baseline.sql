CREATE TYPE "public"."CategoryDefaultType" AS ENUM('FIXO', 'VARIAVEL', 'RECORRENTE', 'COFRE');--> statement-breakpoint
CREATE TYPE "public"."CategorySystemRole" AS ENUM('RECEITA_PADRAO', 'SALDO_FECHAMENTO', 'INVESTIMENTOS');--> statement-breakpoint
CREATE TYPE "public"."DividendType" AS ENUM('DIVIDEND', 'JCP', 'RENDIMENTO');--> statement-breakpoint
CREATE TYPE "public"."InvestmentAssetType" AS ENUM('RENDA_FIXA', 'POUPANCA_CAIXINHA', 'ACOES', 'FII', 'ETF', 'BITCOIN', 'USDC', 'OUTROS');--> statement-breakpoint
CREATE TYPE "public"."InvestmentOperationType" AS ENUM('BUY', 'SELL', 'SUBSCRIPTION', 'BONUS', 'DIVIDEND');--> statement-breakpoint
CREATE TYPE "public"."MonthStatus" AS ENUM('RASCUNHO', 'ATIVO', 'FECHADO');--> statement-breakpoint
CREATE TYPE "public"."RentabilidadeType" AS ENUM('PRE_FIXADO', 'POS_FIXADO');--> statement-breakpoint
CREATE TYPE "public"."SwapFeeCurrency" AS ENUM('FROM', 'TO');--> statement-breakpoint
CREATE TYPE "public"."TransactionSource" AS ENUM('CONTA_CORRENTE', 'CARTAO_CREDITO', 'DINHEIRO');--> statement-breakpoint
CREATE TYPE "public"."TransactionType" AS ENUM('RECORRENTE', 'PARCELADO', 'A_VISTA');--> statement-breakpoint
CREATE TABLE "bank_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"institution" varchar(100),
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp (3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "carteiras" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"corretora" text NOT NULL,
	"responsavel" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp (3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Category" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"color" text DEFAULT '#6B7280' NOT NULL,
	"icon" text DEFAULT 'receipt' NOT NULL,
	"group" text,
	"is_receita" boolean DEFAULT false NOT NULL,
	"default_type" "CategoryDefaultType" DEFAULT 'VARIAVEL' NOT NULL,
	"monthly_goal" numeric(12, 2),
	"is_archived" boolean DEFAULT false NOT NULL,
	"is_system_default" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp (3) NOT NULL,
	"system_role" "CategorySystemRole"
);
--> statement-breakpoint
CREATE TABLE "credit_cards" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"institution" varchar(100),
	"closing_day" integer,
	"due_day" integer,
	"credit_limit" numeric(12, 2),
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp (3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crypto_swaps" (
	"id" text PRIMARY KEY NOT NULL,
	"from_investment_id" text NOT NULL,
	"to_investment_id" text NOT NULL,
	"date" date NOT NULL,
	"amount_from" numeric(18, 8) NOT NULL,
	"amount_to" numeric(18, 8) NOT NULL,
	"fee_amount" numeric(18, 8) NOT NULL,
	"fee_currency" "SwapFeeCurrency" NOT NULL,
	"rate_from_to" numeric(20, 12),
	"usdc_brl_rate" numeric(10, 4),
	"notes" text,
	"created_at" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "distribution_group_assets" (
	"id" text PRIMARY KEY NOT NULL,
	"group_id" text NOT NULL,
	"asset_type" "InvestmentAssetType" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "distribution_groups" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp (3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dividend_records" (
	"id" text PRIMARY KEY NOT NULL,
	"investment_id" text NOT NULL,
	"ticker" text NOT NULL,
	"investment_name" text NOT NULL,
	"date" date NOT NULL,
	"type" "DividendType" NOT NULL,
	"gross_value" numeric(12, 2) NOT NULL,
	"tax_withheld" numeric(12, 2) DEFAULT '0' NOT NULL,
	"net_value" numeric(12, 2) NOT NULL,
	"created_at" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"quantity_at_payment" numeric(18, 8),
	"rate_per_share" numeric(18, 10)
);
--> statement-breakpoint
CREATE TABLE "forecast_categories" (
	"id" text PRIMARY KEY NOT NULL,
	"category_id" text NOT NULL,
	"created_at" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "investment_operations" (
	"id" text PRIMARY KEY NOT NULL,
	"investment_id" text NOT NULL,
	"carteira_id" text,
	"date" date NOT NULL,
	"type" "InvestmentOperationType" NOT NULL,
	"quantity" numeric(18, 8) NOT NULL,
	"unit_price" numeric(18, 8) NOT NULL,
	"total" numeric(18, 8) NOT NULL,
	"fee" numeric(12, 2) DEFAULT '0',
	"notes" text,
	"created_at" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"crypto_swap_id" text
);
--> statement-breakpoint
CREATE TABLE "investments" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"ticker" text NOT NULL,
	"asset_type" "InvestmentAssetType" DEFAULT 'OUTROS' NOT NULL,
	"current_unit_price" numeric(12, 4) DEFAULT '0' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"rentabilidade_type" "RentabilidadeType",
	"taxa_percent" numeric(8, 4),
	"indice_referencia" text,
	"balance_only_position" boolean DEFAULT false NOT NULL,
	"created_at" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp (3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "months" (
	"id" text PRIMARY KEY NOT NULL,
	"year" integer NOT NULL,
	"month" integer NOT NULL,
	"status" "MonthStatus" DEFAULT 'RASCUNHO' NOT NULL,
	"notes" text,
	"closed_at" timestamp (3),
	"bank_balance_at_close" numeric(12, 2),
	"credit_card_at_close" numeric(12, 2),
	"investment_balance_at_close" numeric(12, 2),
	"irpf_reserve_at_close" numeric(12, 2),
	"created_at" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp (3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "system_config" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"month_id" text NOT NULL,
	"parcelado_group_id" text,
	"description" text NOT NULL,
	"transaction_date" date,
	"category_id" text NOT NULL,
	"bank_account_id" text,
	"credit_card_id" text,
	"investment_id" text,
	"investment_operation_id" text,
	"investment_date" date,
	"type" "TransactionType" NOT NULL,
	"source" "TransactionSource" DEFAULT 'CONTA_CORRENTE',
	"amount_previsto" numeric(18, 8) DEFAULT '0' NOT NULL,
	"amount_realizado" numeric(18, 8),
	"amount_reembolso" numeric(18, 8),
	"is_conciliado" boolean DEFAULT false NOT NULL,
	"is_antecipado" boolean DEFAULT false NOT NULL,
	"installment_current" integer,
	"installment_total" integer,
	"is_late_entry" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_at" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp (3) NOT NULL,
	"recurrence_ends_at_month" text,
	"recurrence_group_id" text
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"name" text,
	"created_at" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp (3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vault_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"vault_id" text NOT NULL,
	"month_id" text NOT NULL,
	"opening_balance" numeric(12, 2) NOT NULL,
	"closing_balance" numeric(12, 2) NOT NULL,
	"total_expenses" numeric(12, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vaults" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"monthly_deposit" numeric(12, 2) DEFAULT '0' NOT NULL,
	"initial_balance" numeric(12, 2) DEFAULT '0' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"category_id" text,
	"created_at" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp (3) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "crypto_swaps" ADD CONSTRAINT "crypto_swaps_from_investment_id_fkey" FOREIGN KEY ("from_investment_id") REFERENCES "public"."investments"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "crypto_swaps" ADD CONSTRAINT "crypto_swaps_to_investment_id_fkey" FOREIGN KEY ("to_investment_id") REFERENCES "public"."investments"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "distribution_group_assets" ADD CONSTRAINT "distribution_group_assets_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."distribution_groups"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "dividend_records" ADD CONSTRAINT "dividend_records_investment_id_fkey" FOREIGN KEY ("investment_id") REFERENCES "public"."investments"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "forecast_categories" ADD CONSTRAINT "forecast_categories_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."Category"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "investment_operations" ADD CONSTRAINT "investment_operations_carteira_id_fkey" FOREIGN KEY ("carteira_id") REFERENCES "public"."carteiras"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "investment_operations" ADD CONSTRAINT "investment_operations_crypto_swap_id_fkey" FOREIGN KEY ("crypto_swap_id") REFERENCES "public"."crypto_swaps"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "investment_operations" ADD CONSTRAINT "investment_operations_investment_id_fkey" FOREIGN KEY ("investment_id") REFERENCES "public"."investments"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_bank_account_id_fkey" FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."Category"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_credit_card_id_fkey" FOREIGN KEY ("credit_card_id") REFERENCES "public"."credit_cards"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_investment_id_fkey" FOREIGN KEY ("investment_id") REFERENCES "public"."investments"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_investment_operation_id_fkey" FOREIGN KEY ("investment_operation_id") REFERENCES "public"."investment_operations"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_month_id_fkey" FOREIGN KEY ("month_id") REFERENCES "public"."months"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "vault_snapshots" ADD CONSTRAINT "vault_snapshots_month_id_fkey" FOREIGN KEY ("month_id") REFERENCES "public"."months"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "vault_snapshots" ADD CONSTRAINT "vault_snapshots_vault_id_fkey" FOREIGN KEY ("vault_id") REFERENCES "public"."vaults"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "vaults" ADD CONSTRAINT "vaults_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."Category"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX "carteiras_name_key" ON "carteiras" USING btree ("name" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "Category_system_role_key" ON "Category" USING btree ("system_role" enum_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "distribution_group_assets_asset_type_key" ON "distribution_group_assets" USING btree ("asset_type" enum_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "forecast_categories_category_id_key" ON "forecast_categories" USING btree ("category_id" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "months_year_month_key" ON "months" USING btree ("year" int4_ops,"month" int4_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "transactions_investment_operation_id_key" ON "transactions" USING btree ("investment_operation_id" text_ops);--> statement-breakpoint
CREATE INDEX "transactions_recurrence_group_id_idx" ON "transactions" USING btree ("recurrence_group_id" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_key" ON "users" USING btree ("email" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "vault_snapshots_vault_id_month_id_key" ON "vault_snapshots" USING btree ("vault_id" text_ops,"month_id" text_ops);