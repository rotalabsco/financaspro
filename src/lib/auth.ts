/**
 * Autenticação (Better Auth + Drizzle), no padrão do OfficeParty.
 *
 * - Senhas em bcrypt: os hashes da tabela antiga `users` foram copiados como estão, então
 *   a senha de quem já usava o app continua valendo.
 * - Sem cadastro público: o primeiro usuário nasce em /setup (só com o banco sem usuários)
 *   ou pelo seed; os demais, pelo helper createPasswordUser.
 * - Sessão no banco (revogável) + cookie de cache assinado, que o proxy (src/proxy.ts) valida sem banco.
 */
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import bcrypt from "bcryptjs";
import { db } from "@/db";
import { authAccount, authSession, authUser, authVerification } from "@/db/schema";
import { resolveAuthSecret } from "@/lib/auth-secret";

/**
 * Validade do cookie de cache da sessão. O proxy confia nele sem ir ao banco por esse
 * tempo; é também o atraso máximo para um logout valer contra um cookie copiado.
 */
export const SESSION_CACHE_SECONDS = 60;

function createAuth() {
  return betterAuth({
    baseURL: process.env.BETTER_AUTH_URL,
    secret: resolveAuthSecret(),
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: { user: authUser, session: authSession, account: authAccount, verification: authVerification },
    }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: 8,
      password: {
        hash: (password) => bcrypt.hash(password, 10),
        verify: ({ hash, password }) => bcrypt.compare(password, hash),
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7, // 7 dias, como a sessão antiga
      cookieCache: { enabled: true, maxAge: SESSION_CACHE_SECONDS },
    },
    rateLimit: {
      enabled: process.env.NODE_ENV === "production" || process.env.AUTH_RATE_LIMIT === "true",
      window: 60,
      max: 100,
      customRules: {
        "/sign-in/email": { window: 60, max: 5 },
        "/change-password": { window: 60, max: 5 },
      },
    },
    plugins: [nextCookies()],
  });
}

type Auth = ReturnType<typeof createAuth>;
let instance: Auth | null = null;

/** Instância criada no primeiro uso: importar o módulo não exige banco (ex.: next build). */
export function getAuth(): Auth {
  instance ??= createAuth();
  return instance;
}

export class UserAlreadyExistsError extends Error {}

/** Cria usuário com e-mail e senha (o cadastro público fica desligado). */
export async function createPasswordUser(input: { email: string; password: string; name: string }) {
  const ctx = await getAuth().$context;
  const email = input.email.trim().toLowerCase();
  if (await ctx.internalAdapter.findUserByEmail(email)) throw new UserAlreadyExistsError(email);
  const created = await ctx.internalAdapter.createUser({ email, name: input.name, emailVerified: true }, { method: "admin" });
  await ctx.internalAdapter.linkAccount({
    userId: created.id,
    providerId: "credential",
    accountId: created.id,
    password: await ctx.password.hash(input.password),
  });
  return created;
}
