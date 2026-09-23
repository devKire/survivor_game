import { writeFileSync } from "node:fs";
import { GameSimulation } from "../src/game/core/simulation";
import { freshSave } from "../src/game/core/save";
import { mulberry32 } from "../src/game/core/math";
import { ACHIEVEMENTS } from "../src/game/content/catalog";

const results = [];
for (const duration of [600, 900, 1800]) {
  Math.random = mulberry32(23092026 + duration);
  const save = freshSave();
  // Recurring income: first-time achievements are measured by separate tests.
  save.achievements = ACHIEVEMENTS.map(a => a.id);
  const g = new GameSimulation(save);
  g.start("nara", "normal", "ruins", "ECONOMY-BALANCE", duration);
  g.fx = 0;
  const started = performance.now();
  g.input.vector = () => {
    const targets = [...g.pickups.filter(p => p.type === "chest" || p.type === "gems"), ...g.gems];
    let nearest = targets[0], distance = Infinity;
    for (const target of targets) {
      const d = Math.hypot(target.x - g.player.x, target.y - g.player.y);
      if (d < distance) { nearest = target; distance = d; }
    }
    if (!nearest) return { x: Math.cos(g.run.time / 10), y: Math.sin(g.run.time / 10) };
    const dx = nearest.x - g.player.x, dy = nearest.y - g.player.y, d = Math.max(1, Math.hypot(dx, dy));
    return { x: dx / d, y: dy / d };
  };
  while (g.run.time < duration && !g.run.settled) {
    g.player.invulnerable = 1;
    if (g.state === "levelup") g.pickUpgrade(0);
    if (g.state === "chest") g.claimChest();
    if (g.state !== "playing") g.state = "playing";
    g.update(0.04);
    g.particles.clear(); g.floats.clear(); g.lines.length = 0;
  }
  g.finish(true);
  results.push({ duration, kills: g.run.kills, collectedGems: g.run.gems,
    gems: save.gems, gold: save.gold, gemsPerMinute: save.gems / (duration / 60),
    secondsToSimulate: (performance.now() - started) / 1000 });
}
const report = { assumptions: "One seeded invulnerable Nara bot per duration; nearest XP/currency/chest collection; first available upgrade; achievements excluded. Not human difficulty or production distribution.", results };
writeFileSync("docs/economy-balance-results.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
