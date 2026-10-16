import { WorldSocial } from "./social";
import {
  persistWorldFieldEvent,
  settleWorldFieldEvent,
  recoverWorldFieldRewards,
} from "../../server/rpg/world/rewards";
import { executeWorldService } from "./services";
import { rpgProfileData } from "../../server/rpg/profile";
import { buildRpgCombatLoadout } from "../../server/rpg/loadout";
import {
  persistWorldGathering,
  persistWorldDiscovery,
  readWorldResources,
  worldGatheringReplay,
} from "../../server/rpg/world/resources";
import { gatheringReady } from "../../game/core/rpg/exploration/runtime";
import { gatheringCycle } from "../../game/core/rpg/exploration/gathering";
import { explorationResource } from "../../game/content/rpg/exploration-resources";
import { inDiscoveryRange } from "../../game/core/rpg/exploration/generation";
import { REFUGE } from "../../game/content/rpg/refuge";
import { withinWorldInteraction } from "../../game/core/rpg/world/rules";
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
export interface WorldPresence {
  connection: WorldConnection;
  zone: WorldZone;
  avatar: WorldAvatar;
  lastActivity: number;
  transitions: Map<string, { portalId: string }>;
}
export class WorldCoordinator {
  readonly authorityId = randomUUID();
  readonly social = new WorldSocial(this);
  readonly zones = new Map<WorldZoneId, WorldZone>();
  readonly presence = new Map<string, WorldPresence>();
  private queues = new Map<string, Promise<unknown>>();
  private snapshotClock = 0;
  private accumulator = 0;
  private flushing = false;
  private nextFlush = 0;
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
    await this.refreshResources(this.current(c));
    await this.social.refresh(c.userId);
    c.send(zone.snapshot(avatar));
  }
  async leave(c: WorldConnection) {
    const p = this.presence.get(c.userId);
    if (!p || p.connection !== c) return;
    p.zone.remove(c.userId);
    this.presence.delete(c.userId);
    await this.social.departed(c.userId);
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
      if (dest.definition.safe) await this.refreshAvatar(p);
      p.transitions.set(v.requestId, { portalId: v.portalId });
      if (p.transitions.size > 16)
        p.transitions.delete(p.transitions.keys().next().value!);
      await this.refreshResources(p);
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
  sendResourceState(p: WorldPresence, message?: string) {
    const g = p.avatar.gathering;
    p.connection.send({
      type: "WORLD_STATE",
      epoch: p.avatar.epoch,
      revision: p.avatar.revision,
      cycle: p.avatar.cycle,
      depleted: [...p.avatar.depleted],
      discovered: [...p.avatar.discoveries],
      gathering: g
        ? {
            nodeId: g.node.id,
            elapsed: g.elapsed,
            duration: explorationResource(g.node.definitionId).durationMs,
          }
        : null,
      ...(message ? { message } : {}),
    });
  }
  async refreshResources(p: WorldPresence) {
    const state = await readWorldResources(p.connection.userId);
    p.avatar.revision = state.revision;
    p.avatar.cycle = state.cycle;
    p.avatar.depleted = new Set(state.depleted);
    p.avatar.discoveries = new Set(state.discovered);
    p.connection.send(p.zone.snapshot(p.avatar));
    this.sendResourceState(p);
  }
  async refreshAvatar(p: WorldPresence) {
    const profile = await rpgProfileData(p.connection.userId),
      active = profile.characters.find(
        (c) => c.id === profile.activeCharacterId,
      )!;
    if (p.zone.definition.safe) {
      const loadout = await buildRpgCombatLoadout(
        p.connection.userId,
        active.characterId,
      );
      const old = p.avatar;
      let visitId = old.visitId,
        epoch = old.epoch;
      if (loadout.characterId !== old.loadout.characterId) {
        const entry = await openWorldVisit(old.userId, this.authorityId, () => {
          this.current(p.connection, old.epoch);
        });
        visitId = entry.visit.id;
        epoch = entry.visit.epoch;
      }
      const next = p.zone.createAvatar({
        userId: old.userId,
        publicId: old.publicId,
        visitId,
        epoch,
        name: old.name,
        loadout,
        xp: active.xp,
        revision: profile.revision,
      });
      const position = { x: old.player.x, y: old.player.y },
        ratio = old.player.health / old.player.maxHealth;
      p.zone.remove(old.userId);
      p.zone.add(next);
      Object.assign(next.player, position);
      next.player.health = next.player.maxHealth * ratio;
      next.sequence = epoch === old.epoch ? old.sequence : 0;
      next.busy = old.busy;
      next.profileLevel = active.level;
      p.avatar = next;
      p.zone.refreshPresence(next);
    } else {
      p.avatar.revision = profile.revision;
      p.avatar.xp = active.xp;
      p.avatar.profileLevel = active.level;
    }
  }
  processEvents(p: WorldPresence) {
    const a = p.avatar,
      c = p.connection;
    if (a.refreshPending || a.busy) return;
    if (a.cycle !== gatheringCycle(Date.now())) {
      a.refreshPending = true;
      void this.serialized(c.userId, () => this.refreshResources(p))
        .catch(() => {})
        .finally(() => {
          a.refreshPending = false;
        });
      return;
    }
    if (p.zone.definition.safe) return;
    const g = gatheringReady(a.gathering);
    if (g) {
      g.pending = true;
      void this.serialized(c.userId, async () => {
        const assertLive = () => {
          this.current(c, a.epoch);
          p.zone.assertGather(a, g);
        };
        try {
          const result = await persistWorldGathering(
            c.userId,
            a.visitId,
            a.epoch,
            g,
            assertLive,
          );
          if (a.gathering === g) a.gathering = undefined;
          await this.refreshResources(p);
          c.send({
            type: "WORLD_RESULT",
            requestId: g.intent.requestId,
            ok: true,
            message: `Coleta confirmada: +${result.quantity} ${result.materialId}.`,
            data: result,
          });
        } catch (error) {
          if (a.gathering === g) a.gathering = undefined;
          c.send({
            type: "WORLD_RESULT",
            requestId: g.intent.requestId,
            ok: false,
            message:
              error instanceof UserError
                ? error.message
                : "Coleta cancelada ou indisponível. Tente novamente.",
          });
          await this.refreshResources(p).catch(() => {});
        }
      });
      return;
    }
    if (a.gathering) return;
    for (const node of p.zone.nodes.filter(
      (n) =>
        inDiscoveryRange(n, a.player) &&
        !a.discoveries.has(n.id) &&
        !a.discoveryPending.has(n.id),
    )) {
      a.discoveryPending.add(node.id);
      void this.serialized(c.userId, async () => {
        if (a.gathering || a.busy) return;
        const assertLive = () => {
          this.current(c, a.epoch);
          if (
            p.zone.zoneId !== "ruins-outskirts" ||
            !inDiscoveryRange(node, a.player)
          )
            throw new UserError("Descoberta cancelada.");
        };
        await persistWorldDiscovery(
          c.userId,
          a.visitId,
          a.epoch,
          node,
          assertLive,
        );
        a.discoveries.add(node.id);
        await this.refreshResources(p);
      })
        .catch(() => {})
        .finally(() => a.discoveryPending.delete(node.id));
    }
  }
  async rpc(
    c: WorldConnection,
    v: Extract<WorldCommand, { type: "WORLD_RPC" }>,
  ) {
    const p = this.current(c, v.epoch);
    p.avatar.busy = true;
    p.avatar.gathering = undefined;
    p.avatar.input = { x: 0, y: 0 };
    try {
      const data = await executeWorldService(c, p, v.operation, v.args, () => {
        this.current(c, v.epoch);
      });
      if (v.operation !== "JOURNAL") await this.refreshAvatar(p);
      await this.refreshResources(p);
      c.send({
        type: "WORLD_RESULT",
        requestId: v.requestId,
        ok: true,
        message: "Registro confirmado.",
        data,
      });
      c.send(p.zone.snapshot(p.avatar));
    } finally {
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
    if (v.type === "WORLD_CHAT") {
      await this.social.chat(c, v);
      return;
    }
    if (v.type === "WORLD_GROUP") {
      await this.social.group(c, v);
      return;
    }
    if (v.type === "WORLD_TRANSITION") {
      await this.transition(c, v);
      return;
    }
    if (v.type === "WORLD_REFRESH") {
      await this.refreshAvatar(p);
      await this.refreshResources(p);
      c.send(p.zone.snapshot(p.avatar));
      return;
    }
    if (v.type === "WORLD_CANCEL") {
      p.avatar.gathering = undefined;
      this.sendResourceState(p);
      return;
    }
    if (v.type === "WORLD_RPC") {
      await this.rpc(c, v);
      return;
    }
    if (v.type === "WORLD_INTERACT") {
      const target = [...REFUGE.npcs, ...REFUGE.structures].find(
        (t) => t.id === v.targetId,
      );
      if (
        p.zone.zoneId !== "obelisk-refuge" ||
        !target ||
        !withinWorldInteraction(p.avatar.player, target) ||
        p.avatar.player.health <= 0
      )
        throw new UserError("Aproxime-se de um serviço válido.");
      c.send({
        type: "WORLD_INTERACTION",
        epoch: p.avatar.epoch,
        targetId: target.id,
        service:
          target.visual === "npc" ? "NPC" : (target.service ?? "CHARACTER"),
      });
      return;
    }
    if (v.type === "WORLD_GATHER") {
      await this.refreshResources(p);
      const intent = {
        nodeId: v.nodeId,
        requestId: v.requestId,
        expectedRevision: v.expectedRevision,
      };
      const replay = await worldGatheringReplay(c.userId, intent);
      if (replay) {
        c.send({
          type: "WORLD_RESULT",
          requestId: v.requestId,
          ok: true,
          message: "Coleta já confirmada.",
          data: replay,
        });
        return;
      }
      if (v.expectedRevision !== p.avatar.revision)
        throw new UserError("O perfil mudou. Atualize e tente novamente.");
      try {
        p.zone.startGather(p.avatar, intent);
      } catch (error) {
        throw new UserError(
          error instanceof Error ? error.message : "Coleta inválida.",
        );
      }
      if (p.avatar.depleted.has(v.nodeId)) {
        p.avatar.gathering = undefined;
        this.sendResourceState(p, "Recurso já coletado neste ciclo UTC.");
        c.send({
          type: "WORLD_RESULT",
          requestId: v.requestId,
          ok: true,
          message: "Recurso já coletado neste ciclo UTC.",
        });
      } else this.sendResourceState(p);
      return;
    }
    throw new UserError("Serviço indisponível nesta etapa.");
  }
  input(c: WorldConnection, v: Extract<WorldCommand, { type: "WORLD_INPUT" }>) {
    if (!isRpgSharedWorldEnabled()) return;
    const p = this.current(c, v.epoch);
    if (Math.hypot(v.moveX, v.moveY) > 0.01) p.lastActivity = Date.now();
    p.zone.acceptMovement(c.userId, v);
  }
  async flushRewards() {
    if (this.flushing || !isRpgSharedWorldEnabled()) return;
    this.flushing = true;
    try {
      const settled: Awaited<ReturnType<typeof settleWorldFieldEvent>> = [];
      for (const zone of this.zones.values()) {
        const events = zone.field?.pending;
        for (let i = 0; events?.length && i < 8; i++) {
          const event = events[0];
          await persistWorldFieldEvent(event);
          events.shift(); // From this point startup recovery owns the immutable evidence.
          settled.push(...(await settleWorldFieldEvent(event.id)));
        }
      }
      settled.push(...(await recoverWorldFieldRewards()));
      for (const userId of new Set(settled.map((r) => r.userId))) {
        const p = this.presence.get(userId);
        if (!p) continue;
        await this.serialized(userId, async () => {
          if (this.presence.get(userId) !== p) return;
          await this.refreshAvatar(p);
          await this.refreshResources(p);
          p.connection.send({
            type: "WORLD_REWARDS",
            rewards: settled
              .filter((r) => r.userId === userId)
              .map((r) => ({
                id: r.eventId,
                xp: r.xpGranted,
                revision: r.revision,
                result: r.result,
              })),
          });
        });
      }
    } finally {
      this.flushing = false;
    }
  }
  step(dt: number) {
    if (
      Date.now() >= this.nextFlush &&
      [...this.zones.values()].some((z) => z.field?.pending.length)
    ) {
      this.nextFlush = Date.now() + 1000;
      void this.flushRewards().catch(() => {
        console.error("World field rewards pending retry.");
      });
    }
    this.accumulator += Math.min(0.2, Math.max(0, dt));
    while (this.accumulator >= 0.04) {
      for (const zone of this.zones.values()) zone.update(0.04);
      this.accumulator -= 0.04;
    }
    for (const zone of this.zones.values()) {
      if (
        !zone.avatars.size &&
        !zone.reservations &&
        !zone.field?.pending.length
      ) {
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
      for (const p of this.presence.values()) {
        this.processEvents(p);
        p.connection.send(p.zone.snapshot(p.avatar));
        if (p.avatar.gathering) this.sendResourceState(p);
      }
    }
  }
  async maintenance() {
    await this.flushRewards();
    await this.social.maintenance();
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
