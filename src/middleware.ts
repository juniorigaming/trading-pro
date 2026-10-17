/**
 * Portão de autenticação (ver src/lib/auth.ts).
 *  - Sem APP_PASSWORD → não faz nada (app aberto).
 *  - Página sem sessão → redireciona para /login?next=...
 *  - /api sem sessão → 401 JSON.
 */
import { NextResponse, type NextRequest } from "next/server";
import { getAppPassword, hasValidSession, isPublicPath } from "@/lib/auth";

export async function middleware(request: NextRequest) {
  if (!getAppPassword()) return NextResponse.next();
  const { pathname, search } = request.nextUrl;
  if (isPublicPath(pathname)) return NextResponse.next();
  if (await hasValidSession(request)) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Não autorizado — faça login" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  url.searchParams.set("next", pathname + (search || ""));
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icons/|manifest.webmanifest).*)"],
};
