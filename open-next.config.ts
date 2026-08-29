import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default defineCloudflareConfig({
  // Cache pode ser configurado depois (R2/KV).
  // Por enquanto o app sobe sem cache avançado.
});
