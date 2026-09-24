import { PvpSimulation, type FighterSeed, type Fighter } from "./pvp";
import {
  WAR,
  type WarMinion,
  type WarStructure,
  type WarView,
  type WarRole,
  type TroopType,
  type GroupOrder,
} from "../content/war";
import { PVP_RULES } from "../content/mode-rules";
import { MATCHMAKING_CONFIG } from "../content/matchmaking";
import { combatBody } from "./competitive-combat";
import { updateWarBots } from "./war-bots";
import { Pool } from "./collections";
import { predictMove } from "../network/movement";
import { STRUCTURE_DEFINITIONS } from "../content/catalog";
import { clamp } from "./math";
export class WarSimulation extends PvpSimulation {
  readonly units = new Pool<WarMinion>(
    () => ({
      id: 0,
      team: 0,
      lane: 0,
      kind: "SOLDADO",
      x: 0,
      y: 0,
      hp: 0,
      maxHp: 0,
      speed: 0,
      damage: 0,
      cooldown: 0,
    }),
    WAR.minionCap,
  );
  energy = new Map<string, number>();
  roles = new Map<string, WarRole>();
  upgradeRanks = new Map<
    string,
    { damage: number; health: number; speed: number }
  >();
  actionsAt = new Map<string, number>();
  orders: GroupOrder[][] = [
    ["ATACAR", "ATACAR", "ATACAR"],
    ["ATACAR", "ATACAR", "ATACAR"],
  ];
  troops: TroopType[][] = [
    ["SOLDADO", "SOLDADO", "SOLDADO"],
    ["SOLDADO", "SOLDADO", "SOLDADO"],
  ];
  troopRanks = [0, 0];
  objective = { owner: null as number | null, capture: 0, nextReward: 0 };
  objectiveTeam: number | null = null;
  incomeAt = 10;
  structures: WarStructure[] = [];
  nextUnit = 1;
  waveAt = 3;
  left = new Set<string>();
  constructor(seeds: FighterSeed[], mapId = "ruins", seed = "competitive") {
    super(seeds, mapId, seed, "pvp5v5");
    if (
      seeds.length !== 10 ||
      [0, 1].some((t) => seeds.filter((s) => s.team === t).length !== 5)
    )
      throw new Error("Guerra requer 5×5");
    this.width = WAR.width;
    this.height = WAR.height;
    for (const team of [0, 1])
      if (
        seeds.filter((s) => s.team === team && s.role === "COMANDANTE").length >
        1
      )
        throw new Error("Máximo um Comandante por time.");
    for (const s of seeds) {
      this.roles.set(s.id, s.role || "SOLDADO");
      this.energy.set(s.id, s.role === "COMANDANTE" ? 120 : 100);
      this.upgradeRanks.set(s.id, { damage: 0, health: 0, speed: 0 });
    }
    for (const team of [0, 1]) {
      this.structures.push({
        id: `core:${team}`,
        team,
        kind: "CORE",
        x: team === 0 ? 130 : 2470,
        y: 700,
        r: 65,
        hp: WAR.coreHp,
        maxHp: WAR.coreHp,
        cooldown: 0,
      });
      for (let lane = 0; lane < 3; lane++)
        this.structures.push({
          id: `tower:${team}:${lane}`,
          team,
          kind: "TORRE",
          x: team === 0 ? 600 : 2000,
          y: WAR.lanes[lane],
          r: 30,
          hp: WAR.towerHp,
          maxHp: WAR.towerHp,
          cooldown: 0,
        });
    }
    this.resetPositions();
  }
  botNextDecision = new Map<string, number>();
  targetBodies = new Map<number, import("./types").Enemy>();
  structureBodyIds = new Map<string, number>();
  override environment(f: Fighter, dt: number) {
    super.environment(f, dt);
    const enemyCore = this.structures.find(
      (s) => s.kind === "CORE" && s.team !== f.team && s.hp > 0,
    );
    if (
      enemyCore &&
      Math.hypot(f.player.x - enemyCore.x, f.player.y - enemyCore.y) <
        PVP_RULES.baseDefenseRadius &&
      Math.floor(this.time / 0.5) !== Math.floor((this.time - dt) / 0.5)
    )
      this.hurtFighter(f, PVP_RULES.baseDefenseDamage);
  }
  override disconnectedStep(f: Fighter) {
    if (
      !f.connected &&
      !f.isBot &&
      !f.botControlled &&
      this.time - f.disconnectedAt >= MATCHMAKING_CONFIG.reconnectGraceSeconds
    ) {
      f.botControlled = true;
      f.botEverControlled = true;
      this.log("bot-takeover", f.id);
    }
  }
  override reconnect(id: string) {
    const f = this.fighters.get(id);
    if (!f || f.isBot || this.ended || this.left.has(id)) return false;
    f.botControlled = false;
    f.connected = true;
    f.input.ability = "none";
    f.input.moveX = f.input.moveY = 0;
    this.log("reconnect", id);
    return true;
  }
  override combatTargets(owner: Fighter) {
    const targets = super.combatTargets(owner);
    const body = (
      id: number,
      p: { x: number; y: number },
      r: number,
      hp: () => number,
    ) => {
      let b = this.targetBodies.get(id);
      if (!b) {
        b = combatBody(id, p, r, hp);
        this.targetBodies.set(id, b);
      }
      return b;
    };
    for (const u of this.units?.items || [])
      if (u.team !== owner.team && u.hp > 0)
        targets.push({
          body: body(1000 + u.id, u, 10, () => u.hp),
          hurt: (n) => this.hitMinion(u, n, owner),
        });
    for (const s of this.structures || [])
      if (s.team !== owner.team && s.hp > 0) {
        // Structures have stable public IDs; distinct namespace from minions and fighters.
        if (!this.structureBodyIds.has(s.id))
          this.structureBodyIds.set(s.id, 2000000 + this.structureBodyIds.size);
        const id = this.structureBodyIds.get(s.id)!;
        targets.push({
          body: body(id, s, s.r, () => s.hp),
          hurt: (n) => this.hurtStructure(s, n, owner),
        });
      }
    return targets;
  }
  override forfeit(id: string) {
    const f = this.fighters.get(id);
    if (!f || this.ended || this.left.has(id)) return;
    this.left.add(id);
    this.forfeited.add(id);
    f.connected = false;
    f.botControlled = true;
    f.botEverControlled = true;
    f.disconnectedAt = this.time;
    this.log("forfeit", id);
    if (
      [...this.fighters.values()]
        .filter((p) => p.team === f.team && !p.isBot)
        .every((p) => this.left.has(p.id))
    ) {
      this.ended = true;
      this.winner = 1 - f.team;
      this.reason = "team-forfeit";
    }
  }
  spawnWave(
    team: number,
    lane: number,
    count = 3,
    kind: TroopType = "SOLDADO",
    formation = "LINHA",
  ) {
    for (let i = 0; i < count; i++) {
      if (
        this.units.items.filter((u) => u.team === team).length >=
        WAR.minionCap / 2
      )
        return;
      const unit = this.units.take();
      if (!unit) return;
      Object.assign(unit, {
        id: this.nextUnit++,
        team,
        lane,
        kind,
        x: (team === 0 ? 180 : 2420) + (formation === "COLUNA" ? i * 18 : 0),
        y:
          WAR.lanes[lane] +
          ((i % 3) - 1) * (formation === "DISPERSAR" ? 42 : 22),
        hp:
          (kind === "TANQUE" ? 130 : kind === "SUPORTE" ? 45 : 55) *
          (1 + this.troopRanks[team] * 0.1),
        maxHp:
          (kind === "TANQUE" ? 130 : kind === "SUPORTE" ? 45 : 55) *
          (1 + this.troopRanks[team] * 0.1),
        speed: kind === "TANQUE" ? 42 : 65,
        damage:
          (kind === "TANQUE" ? 12 : kind === "SUPORTE" ? 4 : 7) *
          (1 + this.troopRanks[team] * 0.1),
        cooldown: 0,
      });
    }
  }
  hurtStructure(s: WarStructure, damage: number, owner?: Fighter) {
    if (s.hp <= 0) return;
    if (owner)
      damage *= 1 + 0.04 * (this.upgradeRanks.get(owner.id)?.damage || 0);
    const before = s.hp;
    s.hp = Math.max(0, s.hp - damage);
    if (before > 0 && s.hp === 0) {
      this.log("structure-destroyed", owner?.id, s.id);
      this.onStructureDestroyed(s, owner);
    }
  }
  onStructureDestroyed(s: WarStructure, owner?: Fighter) {
    for (const f of this.fighters.values())
      if (f.team !== s.team) this.credit(f.id, owner?.id === f.id ? 45 : 20);
  }
  onMinionKilled(m: WarMinion, owner?: Fighter) {
    if (owner) this.credit(owner.id, m.kind === "TANQUE" ? 10 : 5);
  }
  hitMinion(m: WarMinion, amount: number, owner?: Fighter) {
    if (m.hp <= 0) return;
    if (owner)
      amount *= 1 + 0.04 * (this.upgradeRanks.get(owner.id)?.damage || 0);
    m.hp = Math.max(0, m.hp - amount);
    if (m.hp === 0) this.onMinionKilled(m, owner);
  }
  override checkObjective() {
    const cores = this.structures.filter((s) => s.kind === "CORE");
    if (cores.length < 2) return;
    this.score = cores.map((c) => Math.ceil(c.hp));
    if (this.time >= 1800 && cores.every((c) => c.hp > 0)) {
      const low = Math.min(...cores.map((c) => c.hp));
      for (const c of cores) if (c.hp === low) c.hp = 0;
    }
    if (cores.some((c) => c.hp <= 0)) {
      this.ended = true;
      this.winner = cores.every((c) => c.hp <= 0)
        ? null
        : cores[0].hp > 0
          ? 0
          : 1;
      this.reason = "core";
      this.log("core-destroyed", undefined, undefined, this.winner ?? -1);
    }
  }
  override step(dt = 0.04) {
    for (const [id, b] of this.targetBodies) {
      if (b.dead) {
        this.targetBodies.delete(id);
        continue;
      }
      for (const [status, effect] of Object.entries(b.statuses)) {
        effect.duration -= dt;
        if (effect.duration <= 0) delete b.statuses[status];
      }
      for (const status of Object.keys(b.controlImmunity || {}))
        b.controlImmunity![status] = Math.max(
          0,
          b.controlImmunity![status] - dt,
        );
    }
    for (const f of this.fighters.values()) this.disconnectedStep(f);
    updateWarBots(this);
    super.step(dt);
    if (this.ended || this.time < this.intermissionUntil) return;
    if (this.time >= this.incomeAt) {
      this.incomeAt = this.time + 10;
      for (const f of this.fighters.values())
        if (!this.left.has(f.id) || f.botControlled) this.credit(f.id, 5);
    }
    const capturing = [0, 1].map((team) =>
      [...this.fighters.values()].some(
        (f) =>
          f.team === team &&
          (f.connected || f.botControlled) &&
          f.player.health > 0 &&
          Math.hypot(f.player.x - 1300, f.player.y - 700) < 110,
      ),
    );
    const captureTeam =
      capturing[0] === capturing[1] ? null : capturing[0] ? 0 : 1;
    if (captureTeam !== null) {
      if (this.objectiveTeam !== captureTeam) {
        this.objectiveTeam = captureTeam;
        this.objective.capture = 0;
      }
      this.objective.capture = Math.min(10, this.objective.capture + dt);
      if (this.objective.capture >= 10) {
        this.objective.owner = captureTeam;
        if (this.time >= this.objective.nextReward) {
          this.objective.nextReward = this.time + 60;
          for (const f of this.fighters.values())
            if (f.team === captureTeam) this.credit(f.id, 30);
          this.log("objective", undefined, undefined, captureTeam);
        }
      }
    }
    if (this.time >= this.waveAt) {
      this.waveAt = this.time + WAR.waveSeconds;
      for (const team of [0, 1])
        for (let lane = 0; lane < 3; lane++) this.spawnWave(team, lane);
    }
    for (const f of this.fighters.values()) {
      if (f.player.health <= 0) {
        if (!f.respawnAt)
          f.respawnAt =
            this.time + Math.min(20, 8 + Math.floor(this.time / 120));
        if (this.time >= f.respawnAt) {
          f.player.health = f.player.maxHealth;
          f.player.x = f.team === 0 ? 230 : 2370;
          f.player.y = 700;
          f.respawnAt = 0;
          f.protectedUntil = this.time + PVP_RULES.spawnProtection;
          f.body.statuses = {};
          f.body.controlImmunity = {};
          this.log("respawn", f.id);
        }
      }
      if (f.player.health > 0) {
        for (const s of this.structures) {
          if (s.hp <= 0) continue;
          const dx = f.player.x - s.x,
            dy = f.player.y - s.y,
            d = Math.hypot(dx, dy);
          if (d < s.r + 13) {
            const angle = d ? Math.atan2(dy, dx) : 0;
            f.player.x = s.x + Math.cos(angle) * (s.r + 13);
            f.player.y = s.y + Math.sin(angle) * (s.r + 13);
          }
        }
        f.player.x = clamp(f.player.x, 20, this.width - 20);
        f.player.y = clamp(f.player.y, 20, this.height - 20);
      }
    }
    for (const u of this.units.items) {
      if (u.hp <= 0) continue;
      const near = [...this.fighters.values()].some(
        (f) =>
          Math.abs(f.player.x - u.x) < 600 && Math.abs(f.player.y - u.y) < 450,
      );
      if (!near && this.tick % 5 !== 0) continue;
      this.moveMinion(u, dt * (near ? 1 : 5));
    }
    for (let i = this.units.items.length - 1; i >= 0; i--)
      if (this.units.items[i].hp <= 0) this.units.remove(i);
    for (const tower of this.structures) {
      if (tower.hp <= 0 || tower.kind !== "TORRE" || tower.cooldown > this.time)
        continue;
      const target = this.units.items.find(
        (u) =>
          u.team !== tower.team &&
          Math.hypot(u.x - tower.x, u.y - tower.y) < 210,
      );
      if (target) {
        this.hitMinion(target, 22);
        tower.cooldown = this.time + 0.8;
      } else {
        const f = [...this.fighters.values()].find(
          (f) =>
            f.team !== tower.team &&
            f.player.health > 0 &&
            Math.hypot(f.player.x - tower.x, f.player.y - tower.y) < 210,
        );
        if (f) {
          this.hurtFighter(f, 18);
          tower.cooldown = this.time + 0.8;
        }
      }
    }
    this.checkObjective();
  }
  hurtFighter(f: Fighter, amount: number) {
    if (f.player.health <= 0 || this.time < f.protectedUntil) return;
    f.player.health = Math.max(0, f.player.health - amount);
    if (f.player.health === 0) {
      f.deaths++;
      this.log("minion-kill", undefined, f.id);
    }
  }
  moveMinion(u: WarMinion, dt: number) {
    u.cooldown -= dt;
    const body = this.targetBodies.get(1000 + u.id);
    if ((body?.statuses.freeze?.duration || 0) > 0) return;
    dt *= body?.statuses.slow?.magnitude || 1;
    const foe = this.units.items.find(
        (e) =>
          e.hp > 0 &&
          e.team !== u.team &&
          Math.hypot(e.x - u.x, e.y - u.y) < 38,
      ),
      fighter = [...this.fighters.values()].find(
        (f) =>
          f.team !== u.team &&
          f.player.health > 0 &&
          Math.hypot(f.player.x - u.x, f.player.y - u.y) < 60,
      ),
      structure = this.structures.find(
        (s) =>
          s.team !== u.team &&
          s.hp > 0 &&
          Math.hypot(s.x - u.x, s.y - u.y) < s.r + 28,
      );
    if (foe || fighter || structure) {
      if (u.cooldown <= 0) {
        u.cooldown = 0.9;
        if (foe) this.hitMinion(foe, u.damage);
        else if (fighter) this.hurtFighter(fighter, u.damage);
        else if (structure) this.hurtStructure(structure, u.damage);
      }
      return;
    }
    if (u.kind === "SUPORTE" && u.cooldown <= 0) {
      for (const ally of this.units.items)
        if (
          ally.team === u.team &&
          ally.hp > 0 &&
          Math.hypot(ally.x - u.x, ally.y - u.y) < 95
        )
          ally.hp = Math.min(ally.maxHp, ally.hp + 3);
      u.cooldown = 1.5;
    }
    const target = this.minionDestination(u),
      dx = target.x - u.x,
      dy = target.y - u.y,
      len = Math.max(1, Math.hypot(dx, dy)),
      step = Math.min(len, u.speed * dt);
    let mx = dx / len,
      my = dy / len;
    const obstacle = this.world.nearby.find(
      (s) =>
        !s.destroyed &&
        STRUCTURE_DEFINITIONS[s.type]?.collidable &&
        Math.hypot(u.x + mx * 45 - s.x, u.y + my * 45 - s.y) < s.r + 25,
    );
    if (obstacle) {
      mx *= 0.3;
      my = u.y <= obstacle.y ? -1 : 1;
    }
    const move = predictMove(
      u,
      { x: mx, y: my },
      step * (this.world.isWater(u.x, u.y) ? PVP_RULES.waterSpeed : 1),
      1,
      this.world.nearby,
    );
    u.x = move.x;
    u.y = move.y;
  }
  minionDestination(u: WarMinion) {
    const order = this.orders[u.team][u.lane];
    if (order === "RECUAR")
      return { x: u.team === 0 ? 230 : 2370, y: WAR.lanes[u.lane] };
    if (order === "DEFENDER")
      return { x: u.team === 0 ? 560 : 2040, y: WAR.lanes[u.lane] };
    if (order === "FOCAR_TORRE") {
      const tower = this.structures.find(
        (s) =>
          s.team !== u.team &&
          s.kind === "TORRE" &&
          s.hp > 0 &&
          Math.abs(s.y - WAR.lanes[u.lane]) < 80,
      );
      if (tower) return tower;
    }
    if (order === "FOCAR_BASE") return { x: u.team === 0 ? 2470 : 130, y: 700 };
    return {
      x: u.team === 0 ? 2470 : 130,
      y: (u.team === 0 ? u.x > 2200 : u.x < 400) ? 700 : WAR.lanes[u.lane],
    };
  }
  credit(id: string, amount: number) {
    const f = this.fighters.get(id);
    if (!f || (this.left.has(id) && !f.botControlled)) return;
    const cores = this.structures.filter((s) => s.kind === "CORE"),
      defensive = cores[f.team]?.hp < cores[1 - f.team]?.hp ? 1.15 : 1;
    this.energy.set(
      id,
      Math.min(
        WAR.maxEnergy,
        (this.energy.get(id) || 0) + Math.floor(amount * defensive),
      ),
    );
  }
  spend(id: string, amount: number) {
    if (!Number.isSafeInteger(amount) || amount <= 0) return false;
    const balance = this.energy.get(id) || 0;
    if (balance < amount) return false;
    this.energy.set(id, balance - amount);
    return true;
  }
  allowed(id: string, role: WarRole) {
    const f = this.fighters.get(id);
    return f &&
      (f.connected || f.botControlled) &&
      f.player.health > 0 &&
      !this.ended &&
      (!this.left.has(id) || f.botControlled) &&
      this.roles.get(id) === role
      ? f
      : null;
  }
  override damage(target: Fighter, amount: number, owner: Fighter) {
    const before = target.player.health;
    super.damage(
      target,
      amount * (1 + 0.04 * (this.upgradeRanks.get(owner.id)?.damage || 0)),
      owner,
    );
    if (before > 0 && target.player.health === 0) {
      this.credit(owner.id, 20 + Math.min(40, target.kills * 5));
      for (const f of this.fighters.values())
        if (
          f.id !== owner.id &&
          f.team === owner.team &&
          Math.hypot(
            f.player.x - target.player.x,
            f.player.y - target.player.y,
          ) < 350
        )
          this.credit(f.id, 5);
    }
  }
  build(id: string, kind: "TORRE" | "BARRICADA", x: number, y: number) {
    const f = this.allowed(id, "CONSTRUTOR"),
      r = kind === "TORRE" ? 24 : 28,
      cost = kind === "TORRE" ? 80 : 30;
    if (
      !f ||
      (this.actionsAt.get(id) || 0) > this.time ||
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      x < 100 ||
      x > 2500 ||
      y < 100 ||
      y > 1300 ||
      Math.hypot(x - f.player.x, y - f.player.y) > 160
    )
      return false;
    if (
      !(f.team === 0 ? x <= 1350 : x >= 1250) &&
      !this.structures.some(
        (s) =>
          s.team === f.team && s.hp > 0 && Math.hypot(x - s.x, y - s.y) < 200,
      )
    )
      return false;
    if (
      this.world.nearby.some(
        (s) => !s.destroyed && Math.hypot(x - s.x, y - s.y) < r + s.r + 25,
      ) ||
      this.structures.some(
        (s) => s.hp > 0 && Math.hypot(x - s.x, y - s.y) < r + s.r + 20,
      ) ||
      [...this.fighters.values()].some(
        (p) =>
          p.player.health > 0 &&
          Math.hypot(x - p.player.x, y - p.player.y) < r + 20,
      )
    )
      return false;
    if (
      this.structures.filter((s) => s.ownerId === id && s.hp > 0).length >= 4 ||
      this.structures.filter((s) => s.team === f.team && s.ownerId && s.hp > 0)
        .length >= 8 ||
      !this.spend(id, cost)
    )
      return false;
    this.structures = this.structures.filter((s) => !s.ownerId || s.hp > 0);
    this.structures.push({
      id: `built:${this.nextUnit++}`,
      ownerId: id,
      team: f.team,
      kind,
      x,
      y,
      r,
      hp: kind === "TORRE" ? 220 : 300,
      maxHp: kind === "TORRE" ? 220 : 300,
      cooldown: this.time + 2,
    });
    this.actionsAt.set(id, this.time + 4);
    this.log("build:" + kind, id);
    return true;
  }
  repair(id: string, targetId: string) {
    const f = this.allowed(id, "CONSTRUTOR"),
      s = this.structures.find((s) => s.id === targetId);
    if (
      !f ||
      !s ||
      s.team !== f.team ||
      s.hp <= 0 ||
      s.hp >= s.maxHp ||
      Math.hypot(s.x - f.player.x, s.y - f.player.y) > 160 ||
      (this.actionsAt.get(id) || 0) > this.time ||
      !this.spend(id, 20)
    )
      return false;
    s.hp = Math.min(s.maxHp, s.hp + 50);
    this.actionsAt.set(id, this.time + 2);
    this.log("repair", id, s.id);
    return true;
  }
  order(id: string, lane: number, order: GroupOrder) {
    const f = this.allowed(id, "COMANDANTE");
    if (!f || !Number.isInteger(lane) || lane < 0 || lane > 2) return false;
    this.orders[f.team][lane] = order;
    this.log("order:" + order, id, undefined, lane);
    return true;
  }
  recruit(
    id: string,
    lane: number,
    kind: TroopType,
    count: number,
    formation: string,
  ) {
    const f = this.allowed(id, "COMANDANTE"),
      cost = count * (kind === "TANQUE" ? 25 : kind === "SUPORTE" ? 20 : 10);
    if (
      !f ||
      !Number.isInteger(lane) ||
      lane < 0 ||
      lane > 2 ||
      !Number.isInteger(count) ||
      count < 1 ||
      count > 10 ||
      (this.actionsAt.get(id) || 0) > this.time ||
      this.units.items.length + count > WAR.minionCap ||
      this.units.items.filter((u) => u.team === f.team).length + count >
        WAR.minionCap / 2 ||
      !this.spend(id, cost)
    )
      return false;
    this.troops[f.team][lane] = kind;
    this.spawnWave(f.team, lane, count, kind, formation);
    this.actionsAt.set(id, this.time + 6);
    this.log("recruit:" + kind, id, undefined, count);
    return true;
  }
  upgrade(id: string, kind: "damage" | "health" | "speed" | "troops") {
    const f = this.fighters.get(id);
    if (
      !f ||
      (!f.connected && !f.botControlled) ||
      f.player.health <= 0 ||
      this.ended
    )
      return false;
    if (kind === "troops") {
      if (
        !this.allowed(id, "COMANDANTE") ||
        this.troopRanks[f.team] >= 3 ||
        !this.spend(id, 100 * (this.troopRanks[f.team] + 1))
      )
        return false;
      this.troopRanks[f.team]++;
    } else {
      const ranks = this.upgradeRanks.get(id)!;
      if (
        !this.allowed(id, "SOLDADO") ||
        ranks[kind] >= 3 ||
        !this.spend(id, 50 * (ranks[kind] + 1))
      )
        return false;
      ranks[kind]++;
      if (kind === "health") {
        f.player.maxHealth = 100 + 10 * ranks.health;
        f.player.health = Math.min(
          f.player.maxHealth,
          f.player.health + 10 * PVP_RULES.healing,
        );
      }
      if (kind === "speed") f.player.speed = 220 * (1 + 0.02 * ranks.speed);
    }
    this.log("upgrade:" + kind, id);
    return true;
  }
  override snapshot(id: string) {
    const base = super.snapshot(id),
      f = this.fighters.get(id)!;
    const near = (x: number, y: number) =>
      Math.abs(x - f.player.x) <= WAR.interestX &&
      Math.abs(y - f.player.y) <= WAR.interestY;
    const war: WarView = {
      cores: this.structures.filter((s) => s.kind === "CORE").map((s) => s.hp),
      energy: this.energy.get(id) || 0,
      role: this.roles.get(id) || "SOLDADO",
      minions: this.units.items
        .filter((u) => near(u.x, u.y))
        .map((u) => ({
          id: u.id,
          team: u.team,
          kind: u.kind,
          x: u.x,
          y: u.y,
          hp: u.hp,
          maxHp: u.maxHp,
        })),
      structures: this.structures,
      orders: this.orders[f.team],
      troops: this.troops[f.team],
      upgrades:
        this.roles.get(id) === "COMANDANTE"
          ? this.troopRanks[f.team]
          : Object.values(this.upgradeRanks.get(id)!).reduce(
              (a, b) => a + b,
              0,
            ),
      entityCount: this.units.items.length,
      objective: this.objective,
    };
    return {
      ...base,
      roundRemaining: Math.max(0, 1800 - this.time),
      players: base.players,
      bullets: base.bullets.filter((b) => near(b.x, b.y)),
      war,
    };
  }
}
