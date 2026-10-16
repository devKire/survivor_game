import { randomUUID } from "node:crypto";
import { cpus, totalmem } from "node:os";
import { mkdir, writeFile } from "node:fs/promises";
import { WorldZone } from "../src/realtime/world/zone";
import { createRpgCombatLoadout } from "../src/game/core/rpg/loadout";
const percentile = (v: number[], p: number) =>
  [...v].sort((a, b) => a - b)[
    Math.min(v.length - 1, Math.floor(v.length * p))
  ];
const results = [];
for (const population of [1, 2, 5, 10, 20]) {
  const z = new WorldZone("ruins-outskirts", randomUUID()),
    avatars = [];
  for (let i = 0; i < population; i++) {
    const a = z.createAvatar({
      userId: `benchmark-${i}`,
      publicId: randomUUID(),
      visitId: randomUUID(),
      epoch: randomUUID(),
      name: `Player ${i}`,
      loadout: createRpgCombatLoadout({
        characterId: "nara",
        level: 1,
        attributes: { vitality: 0, power: 0, agility: 0, focus: 0, will: 0 },
        equipment: [],
        profileRevision: 1,
      }),
      xp: 0,
      revision: 1,
    });
    z.add(a);
    Object.assign(a.player, {
      x: 260 + (i % 5) * 45,
      y: 160 + Math.floor(i / 5) * 80,
    });
    avatars.push(a);
  }
  const ticks: number[] = [],
    snapshots: number[] = [],
    bytes: number[] = [],
    memory = process.memoryUsage().heapUsed;
  for (let t = 0; t < 750; t++) {
    const before = performance.now();
    z.update(0.04);
    ticks.push(performance.now() - before);
    if (t % 3 === 0) {
      const start = performance.now();
      for (const a of avatars)
        bytes.push(Buffer.byteLength(JSON.stringify(z.snapshot(a))));
      snapshots.push(performance.now() - start);
    }
  }
  results.push({
    population,
    simulatedSeconds: 30,
    tickP50: percentile(ticks, 0.5),
    tickP95: percentile(ticks, 0.95),
    tickP99: percentile(ticks, 0.99),
    snapshotsBatchP95: percentile(snapshots, 0.95),
    snapshotBytesP95: percentile(bytes, 0.95),
    heapDeltaBytes: process.memoryUsage().heapUsed - memory,
    maxPlayersInSnapshot: Math.max(
      ...avatars.map((a) => z.snapshot(a).players.length),
    ),
    queuedDiscreteRewardEvents: z.field?.pending.length,
  });
  z.dispose();
}
await mkdir("docs/qa/world", { recursive: true });
await writeFile(
  "docs/qa/world/server-benchmark.json",
  JSON.stringify(
    {
      at: new Date().toISOString(),
      node: process.version,
      cpu: cpus()[0].model,
      logicalCpus: cpus().length,
      totalMemoryBytes: totalmem(),
      method:
        "Headless WorldZone simulation and JSON snapshots. No sockets, database or artificial reward grants. These CPU measurements are not WAN latency or production capacity.",
      results,
    },
    null,
    2,
  ),
);
console.log(JSON.stringify(results, null, 2));
if (results.some((r) => r.tickP95 + r.snapshotsBatchP95 > 40))
  process.exitCode = 1;
