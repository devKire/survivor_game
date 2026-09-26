import { performance } from "node:perf_hooks";
import { writeFile, mkdir } from "node:fs/promises";
import { WarSimulation } from "../src/game/core/war";
import { WAR } from "../src/game/content/war";
import type { FighterSeed } from "../src/game/core/pvp";
const seeds: FighterSeed[] = Array.from({ length: 10 }, (_, i) => ({
  id: `bench:${i}`,
  name: `Bot ${i}`,
  team: i < 5 ? 0 : 1,
  character: (["nara", "orin", "ivo", "sena"] as const)[i % 4],
  role: "SOLDADO",
  cosmetics: {},
  isBot: true,
}));
const game = new WarSimulation(seeds);
for (const team of [0, 1])
  for (let lane = 0; lane < 3; lane++)
    game.spawnWave(team, lane, WAR.minionCap / 6);
const times: number[] = [],
  sizes: number[] = [];
let peak = 0;
for (let i = 0; i < 3000 && !game.ended; i++) {
  const t = performance.now();
  game.step();
  times.push(performance.now() - t);
  peak = Math.max(peak, game.units.items.length);
  if (i % 5 === 0)
    sizes.push(
      Buffer.byteLength(JSON.stringify(game.snapshot(seeds[i % 10].id))),
    );
}
times.sort((a, b) => a - b);
sizes.sort((a, b) => a - b);
const report = {
  ticks: times.length,
  simulationSeconds: game.time,
  peakMinions: peak,
  neutralCount: game.neutrals.camps.flatMap((c) => c.enemies).length,
  tickMedianMs: times[Math.floor(times.length * 0.5)],
  tickP95Ms: times[Math.floor(times.length * 0.95)],
  tickMaxMs: times.at(-1),
  snapshotP95Bytes: sizes[Math.floor(sizes.length * 0.95)],
  tickHz: 25,
  snapshotHz: 10,
};
await mkdir("artifacts/war-redesign", { recursive: true });
await writeFile(
  "artifacts/war-redesign/performance.json",
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report));
