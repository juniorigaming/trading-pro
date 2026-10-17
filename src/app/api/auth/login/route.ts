import { getAppPassword, safeEqual, sessionCookieHeader, sessionTokenFor } from "@/lib/auth";

export const dynamic = "force-dynamic";

const attempts = new Map<string, { n: number; until: number }>();

/** Rate limit simples por IP: 8 tentativas por 10 min (memória do isolate — suficiente para uso pessoal). */
function throttled(ip: string): boolean {
  const now = Date.now();
  const a = attempts.get(ip);
  if (a && a.until > now && a.n >= 8) return true;
  if (!a || a.until <= now) attempts.set(ip, { n: 1, until: now + 10 * 60_000 });
  else a.n += 1;
  return false;
}

export async function POST(request: Request) {
  const pwd = getAppPassword();
  if (!pwd) return Response.json({ ok: true, enabled: false });
  const ip = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "local";
  if (throttled(ip)) return Response.json({ error: "Muitas tentativas. Aguarde 10 minutos." }, { status: 429 });

  let given = "";
  try {
    const body = (await request.json()) as { password?: string };
    given = String(body.password ?? "");
  } catch { given = ""; }

  if (given.length > 512 || !safeEqual(given, pwd)) {
    return Response.json({ error: "Senha incorreta" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  const token = await sessionTokenFor(pwd);
  const secure = new URL(request.url).protocol === "https:";
  return Response.json({ ok: true, enabled: true }, {
    headers: { "Set-Cookie": sessionCookieHeader(token, secure), "Cache-Control": "no-store" },
  });
}
