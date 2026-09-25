import { Player } from "./entities";
import { clamp, segmentDistance2 } from "./math";
import { predictMove } from "../network/movement";
import {
  PVP,
  PVP_CHARACTER_BUILDS,
  PVP_CHARACTER_PROFILES,
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
  buildRevision: number;
  name: string;
  team: number;
  player: Player;
  input: PvpInput;
  lastInputAt: number;
  ack: number;
  cooldowns: Record<PvpAbility, number>;
  isBot: boolean;
  botControlled: boolean;
  botEverControlled: boolean;
  humanCasts: number;
  body: import("./types").Enemy;
  protectedUntil: number;
  connected: boolean;
  disconnectedAt: number;
  respawnAt: number;
  kills: number;
  deaths: number;
  assists: number;
  warItems: string[];
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
  isBot?: boolean;
  partyId?: string;
  role?: import("../content/war").WarRole;
}
import {
  MAP_DEFINITIONS,
  STRUCTURE_DEFINITIONS,
} from "../content/catalog";
import { PVP_RULES } from "../content/mode-rules";
import { World } from "./world";
import { CompetitiveCombat, combatBody } from "./competitive-combat";
import type { Enemy, Vec } from "./types";
export const PVP_MAP_POOL = Object.keys(MAP_DEFINITIONS).filter(
  (id) => MAP_DEFINITIONS[id].profiles && MAP_DEFINITIONS[id].unlocked,
);

/** Reapplies native character/build identity, then restores competitive normalization. */
export function recalculateCompetitivePlayer(
  player: Player,
  preserveHealthRatio = true,
  growthCap = Number.POSITIVE_INFINITY,
) {
  const healthRatio = preserveHealthRatio
    ? player.health / Math.max(1, player.maxHealth)
    : 1;
  player.recalculate();
  player.maxHealth = Math.round(PVP.hp * (player.maxHealth / 110));
  player.speed = PVP.speed * (player.speed / 195);
  player.stats.growth = Math.min(growthCap, player.stats.growth);
  player.health = clamp(healthRatio * player.maxHealth, 0, player.maxHealth);
}

