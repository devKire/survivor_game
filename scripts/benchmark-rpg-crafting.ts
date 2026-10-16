import "dotenv/config";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { cpus } from "node:os";
import { Client } from "pg";
import { db } from "../src/server/db";
import { openWorldVisit } from "../src/server/rpg/world/presence";
import { withWorldServicePermit } from "../src/server/rpg/world/service-context";
import { mutateCrafting } from "../src/server/rpg/crafting/service";
import {
  craftingCatalog,
  craftingHistory,
} from "../src/server/rpg/crafting/catalog";
if (
  process.env.RUN_RPG_BENCHMARK !== "1" ||
  !["127.0.0.1", "localhost"].includes(
    new URL(process.env.DATABASE_URL!).hostname,
  )
)
  throw Error(
    "Benchmark requires an explicit isolated local PostgreSQL environment.",
  );
const users: string[] = [],
  samples: { operation: string; durationMs: number; statements: number }[] = [];
const original = Client.prototype.query;
let statements = 0;
Client.prototype.query = function (
  this: Client,
  ...args: Parameters<Client["query"]>
) {
  statements++;
  return Reflect.apply(original, this, args);
} as Client["query"];
const measure = async <T>(operation: string, run: () => Promise<T>) => {
  const before = statements,
    start = performance.now(),
    result = await run();
  samples.push({
    operation,
    durationMs: performance.now() - start,
    statements: statements - before,
  });
  return result;
};
const percentile = (values: number[], p: number) =>
  [...values].sort((a, b) => a - b)[
    Math.min(values.length - 1, Math.floor(values.length * p))
  ];
