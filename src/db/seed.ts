import { count } from "drizzle-orm";
import { db } from "./index";
import type { InvestmentAssetType } from "./enums";
import { authUser, bankAccounts, categories, distributionGroupAssets, distributionGroups } from "./schema";
import { createPasswordUser } from "../lib/auth";
import { ensureSystemCategory } from "../lib/system-categories";

async function countRows(table: typeof authUser | typeof categories | typeof bankAccounts | typeof distributionGroups) {
  const [row] = await db.select({ n: count() }).from(table);
  return row.n;
}

/** Padrão: Bitcoin e USDC no mesmo grupo internacional (distribuição). */
const DEFAULT_DISTRIBUTION_GROUPS: Array<{
  name: string;
  sortOrder: number;
  assetTypes: InvestmentAssetType[];
}> = [
  { name: "Internacional (BTC, USDC)", sortOrder: 0, assetTypes: ["BITCOIN", "USDC"] },
  { name: "Renda fixa", sortOrder: 1, assetTypes: ["RENDA_FIXA"] },
  { name: "Poupança e caixinhas", sortOrder: 2, assetTypes: ["POUPANCA_CAIXINHA"] },
  { name: "Ações", sortOrder: 3, assetTypes: ["ACOES"] },
  { name: "FII", sortOrder: 4, assetTypes: ["FII"] },
  { name: "ETF", sortOrder: 5, assetTypes: ["ETF"] },
  { name: "Outros", sortOrder: 6, assetTypes: ["OUTROS"] },
];

/**
 * Usuário inicial opcional: com SEED_ADMIN_EMAIL e SEED_ADMIN_PASSWORD, o seed cria o
 * usuário; sem eles, o primeiro acesso é pela tela /setup.
 */
const SEED_ADMIN = {
  email: process.env.SEED_ADMIN_EMAIL?.trim(),
  password: process.env.SEED_ADMIN_PASSWORD,
  name: process.env.SEED_ADMIN_NAME?.trim() || "Admin",
};

const DEFAULT_CATEGORIES = [
  { name: "Mercado", color: "#10B981", icon: "shopping-cart", defaultType: "VARIAVEL" as const, isReceita: false },
  { name: "Habitação", color: "#6366F1", icon: "home", defaultType: "FIXO" as const },
  { name: "Saúde", color: "#EC4899", icon: "heart", defaultType: "VARIAVEL" as const },
  { name: "Transporte", color: "#3B82F6", icon: "car", defaultType: "VARIAVEL" as const },
  { name: "Gasolina", color: "#F59E0B", icon: "fuel", defaultType: "VARIAVEL" as const },
  { name: "Despesas Pessoais", color: "#8B5CF6", icon: "user", defaultType: "VARIAVEL" as const },
  { name: "Lazer", color: "#14B8A6", icon: "film", defaultType: "VARIAVEL" as const },
  { name: "Restaurantes", color: "#F97316", icon: "utensils", defaultType: "VARIAVEL" as const },
  { name: "Assinaturas", color: "#06B6D4", icon: "credit-card", defaultType: "RECORRENTE" as const },
  { name: "Pets", color: "#84CC16", icon: "paw", defaultType: "VARIAVEL" as const },
  { name: "Casa", color: "#A855F7", icon: "home", defaultType: "VARIAVEL" as const },
  { name: "Viagens", color: "#0EA5E9", icon: "plane", defaultType: "VARIAVEL" as const },
  { name: "Doações", color: "#22C55E", icon: "gift", defaultType: "VARIAVEL" as const },
  { name: "Investimentos", color: "#059669", icon: "trending-up", defaultType: "FIXO" as const, systemRole: "INVESTIMENTOS" as const },
  { name: "IRPF", color: "#DC2626", icon: "file-text", defaultType: "VARIAVEL" as const },
  { name: "Pedágio", color: "#64748B", icon: "road", defaultType: "VARIAVEL" as const },
  { name: "Presentes", color: "#F43F5E", icon: "gift", defaultType: "VARIAVEL" as const },
  { name: "Hospedagem", color: "#0D9488", icon: "building", defaultType: "VARIAVEL" as const },
  { name: "Equipamentos", color: "#78716C", icon: "cpu", defaultType: "VARIAVEL" as const },
  // Receitas
  { name: "Salário", color: "#22C55E", icon: "briefcase", defaultType: "FIXO" as const, isReceita: true },
  { name: "Benefícios", color: "#10B981", icon: "gift", defaultType: "VARIAVEL" as const, isReceita: true },
  // "Receita" é a categoria padrão das receitas criadas pela tela de Receitas.
  { name: "Receita", color: "#14B8A6", icon: "plus", defaultType: "VARIAVEL" as const, isReceita: true, systemRole: "RECEITA_PADRAO" as const },
];

async function main() {
  console.log("Seeding database...");

  const existingUsers = await countRows(authUser);
  if (existingUsers === 0) {
    if (SEED_ADMIN.email && SEED_ADMIN.password) {
      await createPasswordUser({ email: SEED_ADMIN.email, password: SEED_ADMIN.password, name: SEED_ADMIN.name });
      console.log("Usuário inicial criado:", SEED_ADMIN.email.toLowerCase());
    } else {
      console.log("Nenhum usuário ainda: crie o primeiro em /setup (ou defina SEED_ADMIN_EMAIL e SEED_ADMIN_PASSWORD).");
    }
  }

  const existingCategories = await countRows(categories);
  if (existingCategories === 0) {
    await db.insert(categories).values(
      DEFAULT_CATEGORIES.map((c, i) => ({
        name: c.name,
        color: c.color,
        icon: c.icon,
        defaultType: c.defaultType,
        isReceita: "isReceita" in c ? c.isReceita : false,
        systemRole: "systemRole" in c ? c.systemRole : null,
        isSystemDefault: true,
        sortOrder: i + 1,
      }))
    );
    console.log("Default categories created.");
  } else {
    // Banco que já tinha categorias: garante a de receitas padrão (adota a "Receita" antiga, se houver).
    await ensureSystemCategory(db, "RECEITA_PADRAO");
  }

  const existingBankAccounts = await countRows(bankAccounts);
  if (existingBankAccounts === 0) {
    await db.insert(bankAccounts).values([
      { name: "Conta Corrente Principal", institution: null, sortOrder: 0 },
      { name: "Poupança", institution: null, sortOrder: 1 },
      { name: "Carteira", institution: null, sortOrder: 2 },
    ]);
    console.log("Default bank accounts created.");
  }

  const existingDistGroups = await countRows(distributionGroups);
  if (existingDistGroups === 0) {
    for (const g of DEFAULT_DISTRIBUTION_GROUPS) {
      const [group] = await db
        .insert(distributionGroups)
        .values({ name: g.name, sortOrder: g.sortOrder })
        .returning();
      await db.insert(distributionGroupAssets).values(g.assetTypes.map((assetType) => ({ groupId: group.id, assetType })));
    }
    console.log("Distribution groups (portfólio) seeded.");
  }

  console.log("Seed completed.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .then(() => process.exit(0));
