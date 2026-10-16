import { Client } from "pg";
import { getDatabaseUrl } from "../../server/env";

/** Session advisory lock, held by a dedicated connection for the entire authority lifetime. */
export function realtimeAuthorityUrl(connection: string) {
  const url = new URL(connection);
  // Session advisory locks cannot be held through transaction-mode PgBouncer.
  // Neon exposes the same database/credentials at its corresponding direct endpoint.
  if (url.hostname.endsWith(".neon.tech")) {
    const labels = url.hostname.split(".");
    labels[0] = labels[0].replace(/-pooler$/, "");
    url.hostname = labels.join(".");
  }
  if (url.searchParams.get("sslmode") === "require")
    url.searchParams.set("sslmode", "verify-full");
  return url.toString();
}
export async function acquireRealtimeAuthority(onLost: () => void) {
  const url = new URL(realtimeAuthorityUrl(getDatabaseUrl()));
  const client = new Client({
    connectionString: url.toString(),
    connectionTimeoutMillis: 10000,
  });
  let released = false;
  client.on("error", () => {
    if (!released) onLost();
  });
  client.on("end", () => {
    if (!released) onLost();
  });
  await client.connect();
  const locked = (
    await client.query<{ locked: boolean }>(
      "SELECT pg_try_advisory_lock(200102,65) AS locked",
    )
  ).rows[0].locked;
  if (!locked) {
    released = true;
    await client.end();
    throw new Error("Outra autoridade realtime já está ativa neste banco.");
  }
  const heartbeat = setInterval(() => {
    void client.query("SELECT 1").catch(() => {
      if (!released) onLost();
    });
  }, 30000);
  heartbeat.unref();
  return async () => {
    released = true;
    clearInterval(heartbeat);
    await client.end();
  };
}
