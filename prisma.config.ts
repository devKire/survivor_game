import "dotenv/config";
import { defineConfig } from "prisma/config";

const databaseUrl = process.env.DATABASE_URL?.trim();

let datasourceUrl = "";

if (databaseUrl) {
  const url = new URL(databaseUrl);
  url.searchParams.set("schema", "limiar");
  datasourceUrl = url.toString();
}

export default defineConfig({
  schema: "prisma/schema.prisma",

  migrations: {
    path: "prisma/migrations",
  },

  datasource: {
    url: datasourceUrl,
  },
});