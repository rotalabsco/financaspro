/**
 * Segredo do Better Auth. Sem dependências de Node: usado também pelo proxy (src/proxy.ts),
 * que valida o cookie de cache assinado da sessão com ele.
 */
/** Placeholder antigo do .env.example: aceitá-lo deixaria a sessão forjável. */
const KNOWN_PLACEHOLDERS = new Set(["sua-chave-secreta-min-32-caracteres-aqui!!"]);
const DEV_SECRET = "financaspro-dev-secret-nao-use-em-producao-0000";

export function resolveAuthSecret(): string {
  const secret = (process.env.BETTER_AUTH_SECRET ?? process.env.SESSION_SECRET)?.trim();
  if (secret && secret.length >= 32 && !KNOWN_PLACEHOLDERS.has(secret)) return secret;
  if (process.env.NODE_ENV === "production" && process.env.NEXT_PHASE !== "phase-production-build") {
    throw new Error(
      "BETTER_AUTH_SECRET (ou SESSION_SECRET) ausente, curto ou de exemplo. Gere com: openssl rand -base64 48"
    );
  }
  return DEV_SECRET;
}
