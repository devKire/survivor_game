import { WEAPON_DEFINITIONS, WEAPON_PATHS } from "../content/catalog";
import { ATTACKS } from "./attacks";
import { clamp, xpNeed } from "./math";
import type { GameSimulation } from "./simulation";
import type * as T from "./types";
export class Player {
  constructor(
    character: string,
    readonly meta: Record<string, number> = {},
  ) {
    this.character = character;
    this.x = 0;
    this.y = 0;
    this.r = 13;
    this.speed = 195;
    this.health = 110;
    this.maxHealth = 110;
    this.armor = 0;
    this.level = 1;
    this.xp = 0;
    this.xpToNextLevel = xpNeed(1);
    this.weapons = [];
    this.passives = {};
    this.stats = {
      damage: 1,
      area: 1,
      cooldown: 1,
      duration: 1,
      amount: 0,
      pickupRange: 76,
      growth: 1,
      luck: 1,
      critChance: 0.07,
      recovery: 0,
    };
    this.dx = 1;
    this.dy = 0;
    this.invulnerable = 0;
    this.buff = 0;
    this.luckBuff = 0;
    this.inWater = false;
    this.hurtFlash = 0;

    this.recalculate();
    this.health = this.maxHealth;
  }

  get position() {
    return { x: this.x, y: this.y };
  }

  recalculate() {
    const p = (k: string) => this.passives[k] || 0;
    const m = (k: string) => this.meta[k] || 0;
    const c = this.character;
    const old = this.maxHealth;

    this.maxHealth = Math.round(
      110 *
        (1 + 0.15 * p("vitality") + 0.06 * m("vitality")) *
        (c === "ivo" ? 0.85 : 1),
    );

    this.health = clamp(this.health + this.maxHealth - old, 0, this.maxHealth);

    this.speed =
      195 *
      (1 + 0.07 * p("speed") + 0.04 * m("speed")) *
      (c === "nara" ? 1.1 : 1);

    this.armor = p("armor") + m("armor");

    this.stats = {
      damage:
        (1 + 0.1 * p("might") + 0.05 * m("might")) *
        (c === "sena" ? 1.08 : 1) *
        (c === "nara"
          ? 1 + 0.03 * Math.min(10, Math.floor(this.level / 10))
          : 1),

      area: (1 + 0.1 * p("area")) * (c === "orin" ? 1.2 : 1),
      cooldown: Math.max(0.4, 1 - 0.05 * p("haste")),
      duration: 1 + 0.15 * p("duration"),
      amount: p("amount") + (c === "ivo" ? 1 : 0),
      pickupRange: 76 * (1 + 0.25 * p("pickup") + 0.1 * m("pickup")),
      growth:
        (1 + 0.05 * p("growth") + 0.03 * m("growth")) *
        (c === "sena" ? 1.25 : 1),
      luck: 1 + 0.12 * p("luck") + 0.08 * m("luck"),
      critChance: 0.07 + 0.01 * p("luck") + 0.005 * m("luck"),
      recovery:
        0.25 * p("recovery") + 0.15 * m("recovery") + (c === "orin" ? 0.3 : 0),
    };
  }

  character!: string;
  x!: number;
  y!: number;
  r!: number;
  speed!: number;
  health!: number;
  maxHealth!: number;
  armor!: number;
  level!: number;
  xp!: number;
  xpToNextLevel!: number;
  weapons!: Weapon[];
  passives!: Record<string, number>;
  stats!: T.Stats;
  dx!: number;
  dy!: number;
  invulnerable!: number;
  buff!: number;
  luckBuff!: number;
  inWater!: boolean;
  hurtFlash!: number;
}

export class Weapon {
  ownerId: string | null = null;
  constructor(id: string) {
    this.id = id;
    this.level = 1;
    this.evolved = false;
    this.path = null;
    this.pathLevel = 0;
    this.timer = 0.25;
    this.damageDealt = 0;
    this.kills = 0;
    this.shots = 0;
    this.hits = 0;
  }

  get definition() {
    return WEAPON_DEFINITIONS[this.id];
  }

  get name() {
    return this.evolved ? this.definition.evolution : this.definition.name;
  }

  values(p: Player) {
    const mods = this.path
      ? WEAPON_PATHS[this.id]?.[this.path]?.mods || {}
      : {};
    return {
      damage:
        this.definition.damage *
        (1 + 0.23 * (this.level - 1)) *
        p.stats.damage *
        (this.evolved ? 1.65 : 1) *
        (p.buff > 0 ? 1.4 : 1) *
        (mods.damage || 1),

      cooldown:
        this.definition.cooldown *
        (1 - 0.035 * (this.level - 1)) *
        p.stats.cooldown *
        (p.buff > 0 ? 0.75 : 1) *
        (mods.cooldown || 1),

      area: p.stats.area * (1 + 0.045 * (this.level - 1)) * (mods.area || 1),
      amount: Math.max(
        1,
        1 + Math.floor(this.level / 3) + p.stats.amount + (mods.amount || 0),
      ),
      duration:
        p.stats.duration * (1 + 0.07 * (this.level - 1)) * (mods.duration || 1),
      mods,
    };
  }

  update(g: GameSimulation, dt: number) {
    this.timer -= dt;

    if (this.timer <= 0) {
      const v = this.values(g.player);
      this.timer += v.cooldown;
      ATTACKS[this.definition.type](g, this, v);
    }
  }

  id!: string;
  level!: number;
  evolved!: boolean;
  path!: string | null;
  pathLevel!: number;
  timer!: number;
  damageDealt!: number;
  kills!: number;
  shots!: number;
  hits!: number;
}
