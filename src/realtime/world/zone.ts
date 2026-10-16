import {
  startGathering,
  assertGathering,
  advanceGathering,
} from "../../game/core/rpg/exploration/runtime";
import { gatheringIntent } from "../../game/core/rpg/exploration/gathering";
import { GameSimulation } from "../../game/core/simulation";
import { Player, Weapon } from "../../game/core/entities";
import { freshSave } from "../../game/core/save";
import { CHARACTER_DEFINITIONS } from "../../game/content/catalog";
import { EXPLORATION_RUINS } from "../../game/content/rpg/exploration-regions";
import { REFUGE } from "../../game/content/rpg/refuge";
import { WORLD_ZONES } from "../../game/content/rpg/world-zones";
import { moveInRefuge } from "../../game/core/rpg/refuge/scene";
import { generateExploration } from "../../game/core/rpg/exploration/generation";
import { WorldInterest } from "../../game/core/rpg/world/interest";
import {
  acceptWorldInput,
  clampWorldPosition,
  normalizedWorldMove,
} from "../../game/core/rpg/world/rules";
import {
  WORLD_ID,
  WORLD_INPUT_TIMEOUT,
  type WorldZoneId,
  type WorldPublicPlayer,
  type WorldInput,
} from "../../game/core/rpg/world/types";
import type { RpgCombatLoadout } from "../../game/core/rpg/combat-types";
import type { WorldSnapshot } from "../../game/network/world";
import type { ActiveGathering } from "../../game/core/rpg/exploration/simulation";
import type { Vec } from "../../game/core/types";

