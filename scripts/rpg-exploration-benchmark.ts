import "dotenv/config";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { db } from "../src/server/db";
import * as teams from "../src/server/teams";
import {
  createAuthorizedExploration,
  startExplorationGather,
  processExploration,
  explorationState,
  finishExploration,
} from "../src/realtime/rpg-exploration";
import { EXPLORATION_RUINS as region } from "../src/game/content/rpg/exploration-regions";
import { generateExploration } from "../src/game/core/rpg/exploration/generation";
import { SnapshotStream } from "../src/realtime/snapshots";
import { explorationPath } from "../tests/helpers/exploration-navigation";
if (
  process.env.RUN_RPG_BENCHMARK !== "1" ||
  new URL(process.env.DATABASE_URL!).hostname !== "127.0.0.1"
)
  throw Error("Explicit benchmark opt-in and isolated local database required");
const client = new PrismaClient({
  adapter: new PrismaPg(
    { connectionString: process.env.DATABASE_URL! },
    { schema: "limiar" },
  ),
  log: [{ level: "query", emit: "event" }],
});
let queries = 0,
  measuringGather = false;
const transactionMs: number[] = [];
const intentMs: number[] = [];
const sqlMs: number[] = [];
client.$on("query", (e) => {
  queries++;
  sqlMs.push(e.duration);
});
// adapter-pg query events omit BEGIN/COMMIT. Measure the complete transaction promise.
const transact = client.$transaction.bind(client);
client.$transaction = (async (...args: unknown[]) => {
  const at = performance.now(),
    measured = measuringGather;
  try {
    return await Reflect.apply(transact, client, args);
  } finally {
    if (measured) transactionMs.push(performance.now() - at);
  }
}) as typeof client.$transaction;
(globalThis as typeof globalThis & { limiarDb?: PrismaClient }).limiarDb =
  client as unknown as PrismaClient;
const users: string[] = [],
  teamIds: string[] = [],
  tickMs: number[] = [],
  snapshotMs: number[] = [],
  generationMs: number[] = [];
const percentile = (values: number[], q = 0.95) =>
  [...values].sort((a, b) => a - b)[
    Math.min(values.length - 1, Math.floor(values.length * q))
  ] ?? 0;
