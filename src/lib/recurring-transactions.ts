import { randomUUID } from "crypto";
import { and, asc, eq, gt, gte, inArray, isNotNull, isNull, lt, ne, or, sql, type SQL } from "drizzle-orm";
import type { DbOrTx } from "@/db";
import type { TransactionSource, TransactionType } from "@/db/enums";
import { categories, months, transactions } from "@/db/schema";
import { isBalanceCarryRow } from "./system-categories";


/** Linhas cujo mês (join com months) vem antes/depois de ano-mês. */
function monthBefore(year: number, month: number): SQL {
  return or(lt(months.year, year), and(eq(months.year, year), lt(months.month, month)))!;
}
function monthAfter(year: number, month: number): SQL {
  return or(gt(months.year, year), and(eq(months.year, year), gt(months.month, month)))!;
}
function monthFrom(year: number, month: number): SQL {
  return or(gt(months.year, year), and(eq(months.year, year), gte(months.month, month)))!;
}

export function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function parseMonthKey(key: string): { year: number; month: number } | null {
  const m = key.match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (!Number.isFinite(year) || month < 1 || month > 12) return null;
  return { year, month };
}

/** true se a série não deve existir em targetMonth (YYYY-MM). */
export function isRecurrenceEndedAt(
  endsAtMonth: string | null | undefined,
  targetYear: number,
  targetMonth: number
): boolean {
  if (!endsAtMonth) return false;
  return monthKey(targetYear, targetMonth) >= endsAtMonth;
}

export function effectiveRecurringAmount(tx: {
  amountRealizado?: unknown;
  amountPrevisto?: unknown;
}): number {
  if (tx.amountRealizado != null && Number.isFinite(Number(tx.amountRealizado))) {
    return Number(tx.amountRealizado);
  }
  return Number(tx.amountPrevisto ?? 0);
}

function seriesFingerprint(tx: {
  description: string;
  categoryId: string;
  bankAccountId?: string | null;
  creditCardId?: string | null;
  source?: string | null;
}): string {
  return [
    tx.description.trim().toLowerCase(),
    tx.categoryId,
    tx.bankAccountId ?? "",
    tx.creditCardId ?? "",
    tx.source ?? "CONTA_CORRENTE",
  ].join("|");
}

/**
 * Atribui recurrenceGroupId a RECORRENTE sem grupo, agrupando por fingerprint.
 * Se já existe série ativa com o mesmo fingerprint e sem linha nos mesmos meses,
 * as linhas entram nela (antes viravam uma série nova a cada vez).
 */
export async function backfillRecurrenceGroupIds(db: DbOrTx): Promise<number> {
  const rows = await db
    .select({
      id: transactions.id,
      description: transactions.description,
      categoryId: transactions.categoryId,
      bankAccountId: transactions.bankAccountId,
      creditCardId: transactions.creditCardId,
      source: transactions.source,
      monthId: transactions.monthId,
    })
    .from(transactions)
    .where(and(eq(transactions.type, "RECORRENTE"), isNull(transactions.recurrenceGroupId)))
    .orderBy(asc(transactions.createdAt), asc(transactions.id));

  if (rows.length === 0) return 0;

  const groups = new Map<string, typeof rows>();
  for (const row of rows) {
    const fp = seriesFingerprint(row);
    const list = groups.get(fp) ?? [];
    list.push(row);
    groups.set(fp, list);
  }

  let updated = 0;
  for (const list of Array.from(groups.values())) {
    const groupId = (await findCompatibleActiveGroup(db, list[0], list)) ?? randomUUID();
    await db
      .update(transactions)
      .set({ recurrenceGroupId: groupId })
      .where(inArray(transactions.id, list.map((r) => r.id)));
    updated += list.length;
  }
  return updated;
}

