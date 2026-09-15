// Criptografia simples para senhas de corretora - usa Web Crypto API compatível com Workers
// Em produção, use ENCRYPTION_KEY de 32 chars no env do Cloudflare

async function getKey(secret: string) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret.padEnd(32, "0").slice(0, 32)),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: enc.encode("trading-pro-salt-v1"),
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encryptPassword(plain: string, secret: string): Promise<string> {
  if (!plain) return "";
  const key = await getKey(secret);
  const enc = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    enc.encode(plain)
  );
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encrypted), iv.length);
  return btoa(String.fromCharCode(...combined));
}

export async function decryptPassword(encryptedB64: string, secret: string): Promise<string> {
  if (!encryptedB64) return "";
  try {
    const key = await getKey(secret);
    const combined = Uint8Array.from(atob(encryptedB64), c => c.charCodeAt(0));
    const iv = combined.slice(0, 12);
    const data = combined.slice(12);
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      data
    );
    return new TextDecoder().decode(decrypted);
  } catch (e) {
    console.error("[decrypt] failed:", e);
    return "";
  }
}

export function getEncryptionSecret(): string {
  try {
    // Tenta pegar do Cloudflare env
    const { getCloudflareContext } = require("@opennextjs/cloudflare");
    const cf = getCloudflareContext();
    if ((cf.env as any).ENCRYPTION_KEY) return (cf.env as any).ENCRYPTION_KEY;
  } catch {}
  return process.env.ENCRYPTION_KEY || "trading-pro-default-key-32-chars!!";
}
