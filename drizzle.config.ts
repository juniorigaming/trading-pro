import { defineConfig } from "drizzle-kit";

// O drizzle-kit carrega automaticamente o arquivo .env da raiz do projeto.
// Coloque a DATABASE_URL do seu banco (Neon, Supabase, etc.) no .env.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
});