async function findCompatibleActiveGroup(
  db: DbOrTx,
  sample: {
    description: string;
    categoryId: string;
    bankAccountId: string | null;
    creditCardId: string | null;
    source: TransactionSource | null;
  },
  rows: { monthId: string }[]
): Promise<string | null> {
  // Prisma: description equals + mode insensitive. NULL em conta/cartão casa com NULL.
  const candidates = await db
    .select({
      recurrenceGroupId: transactions.recurrenceGroupId,
      monthId: transactions.monthId,
      source: transactions.source,
      createdAt: transactions.createdAt,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.type, "RECORRENTE"),
        isNotNull(transactions.recurrenceGroupId),
        isNull(transactions.recurrenceEndsAtMonth),
        sql`lower(${transactions.description}) = lower(${sample.description.trim()})`,
        eq(transactions.categoryId, sample.categoryId),
        sample.bankAccountId == null ? isNull(transactions.bankAccountId) : eq(transactions.bankAccountId, sample.bankAccountId),
        sample.creditCardId == null ? isNull(transactions.creditCardId) : eq(transactions.creditCardId, sample.creditCardId)
      )
    )
    .orderBy(asc(transactions.createdAt));
  const wantedSource = sample.source ?? "CONTA_CORRENTE";
  const months = new Set(rows.map((r) => r.monthId));
  const byGroup = new Map<string, Set<string>>();
  for (const c of candidates) {
    if ((c.source ?? "CONTA_CORRENTE") !== wantedSource) continue;
    const set = byGroup.get(c.recurrenceGroupId!) ?? new Set<string>();
    set.add(c.monthId);
    byGroup.set(c.recurrenceGroupId!, set);
  }
  for (const [groupId, groupMonths] of Array.from(byGroup.entries())) {
    if (!Array.from(months).some((m) => groupMonths.has(m))) return groupId;
  }
  return null;
}

export async function findExistingRecurringInMonth(
  db: DbOrTx,
  opts: {
    monthId: string;
    recurrenceGroupId?: string | null;
    description: string;
    categoryId: string;
    bankAccountId?: string | null;
    creditCardId?: string | null;
  }
) {
  if (opts.recurrenceGroupId) {
    const [byGroup] = await db
      .select({ id: transactions.id })
      .from(transactions)
      .where(
        and(
          eq(transactions.monthId, opts.monthId),
          eq(transactions.type, "RECORRENTE"),
          eq(transactions.recurrenceGroupId, opts.recurrenceGroupId)
        )
      )
      .limit(1);
    if (byGroup) return byGroup;
  }
  const [byFields] = await db
    .select({ id: transactions.id })
    .from(transactions)
    .where(
      and(
        eq(transactions.monthId, opts.monthId),
        eq(transactions.type, "RECORRENTE"),
        eq(transactions.description, opts.description),
        eq(transactions.categoryId, opts.categoryId),
        opts.bankAccountId == null ? isNull(transactions.bankAccountId) : eq(transactions.bankAccountId, opts.bankAccountId),
        opts.creditCardId == null ? isNull(transactions.creditCardId) : eq(transactions.creditCardId, opts.creditCardId)
      )
    )
    .limit(1);
  return byFields ?? null;
}

/**
 * Copia um lançamento RECORRENTE do mês-fonte para o mês-alvo,
 * usando valor efetivo do fonte e respeitando encerramento da série.
 * A cópia nasce lançada (realizado = valor) e não conciliada: conciliar é o pagamento.
 */
