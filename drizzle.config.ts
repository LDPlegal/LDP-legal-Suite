import { defineConfig } from "drizzle-kit";
import { config } from "dotenv";

config({ path: ".env" });

const url = process.env.DATABASE_MIGRATE_URL;
if (!url) {
  throw new Error(
    "DATABASE_MIGRATE_URL is required. Set it in .env (this is the owner/admin connection used for DDL — not the runtime connection).",
  );
}

export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./drizzle/migrations",
  dialect: "postgresql",
  dbCredentials: { url },
  strict: true,
  verbose: true,
});
