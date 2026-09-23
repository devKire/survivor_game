import "dotenv/config";
import { db } from "../src/server/db";

// Read-only aggregate audit: never print account identifiers or connection secrets.
try {
  const rows = await db().$queryRaw`
    SELECT count(*)::int AS accounts,
      count(*) FILTER (WHERE (data->>'gold')::numeric > 0)::int AS funded,
      coalesce(sum((data->>'gold')::numeric),0)::text AS total,
      coalesce(sum((data->>'gems')::numeric),0)::text AS gems_total,
      count(*) FILTER (WHERE data->>'economyVersion' = '2')::int AS migrated,
      coalesce(min((data->>'gold')::numeric),0)::text AS minimum,
      coalesce(max((data->>'gold')::numeric),0)::text AS maximum,
      percentile_cont(ARRAY[0.5,0.9,0.99]) WITHIN GROUP
        (ORDER BY (data->>'gold')::numeric) AS percentiles,
      count(*) FILTER (WHERE "localArchive" IS NOT NULL)::int AS local_archives
    FROM limiar."UserProgress"`;
  const sessions = await db().gameSession.count({ where: { status: "RUNNING" } });
  console.log(JSON.stringify({ auditedAt: new Date().toISOString(), balances: rows, runningSessions: sessions }, null, 2));
} catch (error) {
  console.error("Economy audit unavailable:", error instanceof Error ? error.name : "unknown");
  process.exitCode = 1;
} finally {
  await db().$disconnect();
}
