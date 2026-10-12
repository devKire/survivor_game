import "dotenv/config";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { db } from "../src/server/db";
import { rpgProfileData } from "../src/server/rpg/profile";
import { transferRpgItem } from "../src/server/rpg/storage";
if (
  process.env.RUN_RPG_BENCHMARK !== "1" ||
  new URL(process.env.DATABASE_URL!).hostname !== "127.0.0.1"
)
  throw new Error(
    "Explicit benchmark opt-in and isolated local database required",
  );
const userId = "refuge_benchmark_" + randomUUID();
try {
  await db().user.create({
    data: {
      id: userId,
      name: "Storage benchmark fixture",
      email: userId + "@example.test",
    },
  });
  await rpgProfileData(userId);
  const item = await db().rpgItemInstance.create({
    data: { userId, itemId: "blade-weathered", rarity: "COMMON" },
  });
  const values: number[] = [];
  for (let i = 0; i < 100; i++) {
    const start = performance.now();
    await transferRpgItem(userId, {
      requestId: randomUUID(),
      expectedRevision: i + 1,
      instanceId: item.id,
      operation: i % 2 ? "WITHDRAW_ITEM" : "DEPOSIT_ITEM",
    });
    values.push(performance.now() - start);
  }
  values.sort((a, b) => a - b);
  const result = {
    samples: values.length,
    meanMs: values.reduce((a, b) => a + b, 0) / values.length,
    p95Ms: values[Math.floor(values.length * 0.95)],
    maxMs: values.at(-1),
    instances: await db().rpgItemInstance.count({ where: { userId } }),
    receipts: await db().rpgMutationReceipt.count({ where: { userId } }),
  };
  await mkdir("artifacts/refuge", { recursive: true });
  await writeFile(
    "artifacts/refuge/storage-benchmark.json",
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result));
} finally {
  await db().user.deleteMany({ where: { id: userId } });
  await db().$disconnect();
}
