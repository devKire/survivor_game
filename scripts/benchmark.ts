import { performance } from "node:perf_hooks";
import { writeFileSync } from "node:fs";
import { CoopSimulation } from "../src/game/core/coop";
import { freshSave } from "../src/game/core/save";
import { SnapshotStream } from "../src/realtime/snapshots";
import { Weapon } from "../src/game/core/entities";
const g = new CoopSimulation(
  Array.from({ length: 5 }, (_, i) => ({
    id: "p" + i,
    name: "Load" + i,
    character: "orin",
    progress: freshSave(),
  })),
  "normal",
  "gardens",
  "LOAD-TEST",
);
for (const [i, m] of [...g.members.values()].entries()) {
  m.player.x = i * 850;
  m.player.y = 0;
  m.player.health = 1e8;
  m.player.maxHealth = 1e8;
  m.player.weapons = ["ember", "orbit", "spear", "frost", "chain", "well"].map(
    (id) =>
      Object.assign(new Weapon(id), { ownerId: m.id, level: 8, evolved: true }),
  );
}
g.run.time = 1500;
g.director.eventIndex = 6;
g.director.index = 8;
for (let i = 0; i < 1100; i++) {
  const e = g.spawnAt(
    ["husk", "tank", "sentinel", "ranged", "dart"][i % 5],
    (i % 55) * 80 - 400,
    Math.floor(i / 55) * 60 - 600,
  );
  if (e) {
    e.hp = 1e8;
    e.maxHp = 1e8;
  }
}
const streams = [...g.members.values()].map(() => new SnapshotStream()),
  ticks: number[] = [],
  completeTicks: number[] = [],
  snapshotBatches: number[] = [],
  bytes: number[][] = streams.map(() => []);
const memoryBefore = process.memoryUsage().heapUsed;
let snapshotClock = 0;
for (let tick = 0; tick < 300; tick++) {
  const t = performance.now();
  g.update(0.04);
  ticks.push(performance.now() - t);
  snapshotClock += 0.04;
  if (snapshotClock >= 0.1) {
    snapshotClock -= 0.1;
    const started = performance.now();
    [...g.members.values()].forEach((m, i) =>
      bytes[i].push(
        Buffer.byteLength(
          JSON.stringify(streams[i].build(g, m, tick, tick < 3)),
        ),
      ),
    );
    snapshotBatches.push(performance.now() - started);
  }
  completeTicks.push(performance.now() - t);
}
ticks.sort((a, b) => a - b);
const average = (a: number[]) => a.reduce((s, n) => s + n, 0) / a.length;
const distribution = (v: number[]) => {
  v.sort((a, b) => a - b);
  return {
    mean: average(v),
    p95: v[Math.floor(v.length * 0.95)],
    max: v.at(-1),
  };
};
const result = {
  totalTickIncludingSnapshotsMs: distribution(completeTicks),
  snapshotBatchMs: distribution(snapshotBatches),
  players: 5,
  initialEnemies: 1100,
  remainingEnemies: g.enemies.length,
  ticks: 300,
  tickHz: 25,
  tickMs: {
    mean: average(ticks),
    p95: ticks[Math.floor(ticks.length * 0.95)],
    max: ticks.at(-1),
  },
  heapDeltaMB: (process.memoryUsage().heapUsed - memoryBefore) / 1024 / 1024,
  heapMB: process.memoryUsage().heapUsed / 1024 / 1024,
  snapshots: bytes.map((a) => ({
    meanBytes: Math.round(average(a)),
    maxBytes: Math.max(...a),
    approxBytesPerSecondAt10Hz: Math.round(average(a) * 10),
  })),
};
writeFileSync("docs/load-results.json", JSON.stringify(result, null, 2));
console.log(result);