try {
  for (let i = 0; i < 5; i++) {
    const id = "bench_expl_" + randomUUID();
    users.push(id);
    await db().user.create({
      data: { id, name: id, email: id + "@example.test" },
    });
  }
  const team = await teams.createTeam(users[0]);
  teamIds.push(team.id);
  for (const id of users.slice(1)) await teams.joinTeam(id, team.code);
  await teams.updateTeam(users[0], { expeditionKind: "RPG_EXPLORATION" });
  for (const id of users) await teams.updateTeam(id, { ready: true });
  const session = await teams.startTeam(users[0]);
  global.gc?.();
  const heapBefore = process.memoryUsage().heapUsed;
  const createAt = performance.now(),
    g = await createAuthorizedExploration(session.id),
    createMs = performance.now() - createAt;
  global.gc?.();
  const heapRegion = process.memoryUsage().heapUsed - heapBefore;
  for (let i = 0; i < 100; i++) {
    const at = performance.now();
    generateExploration(region, g.world);
    generationMs.push(performance.now() - at);
  }
  const descriptors = g.nodes.filter((n) => n.kind === "RESOURCE"),
    obstacles = Array.from(
      { length: 9 },
      (_, i) =>
        g.world.createChunk((i % 3) - 1, Math.floor(i / 3) - 1).structures,
    ).flat();
  const targets = users.map((_, i) => descriptors[i * 3]);
  const paths = users.map((id, i) =>
    explorationPath(g.members.get(id)!.player, targets[i], obstacles),
  );
  const cursors = users.map(() => 0),
    streams = users.map(() => new SnapshotStream());
  let sequence = 0;
  const sqlBeforeTicks = queries;
  while (cursors.some((c, i) => c < paths[i].length) && sequence < 4000) {
    sequence++;
    for (const [i, id] of users.entries()) {
      const p = g.members.get(id)!.player;
      let target = paths[i][cursors[i]];
      if (target && Math.hypot(p.x - target.x, p.y - target.y) < 12)
        target = paths[i][++cursors[i]];
      const dx = target ? target.x - p.x : 0,
        dy = target ? target.y - p.y : 0,
        d = Math.max(1, Math.hypot(dx, dy));
      g.acceptInput(id, {
        sequence,
        moveX: dx / d,
        moveY: dy / d,
        interact: false,
      });
    }
    const at = performance.now();
    g.update(0.04);
    tickMs.push(performance.now() - at);
    if (sequence % 3 === 0) {
      const at = performance.now();
      users.forEach((id, i) =>
        streams[i].build(g, g.members.get(id)!, sequence, false),
      );
      snapshotMs.push(performance.now() - at);
    }
  }
  if (cursors.some((c, i) => c < paths[i].length))
    throw Error("Benchmark navigation failed");
  const tickQueries = queries - sqlBeforeTicks;
  for (const id of users)
    g.acceptInput(id, {
      sequence: ++sequence,
      moveX: 0,
      moveY: 0,
      interact: false,
    });
  const start = performance.now(),
    queriesBeforeGather = queries;
  measuringGather = true;
  for (const [i, id] of users.entries()) {
    const at = performance.now();
    await startExplorationGather(g, id, {
      nodeId: targets[i].id,
      expectedRevision: explorationState(g, id)!.revision,
      requestId: randomUUID(),
    });
    intentMs.push(performance.now() - at);
  }
  while (
    users.some(
      (id, i) => !explorationState(g, id)?.depleted.includes(targets[i].id),
    )
  ) {
    if (performance.now() - start > 15000)
      throw Error(
        "Benchmark gathering failed: " +
          JSON.stringify(users.map((id) => explorationState(g, id))),
      );
    g.update(0.04);
    processExploration(g);
    await new Promise((r) => setTimeout(r, 40));
  }
  measuringGather = false;
  const gatheringMs = performance.now() - start,
    gatherQueries = queries - queriesBeforeGather;
  const claims = await db().rpgResourceClaim.count({
    where: { sessionId: session.id },
  });
  if (claims !== 5) throw Error("Expected five personal claims");
  for (const id of users) g.leave(id);
  g.update(0.04);
  await finishExploration(g);
  const report = {
    players: 5,
    resources: descriptors.length,
    pois: g.nodes.length - descriptors.length,
    chunks: g.world.chunks.size,
    createMs,
    heapRegionBytes: heapRegion,
    heapPerPlayerEstimateBytes: heapRegion / 5,
    generationP95Ms: percentile(generationMs),
    tickP95Ms: percentile(tickMs),
    snapshotFivePlayersP95Ms: percentile(snapshotMs),
    tickQueries,
    gatheringMs,
    gatherQueries,
    intentValidationP95Ms: percentile(intentMs),
    transactionP95Ms: percentile(transactionMs),
    measuredTransactions: transactionMs.length,
    sqlQueryP95Ms: percentile(sqlMs),
    claims,
    notes:
      "Local Node/PostgreSQL. Movement ticks accelerated by test navigator; gathering requires real elapsed time. Heap estimate includes region and Prisma warmup, not isolated player allocation. Generation measures resources and POIs together. Transaction latency is whole promise wall time including lock wait, measured with a benchmark-only wrapper.",
  };
  await mkdir("artifacts/exploration", { recursive: true });
  await writeFile(
    "artifacts/exploration/benchmark.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await db().user.deleteMany({ where: { id: { in: users } } });
  await db().gameSession.deleteMany({ where: { teamId: { in: teamIds } } });
  await db().team.deleteMany({ where: { id: { in: teamIds } } });
  await db().$disconnect();
}
