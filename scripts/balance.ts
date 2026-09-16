import { mulberry32 } from "../src/game/core/math";
import { GameSimulation } from "../src/game/core/simulation";
import { CoopSimulation } from "../src/game/core/coop";
import { freshSave } from "../src/game/core/save";
import { WEAPON_DEFINITIONS } from "../src/game/content/catalog";
import type { Upgrade, Vec } from "../src/game/core/types";
import { writeFileSync } from "node:fs";
function select(g: GameSimulation, choices: Upgrade[]) {
  const w = g.player.weapons[0];
  return choices.reduce((best, c, i) => {
    const score = (c: Upgrade) =>
      c.kind === "path"
        ? 100
        : c.kind === "weapon" && c.id === w.id
          ? 90
          : c.kind === "passive" && c.id === WEAPON_DEFINITIONS[w.id].passive
            ? 80
            : c.kind === "weapon"
              ? 30
              : 20;
    return score(c) > score(choices[best]) ? i : best;
  }, 0);
}
function move(g: GameSimulation): Vec {
  const p = g.player;
  const boss = g.enemies.find(
    (e) => !e.dead && (e.type === "boss" || e.type === "final"),
  );
  const chests = g.pickups.filter((p) => p.type === "chest");
  const candidates = chests.length ? chests : boss ? [boss] : g.gems;
  let nearest: Vec | undefined,
    d = Infinity;
  for (const o of candidates) {
    const distance = Math.hypot(o.x - p.x, o.y - p.y);
    if (distance < d) {
      d = distance;
      nearest = o;
    }
  }
  if (!nearest)
    return { x: Math.cos(g.run.time * 0.1), y: Math.sin(g.run.time * 0.1) };
  const x = nearest.x - p.x,
    y = nearest.y - p.y,
    n = Math.max(1, Math.hypot(x, y));
  return { x: x / n, y: y / n };
}
const results = [];
for (const n of [1, 2, 5]) {
  Math.random = mulberry32(20260915 + n);
  const g =
    n === 1
      ? new GameSimulation(freshSave())
      : new CoopSimulation(
          Array.from({ length: n }, (_, i) => ({
            id: "bot" + i,
            name: "Bot" + i,
            character: "nara",
            progress: freshSave(),
          })),
          "normal",
          "ruins",
          "BALANCE-2026",
        );
  if (n === 1) g.start("nara", "normal", "ruins", "BALANCE-2026");
  g.fx = 0;
  const started = performance.now();
  let step = 0;
  while (g.run.time < 1800) {
    if (g instanceof CoopSimulation) {
      for (const m of g.members.values()) {
        g.activate(m);
        m.player.invulnerable = 1;
        g.acceptInput(m.id, {
          sequence: ++step,
          moveX: move(g).x,
          moveY: move(g).y,
          interact: false,
        });
        if (m.pending) g.choose(m.id, m.decision, select(g, m.choices), "pick");
      }
      g.update(0.04);
    } else {
      g.player.invulnerable = 1;
      g.input.vector = () => move(g);
      if (g.state === "levelup") g.pickUpgrade(select(g, g.choices));
      if (g.state === "chest") g.claimChest();
      if (g.state === "item") g.pendingItem = null;
      if (g.state !== "playing") g.state = "playing";
      g.update(0.04);
    }
    g.particles.clear();
    g.floats.clear();
    g.lines.length = 0;
  }
  const result = {
    players: n,
    assumptions:
      "Bot invulnerável; movimento até bosses/baús/gemas, raio normal; RNG fixo; prioriza arma inicial e seu passivo. Não mede dificuldade humana.",
    secondsToSimulate: (performance.now() - started) / 1000,
    kills: g.run.kills,
    level: g.player.level,
    telemetry: g.run.telemetry,
  };
  results.push(result);
  console.log(JSON.stringify(result));
}
writeFileSync("docs/balance-results.json", JSON.stringify(results, null, 2));