try {
  const accounts = [];
  for (let n = 0; n < 20; n++) {
    const userId = "forge_benchmark_" + randomUUID();
    users.push(userId);
    await db().user.create({
      data: { id: userId, name: "QA", email: userId + "@example.test" },
    });
    const entry = await openWorldVisit(userId, randomUUID(), () => {}),
      permit = { userId, visitId: entry.visit.id, assertLive: () => {} };
    const progress = await db().userProgress.findUniqueOrThrow({
      where: { userId },
    });
    // Internal isolated fixtures for measurement, never gameplay/grant endpoints.
    await db().userProgress.update({
      where: { userId },
      data: { data: { ...(progress.data as object), gold: 1000 } },
    });
    await db().rpgMaterialBalance.createMany({
      data: ["weathered-ore", "ruins-fiber", "obelisk-dust"].map(
        (materialId) => ({ userId, materialId, amount: 1000 }),
      ),
    });
    const run = (args: object) =>
      withWorldServicePermit(permit, () => mutateCrafting(userId, args));
    let revision = entry.revision;
    const command = (details: object) => ({
      ...details,
      requestId: randomUUID(),
      expectedRevision: revision,
      catalogVersion: 1,
    });
    const made = await measure("CRAFT_ITEM", () =>
      run(
        command({
          operation: "CRAFT_ITEM",
          recipeId: "recipe:blade-weathered",
          recipeVersion: 1,
        }),
      ),
    );
    revision = made.revision;
    const upgraded = await measure("UPGRADE_ITEM", () =>
      run(command({ operation: "UPGRADE_ITEM", instanceId: made.item!.id })),
    );
    revision = upgraded.revision;
    const reforged = await measure("REFORGE_ITEM", () =>
      run(command({ operation: "REFORGE_ITEM", instanceId: made.item!.id })),
    );
    revision = reforged.revision;
    const bought = await measure("BUY_FROM_VENDOR", () =>
      run(
        command({
          operation: "BUY_FROM_VENDOR",
          vendorId: "refuge:trader",
          stockItemId: "stock:blade",
        }),
      ),
    );
    revision = bought.revision;
    const sold = await measure("SELL_TO_VENDOR", () =>
      run(
        command({
          operation: "SELL_TO_VENDOR",
          vendorId: "refuge:trader",
          instanceId: bought.item!.id,
        }),
      ),
    );
    revision = sold.revision;
    const refined = await measure("REFINE_MATERIAL", () =>
      run(
        command({
          operation: "REFINE_MATERIAL",
          recipeId: "refine:residual-dust",
          recipeVersion: 1,
        }),
      ),
    );
    revision = refined.revision;
    const catalog = await measure("CATALOG", () =>
      withWorldServicePermit(permit, () =>
        craftingCatalog(userId, { stationId: "refuge:forge" }),
      ),
    );
    await measure("HISTORY", () =>
      withWorldServicePermit(permit, () =>
        craftingHistory(userId, { stationId: "refuge:forge" }),
      ),
    );
    accounts.push({
      userId,
      run,
      revision,
      responseBytes: Buffer.byteLength(JSON.stringify(catalog)),
    });
  }
  const account = accounts[0],
    command = {
      operation: "CRAFT_ITEM",
      requestId: randomUUID(),
      expectedRevision: account.revision,
      catalogVersion: 1,
      recipeId: "recipe:mantle-ash",
      recipeVersion: 1,
    };
  let start = performance.now(),
    before = statements;
  const replay = await Promise.allSettled(
    Array.from({ length: 5 }, () => account.run(command)),
  );
  const concurrentReplay = {
    requests: 5,
    durationMs: performance.now() - start,
    statements: statements - before,
    confirmedResponses: replay.filter((r) => r.status === "fulfilled").length,
    records: await db().rpgCommerceRecord.count({
      where: { userId: account.userId, requestId: command.requestId },
    }),
  };
  const revision = (
    await db().rpgProfile.findUniqueOrThrow({
      where: { userId: account.userId },
    })
  ).revision;
  start = performance.now();
  before = statements;
  const competing = await Promise.allSettled(
    Array.from({ length: 5 }, () =>
      account.run({
        ...command,
        requestId: randomUUID(),
        expectedRevision: revision,
      }),
    ),
  );
  const competingRevision = {
    requests: 5,
    durationMs: performance.now() - start,
    statements: statements - before,
    confirmed: competing.filter((r) => r.status === "fulfilled").length,
    rejected: competing.filter((r) => r.status === "rejected").length,
  };
  const operations = [...new Set(samples.map((s) => s.operation))].map(
    (operation) => {
      const group = samples.filter((s) => s.operation === operation);
      return {
        operation,
        samples: group.length,
        durationP50: percentile(
          group.map((s) => s.durationMs),
          0.5,
        ),
        durationP95: percentile(
          group.map((s) => s.durationMs),
          0.95,
        ),
        statementsP95: percentile(
          group.map((s) => s.statements),
          0.95,
        ),
      };
    },
  );
  if (concurrentReplay.records !== 1 || competingRevision.confirmed !== 1)
    throw Error("Benchmark invariant failed");
  await mkdir("docs/qa/crafting", { recursive: true });
  await writeFile(
    "docs/qa/crafting/benchmark.json",
    JSON.stringify(
      {
        at: new Date().toISOString(),
        node: process.version,
        cpu: cpus()[0].model,
        logicalCpus: cpus().length,
        method:
          "Twenty isolated accounts, sequential service calls with internal fixture permits; no network or gameplay claim. pg.Client.query counts include transaction boundaries. Five-request groups measure aggregate query counts and wall time including lock waits, not individual lock durations. No competing browser/realtime suite.",
        operations,
        concurrentReplay,
        competingRevision,
        catalogBytesP95: percentile(
          accounts.map((a) => a.responseBytes),
          0.95,
        ),
        raw: samples,
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify(
      { operations, concurrentReplay, competingRevision },
      null,
      2,
    ),
  );
} finally {
  Client.prototype.query = original;
  await db().user.deleteMany({ where: { id: { in: users } } });
  await db().$disconnect();
}
