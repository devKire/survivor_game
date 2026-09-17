import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import { getDatabaseUrl } from "./env";
const globalDb = globalThis as typeof globalThis & { limiarDb?: PrismaClient };
export function db(): PrismaClient {
  const url = getDatabaseUrl();
  return (globalDb.limiarDb ??= new PrismaClient({
    adapter: new PrismaPg(
      {
        connectionString: secureConnectionString(url),
        max: 8,
        connectionTimeoutMillis: 10000,
        idleTimeoutMillis: 10000,
      },
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
