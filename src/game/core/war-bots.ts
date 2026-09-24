import { MATCHMAKING_CONFIG as CONFIG } from "../content/matchmaking";
import { WAR } from "../content/war";
import { PVP_RULES } from "../content/mode-rules";
import { hashString } from "./math";
import type { WarSimulation } from "./war";
/** Bots submit ordinary intent; sight, reaction interval, resources and cooldowns apply. */
export function updateWarBots(g: WarSimulation) {
  if (g.ended || g.time < g.intermissionUntil) return;
  for (const f of g.fighters.values()) {
    if (
      !f.botControlled ||
      f.player.health <= 0 ||
      (g.botNextDecision.get(f.id) || 0) > g.time
    )
      continue;
    g.botNextDecision.set(f.id, g.time + CONFIG.botDecisionSeconds);
    const p = f.player,
      lane = hashString(f.id) % 3,
      home = f.team === 0 ? 230 : 2370;
    const enemies = g
      .combatTargets(f)
      .filter(
        (t) =>
          Math.hypot(t.body.x - p.x, t.body.y - p.y) < CONFIG.botSight &&
          g.lineClear(p, t.body),
      );
    enemies.sort(
      (a, b) =>
        Math.hypot(a.body.x - p.x, a.body.y - p.y) -
        Math.hypot(b.body.x - p.x, b.body.y - p.y),
    );
    const enemy = enemies[0]?.body;
    const retreat = p.health < p.maxHealth * 0.28;
    const defend = enemies.some((t) => Math.abs(t.body.x - home) < 450);
    const role = g.roles.get(f.id);
    let destination: { x: number; y: number } = {
      x: f.team === 0 ? 2200 : 400,
      y: WAR.lanes[lane],
    };
    if (retreat) {
      const fountain = g.world.nearby
        .filter(
          (s) =>
            s.type === "fountain" && (g.fountainReady.get(s.id) || 0) <= g.time,
        )
        .sort(
          (a, b) =>
            Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y),
        )[0];
      destination = fountain || { x: home, y: 700 };
    } else if (defend && enemy) destination = enemy;
    else if (role === "COMANDANTE" && g.objective.owner !== f.team)
      destination = { x: 1300, y: 780 };
    else if (enemy) destination = enemy;
    else {
      const tower = g.structures.find(
        (s) =>
          s.team !== f.team &&
          s.kind === "TORRE" &&
          s.hp > 0 &&
          Math.abs(s.y - WAR.lanes[lane]) < 80,
      );
      if (tower) destination = tower;
      else destination = { x: f.team === 0 ? 2470 : 130, y: 700 };
    }
    let dx = destination.x - p.x,
      dy = destination.y - p.y;
    const d = Math.hypot(dx, dy);
    // Traverse clear lane corridors before advancing; steer locally around reusable obstacles.
    if (!enemy && !retreat && Math.abs(dy) > 55) {
      dx = 0;
      dy = Math.sign(dy);
    } else {
      dx /= Math.max(1, d);
      dy /= Math.max(1, d);
    }
    const obstacle = g.world.nearby.find(
      (s) =>
        !s.destroyed &&
        Math.hypot(p.x + dx * 55 - s.x, p.y + dy * 55 - s.y) < s.r + 28,
    );
    if (obstacle) {
      const side = p.y <= obstacle.y ? -1 : 1;
      dx = (f.team === 0 ? 1 : -1) * 0.3;
      dy = side;
    }
    const range = PVP_RULES.weapons[g.loadout(f).basic].range;
    if (enemy && !retreat && d < range * 0.65) {
      dx = 0;
      dy = 0;
    }
    const angle = enemy
      ? Math.atan2(enemy.y - p.y, enemy.x - p.x) +
        Math.sin(g.time * 2 + hashString(f.id)) * CONFIG.botAimError
      : Math.atan2(dy, dx);
    f.input = {
      ...f.input,
      moveX: dx,
      moveY: dy,
      aimX: Math.cos(angle),
      aimY: Math.sin(angle),
      seenTick: g.tick,
      ability:
        enemy && !retreat
          ? d < 95 && g.time >= f.cooldowns.pulse
            ? "pulse"
            : d < range
              ? "basic"
              : "skill"
          : "none",
    };
    f.lastInputAt = g.time;
    if (role === "COMANDANTE") {
      g.order(f.id, lane, retreat ? "RECUAR" : defend ? "DEFENDER" : "ATACAR");
      g.recruit(f.id, lane, "SOLDADO", 3, "LINHA");
    } else if (role === "CONSTRUTOR") {
      const damaged = g.structures.find(
        (s) =>
          s.team === f.team &&
          s.hp > 0 &&
          s.hp < s.maxHp &&
          Math.hypot(s.x - p.x, s.y - p.y) < 160,
      );
      if (damaged) g.repair(f.id, damaged.id);
      else g.build(f.id, "TORRE", p.x, p.y + 90);
    } else g.upgrade(f.id, retreat ? "health" : "damage");
  }
}
