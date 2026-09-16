import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
const globalDb = globalThis as typeof globalThis & { limiarDb?: PrismaClient };
export function db(): PrismaClient {
  const url = process.env.DATABASE_URL;
  if (!url?.trim())
    throw new Error(
      "DATABASE_URL precisa ser configurada no .env para habilitar contas online.",
    );
  return (globalDb.limiarDb ??= new PrismaClient({
    adapter: new PrismaPg(
      { connectionString: secureConnectionString(url), max: 8 },
      { schema: "limiar" },
    ),
  }));
}

function secureConnectionString(value: string) {
  const url = new URL(value);
  if (url.searchParams.get("sslmode") === "require")
    url.searchParams.set("sslmode", "verify-full");
  return url.toString();
}
