import "dotenv/config";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { rpgQuestJournal } from "../src/server/rpg/quests/journal";
import { mutateQuest, mutateDialogue } from "../src/server/rpg/quests/service";
if (
  process.env.RUN_RPG_BENCHMARK !== "1" ||
  new URL(process.env.DATABASE_URL!).hostname !== "127.0.0.1"
)
  throw Error("Explicit local benchmark opt-in required");
const client = new PrismaClient({
  adapter: new PrismaPg(
    { connectionString: process.env.DATABASE_URL! },
    { schema: "limiar" },
  ),
  log: [{ level: "query", emit: "event" }],
});
(globalThis as typeof globalThis & { limiarDb?: PrismaClient }).limiarDb =
  client;
let queries = 0;
client.$on("query", () => queries++);
const samples: Record<string, { ms: number; queries: number }[]> = {};
async function measure<T>(label: string, fn: () => Promise<T>) {
  const start = performance.now(),
    before = queries;
  try {
    return await fn();
  } finally {
    (samples[label] ??= []).push({
      ms: performance.now() - start,
      queries: queries - before,
    });
  }
}
const users: string[] = [];
const memoryBefore = process.memoryUsage().heapUsed;
try {
  for (let i = 0; i < 10; i++) {
    const userId = "quest_bench_" + randomUUID();
    users.push(userId);
    await client.user.create({
      data: { id: userId, name: userId, email: userId + "@example.test" },
    });
    let journal = await rpgQuestJournal(userId);
    const quest = async (kind: "ACCEPT" | "CLAIM") => {
      const r = await mutateQuest(userId, {
        kind,
        questId: "main:refuge-introduction",
        requestId: randomUUID(),
        expectedRevision: journal.revision,
      });
      journal = r.journal;
    };
    const talk = async (npcId: string, choices: string[]) => {
      let r = await mutateDialogue(userId, {
        kind: "OPEN",
        npcId,
        requestId: randomUUID(),
        expectedRevision: journal.revision,
      });
      journal = r.journal;
      for (const choiceId of choices) {
        r = await measure(
          choiceId === "confirm" ? "proof-and-completion" : "dialogue",
          () =>
            mutateDialogue(userId, {
              kind: "CHOOSE",
              npcId,
              choiceId,
              requestId: randomUUID(),
              expectedRevision: journal.revision,
            }),
        );
        journal = r.journal;
      }
    };
    await measure("accept", () => quest("ACCEPT"));
    await talk("refuge:guardian", ["priority", "remnants"]);
    await talk("refuge:guide", ["briefing", "confirm"]);
    await talk("refuge:guardian", ["intro-report", "confirm"]);
    await measure("reward", () => quest("CLAIM"));
    for (let j = 0; j < 3; j++)
      await measure("journal-and-history", () => rpgQuestJournal(userId));
  }
  const p95 = (values: number[]) =>
    [...values].sort((a, b) => a - b)[
      Math.min(values.length - 1, Math.floor(values.length * 0.95))
    ];
  const report = {
    environment:
      "local PostgreSQL, sequential requests, 10 accounts; not production load",
    samples: Object.fromEntries(
      Object.entries(samples).map(([label, values]) => [
        label,
        {
          count: values.length,
          p95Ms: p95(values.map((v) => v.ms)),
          p95Queries: p95(values.map((v) => v.queries)),
        },
      ]),
    ),
    heapDeltaBytes: process.memoryUsage().heapUsed - memoryBefore,
  };
  await mkdir("artifacts/quests", { recursive: true });
  await writeFile(
    "artifacts/quests/benchmark.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await client.user.deleteMany({ where: { id: { in: users } } });
  await client.$disconnect();
}
