import { GameSimulation } from "./simulation";
import { freshSave } from "./save";
import { BOSS_EVENTS, ENEMY_DEFINITIONS } from "../content/catalog";
import {
  WAR_NEUTRAL_CAMPS,
  type WarNeutralView,
} from "../content/war-neutrals";
import { WAR } from "../content/war";
import type { WarSimulation } from "./war";
import type { Fighter } from "./pvp";
import type { Enemy, Vec } from "./types";
import type { Player, Weapon } from "./entities";

/** Runs only existing enemy AI/statuses. Never advances PvE waves, drops or progression. */
export class WarNeutrals extends GameSimulation {
  camps = WAR_NEUTRAL_CAMPS.map((config) => ({
    config,
    enemies: [] as Enemy[],
    respawnAt: 0,
  }));
  returning = new Set<number>();
  attackers = new Map<number, Fighter>();
  contactAt = new Map<string, number>();
  constructor(readonly arena: WarSimulation) {
    super(freshSave());
    this.start("nara", "test", arena.world.mapId, arena.world.seed);
    this.world = arena.world;
    this.fx = 0;
    this.enemyId = 3_000_000;
    this.viewW = WAR.width;
    this.viewH = WAR.height;
    this.spawnCamps();
  }
  spawnCamps() {
    for (const camp of this.camps) {
      if (camp.enemies.some((e) => !e.dead) || this.arena.time < camp.respawnAt)
        continue;
      this.enemies = this.camps
        .flatMap((c) => c.enemies)
        .filter((e) => !e.dead);
      camp.enemies = camp.config.enemyTypes.map((type, i) => {
        const def = ENEMY_DEFINITIONS[type];
        return this.spawnAt(
          type,
          camp.config.x + i * 32,
          camp.config.y,
          type === "boss"
            ? BOSS_EVENTS.find((b) => b.pattern === "charge")!
            : null,
          { hp: def.hp, maxHp: def.hp, damage: def.damage, speed: def.speed },
        )!;
      });
    }
  }
  override nearestPlayer(point: Vec): Player {
    const players = [...this.arena.fighters.values()].filter(
      (f) => f.player.health > 0,
    );
    players.sort(
      (a, b) =>
        Math.hypot(a.player.x - point.x, a.player.y - point.y) -
        Math.hypot(b.player.x - point.x, b.player.y - point.y),
    );
    return players[0]?.player || this.player;
  }
  override ownerOf(weapon: Weapon | null): Player {
    return weapon?.ownerId
      ? this.arena.fighters.get(weapon.ownerId)?.player || this.player
      : this.player;
  }
  advance(dt: number) {
    this.run.simTime = this.arena.time;
    this.spawnCamps();
    const active: Enemy[] = [];
    for (const camp of this.camps)
      for (const e of camp.enemies) {
        if (e.dead) continue;
        const home = Math.hypot(e.x - camp.config.x, e.y - camp.config.y);
        const target = this.nearestPlayer(e);
        const distance = Math.hypot(target.x - e.x, target.y - e.y);
        const targetHome = Math.hypot(
          target.x - camp.config.x,
          target.y - camp.config.y,
        );
        if (
          home > camp.config.leashRadius ||
          targetHome > camp.config.leashRadius + 80 ||
          target.health <= 0
        )
          this.returning.add(e.id);
        if (this.returning.has(e.id)) {
          e.statuses = {};
          e.charge = 0;
          e.wind = 0;
          this.attackers.delete(e.id);
          if (home < 8) {
            e.x = camp.config.x;
            e.y = camp.config.y;
            e.hp = e.maxHp;
            e.bossPhase = 1;
            e.attack = 2;
            this.returning.delete(e.id);
          } else {
            e.x += ((camp.config.x - e.x) / home) * e.speed * 1.8 * dt;
            e.y += ((camp.config.y - e.y) / home) * e.speed * 1.8 * dt;
          }
        } else if (distance < 220 || this.attackers.has(e.id)) active.push(e);
      }
    this.enemies = active;
    this.updateEnemies(dt);
    this.enemies = this.camps.flatMap((c) => c.enemies);
  }
  hit(e: Enemy, amount: number, owner?: Fighter) {
    if (e.dead || this.returning.has(e.id)) return false;
    if (owner) this.attackers.set(e.id, owner);
    e.hp = Math.max(0, e.hp - amount);
    if (e.hp > 0) return false;
    e.dead = true;
    const camp = this.camps.find((c) => c.enemies.includes(e))!;
    const killer = owner || this.attackers.get(e.id);
    this.attackers.delete(e.id);
    if (camp.enemies.every((other) => other.dead))
      camp.respawnAt = this.arena.time + camp.config.respawn;
    if (killer) {
      this.arena.grantWarGold(killer.id, camp.config.reward.warGold);
      for (const ally of this.arena.fighters.values())
        if (ally.team === killer.team) {
          if (
            ally.player.health > 0 &&
            Math.hypot(ally.player.x - e.x, ally.player.y - e.y) <=
              WAR.xpShareRadius
          )
            this.arena.grantWarXp(ally.id, camp.config.reward.xp);
          if (camp.config.reward.energy)
            this.arena.energy.set(
              ally.id,
              Math.min(
                WAR.maxEnergy,
                (this.arena.energy.get(ally.id) || 0) +
                  camp.config.reward.energy,
              ),
            );
        }
    }
    return true;
  }
  override damageEnemy(e: Enemy, amount: number, weapon?: Weapon | null) {
    return this.hit(
      e,
      amount,
      weapon?.ownerId ? this.arena.fighters.get(weapon.ownerId) : undefined,
    );
  }
  override hurtPlayer(amount: number, player: Player = this.player) {
    const fighter = [...this.arena.fighters.values()].find(
      (f) => f.player === player,
    );
    if (!fighter || (this.contactAt.get(fighter.id) || 0) > this.arena.time)
      return;
    this.contactAt.set(fighter.id, this.arena.time + 0.8);
    this.arena.hurtFighter(fighter, amount);
  }
  override saveSnapshot() {
    return false;
  }
  override checkAchievements() {}
  snapshot(x: number, y: number): WarNeutralView[] {
    return this.camps.flatMap((camp) =>
      camp.enemies
        .filter(
          (e) =>
            !e.dead &&
            Math.abs(e.x - x) <= WAR.interestX &&
            Math.abs(e.y - y) <= WAR.interestY,
        )
        .map((e) => ({
          id: e.id,
          campId: camp.config.id,
          type: e.type,
          name: e.name,
          x: e.x,
          y: e.y,
          hp: e.hp,
          maxHp: e.maxHp,
          wind: e.wind,
          charge: e.charge,
          aimX: e.aimX,
          aimY: e.aimY,
          bossPhase: e.bossPhase,
        })),
    );
  }
}
