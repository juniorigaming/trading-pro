import { describe, expect, it } from "vitest";
import { readCookie, safeEqual, sessionTokenFor, isPublicPath } from "@/lib/auth";

describe("proteção de sessão", () => {
  it("usa HMAC determinístico e sensível à senha", async () => {
    const a = await sessionTokenFor("senha-segura");
    const b = await sessionTokenFor("senha-segura");
    const c = await sessionTokenFor("senha-diferente");
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });

  it("compara sem prefixos parciais e decodifica cookie com outros cookies ao lado", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abcd")).toBe(false);
    expect(readCookie("theme=dark; tp_session=abc%3Ddef; x=1", "tp_session")).toBe("abc=def");
    expect(readCookie("tp_session=%E0%A4%A", "tp_session")).toBe("%E0%A4%A");
  });

  it("mantém públicos só login, autenticação e recursos estáticos essenciais", () => {
    expect(isPublicPath("/login")).toBe(true);
    expect(isPublicPath("/api/auth/status")).toBe(true);
    expect(isPublicPath("/sw.js")).toBe(true);
    expect(isPublicPath("/api/trades")).toBe(false);
    expect(isPublicPath("/configuracoes")).toBe(false);
  });
});
