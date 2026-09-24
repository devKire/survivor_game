import { GameSimulation } from "./simulation";
import { freshSave } from "./save";
import { Weapon } from "./entities";
import { ATTACKS } from "./attacks";
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
    this.player.weapons = ["basic", "skill", "pulse"].map((ability) => {
      const w = new Weapon(
        arena.loadout(fighter)[ability as "basic" | "skill" | "pulse"],
      );
      w.ownerId = fighter.id;
      w.ruleset = "PVP";
      return w;
    });
  }
  refresh() {
    this.targets.clear();
    this.enemies = this.arena
      .combatTargets(this.fighter)
      .map(({ body, hurt }) => {
        this.targets.set(body.id, hurt);
        return body;
      });
    this.grid.rebuild(this.enemies);
    this.run.simTime = this.arena.time;
  }
  fire(ability: "basic" | "skill" | "pulse") {
    this.refresh();
    const w = this.player.weapons[["basic", "skill", "pulse"].indexOf(ability)];
    const tuning = PVP_RULES.weapons[w.id];
    const values = w.values(this.player);
    // Aim controls auto-targeted weapons too; unseen targets never enter their grid.
    const f = this.fighter,
      length = Math.max(0.001, Math.hypot(f.input.aimX, f.input.aimY));
    this.player.dx = f.input.aimX / length;
    this.player.dy = f.input.aimY / length;
    this.grid.rebuild(
      this.enemies.filter((e) => {
        const dx = e.x - this.player.x,
          dy = e.y - this.player.y,
          d = Math.hypot(dx, dy);
        return (
          d <= tuning.range &&
          (ability === "pulse" ||
            (dx * this.player.dx + dy * this.player.dy) / Math.max(1, d) >
              0.88) &&
          this.arena.lineClear(this.player, e)
        );
      }),
    );
    ATTACKS[w.definition.type](this, w, {
      ...values,
      damage: w.definition.damage * tuning.damage,
      amount: 1,
      area: 1,
      duration: 1,
    });
    this.grid.rebuild(this.enemies);
  }
  advance(dt: number) {
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