export async function copyRecurringTransactionToMonth(
  db: DbOrTx,
  source: {
    id: string;
    description: string;
    categoryId: string;
    bankAccountId: string | null;
    creditCardId: string | null;
    type: TransactionType;
    source: TransactionSource | null;
    amountPrevisto: unknown;
    amountRealizado: unknown;
    amountReembolso: unknown;
    notes: string | null;
    recurrenceGroupId: string | null;
    recurrenceEndsAtMonth: string | null;
    category?: { name?: string; isReceita?: boolean } | null;
    /** Contador de parcelas (ex.: financiamento 3/420). Só conta quando total > 1. */
    installmentCurrent?: number | null;
    installmentTotal?: number | null;
    /** Mês da linha de origem; sem ele, assume o mês anterior ao alvo. */
    month?: { year: number; month: number } | null;
  },
  target: { id: string; year: number; month: number }
): Promise<"created" | "skipped_exists" | "skipped_ended" | "skipped_not_recurring"> {
  if (source.type !== "RECORRENTE") return "skipped_not_recurring";
  if (isRecurrenceEndedAt(source.recurrenceEndsAtMonth, target.year, target.month)) {
    return "skipped_ended";
  }

  let installment: { current: number; total: number } | null = null;
  if (source.installmentTotal != null && source.installmentTotal > 1 && source.installmentCurrent != null) {
    const step = source.month
      ? (target.year - source.month.year) * 12 + (target.month - source.month.month)
      : 1;
    const current = source.installmentCurrent + step;
    if (current > source.installmentTotal) return "skipped_ended";
    installment = { current, total: source.installmentTotal };
  }

  let groupId = source.recurrenceGroupId;
  if (!groupId) {
    groupId = randomUUID();
    await db.update(transactions).set({ recurrenceGroupId: groupId }).where(eq(transactions.id, source.id));
  }

  const exists = await findExistingRecurringInMonth(db, {
    monthId: target.id,
    recurrenceGroupId: groupId,
    description: source.description,
    categoryId: source.categoryId,
    bankAccountId: source.bankAccountId,
    creditCardId: source.creditCardId,
  });
  if (exists) return "skipped_exists";

  const valor = effectiveRecurringAmount(source);

  await db.insert(transactions).values({
      monthId: target.id,
      description: source.description,
      categoryId: source.categoryId,
      bankAccountId: source.bankAccountId,
      creditCardId: source.creditCardId,
      type: "RECORRENTE",
      source: source.source ?? "CONTA_CORRENTE",
      amountPrevisto: valor,
      amountRealizado: valor,
      amountReembolso: source.amountReembolso != null ? Number(source.amountReembolso) : null,
      isConciliado: false,
      isAntecipado: false,
      notes: source.notes,
      recurrenceGroupId: groupId,
      recurrenceEndsAtMonth: source.recurrenceEndsAtMonth,
      installmentCurrent: installment?.current ?? null,
      installmentTotal: installment?.total ?? null,
      transactionDate: null,
  });
  return "created";
}


/** Colunas da linha-fonte de uma série + categoria e mês (o antigo recurringSourceSelect). */
const recurringSourceColumns = {
  id: transactions.id,
  description: transactions.description,
  categoryId: transactions.categoryId,
  bankAccountId: transactions.bankAccountId,
  creditCardId: transactions.creditCardId,
  type: transactions.type,
  source: transactions.source,
  amountPrevisto: transactions.amountPrevisto,
  amountRealizado: transactions.amountRealizado,
  amountReembolso: transactions.amountReembolso,
  notes: transactions.notes,
  recurrenceGroupId: transactions.recurrenceGroupId,
  recurrenceEndsAtMonth: transactions.recurrenceEndsAtMonth,
  installmentCurrent: transactions.installmentCurrent,
  installmentTotal: transactions.installmentTotal,
  categoryName: categories.name,
  categoryIsReceita: categories.isReceita,
  categorySystemRole: categories.systemRole,
  monthYear: months.year,
  monthMonth: months.month,
};

async function selectRecurringSources(db: DbOrTx, where: SQL | undefined) {
  const rows = await db
    .select(recurringSourceColumns)
    .from(transactions)
    .innerJoin(categories, eq(categories.id, transactions.categoryId))
    .innerJoin(months, eq(months.id, transactions.monthId))
    .where(where);
  return rows.map(({ categoryName, categoryIsReceita, categorySystemRole, monthYear, monthMonth, ...t }) => ({
    ...t,
    category: { name: categoryName, isReceita: categoryIsReceita, systemRole: categorySystemRole },
    month: { year: monthYear, month: monthMonth },
  }));
}

type RecurringSourceRow = Awaited<ReturnType<typeof selectRecurringSources>>[number];

const isBalanceCarry = isBalanceCarryRow;

/**
 * Preenche um mês recém-criado com as séries recorrentes ativas, copiando a linha
 * mais recente de cada série anterior a ele. Só deve rodar quando o mês nasce:
 * num mês existente desfaria o "excluir só este mês".
 */
export async function materializeRecurringIntoMonth(
  db: DbOrTx,
  target: { id: string; year: number; month: number }
): Promise<number> {
  const targetKey = monthKey(target.year, target.month);
  const rows = await selectRecurringSources(
    db,
    and(
      eq(transactions.type, "RECORRENTE"),
      ne(transactions.isAntecipado, true),
      isNotNull(transactions.recurrenceGroupId),
      monthBefore(target.year, target.month)
    )
  );

  const latestByGroup = new Map<string, RecurringSourceRow>();
  for (const row of rows) {
    if (isBalanceCarry(row)) continue;
    const prev = latestByGroup.get(row.recurrenceGroupId!);
    if (!prev || monthKey(row.month.year, row.month.month) > monthKey(prev.month.year, prev.month.month)) {
      latestByGroup.set(row.recurrenceGroupId!, row);
    }
  }

  let created = 0;
  for (const row of Array.from(latestByGroup.values())) {
    if (row.recurrenceEndsAtMonth && targetKey >= row.recurrenceEndsAtMonth) continue;
    const result = await copyRecurringTransactionToMonth(db, row, target);
    if (result === "created") created += 1;
  }
  return created;
}

