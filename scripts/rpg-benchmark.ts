import { performance } from "node:perf_hooks";
import { mkdir, writeFile } from "node:fs/promises";
import { CoopSimulation } from "../src/game/core/coop";
import { Player, Weapon } from "../src/game/core/entities";
import { freshSave } from "../src/game/core/save";
import { SnapshotStream } from "../src/realtime/snapshots";
import {
  createRpgCombatLoadout,
  initialRpgAttributes,
  equipmentDefinition,
  rollEquipmentAffixes,
} from "../src/game/core/rpg";

const loadout = createRpgCombatLoadout({
  characterId: "orin",
  level: 100,
  attributes: {
    ...initialRpgAttributes(100).attributes,
    vitality: 99,
    power: 99,
    agility: 99,
    focus: 99,
    will: 99,
  },
  equipment: ["blade-weathered", "mantle-still", "charm-lens"].map(
    (itemId) => ({
      id: "bench-" + itemId,
      itemId,
      rarity: "LEGENDARY",
      level: 100,
      quantity: 1,
      contentVersion: 1,
      rollSeed: "benchmark-v1",
      affixes: rollEquipmentAffixes(
        equipmentDefinition(itemId),
        "LEGENDARY",
        100,
        "benchmark-v1",
      ),
    }),
  ),
  profileRevision: 1,
});
const participants = Array.from({ length: 5 }, (_, i) => ({
  id: "p" + i,
  name: "Load" + i,
  character: "orin",
  progress: freshSave(),
}));
const emptyLoadout = createRpgCombatLoadout({
  characterId: "orin",
  level: 1,
  attributes: initialRpgAttributes(1).attributes,
  equipment: [],
  profileRevision: 1,
});
const distribution = (values: number[]) => {
  const v = [...values].sort((a, b) => a - b);
  return {
    mean: v.reduce((sum, n) => sum + n, 0) / v.length,
    median: v[Math.floor(v.length / 2)],
    p95: v[Math.floor(v.length * 0.95)],
    max: v.at(-1),
  };
};
function run(rpg: boolean | "empty") {
  // Reproducible engine randomness in this standalone benchmark only.
  const originalRandom = Math.random;
  let seed = 18271;
  Math.random = () => {
    seed = Math.imul(seed, 1664525) + 1013904223;
    return (seed >>> 0) / 4294967296;
  };
  try {
    const game = new CoopSimulation(
      participants,
      "normal",
      "gardens",
      "RPG-LOAD-TEST",
      1800,
      rpg
        ? {
            kind: "RPG_EXPEDITION",
            loadouts: Object.fromEntries(
              participants.map((p) => [
                p.id,
                rpg === "empty" ? emptyLoadout : loadout,
              ]),
            ),
          }
        : { kind: "SURVIVOR" },
    );
    for (const [i, member] of [...game.members.values()].entries()) {
      member.player.x = i * 850;
      member.player.y = 0;
      member.player.health = member.player.maxHealth = 1e8;
      member.player.weapons = [
        "ember",
        "orbit",
        "spear",
        "frost",
        "chain",
        "well",
      ].map((id) =>
        Object.assign(new Weapon(id), {
          ownerId: member.id,
          level: 8,
          evolved: true,
        }),
      );
    }
    game.run.time = 1500;
    game.director.eventIndex = 6;
    game.director.index = 8;
    for (let i = 0; i < 1100; i++) {
      const enemy = game.spawnAt(
        ["husk", "tank", "sentinel", "ranged", "dart"][i % 5],
        (i % 55) * 80 - 400,
        Math.floor(i / 55) * 60 - 600,
      );
      if (enemy) enemy.hp = enemy.maxHp = 1e8;
    }
    const streams = [...game.members.values()].map(() => new SnapshotStream());
    const update: number[] = [],
      complete: number[] = [],
      bytes: number[] = [];
    let peak = 0;
    for (let tick = 0; tick < 400; tick++) {
      const start = performance.now();
      game.update(0.04);
      const elapsed = performance.now() - start;
      if (tick % 3 === 0)
        [...game.members.values()].forEach((member, i) =>
          bytes.push(
            Buffer.byteLength(
              JSON.stringify(streams[i].build(game, member, tick, tick === 0)),
            ),
          ),
        );
      if (tick >= 100) {
        update.push(elapsed);
        complete.push(performance.now() - start);
      }
      peak = Math.max(peak, game.enemies.length);
    }
    return {
      updateMs: distribution(update),
      withSnapshotsMs: distribution(complete),
      snapshotBytes: distribution(bytes),
      peakEnemies: peak,
      remainingEnemies: game.enemies.length,
      measuredTicks: update.length,
    };
  } finally {
    Math.random = originalRandom;
  }
}
// Warm both paths, then alternate order to reduce JIT/order bias. No flaky timing assertion.
run(false);
run("empty");
run(true);
const rounds = Array.from({ length: 4 }, (_, index) =>
  index % 2 === 0
    ? { classic: run(false), empty: run("empty"), rpg: run(true) }
    : (() => {
        const rpg = run(true);
        const empty = run("empty");
        return { classic: run(false), empty, rpg };
      })(),
);
const classic = new Player("orin", {}, "PVE"),
  rpg = new Player("orin", {}, "PVE", { kind: "RPG_EXPEDITION", loadout });
const recalculate = (player: Player) => {
  const start = performance.now();
  for (let i = 0; i < 10000; i++) player.recalculate();
  return (performance.now() - start) / 10000;
};
const result = {
  node: process.version,
  players: 5,
  initialEnemies: 1100,
  seed: "RPG-LOAD-TEST",
  rounds,
  recalculateMeanMs: { classic: recalculate(classic), rpg: recalculate(rpg) },
  balance: {
    classic: classic.stats,
    rpg: rpg.stats,
    directDamageRatio: rpg.stats.damage / classic.stats.damage,
    attackRateRatio: classic.stats.cooldown / rpg.stats.cooldown,
    // The existing engine critical multiplier is 1.8, not 2. This is a single-target
    // estimate; area/duration effects depend on enemy placement and weapon behavior.
    expectedDirectDpsRatio:
      ((rpg.stats.damage / rpg.stats.cooldown) *
        (1 + 0.8 * rpg.stats.critChance)) /
      ((classic.stats.damage / classic.stats.cooldown) *
        (1 + 0.8 * classic.stats.critChance)),
  },
};
await mkdir("artifacts/rpg-phase2", { recursive: true });
await writeFile(
  "artifacts/rpg-phase2/performance.json",
  JSON.stringify(result, null, 2),
);
console.log(JSON.stringify(result, null, 2));
