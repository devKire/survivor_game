import { MATCHMAKING_CONFIG as CONFIG } from "../content/matchmaking";
import { WAR, WAR_ITEM_DEFINITIONS } from "../content/war";
import { PVP_RULES } from "../content/mode-rules";
import { PVP_BOT_BUILD_PREFERENCES } from "../content/pvp";
import { hashString } from "./math";
import type { WarBotBrain, WarSimulation } from "./war";
import type { Fighter } from "./pvp";

function makeBrain(f: Fighter): WarBotBrain {
  return {
    state: "RETURN_BASE",
    lane: hashString(f.id) % WAR.lanes.length,
    targetId: null,
    lastX: f.player.x,
    lastY: f.player.y,
    stuckSeconds: 0,
    detourSide: hashString(f.id + ":side") % 2 ? 1 : -1,
    lastDecisionAt: 0,
    nextLaneAt: 0,
  };
}

function closest<T extends { x: number; y: number }>(items: T[], x: number, y: number) {
  return items.slice().sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y))[0];
}

/** Server-only objective brain. Bots submit ordinary movement/ability and class intents. */
export function updateWarBots(g: WarSimulation) {
  if (g.ended || g.time < g.intermissionUntil) return;
  for (const f of g.fighters.values()) {
    if (!f.botControlled) continue;
    let brain = g.botBrains.get(f.id);
    if (!brain) g.botBrains.set(f.id, (brain = makeBrain(f)));
    if (f.player.health <= 0) {
      brain.state = "DEAD";
      brain.targetId = null;
      brain.stuckSeconds = 0;
      continue;
    }
    if ((g.botNextDecision.get(f.id) || 0) > g.time) continue;
    const elapsed = Math.max(CONFIG.botDecisionSeconds, g.time - brain.lastDecisionAt || CONFIG.botDecisionSeconds);
    g.botNextDecision.set(f.id, g.time + CONFIG.botDecisionSeconds);
    brain.lastDecisionAt = g.time;

    const p = f.player;
    const moved = Math.hypot(p.x - brain.lastX, p.y - brain.lastY);
    if (moved < 5) brain.stuckSeconds += elapsed;
    else brain.stuckSeconds = 0;
    brain.lastX = p.x;
    brain.lastY = p.y;
    if (brain.stuckSeconds >= 2) {
      brain.detourSide *= -1;
      brain.stuckSeconds = 0;
    }

    const progress = g.progress.get(f.id)!;
    const preferences = PVP_BOT_BUILD_PREFERENCES[p.character as keyof typeof PVP_BOT_BUILD_PREFERENCES];
    while (progress.pendingUpgrades > 0) {
      const choice = progress.choices.find((option) => preferences.includes(option.id)) || progress.choices[0];
      if (!choice || !g.chooseUpgrade(f.id, progress.decision, choice.id)) break;
    }
    if (g.shopAvailable(f)) {
      const preferred = Object.values(WAR_ITEM_DEFINITIONS).filter((item) =>
        item.cost <= progress.warGold &&
        !progress.items.some((slot) => slot.id === item.id),
      ).sort((a, b) => a.cost - b.cost)[0];
      if (preferred) g.buyItem(f.id, preferred.id);
    }

    if (g.time >= brain.nextLaneAt) {
      const weakTower = g.structures
        .filter((s) => s.team !== f.team && s.kind === "TORRE" && s.hp > 0)
        .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
      if (weakTower) {
        const laneIndex = WAR.lanes.findIndex((lane) => lane === weakTower.y);
        if (laneIndex >= 0) brain.lane = laneIndex;
      }
      brain.nextLaneAt = g.time + 8;
    }

    const visible = g.combatTargets(f).filter(({ body }) =>
      Math.hypot(body.x - p.x, body.y - p.y) < CONFIG.botSight && g.lineClear(p, body),
    );
    const locked = visible.find(({ body }) => body.id === brain.targetId);
    const fighters = visible.filter(({ body }) => body.id > 0 && body.id < 1000);
    const minions = visible.filter(({ body }) => body.id >= 1000 && body.id < 2_000_000);
    const nearest = closest(visible.map((entry) => entry.body), p.x, p.y);
    const target = locked || visible.find((entry) => entry.body === nearest);
    const enemy = target?.body;
    brain.targetId = enemy?.id ?? null;

    const homeX = f.team === 0 ? 230 : 2370;
    const ownCoreThreat = [...g.fighters.values()].find((other) =>
      other.team !== f.team && other.player.health > 0 &&
      Math.hypot(other.player.x - homeX, other.player.y - 700) < 430,
    );
    const nearbyAllies = [...g.fighters.values()].filter((other) => other.team === f.team && other.player.health > 0 && Math.hypot(other.player.x - p.x, other.player.y - p.y) < 420).length;
    const nearbyEnemies = [...g.fighters.values()].filter((other) => other.team !== f.team && other.player.health > 0 && Math.hypot(other.player.x - p.x, other.player.y - p.y) < 420).length;
    const retreat = p.health < p.maxHealth * (nearbyEnemies > nearbyAllies ? 0.38 : 0.28);
    const objectiveSafe = nearbyEnemies <= nearbyAllies + 1;
    const needsObjective = g.objective.owner !== f.team;
    const ownTower = g.structures.find((s) => s.team === f.team && s.kind === "TORRE" && Math.abs(s.y - WAR.lanes[brain.lane]) < 80);
    const laneThreat = !!ownTower && g.units.items.some((unit) =>
      unit.team !== f.team && unit.hp > 0 && Math.hypot(unit.x - ownTower.x, unit.y - ownTower.y) < 300,
    );
    const nearEnemyTower = g.structures.find((s) =>
      s.team !== f.team && s.kind === "TORRE" && s.hp > 0 &&
      Math.hypot(s.x - p.x, s.y - p.y) < 310 && Math.abs(s.y - WAR.lanes[brain.lane]) < 80,
    );
    const alliedWave = nearEnemyTower && g.units.items.some((unit) =>
      unit.team === f.team && unit.hp > 0 && Math.hypot(unit.x - nearEnemyTower.x, unit.y - nearEnemyTower.y) < 240,
    );

    if (retreat) brain.state = p.health < p.maxHealth * 0.22 ? "RETURN_BASE" : "RETREAT";
    else if (ownCoreThreat) brain.state = "DEFEND_CORE";
    else if (laneThreat) brain.state = "DEFEND_LANE";
    else if (needsObjective && objectiveSafe && Math.hypot(p.x - 1300, p.y - 700) < 700) brain.state = "CONTEST_OBJECTIVE";
    else if (nearEnemyTower && !alliedWave && nearbyAllies < nearbyEnemies + 2) brain.state = "DISENGAGE";
    else if (fighters.length && nearbyEnemies > nearbyAllies + 1) brain.state = "DISENGAGE";
    else if (fighters.length) brain.state = "ENGAGE";
    else if (minions.length) brain.state = "FARM";
    else if (g.roles.get(f.id) !== "SOLDADO") brain.state = "ROLE_TASK";
    else brain.state = "PUSH";

    let destination: { x: number; y: number };
    if (brain.state === "RETURN_BASE" || brain.state === "RETREAT") {
      const fountain = closest(g.world.nearby.filter((s) => s.type === "fountain" && (g.fountainReady.get(s.id) || 0) <= g.time), p.x, p.y);
      destination = fountain || { x: homeX, y: WAR.lanes[brain.lane] };
    } else if (brain.state === "DEFEND_CORE") destination = ownCoreThreat!.player;
    else if (brain.state === "CONTEST_OBJECTIVE") destination = { x: 1300, y: 700 };
    else if (brain.state === "DISENGAGE") destination = { x: f.team === 0 ? 445 : 2155, y: WAR.lanes[brain.lane] };
    else if (brain.state === "DEFEND_LANE") destination = { x: ownTower?.x || (f.team === 0 ? 600 : 2000), y: WAR.lanes[brain.lane] };
    else if (brain.state === "ROLE_TASK" && g.roles.get(f.id) === "COMANDANTE" && needsObjective) destination = { x: 1300, y: 700 };
    else if ((brain.state === "ENGAGE" || brain.state === "FARM") && enemy) destination = enemy;
    else {
      const tower = g.structures.find((s) => s.team !== f.team && s.kind === "TORRE" && s.hp > 0 && Math.abs(s.y - WAR.lanes[brain.lane]) < 80);
      destination = tower || { x: f.team === 0 ? 2470 : 130, y: 700 };
    }

    let dx = destination.x - p.x, dy = destination.y - p.y;
    const d = Math.max(1, Math.hypot(dx, dy));
    dx /= d;
    dy /= d;
    const obstacle = g.world.nearby.find((s) =>
      !s.destroyed && Math.hypot(p.x + dx * 55 - s.x, p.y + dy * 55 - s.y) < s.r + 28,
    );
    if (obstacle || brain.stuckSeconds > 0.8) {
      dx = (f.team === 0 ? 0.35 : -0.35);
      dy = brain.detourSide;
    }

    const weapons = g.combat.get(f.id)!.player.weapons;
    const range = Math.max(90, ...weapons.map((weapon) => PVP_RULES.weapons[weapon.id]?.range || 200));
    if (enemy && (brain.state === "ENGAGE" || brain.state === "FARM")) {
      const distance = Math.hypot(enemy.x - p.x, enemy.y - p.y);
      if (distance < range * 0.6) {
        const strafe = Math.sin(g.time * 1.3 + hashString(f.id));
        dx = -dy * strafe * 0.48;
        dy = dx * 0.2 + Math.sign(strafe) * 0.48;
      }
    }

    const angle = enemy
      ? Math.atan2(enemy.y - p.y, enemy.x - p.x) + Math.sin(g.time * 2 + hashString(f.id)) * CONFIG.botAimError
      : Math.atan2(dy, dx);
    f.input = {
      ...f.input,
      moveX: dx,
      moveY: dy,
      aimX: Math.cos(angle),
      aimY: Math.sin(angle),
      seenTick: g.tick,
      ability: enemy && brain.state === "ENGAGE" && d < 95 && g.time >= f.cooldowns.dash ? "dash" : "none",
    };
    f.lastInputAt = g.time;

    const role = g.roles.get(f.id);
    if (role === "COMANDANTE") {
      const laneOrder = brain.state === "RETREAT" ? "RECUAR" : brain.state === "DEFEND_CORE" ? "DEFENDER" : "ATACAR";
      if (g.orders[f.team][brain.lane] !== laneOrder) g.order(f.id, brain.lane, laneOrder);
      const laneMinions = g.units.items.filter((unit) => unit.team === f.team && unit.lane === brain.lane && unit.hp > 0).length;
      if (laneMinions < 8) g.recruit(f.id, brain.lane, "SOLDADO", 3, "LINHA");
      if (g.troopRanks[f.team] < 3) g.upgrade(f.id, "troops");
    } else if (role === "CONSTRUTOR") {
      const damaged = g.structures
        .filter((s) => s.team === f.team && s.hp > 0 && s.hp < s.maxHp)
        .sort((a, b) => (a.kind === "CORE" ? -1 : b.kind === "CORE" ? 1 : a.hp / a.maxHp - b.hp / b.maxHp))[0];
      if (damaged && Math.hypot(damaged.x - p.x, damaged.y - p.y) < 160) g.repair(f.id, damaged.id);
      else if (damaged) {
        const repairX = damaged.x - p.x, repairY = damaged.y - p.y;
        const distance = Math.max(1, Math.hypot(repairX, repairY));
        f.input.moveX = repairX / distance;
        f.input.moveY = repairY / distance;
      }
      else {
        const forward = f.team === 0 ? 1 : -1;
        g.build(f.id, "TORRE", p.x + forward * 65, p.y + brain.detourSide * 70);
      }
    }
  }
}
