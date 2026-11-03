import { and, asc, eq, isNull } from "drizzle-orm";
import type { DbOrTx } from "@/db";
import type { CategorySystemRole } from "@/db/enums";
import { categories } from "@/db/schema";

type Db = DbOrTx;

/** Nota gravada no lançamento de saldo inicial criado pelo fechamento do mês. */
export const AUTO_BALANCE_CARRY_NOTE = "[AUTO_SALDO_FECHAMENTO]";

interface RoleDefaults {
  /** Nome usado quando o app precisa criar a categoria, e nome procurado em bancos antigos. */
  name: string;
  isReceita: boolean;
  color: string;
  icon: string;
  defaultType: "FIXO" | "VARIAVEL";
}

const ROLE_DEFAULTS: Record<CategorySystemRole, RoleDefaults> = {
  RECEITA_PADRAO: { name: "Receita", isReceita: true, color: "#22C55E", icon: "briefcase", defaultType: "VARIAVEL" },
  SALDO_FECHAMENTO: { name: "Saldo Bancario", isReceita: true, color: "#16A34A", icon: "landmark", defaultType: "FIXO" },
  INVESTIMENTOS: { name: "Investimentos", isReceita: false, color: "#059669", icon: "trending-up", defaultType: "FIXO" },
};

/**
 * Categoria que cumpre um papel do sistema. Procura pelo papel; se não houver, adota a
 * categoria antiga com o nome que o código usava (e grava o papel nela); se também não
 * houver, cria. O usuário pode renomear a categoria sem quebrar nada.
 */
export async function ensureSystemCategory(db: Db, role: CategorySystemRole) {
  const [byRole] = await db.select().from(categories).where(eq(categories.systemRole, role)).limit(1);
  if (byRole) return byRole;

  const def = ROLE_DEFAULTS[role];
  const [legacy] = await db
    .select()
    .from(categories)
    .where(and(eq(categories.name, def.name), eq(categories.isReceita, def.isReceita), isNull(categories.systemRole)))
    .orderBy(asc(categories.createdAt), asc(categories.id))
    .limit(1);
  if (legacy) {
    const [adopted] = await db
      .update(categories)
      .set({ systemRole: role })
      .where(eq(categories.id, legacy.id))
      .returning();
    return adopted;
  }

  const [created] = await db
    .insert(categories)
    .values({
      name: def.name,
      color: def.color,
      icon: def.icon,
      defaultType: def.defaultType,
      isReceita: def.isReceita,
      isSystemDefault: true,
      sortOrder: 0,
      systemRole: role,
    })
    .returning();
  return created;
}

/** Lançamento de saldo inicial gerado pelo fechamento (pela nota ou pela categoria). */
export function isBalanceCarryRow(row: {
  notes: string | null;
  category: { systemRole: CategorySystemRole | null } | null;
}): boolean {
  return row.notes === AUTO_BALANCE_CARRY_NOTE || row.category?.systemRole === "SALDO_FECHAMENTO";
}