/**
 * Copia uma série recém-criada para os meses já existentes depois dela,
 * enquanto forem consecutivos (para no primeiro mês que falta).
 */
export async function propagateNewSeriesToExistingMonths(
  db: DbOrTx,
  sourceId: string
): Promise<number> {
  const [source] = await selectRecurringSources(db, eq(transactions.id, sourceId));
  if (!source || source.type !== "RECORRENTE" || isBalanceCarry(source)) return 0;
  if (!source.recurrenceGroupId) {
    source.recurrenceGroupId = randomUUID();
    await db
      .update(transactions)
      .set({ recurrenceGroupId: source.recurrenceGroupId })
      .where(eq(transactions.id, source.id));
  }

  const later = await db
    .select({ id: months.id, year: months.year, month: months.month })
    .from(months)
    .where(monthAfter(source.month.year, source.month.month))
    .orderBy(asc(months.year), asc(months.month));

  let expected = nextMonthOf(source.month.year, source.month.month);
  let created = 0;
  for (const m of later) {
    if (m.year !== expected.year || m.month !== expected.month) break;
    const result = await copyRecurringTransactionToMonth(db, source, m);
    if (result === "created") created += 1;
    expected = nextMonthOf(m.year, m.month);
  }
  return created;
}

function nextMonthOf(year: number, month: number): { year: number; month: number } {
  return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
}

/** Encerra a série a partir de fromMonthKey (YYYY-MM): marca ends e apaga cópias futuras. */
export async function endRecurrenceSeries(
  db: DbOrTx,
  groupId: string,
  fromMonthKey: string
): Promise<{ updated: number; deletedFuture: number }> {
  const parsed = parseMonthKey(fromMonthKey);
  if (!parsed) {
    throw new Error("fromMonth inválido (use YYYY-MM)");
  }

  const updated = await db
    .update(transactions)
    .set({ recurrenceEndsAtMonth: fromMonthKey })
    .where(eq(transactions.recurrenceGroupId, groupId));

  const future = await db
    .select({ id: transactions.id })
    .from(transactions)
    .innerJoin(months, eq(months.id, transactions.monthId))
    .where(
      and(
        eq(transactions.recurrenceGroupId, groupId),
        eq(transactions.type, "RECORRENTE"),
        monthFrom(parsed.year, parsed.month)
      )
    );

  if (future.length > 0) {
    await db.delete(transactions).where(inArray(transactions.id, future.map((f) => f.id)));
  }

  return { updated: updated.rowCount ?? 0, deletedFuture: future.length };
}

/**
 * Propaga novo valor para meses futuros da mesma série (ainda não encerrados).
 * Atualiza previsto e lançado; linhas já conciliadas (pagas) ficam como estão.
 */
export async function propagateRecurringAmountForward(
  db: DbOrTx,
  opts: {
    groupId: string;
    fromYear: number;
    fromMonth: number;
    amount: number;
  }
): Promise<number> {
  const future = (
    await db
      .select({
        id: transactions.id,
        isConciliado: transactions.isConciliado,
        recurrenceEndsAtMonth: transactions.recurrenceEndsAtMonth,
        year: months.year,
        month: months.month,
      })
      .from(transactions)
      .innerJoin(months, eq(months.id, transactions.monthId))
      .where(
        and(
          eq(transactions.recurrenceGroupId, opts.groupId),
          eq(transactions.type, "RECORRENTE"),
          monthAfter(opts.fromYear, opts.fromMonth)
        )
      )
  ).map(({ year, month, ...r }) => ({ ...r, month: { year, month } }));

  let count = 0;
  for (const row of future) {
    if (row.isConciliado) continue;
    if (isRecurrenceEndedAt(row.recurrenceEndsAtMonth, row.month.year, row.month.month)) {
      continue;
    }
    await db
      .update(transactions)
      .set({ amountPrevisto: opts.amount, amountRealizado: opts.amount })
      .where(eq(transactions.id, row.id));
    count += 1;
  }
  return count;
}
