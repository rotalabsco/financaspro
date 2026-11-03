/**
 * Enums do banco como objetos e tipos, no lugar dos que vinham de @prisma/client
 * (`MonthStatus.FECHADO`, `TransactionType.RECORRENTE`...). Os valores saem do schema.
 */
import {
  categoryDefaultType,
  categorySystemRole,
  investmentAssetType,
  investmentOperationType,
  monthStatus,
  transactionSource,
  transactionType,
} from "./schema";

type EnumObject<T extends readonly string[]> = { readonly [K in T[number]]: K };

function toEnum<T extends readonly [string, ...string[]]>(values: T): EnumObject<T> {
  return Object.fromEntries(values.map((v) => [v, v])) as EnumObject<T>;
}

export const MonthStatus = toEnum(monthStatus.enumValues);
export type MonthStatus = (typeof monthStatus.enumValues)[number];

export const TransactionType = toEnum(transactionType.enumValues);
export type TransactionType = (typeof transactionType.enumValues)[number];

export const TransactionSource = toEnum(transactionSource.enumValues);
export type TransactionSource = (typeof transactionSource.enumValues)[number];

export const InvestmentAssetType = toEnum(investmentAssetType.enumValues);
export type InvestmentAssetType = (typeof investmentAssetType.enumValues)[number];

export const InvestmentOperationType = toEnum(investmentOperationType.enumValues);
export type InvestmentOperationType = (typeof investmentOperationType.enumValues)[number];

export const CategorySystemRole = toEnum(categorySystemRole.enumValues);
export type CategorySystemRole = (typeof categorySystemRole.enumValues)[number];

export const CategoryDefaultType = toEnum(categoryDefaultType.enumValues);
export type CategoryDefaultType = (typeof categoryDefaultType.enumValues)[number];
