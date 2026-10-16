import { randomUUID, randomBytes } from "node:crypto";
import { WORLD_FIELD_V1 as config } from "../../game/content/rpg/world-combat";
import type { Enemy } from "../../game/core/types";
import type { WorldZone, WorldAvatar } from "./zone";
import type { WorldFieldProof } from "../../server/rpg/world/rewards";

export interface FieldEvent {
  id: string;
  authorityId: string;
  occurredAt: Date;
  privateSeed: string;
  proof: WorldFieldProof;
}
interface Spawn {
  id: string;
  x: number;
  y: number;
  next: number;
  enemy?: Enemy;
  occurrence?: string;
  contributors: Map<
    string,
    {
      userId: string;
      characterId: WorldAvatar["loadout"]["characterId"];
      visitId: string;
      epoch: string;
    }
  >;
}
/** Bounded occurrences, no database calls. Only actual server damage creates evidence. */
export class WorldFieldCombat {
  readonly pending: FieldEvent[] = [];
  private readonly spawns: Spawn[];
  constructor(
    private zone: WorldZone,
    private authorityId: string,
  ) {
    this.spawns = config.camps.map((c) => {
      let point = { x: c.x, y: c.y };
      for (let i = 0; i < 36; i++) {
        const p = {
          x: c.x + Math.cos(i) * Math.floor(i / 6) * 24,
          y: c.y + Math.sin(i) * Math.floor(i / 6) * 24,
        };
        let blocked = false;
        zone.world.query(p.x, p.y, 24, (s) => {
          if (Math.hypot(s.x - p.x, s.y - p.y) < s.r + 24) blocked = true;
        });
        if (!blocked) {
          point = p;
          break;
        }
      }
      return { ...c, ...point, next: 0, contributors: new Map() };
    });
  }
  beforeDamage(enemy: Enemy, avatar: WorldAvatar | undefined) {
    const spawn = this.spawns.find((s) => s.enemy === enemy);
    if (
      !spawn ||
      !avatar ||
      avatar.player.health <= 0 ||
      Math.hypot(avatar.player.x, avatar.player.y) <= config.safeRadius ||
      Math.hypot(avatar.player.x - enemy.x, avatar.player.y - enemy.y) > 720
    )
      return;
    spawn.contributors.set(avatar.userId, {
      userId: avatar.userId,
      characterId: avatar.loadout.characterId,
      visitId: avatar.visitId,
      epoch: avatar.epoch,
    });
  }
  defeated(enemy: Enemy) {
    const spawn = this.spawns.find((s) => s.enemy === enemy);
    if (!spawn || !spawn.occurrence) return;
    const participants = [...spawn.contributors.values()]
      .filter((v) => {
        const a = this.zone.avatars.get(v.userId);
        return (
          a &&
          a.visitId === v.visitId &&
          a.epoch === v.epoch &&
          a.player.health > 0 &&
          Math.hypot(a.player.x - enemy.x, a.player.y - enemy.y) <= 720
        );
      })
      .sort((a, b) => a.userId.localeCompare(b.userId));
    if (participants.length && this.pending.length < 64)
      this.pending.push({
        id: spawn.occurrence,
        authorityId: this.authorityId,
        occurredAt: new Date(),
        privateSeed: randomBytes(32).toString("hex"),
        proof: {
          version: 1,
          kind: "FIELD_ENEMY_DEFEAT",
          spawnId: spawn.id,
          enemyType: config.enemyType,
          participants,
        },
      });
    spawn.next = this.zone.run.time + config.respawnSeconds;
    spawn.occurrence = undefined;
    spawn.contributors.clear();
  }
  update(dt: number) {
    const z = this.zone,
      targets = z.combatPlayers();
    for (const s of this.spawns) {
      if (s.enemy?.dead) {
        s.enemy = undefined;
        s.next = Math.max(s.next, z.run.time + config.respawnSeconds);
      }
      const nearby = targets.some(
        (p) => Math.hypot(p.x - s.x, p.y - s.y) < config.activationRadius,
      );
      if (
        !s.enemy &&
        nearby &&
        z.run.time >= s.next &&
        this.pending.length < 48
      ) {
        s.enemy =
          z.spawnAt(config.enemyType, s.x, s.y, null, {
            hp: config.health,
            maxHp: config.health,
            damage: config.damage,
            speed: config.speed,
          }) ?? undefined;
        s.occurrence = randomUUID();
        s.contributors.clear();
      }
      if (
        s.enemy &&
        (!nearby ||
          Math.hypot(s.enemy.x - s.x, s.enemy.y - s.y) > config.leash ||
          Math.hypot(s.enemy.x, s.enemy.y) < config.safeRadius + 10)
      ) {
        Object.assign(s.enemy, {
          x: s.x,
          y: s.y,
          hp: config.health,
          kx: 0,
          ky: 0,
          statuses: {},
        });
        s.contributors.clear();
      }
    }
    if (targets.length) {
      z.updateEnemies(dt);
      z.grid.rebuild(z.enemies);
      const previous = z.player;
      for (const a of z.avatars.values())
        if (targets.includes(a.player) && !a.busy && !a.gathering) {
          z.player = a.player;
          for (const w of a.player.weapons) w.update(z, dt);
        }
      z.player = previous;
    }
    z.updateBullets(dt);
    z.updateAreas(dt);
    z.updateEffects(dt);
    z.enemies = z.enemies.filter((e) => !e.dead);
  }
}
