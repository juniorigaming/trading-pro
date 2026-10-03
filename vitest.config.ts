import { defineConfig } from "vitest/config";
import path from "node:path";
export default defineConfig({
  test: { environment: "node", include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"], server: { deps: { inline: ["lucide-react"] } }, globals: false },
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
});
