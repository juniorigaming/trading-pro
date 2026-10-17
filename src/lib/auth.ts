/**
 * Autenticação simples por senha única (single-user).
 *
 *  - Ativa automaticamente quando a variável/secret `APP_PASSWORD` existe no ambiente
 *    (Cloudflare → Workers & Pages → projeto → Settings → Variables and Secrets).
 *  - Sem `APP_PASSWORD` o app continua aberto (comportamento anterior) e a tela de
 *    Configurações mostra um aviso.
 *  - O cookie de sessão é um HMAC-SHA256 derivado da senha (Web Crypto, roda no Worker e no
 *    middleware). Trocar a senha invalida todas as sessões.
 *
 * Nada aqui depende de Node (fs, crypto nativo) para poder rodar no middleware (edge).
 */

export const SESSION_COOKIE = "tp_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 dias
const SESSION_LABEL = "trading-pro-session-v1";

/** Senha configurada (process.env é populado pelo OpenNext antes de cada request). */
export function getAppPassword(): string | null {
  const v = typeof process !== "undefined" ? process.env.APP_PASSWORD : undefined;
  return v && v.trim().length > 0 ? v : null;
}

export function isAuthEnabled(): boolean {
  return getAppPassword() !== null;
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Token de sessão derivado da senha. Mesmo token enquanto a senha não mudar. */
export async function sessionTokenFor(password: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(password), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(SESSION_LABEL));
  return toHex(sig);
}

/** Comparação em tempo constante (evita timing attack trivial). */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) {
      const value = rest.join("=");
      try { return decodeURIComponent(value); } catch { return value; }
    }
  }
  return null;
}

/** Verifica se o request carrega uma sessão válida. `true` também quando a auth está desligada. */
export async function hasValidSession(request: Request): Promise<boolean> {
  const pwd = getAppPassword();
  if (!pwd) return true;
  const cookie = readCookie(request.headers.get("cookie"), SESSION_COOKIE);
  if (!cookie) return false;
  const expected = await sessionTokenFor(pwd);
  return safeEqual(cookie, expected);
}

export function sessionCookieHeader(token: string, secure: boolean): string {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE}${secure ? "; Secure" : ""}`;
}

export function clearSessionCookieHeader(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

/** Caminhos que nunca exigem login. */
export function isPublicPath(pathname: string): boolean {
  if (pathname === "/login" || pathname === "/login/") return true;
  if (pathname.startsWith("/api/auth/")) return true;
  if (pathname === "/api/health") return true;
  if (pathname.startsWith("/_next/")) return true;
  if (pathname === "/favicon.ico" || pathname === "/manifest.webmanifest" || pathname === "/sw.js" || pathname === "/offline.html" || pathname.startsWith("/icons/")) return true;
  return false;
}
