import "dotenv/config";
import pg from "pg";
const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 10000,
});
try {
  await client.connect();
  const r = await client.query(
    "SELECT table_schema,count(*)::int AS tables FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog','information_schema') GROUP BY table_schema ORDER BY table_schema",
  );
  console.log(r.rows);
} catch (e) {
  console.error(
    "Conexão PostgreSQL indisponível:",
    e instanceof Error ? e.name : "erro",
  );
  process.exitCode = 1;
} finally {
  await client.end();
}
