import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getCookieCache, getSessionCookie } from "better-auth/cookies";
import { resolveAuthSecret } from "@/lib/auth-secret";

/** Abertas sem sessão. /setup só funciona com o banco sem usuários (a rota confere). */
const PUBLIC_PAGES = ["/login", "/setup"];

/**
 * Sessão válida? Confere sem tocar no banco sempre que dá:
 * 1. sem cookie de sessão → não;
 * 2. cookie de cache assinado e dentro da validade → sim (checagem criptográfica, sem rede);
 * 3. senão, pergunta ao Better Auth (/api/auth/get-session), que confere no banco e
 *    devolve um cache novo — repassado ao navegador pelos set-cookie.
 * Só a presença do cookie nunca basta: daria para forjar.
 */
async function checkSession(request: NextRequest): Promise<{ ok: boolean; setCookies: string[] }> {
  if (!getSessionCookie(request)) return { ok: false, setCookies: [] };
  // Atrás de proxy (Hostinger) o app pode ver http mesmo com o site em https; o nome do cookie
  // (com ou sem o prefixo __Secure-) depende do BETTER_AUTH_URL, então tenta os dois.
  const secret = resolveAuthSecret();
  for (const isSecure of [true, false]) {
    try {
      const cached = await getCookieCache(request, { secret, isSecure });
      if (cached?.session) return { ok: true, setCookies: [] };
    } catch {
      /* cache inválido ou adulterado: confere no servidor */
    }
  }
  try {
    const base = process.env.BETTER_AUTH_URL?.trim() || request.nextUrl.origin;
    const res = await fetch(new URL("/api/auth/get-session", base), {
      headers: { cookie: request.headers.get("cookie") ?? "" },
      cache: "no-store",
    });
    const data = res.ok ? ((await res.json()) as { session?: unknown } | null) : null;
    return { ok: Boolean(data?.session), setCookies: res.headers.getSetCookie?.() ?? [] };
  } catch {
    return { ok: false, setCookies: [] };
  }
}

function withCookies(res: NextResponse, setCookies: string[]) {
  for (const c of setCookies) res.headers.append("set-cookie", c);
  return res;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isApi = pathname.startsWith("/api/");
  const isPublicPage = PUBLIC_PAGES.some((p) => pathname === p || pathname.startsWith(p + "/"));
  const { ok, setCookies } = await checkSession(request);

  if (pathname === "/" || isPublicPage) {
    if (ok && (pathname === "/" || pathname === "/login")) {
      return withCookies(NextResponse.redirect(new URL("/dashboard", request.url)), setCookies);
    }
    if (pathname === "/") return NextResponse.redirect(new URL("/login", request.url));
    return withCookies(NextResponse.next(), setCookies);
  }

  if (!ok) {
    if (isApi) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    const url = new URL("/login", request.url);
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }
  return withCookies(NextResponse.next(), setCookies);
}

export const config = {
  // Toda a API exige sessão, exceto /api/auth/* (Better Auth e /me), /api/health/* e /api/setup.
  matcher: ["/", "/login", "/setup", "/dashboard/:path*", "/api/((?!auth/|health/|setup).*)"],
};
