import "dotenv/config";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { mkdir, writeFile } from "node:fs/promises";
import { RpgRewardLedger } from "../src/game/core/rpg/reward-ledger";
import { calculateRpgReward } from "../src/game/core/rpg/reward-calculator";
import {
  createRewardSeed,
  deriveRewardRollSeed,
} from "../src/server/rpg/reward-seeds";
import { db } from "../src/server/db";
import { rpgTransaction } from "../src/server/rpg/transaction";
import { initializeRpgExpedition } from "../src/server/rpg/expedition-entry";
import { persistRpgTerminal } from "../src/server/rpg/expedition-terminal";
import { settleRpgExpedition } from "../src/server/rpg/rewards";

if (
  process.env.RUN_RPG_BENCHMARK !== "1" ||
  process.env.RPG_ENABLED !== "true" ||
  process.env.RPG_EXPEDITIONS_ENABLED !== "true" ||
  !["localhost", "127.0.0.1"].includes(
    new URL(process.env.DATABASE_URL!).hostname,
  )
)
  throw new Error(
    "Benchmark requires explicit opt-in and an isolated local PostgreSQL database",
  );
const distribution = (values: number[]) => {
  const s = [...values].sort((a, b) => a - b);
  return {
    mean: s.reduce((a, b) => a + b, 0) / s.length,
    p95: s[Math.min(s.length - 1, Math.floor(s.length * 0.95))],
    max: s[s.length - 1],
  };
};
const ids = Array.from({ length: 5 }, (_, i) => `bench${i}`),
  root = createRewardSeed();
const terminal = (users: string[]) => ({
  version: 1,
  outcome: "VICTORY",
  ticks: 15000,
  participants: users.map((userId) => ({
    userId,
    characterId: "nara",
    entryLevel: 1,
    connectedTicks: 15000,
    activeTicks: 1000,
    absentTicks: 0,
  })),
  events: Array.from({ length: 3 }, (_, i) => ({
    source: "BOSS_DEFEAT",
    eventId: `boss${i}`,
    definitionId: `boss:${i}`,
    tick: 4000 + i * 3000,
    userId: null,
  })),
});
const input = terminal(ids),
  loot: number[] = [];
for (let i = 0; i < 1200; i++) {
  const start = performance.now();
  for (const id of ids)
    calculateRpgReward(input, id, (source, event, index, version) =>
      deriveRewardRollSeed(root, "bench", id, source, event, index, version),
    );
  if (i >= 200) loot.push(performance.now() - start);
}
global.gc?.();
const heapBefore = process.memoryUsage().heapUsed,
  ledger = new RpgRewardLedger(
    ids.map((userId) => ({ userId, characterId: "nara", entryLevel: 1 })),
  );
ledger.step(0.04);
const eventStart = performance.now();
let peakHeap = heapBefore;
for (let i = 0; i < 1_000_000; i++) {
  ledger.event("ELITE_DEFEAT", `enemy:${i}`, "elite");
  if (i % 10000 === 0)
    peakHeap = Math.max(peakHeap, process.memoryUsage().heapUsed);
}
const eventMs = performance.now() - eventStart;
global.gc?.();
const retainedHeapDelta = process.memoryUsage().heapUsed - heapBefore;
const transactionMs: number[] = [],
  settlementMs: number[] = [],
  inserts: number[] = [];
const users: string[] = [],
  teams: string[] = [];
try {
  for (let sample = 0; sample < 10; sample++) {
    const participants = ids.map(() => "bench_" + randomUUID());
    users.push(...participants);
    for (const id of participants)
      await db().user.create({
        data: { id, name: id, email: `${id}@example.test` },
      });
    const team = await db().team.create({
      data: {
        leaderId: participants[0],
        code: randomUUID(),
        expiresAt: new Date(Date.now() + 600000),
        status: "RUNNING",
        expeditionKind: "RPG_EXPEDITION",
      },
    });
    teams.push(team.id);
    const session = await rpgTransaction(async (tx) => {
      const session = await tx.gameSession.create({
        data: {
          teamId: team.id,
          seed: randomUUID(),
          mapId: "ruins",
          mode: "normal",
          duration: 600,
          partySize: 5,
          expeditionKind: "RPG_EXPEDITION",
          members: {
            create: participants.map((userId) => ({
              userId,
              character: "nara",
            })),
          },
        },
      });
      await initializeRpgExpedition(tx, session.id);
      return session;
    });
    await persistRpgTerminal(session.id, terminal(participants));
    let start = performance.now();
    await db().$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT 1`;
      },
      { isolationLevel: "Serializable" },
    );
    transactionMs.push(performance.now() - start);
    start = performance.now();
    await settleRpgExpedition(session.id);
    settlementMs.push(performance.now() - start);
    const where = { userId: { in: participants } };
    inserts.push(
      (await db().rpgItemInstance.count({ where })) +
        (await db().rpgMaterialBalance.count({ where })) +
        (await db().rpgRewardReceipt.count({ where })),
    );
  }
  const result = {
    node: process.version,
    players: 5,
    lootFivePlayersMs: distribution(loot),
    events: {
      attempts: 1_000_000,
      recorded: ledger.terminal(false).events.length,
      totalMs: eventMs,
      nsPerAttempt: (eventMs * 1e6) / 1_000_000,
      retainedHeapDelta,
      peakHeapDelta: peakHeap - heapBefore,
      forcedGc: !!global.gc,
    },
    emptySerializableTransactionMs: distribution(transactionMs),
    atomicFivePlayerSettlementMs: distribution(settlementMs),
    newSettlementRows: distribution(inserts),
  };
  await mkdir("artifacts/rpg-phase3", { recursive: true });
  await writeFile(
    "artifacts/rpg-phase3/rewards-performance.json",
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result, null, 2));
} finally {
  await db().gameSession.deleteMany({ where: { teamId: { in: teams } } });
  await db().team.deleteMany({ where: { id: { in: teams } } });
  await db().user.deleteMany({ where: { id: { in: users } } });
  await db().$disconnect();
}
