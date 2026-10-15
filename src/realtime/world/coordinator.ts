import { randomUUID } from "node:crypto";
import type { WorldCommand } from "../../game/network/world";
import {
  WORLD_PROTOCOL,
  WORLD_ZONE_CAPACITY,
  WORLD_IDLE_MS,
  type WorldZoneId,
} from "../../game/core/rpg/world/types";
import { worldPortal } from "../../game/core/rpg/world/rules";
import { isRpgSharedWorldEnabled } from "../../server/env";
import { UserError } from "../../server/security";
import {
  openWorldVisit,
  checkpointWorldVisit,
  closeWorldVisit,
} from "../../server/rpg/world/presence";
import { WorldZone, type WorldAvatar } from "./zone";

export interface WorldConnection {
  userId: string;
  username: string;
  sessionId: string;
  isOpen: () => boolean;
  send: (message: unknown) => void;
}
interface Presence {
  connection: WorldConnection;
  zone: WorldZone;
  avatar: WorldAvatar;
  lastActivity: number;
  transitions: Map<string, { portalId: string }>;
}
export class WorldCoordinator {
  readonly authorityId = randomUUID();
  readonly zones = new Map<WorldZoneId, WorldZone>();
  readonly presence = new Map<string, Presence>();
  private queues = new Map<string, Promise<unknown>>();
  private snapshotClock = 0;
  private accumulator = 0;
  async serialized<T>(userId: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(userId) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(operation);
    this.queues.set(userId, next);
    try {
      return await next;
    } finally {
      if (this.queues.get(userId) === next) this.queues.delete(userId);
    }
  }
  zone(id: WorldZoneId) {
    let z = this.zones.get(id);
    if (!z) this.zones.set(id, (z = new WorldZone(id, this.authorityId)));
    return z;
  }
  has(userId: string) {
    return this.presence.has(userId);
  }
  current(c: WorldConnection, epoch?: string) {
    const p = this.presence.get(c.userId);
    if (
      !p ||
      p.connection !== c ||
      !c.isOpen() ||
      (epoch !== undefined && p.avatar.epoch !== epoch)
    )
      throw new UserError("Presença desatualizada. Reconecte ao mundo.");
    return p;
  }
  async enter(c: WorldConnection) {
    if (!isRpgSharedWorldEnabled())
      throw new UserError("Mundo compartilhado indisponível.");
    const previous = this.presence.get(c.userId);
    if (previous?.connection === c) {
      c.send(previous.zone.snapshot(previous.avatar));
      return;
    }
    if (previous) {
      previous.zone.remove(c.userId);
      this.presence.delete(c.userId);
      await closeWorldVisit(c.userId, previous.avatar.visitId);
    }
    const data = await openWorldVisit(c.userId, this.authorityId, () => {
      if (!c.isOpen()) throw new UserError("Conexão encerrada.");
    });
    const zone = this.zone(data.zoneId);
    if (zone.avatars.size + zone.reservations >= WORLD_ZONE_CAPACITY) {
      await closeWorldVisit(c.userId, data.visit.id);
      throw new UserError("Região cheia. Tente novamente mais tarde.");
    }
    const avatar = zone.createAvatar({
      userId: c.userId,
      publicId: randomUUID(),
      visitId: data.visit.id,
      epoch: data.visit.epoch,
      name: c.username.slice(0, 100),
      loadout: data.loadout,
      xp: data.xp,
      revision: data.revision,
    });
    zone.add(avatar);
    this.presence.set(c.userId, {
      connection: c,
      zone,
      avatar,
      lastActivity: Date.now(),
      transitions: new Map(),
    });
    c.send(zone.snapshot(avatar));
  }
  async leave(c: WorldConnection) {
    const p = this.presence.get(c.userId);
    if (!p || p.connection !== c) return;
    p.zone.remove(c.userId);
    this.presence.delete(c.userId);
    await closeWorldVisit(c.userId, p.avatar.visitId);
    c.send({
      type: "WORLD_LEFT",
      message: "Mundo encerrado. Progresso confirmado preservado.",
    });
  }
  async transition(
    c: WorldConnection,
    v: Extract<WorldCommand, { type: "WORLD_TRANSITION" }>,
  ) {
    const p = this.current(c),
      prior = p.transitions.get(v.requestId);
    if (prior) {
      if (prior.portalId !== v.portalId)
        throw new UserError("Pedido já utilizado.");
      c.send(p.zone.snapshot(p.avatar));
      return;
    }
    this.current(c, v.epoch);
    if (p.avatar.busy || p.avatar.player.health <= 0)
      throw new UserError("Aguarde a operação atual.");
    const portal = worldPortal(p.zone.definition, p.avatar.player, v.portalId),
      dest = this.zone(portal.destination);
    if (dest.avatars.size + dest.reservations >= WORLD_ZONE_CAPACITY)
      throw new UserError("Região cheia.");
    const epoch = randomUUID();
    dest.reservations++;
    p.avatar.busy = true;
    p.avatar.gathering = undefined;
    p.avatar.input = { x: 0, y: 0 };
    try {
      await checkpointWorldVisit(
        c.userId,
        p.avatar.visitId,
        epoch,
        portal.destination,
        () => {
          this.current(c, v.epoch);
        },
      );
      p.zone.remove(c.userId);
      p.avatar.epoch = epoch;
      p.avatar.sequence = 0;
      p.avatar.discoveryPending.clear();
      dest.add(p.avatar);
      p.zone = dest;
      p.transitions.set(v.requestId, { portalId: v.portalId });
      if (p.transitions.size > 16)
        p.transitions.delete(p.transitions.keys().next().value!);
      c.send(dest.snapshot(p.avatar));
    } catch (error) {
      // A lost commit acknowledgement must not leave a live entity authorized
      // against a different persisted zone. Reentry reads the durable checkpoint.
      await this.leave(c);
      throw error;
    } finally {
      dest.reservations--;
      p.avatar.busy = false;
    }
  }
  async handle(c: WorldConnection, v: WorldCommand) {
    if (v.type === "WORLD_ENTER") {
      if (v.protocol !== WORLD_PROTOCOL)
        throw new UserError("Atualize o cliente.");
      await this.enter(c);
      return;
    }
    if (v.type === "WORLD_LEAVE") {
      this.current(c, v.epoch);
      await this.leave(c);
      return;
    }
    if (!isRpgSharedWorldEnabled()) {
      await this.leave(c);
      throw new UserError("Mundo compartilhado indisponível.");
    }
    const p = this.current(
      c,
      v.type === "WORLD_TRANSITION" ? undefined : v.epoch,
    );
    p.lastActivity = Date.now();
    if (v.type === "WORLD_TRANSITION") {
      await this.transition(c, v);
      return;
    }
    if (v.type === "WORLD_REFRESH") {
      c.send(p.zone.snapshot(p.avatar));
      return;
    }
    if (v.type === "WORLD_CANCEL") {
      p.avatar.gathering = undefined;
      return;
    }
    throw new UserError("Serviço indisponível nesta etapa.");
  }
  input(c: WorldConnection, v: Extract<WorldCommand, { type: "WORLD_INPUT" }>) {
    if (!isRpgSharedWorldEnabled()) return;
    const p = this.current(c, v.epoch);
    p.lastActivity = Date.now();
    p.zone.acceptMovement(c.userId, v);
  }
  step(dt: number) {
    this.accumulator += Math.min(0.2, Math.max(0, dt));
    while (this.accumulator >= 0.04) {
      for (const zone of this.zones.values()) zone.update(0.04);
      this.accumulator -= 0.04;
    }
    for (const zone of this.zones.values()) {
      if (!zone.avatars.size && !zone.reservations) {
        zone.emptySince ||= Date.now();
        if (Date.now() - zone.emptySince > 30000) {
          zone.dispose();
          this.zones.delete(zone.zoneId);
        }
      }
    }
    this.snapshotClock += dt;
    if (this.snapshotClock >= 0.1) {
      this.snapshotClock %= 0.1;
      for (const p of this.presence.values())
        p.connection.send(p.zone.snapshot(p.avatar));
    }
  }
  async maintenance() {
    for (const p of [...this.presence.values()])
      if (
        !isRpgSharedWorldEnabled() ||
        Date.now() - p.lastActivity > WORLD_IDLE_MS
      )
        await this.serialized(p.connection.userId, () =>
          this.leave(p.connection),
        );
  }
  diagnostics() {
    return {
      enabled: isRpgSharedWorldEnabled(),
      protocol: WORLD_PROTOCOL,
      capacityPerZone: WORLD_ZONE_CAPACITY,
      authority: "single",
      zones: [...this.zones.values()].map((z) => ({
        id: z.zoneId,
        version: z.definition.version,
        players: z.avatars.size,
        cells: z.interest.cellCount,
      })),
    };
  }
}
