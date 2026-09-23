import { Player } from "./entities";
import { clamp, segmentDistance2 } from "./math";
import { predictMove } from "../network/movement";
import {
  PVP,
  PVP_LOADOUTS,
  type PvpCharacter,
  type PvpAbility,
} from "../content/pvp";
export interface PvpInput {
  sequence: number;
  moveX: number;
  moveY: number;
  aimX: number;
  aimY: number;
  ability: PvpAbility;
  seenTick: number;
}
export interface Fighter {
  id: string;
  name: string;
  team: number;
  player: Player;
  input: PvpInput;
  lastInputAt: number;
  ack: number;
  cooldowns: Record<PvpAbility, number>;
  connected: boolean;
  disconnectedAt: number;
  respawnAt: number;
  kills: number;
  deaths: number;
  damage: number;
  casts: number;
  hits: number;
}
export interface ArenaEvent {
  tick: number;
  type: string;
  actor?: string;
  target?: string;
  value?: number;
}
export interface ArenaBullet {
  id: number;
  owner: string;
  team: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  damage: number;
  r: number;
}
export interface FighterSeed {
  id: string;
  name: string;
  character: PvpCharacter;
  cosmetics: Record<string, string>;
  team: number;
  role?: import("../content/war").WarRole;
}
export class PvpSimulation {
  readonly fighters = new Map<string, Fighter>();
  readonly forfeited = new Set<string>();
  tick = 0;
  time = 0;
  round = 1;
  roundStarted = 0;
  intermissionUntil = 3;
  score = [0, 0];
  ended = false;
  winner: number | null = null;
  reason = "";
  bullets: ArenaBullet[] = [];
  events: ArenaEvent[] = [];
  nextBullet = 1;
  readonly history: {
    tick: number;
    positions: Map<string, { x: number; y: number }>;
  }[] = [];
  width: number = PVP.arena.width;
  height: number = PVP.arena.height;
  constructor(seeds: FighterSeed[]) {
    for (const s of seeds) {
      const p = new Player(s.character, {}, "PVP");
      p.cosmetics = s.cosmetics;
      p.maxHealth = p.health = PVP.hp;
      p.speed = PVP.speed;
      this.fighters.set(s.id, {
        id: s.id,
        name: s.name,
        team: s.team,
        player: p,
        input: {
          sequence: 0,
          moveX: 0,
          moveY: 0,
          aimX: s.team === 0 ? 1 : -1,
          aimY: 0,
          ability: "none",
          seenTick: 0,
        },
        lastInputAt: 0,
        ack: 0,
        cooldowns: { none: 0, basic: 0, skill: 0, pulse: 0, dash: 0 },
        connected: true,
        disconnectedAt: 0,
        respawnAt: 0,
        kills: 0,
        deaths: 0,
        damage: 0,
        casts: 0,
        hits: 0,
      });
    }
    this.resetPositions();
  }
  log(type: string, actor?: string, target?: string, value?: number) {
    if (this.events.length >= 4000) this.events.splice(0, 100);
    this.events.push({ tick: this.tick, type, actor, target, value });
  }
  resetPositions() {
    for (const f of this.fighters.values()) {
      f.player.x = f.team === 0 ? 120 : this.width - 120;
      f.player.y = this.height / 2;
      f.player.health = PVP.hp;
      f.cooldowns = { none: 0, basic: 0, skill: 0, pulse: 0, dash: 0 };
      f.input.ability = "none";
    }
    this.bullets = [];
    this.history.length = 0;
  }
  accept(id: string, input: PvpInput) {
    const f = this.fighters.get(id);
    if (!f || !f.connected || this.ended || input.sequence <= f.ack) return;
    f.ack = input.sequence;
    f.input = input;
    f.lastInputAt = this.time;
  }
  disconnect(id: string) {
    const f = this.fighters.get(id);
    if (f && f.connected) {
      f.connected = false;
      f.disconnectedAt = this.time;
      f.input.ability = "none";
      this.log("disconnect", id);
    }
  }
  reconnect(id: string) {
    const f = this.fighters.get(id);
    if (
      !f ||
      this.ended ||
      (!f.connected && this.time - f.disconnectedAt > PVP.reconnectSeconds)
    )
      return false;
    f.connected = true;
    this.log("reconnect", id);
    return true;
  }
  forfeit(id: string) {
    const f = this.fighters.get(id);
    if (f && !this.ended) {
      this.forfeited.add(id);
      this.winner = 1 - f.team;
      this.ended = true;
      this.reason = "forfeit";
      this.log("forfeit", id);
    }
  }
  damage(target: Fighter, amount: number, owner: Fighter) {
    if (target.player.health <= 0 || target.team === owner.team) return;
    const dealt = Math.min(target.player.health, amount);
    target.player.health -= dealt;
    owner.damage += dealt;
    owner.hits++;
    this.log("hit", owner.id, target.id, dealt);
    if (target.player.health <= 0) {
      target.deaths++;
      owner.kills++;
      this.log("kill", owner.id, target.id);
    }
  }
  cast(f: Fighter) {
    const a = f.input.ability,
      p = f.player,
      d = PVP_LOADOUTS[p.character as PvpCharacter];
    if (a === "none" || this.time < f.cooldowns[a]) return;
    const length = Math.hypot(f.input.aimX, f.input.aimY);
    if (length < 0.01) return;
    const ax = f.input.aimX / length,
      ay = f.input.aimY / length;
    f.cooldowns[a] =
      this.time + { basic: d.basicCooldown, skill: 4, pulse: 6, dash: 8 }[a];
    f.casts++;
    this.log("ability:" + a, f.id);
    if (a === "dash") {
      const next = predictMove(p, { x: ax, y: ay }, 120, 1, []);
      p.x = clamp(next.x, 20, this.width - 20);
      p.y = clamp(next.y, 20, this.height - 20);
      return;
    }
    if (a === "skill") {
      if (this.bullets.length < 256)
        this.bullets.push({
          id: this.nextBullet++,
          owner: f.id,
          team: f.team,
          x: p.x,
          y: p.y,
          vx: ax * d.boltSpeed,
          vy: ay * d.boltSpeed,
          life: 1.5,
          damage: d.boltDamage,
          r: 6,
        });
      return;
    }
    const rewind = this.history.find(
      (h) =>
        h.tick >=
        Math.max(
          this.tick - PVP.maxRewindTicks,
          Math.min(this.tick, f.input.seenTick),
        ),
    );
    const origin = a === "basic" ? rewind?.positions.get(f.id) || p : p;
    const range = a === "basic" ? d.basicRange : d.pulseRadius;
    let nearest: Fighter | undefined,
      dist = Infinity;
    for (const target of this.fighters.values()) {
      if (target.team === f.team || target.player.health <= 0) continue;
      const position =
        a === "basic"
          ? rewind?.positions.get(target.id) || target.player
          : target.player;
      const distance = Math.hypot(position.x - origin.x, position.y - origin.y);
      const hit =
        a === "pulse"
          ? distance < range + PVP.radius
          : segmentDistance2(
              position.x,
              position.y,
              origin.x,
              origin.y,
              origin.x + ax * range,
              origin.y + ay * range,
            ) <
            (PVP.radius + 4) ** 2;
      if (hit && a === "pulse") this.damage(target, d.pulseDamage, f);
      else if (hit && distance < dist) {
        nearest = target;
        dist = distance;
      }
    }
    if (nearest) this.damage(nearest, d.basicDamage, f);
  }
  step(dt = 1 / PVP.tickHz) {
    if (this.ended) return;
    this.tick++;
    this.time += dt;
    for (const f of this.fighters.values())
      if (!f.connected && this.time - f.disconnectedAt > PVP.reconnectSeconds) {
        this.forfeit(f.id);
        if (this.ended) return;
      }
    if (this.time < this.intermissionUntil) return;
    for (const f of this.fighters.values()) {
      if (
        !f.connected ||
        f.player.health <= 0 ||
        this.time - f.lastInputAt > 0.3
      )
        continue;
      const move = predictMove(
        f.player,
        { x: f.input.moveX, y: f.input.moveY },
        f.player.speed,
        dt,
        [],
      );
      f.player.x = clamp(move.x, 20, this.width - 20);
      f.player.y = clamp(move.y, 20, this.height - 20);
      this.cast(f);
    }
    for (const b of this.bullets) {
      if (b.life <= 0) continue;
      const x = b.x,
        y = b.y;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      for (const f of this.fighters.values()) {
        if (f.team === b.team || f.player.health <= 0) continue;
        if (
          segmentDistance2(f.player.x, f.player.y, x, y, b.x, b.y) <
          (b.r + PVP.radius) ** 2
        ) {
          const owner = this.fighters.get(b.owner);
          if (owner) this.damage(f, b.damage, owner);
          b.life = 0;
          break;
        }
      }
    }
    this.bullets = this.bullets.filter(
      (b) =>
        b.life > 0 &&
        b.x > 0 &&
        b.x < this.width &&
        b.y > 0 &&
        b.y < this.height,
    );
    this.history.push({
      tick: this.tick,
      positions: new Map(
        [...this.fighters].map(([id, f]) => [
          id,
          { x: f.player.x, y: f.player.y },
        ]),
      ),
    });
    if (this.history.length > 8) this.history.shift();
    this.checkObjective();
  }
  checkObjective() {
    const health = [0, 0];
    for (const f of this.fighters.values()) health[f.team] += f.player.health;
    if (
      health.every((h) => h > 0) &&
      this.time - this.roundStarted < PVP.roundSeconds
    )
      return;
    const won = health[0] === health[1] ? null : health[0] > health[1] ? 0 : 1;
    if (won !== null) this.score[won]++;
    this.log("round", undefined, undefined, won ?? -1);
    if (this.score.some((s) => s >= PVP.winRounds) || this.round >= 5) {
      this.ended = true;
      this.winner =
        this.score[0] === this.score[1]
          ? null
          : this.score[0] > this.score[1]
            ? 0
            : 1;
      this.reason = "rounds";
      return;
    }
    this.round++;
    this.intermissionUntil = this.time + 3;
    this.roundStarted = this.intermissionUntil;
    this.resetPositions();
  }
  snapshot(id: string) {
    const own = this.fighters.get(id)!;
    return {
      tick: this.tick,
      time: this.time,
      round: this.round,
      score: this.score,
      ended: this.ended,
      winner: this.winner,
      reason: this.reason,
      width: this.width,
      height: this.height,
      roundRemaining: Math.max(
        0,
        PVP.roundSeconds - (this.time - this.roundStarted),
      ),
      intermission: Math.max(0, this.intermissionUntil - this.time),
      own: { ack: own.ack, cooldowns: own.cooldowns },
      players: [...this.fighters.values()].map((f) => ({
        id: f.id,
        name: f.name,
        team: f.team,
        character: f.player.character,
        x: f.player.x,
        y: f.player.y,
        hp: f.player.health,
        maxHp: f.player.maxHealth,
        speed: f.player.speed,
        connected: f.connected,
        cosmetics: f.player.cosmetics,
      })),
      bullets: this.bullets.map((b) => ({
        id: b.id,
        owner: b.owner,
        color:
          this.fighters.get(b.owner)?.player.cosmetics.PROJECTILE_EFFECT || "",
        x: b.x,
        y: b.y,
        team: b.team,
        r: b.r,
      })),
    };
  }
}
export type ArenaSnapshot = ReturnType<PvpSimulation["snapshot"]> & {
  war?: import("../content/war").WarView;
};
