/**
 * Sessão do usuário no servidor. Mantém o formato antigo ({ userId, email, name }) para as
 * rotas que já checavam `session.userId`; por baixo, lê a sessão do Better Auth.
 */
import { headers } from "next/headers";
import { getAuth } from "@/lib/auth";

export interface SessionData {
  userId?: string;
  email?: string;
  name?: string;
}

export async function getSession(): Promise<SessionData> {
  const result = await getAuth().api.getSession({ headers: await headers() });
  if (!result) return {};
  return { userId: result.user.id, email: result.user.email, name: result.user.name ?? undefined };
}