export class PvpSimulation {
  readonly fighters = new Map<string, Fighter>();
  readonly forfeited = new Set<string>();
  readonly combat = new Map<string, CompetitiveCombat>();
  readonly world: World;
  readonly partyComposition: { id: string; members: string[]; team: number }[];
  fountainReady = new Map<string, number>();
  pickups: { x: number; y: number; value: number }[] = [];
  tick = 0;
  time = 0;
  round = 1;
  roundStarted = 0;
  intermissionUntil = 3;
  score = [0, 0];
  ended = false;
  winner: number | null = null;
  reason = "";
  events: ArenaEvent[] = [];
  width: number;
  height: number;
  constructor(
    seeds: FighterSeed[],
    mapId = "ruins",
    seed = "competitive",
    readonly modeProfile: "pvp1v1" | "pvp5v5" = "pvp1v1",
  ) {
    mapId = PVP_MAP_POOL.includes(mapId) ? mapId : PVP_MAP_POOL[0];
    const profile = MAP_DEFINITIONS[mapId].profiles![modeProfile];
    this.width = profile.width;
    this.height = profile.height;
    let index = 0;
    for (const s of seeds) {
      const player = new Player(s.character, {}, "PVP");
      const build = modeProfile === "pvp5v5"
        ? { weapons: [{ id: PVP_CHARACTER_PROFILES[s.character].war.starterWeapon, level: 1 }], passives: {} }
        : PVP_CHARACTER_PROFILES[s.character].duel;
      player.passives = { ...build.passives };
      recalculateCompetitivePlayer(player, false, modeProfile === "pvp5v5" ? PVP_RULES.warGrowthCap : undefined);
      player.cosmetics = s.cosmetics;
      const f: Fighter = {
        id: s.id,
        buildRevision: 0,
        name: s.name,
        team: s.team,
        player,
        input: {
          sequence: 0,
          moveX: 0,
          moveY: 0,
          aimX: s.team === 0 ? 1 : -1,
          aimY: 0,
          ability: "none",
          seenTick: 0,
        },
        isBot: !!s.isBot,
        botControlled: !!s.isBot,
        botEverControlled: !!s.isBot,
        humanCasts: 0,
        body: combatBody(++index, player, PVP.radius, () => player.health),
        protectedUntil: 0,
        lastInputAt: 0,
        ack: 0,
        cooldowns: { none: 0, dash: 0 },
        connected: !s.isBot,
        disconnectedAt: 0,
        respawnAt: 0,
        kills: 0,
        deaths: 0,
        assists: 0,
        warItems: [],
        damage: 0,
        casts: 0,
        hits: 0,
      };
      this.fighters.set(s.id, f);
    }
    const run = {
      worldVersion: 3,
      worldChanges: {},
      structuresBroken: 0,
      urnsBroken: 0,
    };
    this.world = new World(
      {
        player: this.fighters.values().next().value!.player,
        run,
        playersForWorld: () => [...this.fighters.values()].map((f) => f.player),
        spark() {},
        sound: { play() {}, unlock() {} },
        drop() {},
        dropXP() {},
        dropItemWeighted() {},
        saveSnapshot: () => false,
        hurtPlayer() {},
      },
      mapId,
      seed,
      {},
      profile,
    );
    this.world.onCompetitiveBreak = (s) => {
      if (s.type === "urn") this.pickups.push({ x: s.x, y: s.y, value: 12 });
    };
    this.resetPositions();
    // Bounded world is loaded once, shared by all fighters and combat adapters.
    for (let y = 0; y < this.height; y += 640)
      for (let x = 0; x < this.width; x += 640) this.world.ensureChunkAt(x, y);
    this.world.nearby = [...this.world.chunks.values()].flatMap(
      (c) => c.structures,
    );
    for (const f of this.fighters.values())
      this.combat.set(f.id, new CompetitiveCombat(this, f));
    this.partyComposition = [
      ...new Set(
        seeds.filter((s) => !s.isBot && s.partyId).map((s) => s.partyId!),
      ),
    ].map((id) => ({
      id,
      members: seeds.filter((s) => s.partyId === id).map((s) => s.id),
      team: seeds.find((s) => s.partyId === id)!.team,
    }));
  }
  get bullets() {
    return [...this.combat.values()].flatMap((c) => c.bullets.items);
  }
  get humanCount() {
    return [...this.fighters.values()].filter((f) => !f.isBot).length;
  }
  get botCount() {
    return this.fighters.size - this.humanCount;
  }
  loadout(f: Fighter) {
    if (this.modeProfile === "pvp5v5")
      return {
        weapons: [{ id: PVP_CHARACTER_PROFILES[f.player.character as PvpCharacter].war.starterWeapon, level: 1 }],
        passives: {},
      };
    return PVP_CHARACTER_BUILDS[f.player.character as PvpCharacter];
  }
  log(type: string, actor?: string, target?: string, value?: number) {
    if (this.events.length >= 4000) this.events.splice(0, 100);
    this.events.push({ tick: this.tick, type, actor, target, value });
  }
  resetPositions() {
    this.pickups = [];
    this.fountainReady.clear();
    for (const s of this.world.nearby) {
      s.destroyed = false;
      s.used = false;
      s.opened = false;
      s.hp = s.maxHp;
    }
    const slots = [0, 0];
    for (const f of this.fighters.values()) {
      f.player.x =
        f.team === 0
          ? this.world.profile!.spawnX
          : this.width - this.world.profile!.spawnX;
      f.player.y =
        this.height / 2 +
        (this.modeProfile === "pvp5v5" ? (slots[f.team]++ - 2) * 45 : 0);
      f.player.health = f.player.maxHealth;
      f.cooldowns = { none: 0, dash: 0 };
      f.body.statuses = {};
      f.body.controlImmunity = {};
      f.protectedUntil = this.intermissionUntil;
      f.input.ability = "none";
      for (const weapon of this.combat.get(f.id)?.player.weapons || [])
        weapon.timer = 0.25;
    }
    for (const c of this.combat.values()) {
      c.bullets.clear();
      c.areas = [];
      c.lines = [];
    }
  }
  accept(id: string, input: PvpInput) {
    const f = this.fighters.get(id);
    if (
      !f ||
      !f.connected ||
      f.botControlled ||
      this.ended ||
      input.sequence <= f.ack
    )
      return;
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
      f.input.moveX = f.input.moveY = 0;
      this.log("disconnect", id);
    }
  }
  reconnect(id: string) {
    const f = this.fighters.get(id);
    if (
      !f ||
      f.isBot ||
      this.ended ||
      this.forfeited.has(id) ||
      (!f.connected && this.time - f.disconnectedAt > PVP.reconnectSeconds)
    )
      return false;
    f.botControlled = false;
    f.connected = true;
    f.input.ability = "none";
    f.input.moveX = f.input.moveY = 0;
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
  lineClear(from: Vec, to: Vec) {
    return !this.world.nearby.some(
      (s) =>
        !s.destroyed &&
        STRUCTURE_DEFINITIONS[s.type]?.collidable &&
        segmentDistance2(s.x, s.y, from.x, from.y, to.x, to.y) < (s.r + 3) ** 2,
    );
  }
  combatTargets(
    owner: Fighter,
  ): { body: Enemy; hurt: (amount: number) => void }[] {
    return [...this.fighters.values()]
      .filter(
        (f) =>
          f.team !== owner.team &&
          f.player.health > 0 &&
          this.time >= f.protectedUntil,
      )
      .map((f) => ({
        body: f.body,
        hurt: (amount: number) => this.damage(f, amount, owner),
      }));
  }
  damage(target: Fighter, amount: number, owner: Fighter) {
    if (
      target.player.health <= 0 ||
      target.team === owner.team ||
      this.time < target.protectedUntil
    )
      return;
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
    const a = f.input.ability;
    if (
      a !== "dash" ||
      this.time < f.cooldowns[a] ||
      f.player.health <= 0 ||
      f.body.statuses.freeze?.duration > 0
    )
      return;
    const len = Math.hypot(f.input.aimX, f.input.aimY);
    if (len < 0.01) return;
    f.casts++;
    if (!f.botControlled) f.humanCasts++;
    this.log("ability:" + a, f.id);
    f.cooldowns[a] = this.time + 8;
    for (let i = 0; i < 12; i++) {
      const next = predictMove(
        f.player,
        { x: f.input.aimX / len, y: f.input.aimY / len },
        10,
        1,
        this.world.nearby,
      );
      f.player.x = clamp(next.x, 20, this.width - 20);
      f.player.y = clamp(next.y, 20, this.height - 20);
    }
  }
  disconnectedStep(f: Fighter) {
    if (
      !f.connected &&
      !f.isBot &&
      this.time - f.disconnectedAt > PVP.reconnectSeconds
    )
      this.forfeit(f.id);
  }
  movementSpeed(f: Fighter) {
    return f.body.statuses.freeze?.duration > 0
      ? 0
      : f.player.speed *
          (this.world.isWater(f.player.x, f.player.y)
            ? PVP_RULES.waterSpeed
            : 1) *
          (f.body.statuses.slow?.magnitude || 1);
  }
  environment(f: Fighter, dt: number) {
    for (const [id, s] of Object.entries(f.body.statuses)) {
      s.duration -= dt;
      if (s.duration <= 0) delete f.body.statuses[id];
    }
    for (const id of Object.keys(f.body.controlImmunity || {}))
      f.body.controlImmunity![id] = Math.max(
        0,
        f.body.controlImmunity![id] - dt,
      );
    if (f.player.health <= 0) return;
    if (
      Math.floor(this.time / PVP_RULES.hazardInterval) !==
      Math.floor((this.time - dt) / PVP_RULES.hazardInterval)
    )
      for (const s of this.world.nearby)
        if (
          STRUCTURE_DEFINITIONS[s.type]?.hazard &&
          Math.hypot(f.player.x - s.x, f.player.y - s.y) <
            PVP.radius + s.r * 0.75 &&
          this.time >= f.protectedUntil
        ) {
          f.player.health = Math.max(
            0,
            f.player.health -
              (s.type === "rift" ? 8 : 5) * PVP_RULES.hazardDamage,
          );
          if (f.player.health === 0) {
            f.deaths++;
            this.log("hazard-kill", undefined, f.id);
            break;
          }
        }
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      if (
        f.player.health > 0 &&
        f.player.health < f.player.maxHealth &&
        Math.hypot(p.x - f.player.x, p.y - f.player.y) < 30
      ) {
        f.player.health = Math.min(
          f.player.maxHealth,
          f.player.health + p.value * PVP_RULES.healing,
        );
        this.pickups.splice(i, 1);
      }
    }
    for (const s of this.world.nearby)
      if (
        s.type === "fountain" &&
        f.player.health > 0 &&
        f.player.health < f.player.maxHealth &&
        Math.hypot(f.player.x - s.x, f.player.y - s.y) < 36 &&
        (this.fountainReady.get(s.id) || 0) <= this.time
      ) {
        f.player.health = Math.min(
          f.player.maxHealth,
          f.player.health + PVP_RULES.fountainHeal * PVP_RULES.healing,
        );
        this.fountainReady.set(s.id, this.time + PVP_RULES.fountainCooldown);
        s.used = true;
      }
  }
  step(dt = 1 / PVP.tickHz) {
    if (this.ended) return;
    this.tick++;
    this.time += dt;
    for (const f of this.fighters.values()) this.disconnectedStep(f);
    if (this.ended || this.time < this.intermissionUntil) return;
    for (const s of this.world.nearby)
      if (
        s.type === "fountain" &&
        (this.fountainReady.get(s.id) || 0) <= this.time
      )
        s.used = false;
    for (const f of this.fighters.values()) {
      this.environment(f, dt);
      if (
        (!f.connected && !f.botControlled) ||
        f.player.health <= 0 ||
        this.time - f.lastInputAt > 0.4
      )
        continue;
      const next = predictMove(
        f.player,
        { x: f.input.moveX, y: f.input.moveY },
        this.movementSpeed(f),
        dt,
        this.world.nearby,
      );
      f.player.x = clamp(next.x, 20, this.width - 20);
      f.player.y = clamp(next.y, 20, this.height - 20);
      const moveLength = Math.hypot(f.input.moveX, f.input.moveY);
      if (moveLength > 0.01) {
        f.player.dx = f.input.moveX / moveLength;
        f.player.dy = f.input.moveY / moveLength;
      }
      this.cast(f);
    }
    for (const [id, c] of this.combat) {
      const fighter = this.fighters.get(id);
      c.advance(
        dt,
        !!fighter &&
          fighter.player.health > 0 &&
          (fighter.connected || fighter.botControlled),
      );
    }
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
      mapId: this.world.mapId,
      seed: this.world.seed,
      profile: this.modeProfile,
      structures: this.world.nearby.filter((s) => !s.destroyed),
      humanCount: this.humanCount,
      botCount: this.botCount,
      pickups: this.pickups,
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
        buildRevision: f.buildRevision,
        level: f.player.level,
        kills: f.kills,
        deaths: f.deaths,
        assists: f.assists,
        warItems: f.warItems,
        weapons: (this.combat.get(f.id)?.player.weapons || []).map((weapon) => ({
          id: weapon.id,
          level: weapon.level,
          evolved: weapon.evolved,
          path: weapon.path,
          pathLevel: weapon.pathLevel,
        })),
        x: f.player.x,
        y: f.player.y,
        dx: f.player.dx,
        dy: f.player.dy,
        hp: f.player.health,
        maxHp: f.player.maxHealth,
        speed: this.movementSpeed(f),
        connected: f.connected,
        cosmetics: f.player.cosmetics,
        isBot: f.isBot,
        botControlled: f.botControlled,
        protected: this.time < f.protectedUntil,
      })),
      bullets: [...this.combat.values()].flatMap((c) =>
        c.bullets.items.map((b) => ({
          id: b.id || 0,
          owner: c.fighter.id,
          color: b.color,
          x: b.x,
          y: b.y,
          team: c.fighter.team,
          r: b.r,
          vx: b.vx,
          vy: b.vy,
          kind: b.kind,
          age: b.age,
        })),
      ),
      areas: [...this.combat.values()].flatMap((c) =>
        c.areas.map((a) => ({
          x: a.x,
          y: a.y,
          r: a.r,
          armed: a.armed,
          delay: a.delay,
          color: a.w?.definition.color || "#fff",
          weapon: a.w?.id || "well",
          team: c.fighter.team,
        })),
      ),
      lines: [...this.combat.values()].flatMap((c) =>
        c.lines.map((l) => ({ ...l })),
      ),
    };
  }
}
export type ArenaSnapshot = ReturnType<PvpSimulation["snapshot"]> & {
  war?: import("../content/war").WarView;
};