export interface WorldAvatar {
  userId: string;
  publicId: string;
  visitId: string;
  epoch: string;
  name: string;
  player: Player;
  loadout: RpgCombatLoadout;
  xp: number;
  profileLevel: number;
  refreshPending?: boolean;
  revision: number;
  sequence: number;
  input: Vec;
  lastInput: number;
  busy: boolean;
  gathering?: ActiveGathering;
  depleted: Set<string>;
  discoveries: Set<string>;
  discoveryPending: Set<string>;
  cycle: number;
  respawnAt?: number;
}
/** A region engine, not a run. Reuses collision, entities, weapons and combat primitives. */
export class WorldZone extends GameSimulation {
  readonly activityKind = "RPG_SHARED_WORLD";
  readonly definition;
  readonly instanceId: string;
  readonly avatars = new Map<string, WorldAvatar>();
  readonly interest = new WorldInterest<WorldPublicPlayer>();
  readonly nodes;
  tick = 0;
  emptySince = 0;
  reservations = 0;
  constructor(
    readonly zoneId: WorldZoneId,
    authorityId: string,
  ) {
    super(freshSave());
    this.definition = WORLD_ZONES[zoneId];
    this.instanceId = `${authorityId}:${zoneId}`;
    super.start("nara", "normal", "ruins", EXPLORATION_RUINS.seed, 1800);
    this.nodes =
      zoneId === "ruins-outskirts"
        ? generateExploration(EXPLORATION_RUINS, this.world)
        : [];
    this.enemies = [];
    this.pickups = [];
    this.gems = [];
    this.bullets.clear();
    this.areas = [];
  }
  createAvatar(
    data: Omit<
      WorldAvatar,
      | "player"
      | "input"
      | "sequence"
      | "lastInput"
      | "busy"
      | "depleted"
      | "discoveries"
      | "discoveryPending"
      | "cycle"
      | "profileLevel"
    >,
  ): WorldAvatar {
    const player = new Player(data.loadout.characterId, {}, "PVE", {
      kind: "RPG_EXPEDITION",
      loadout: data.loadout,
    });
    const weapon = new Weapon(
      CHARACTER_DEFINITIONS[data.loadout.characterId].weapon,
    );
    weapon.ownerId = data.publicId;
    player.weapons.push(weapon);
    Object.assign(player, this.definition.spawn);
    return {
      ...data,
      profileLevel: data.loadout.level,
      player,
      input: { x: 0, y: 0 },
      sequence: 0,
      lastInput: this.run.time,
      busy: false,
      depleted: new Set(),
      discoveries: new Set(),
      discoveryPending: new Set(),
      cycle: 0,
    };
  }
  add(avatar: WorldAvatar) {
    if (this.avatars.has(avatar.userId))
      throw new Error("Duplicate world presence");
    Object.assign(avatar.player, this.definition.spawn);
    avatar.input = { x: 0, y: 0 };
    avatar.gathering = undefined;
    this.avatars.set(avatar.userId, avatar);
    this.index(avatar);
    this.emptySince = 0;
  }
  remove(userId: string) {
    const avatar = this.avatars.get(userId);
    if (avatar) {
      this.interest.remove(avatar.publicId);
      avatar.gathering = undefined;
      this.avatars.delete(userId);
    }
  }
  acceptMovement(userId: string, input: WorldInput) {
    const avatar = this.avatars.get(userId);
    if (!avatar || !acceptWorldInput(avatar.epoch, avatar.sequence, input))
      return false;
    avatar.sequence = input.sequence;
    avatar.input = normalizedWorldMove(input.moveX, input.moveY);
    avatar.lastInput = this.run.time;
    if (Math.hypot(avatar.input.x, avatar.input.y) > 0.01)
      avatar.gathering = undefined;
    return true;
  }
  gatheringActor(a: WorldAvatar) {
    return {
      x: a.player.x,
      y: a.player.y,
      level: a.loadout.level,
      available:
        !this.definition.safe &&
        !a.busy &&
        a.player.health > 0 &&
        this.avatars.get(a.userId) === a,
    };
  }
  startGather(a: WorldAvatar, raw: unknown) {
    const intent = gatheringIntent.parse(raw),
      node = this.nodes.find((n) => n.id === intent.nodeId);
    a.gathering = startGathering(
      this.gatheringActor(a),
      node,
      intent,
      a.gathering,
    );
  }
  assertGather(a: WorldAvatar, g: ActiveGathering) {
    assertGathering(this.gatheringActor(a), g, a.gathering);
  }
  publicPlayer(a: WorldAvatar): WorldPublicPlayer {
    return {
      id: a.publicId,
      name: a.name,
      character: a.loadout.characterId,
      level: a.profileLevel,
      x: a.player.x,
      y: a.player.y,
      dx: a.player.dx,
      dy: a.player.dy,
      moving:
        !a.busy &&
        this.run.time - a.lastInput < WORLD_INPUT_TIMEOUT &&
        Math.hypot(a.input.x, a.input.y) > 0.01,
      health: a.player.health,
      maxHealth: a.player.maxHealth,
      connected: true,
    };
  }
  refreshPresence(a: WorldAvatar) {
    this.index(a);
  }
  private index(a: WorldAvatar) {
    this.interest.upsert(this.publicPlayer(a));
  }
  override playersForWorld() {
    return this.avatars ? [...this.avatars.values()].map((a) => a.player) : [];
  }
  override combatPlayers() {
    return this.definition?.safe
      ? []
      : this.playersForWorld().filter(
          (p) => p.health > 0 && Math.hypot(p.x, p.y) > 200,
        );
  }
  override ownerOf(w: Weapon | null) {
    return (
      [...this.avatars.values()].find((a) => a.publicId === w?.ownerId)
        ?.player ?? this.player
    );
  }
  override finish() {} // No victory, run settlement, or world termination.
  override dropXP() {} // No temporary XP/level-up or Survivor drops.
  override pushPickup() {
    return false;
  } // Field rewards have a separate durable ledger.
  override hasSynergy() {
    return false;
  }
  override update(dt: number) {
    if (!this.avatars.size) return;
    dt = Math.min(0.04, Math.max(0, dt));
    this.run.time += dt;
    this.run.simTime += dt;
    this.tick++;
    for (const a of this.avatars.values()) {
      const move =
        !a.busy &&
        a.player.health > 0 &&
        this.run.time - a.lastInput < WORLD_INPUT_TIMEOUT
          ? a.input
          : { x: 0, y: 0 };
      if (this.definition.safe)
        Object.assign(a.player, moveInRefuge(REFUGE, a.player, move, dt));
      else {
        this.movePlayer(a.player, move, dt);
        Object.assign(a.player, clampWorldPosition(this.definition, a.player));
      }
      if (Math.hypot(move.x, move.y) > 0.01) {
        a.player.dx = move.x;
        a.player.dy = move.y;
      }
      a.gathering = advanceGathering(
        this.gatheringActor(a),
        move,
        a.gathering,
        dt,
      );

      this.index(a);
    }
    if (!this.definition.safe) this.world.update();
  }
  snapshot(a: WorldAvatar): WorldSnapshot {
    return {
      type: "WORLD_SNAPSHOT",
      protocol: 1,
      worldId: WORLD_ID,
      zoneId: this.zoneId,
      zoneVersion: 1,
      instanceId: this.instanceId,
      epoch: a.epoch,
      tick: this.tick,
      selfId: a.publicId,
      ack: a.sequence,
      players: this.interest.query(a.player),
      entities: [],
      self: {
        level: a.profileLevel,
        xp: a.xp,
        revision: a.revision,
        speed: this.definition.safe ? 190 : a.player.speed,
      },
    };
  }
  dispose() {
    this.avatars.clear();
    this.interest.clear();
    this.world.chunks.clear();
    this.bullets.clear();
    this.areas = [];
    this.enemies = [];
  }
}
