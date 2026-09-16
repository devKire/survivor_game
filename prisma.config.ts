import "dotenv/config";
import { defineConfig } from "prisma/config";
const url = process.env.DATABASE_URL;
if (!url?.trim())
  throw new Error(
    "DATABASE_URL precisa ser configurada no .env para usar PostgreSQL/Neon.",
  );
const migrationUrl = new URL(url);
migrationUrl.searchParams.set("schema", "limiar");
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: migrationUrl.toString() },
});
