// Executa um arquivo .sql no banco da DATABASE_URL (.env). Uso: node scripts/run-sql.mjs drizzle/0001_ai_module.sql
import { readFileSync } from "node:fs";
import { config } from "dotenv";
import pg from "pg";
config();
const file = process.argv[2];
if (!file) { console.error("Uso: node scripts/run-sql.mjs <arquivo.sql>"); process.exit(1); }
if (!process.env.DATABASE_URL) { console.error("DATABASE_URL ausente no .env"); process.exit(1); }
const sql = readFileSync(file, "utf8");
const local = /sslmode=disable|127\.0\.0\.1|localhost/.test(process.env.DATABASE_URL);
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: local ? false : { rejectUnauthorized: false } });
await client.connect();
try { await client.query(sql); console.log(`OK: ${file} aplicado.`); }
finally { await client.end(); }
