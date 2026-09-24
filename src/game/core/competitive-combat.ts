import { GameSimulation } from "./simulation";
import { freshSave } from "./save";
import { Weapon } from "./entities";
import { ENEMY_DEFINITIONS } from "../content/catalog";
import { PVP_RULES } from "../content/mode-rules";
import type { Enemy, Vec } from "./types";
import type { Fighter, PvpSimulation } from "./pvp";

export function combatBody(
  id: number,
  position: Vec,
  radius: number,
  health: () => number,
): Enemy {
  return {
    ...ENEMY_DEFINITIONS.husk,
    id,
    type: "competitor",
    pattern: "",
    bossEventIndex: null,
    get x() {
      return position.x;
    },
    set x(v) {
      position.x = v;
    },
    get y() {
      return position.y;
    },
    set y(v) {
      position.y = v;
    },
    get hp() {
      return health();
    },
    get dead() {
      return health() <= 0;
    },
    maxHp: 100,
    r: radius,
    kx: 0,
    ky: 0,
    flash: 0,
    attack: 0,
    wind: 0,
    charge: 0,
    aimX: 0,
    aimY: 0,
    bossPhase: 0,
    phase: 0,
    statuses: {},
    burrow: 0,
    shield: 0,
    buffAura: 0,
    specialClock: 0,
    resist: 1,
    controlImmunity: {},
  };
}
/** Adapter to existing attacks/projectiles/areas; never runs PvE update, waves or drops. */
export class CompetitiveCombat extends GameSimulation {
  targets = new Map<number, (amount: number) => void>();
  constructor(
    readonly arena: PvpSimulation,
    readonly fighter: Fighter,
  ) {
    super(freshSave());
    // Initialize the existing combat storage, then use the match world and normalized player.
    this.start(
      fighter.player.character,
      "test",
      arena.world.mapId,
      arena.world.seed,
    );
    this.player = fighter.player;
    this.world = arena.world;
    this.fx = 0;
    this.bullets.limit = 32;
    this.player.weapons = arena.loadout(fighter).weapons.map((data) => {
      const w = new Weapon(data.id);
      w.ownerId = fighter.id;
      w.ruleset = "PVP";
      w.level = data.level;
      w.evolved = data.evolved || false;
      w.path = data.path || null;
      w.pathLevel = data.pathLevel || 0;
      return w;
    });
  }
  refresh(weapon?: Weapon) {
    this.targets.clear();
    const range = weapon
      ? PVP_RULES.weapons[weapon.id]?.range ?? Infinity
      : Infinity;
    this.enemies = this.arena
      .combatTargets(this.fighter)
      .filter(
        ({ body }) =>
          Math.hypot(body.x - this.player.x, body.y - this.player.y) <= range &&
          this.arena.lineClear(this.player, body),
      )
      .map(({ body, hurt }) => {
        this.targets.set(body.id, hurt);
        return body;
      });
    this.grid.rebuild(this.enemies);
    this.run.simTime = this.arena.time;
  }
  advance(dt: number) {
    for (const weapon of this.player.weapons) {
      this.refresh(weapon);
      weapon.update(this, dt);
    }
    this.refresh();
    for (let i = this.bullets.items.length - 1; i >= 0; i--) {
      const b = this.bullets.items[i];
      if (!this.arena.lineClear(b, { x: b.x + b.vx * dt, y: b.y + b.vy * dt }))
        this.bullets.remove(i);
    }
    this.updateBullets(dt);
    this.updateAreas(dt);
    this.updateEffects(dt);
  }
  override damageEnemy(e: Enemy, amount: number) {
    if (e.dead || !this.arena.lineClear(this.player, e)) return false;
    this.targets.get(e.id)?.(amount);
    return e.dead;
  }
  override saveSnapshot() {
    return false;
  }
  override checkAchievements() {}
}
