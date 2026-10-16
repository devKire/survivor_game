import { CoopSimulation } from "../../coop";
import { CHUNK_SIZE } from "../../../content/catalog";
import { EXPLORATION_RUINS as region } from "../../../content/rpg/exploration-regions";
import { generateExploration, inDiscoveryRange } from "./generation";
import { gatheringIntent } from "./gathering";
import type { ExplorationNode } from "./types";
import {
  startGathering,
  gatheringReady,
  assertGathering,
  advanceGathering,
  type ActiveGathering,
} from "./runtime";
export type { ActiveGathering } from "./runtime";
/** Movement/collision/input and party identity remain inherited. No waves or reward ledger. */
export class ExplorationSimulation extends CoopSimulation {
  readonly levels = new Map<string, number>();
  readonly nodes: readonly ExplorationNode[];
  readonly gathering = new Map<string, ActiveGathering>();
  readonly departed = new Set<string>();
  readonly discoveries = new Map<string, Set<string>>();
  readonly discoveryPending = new Map<string, Set<string>>();
  constructor(...args: ConstructorParameters<typeof CoopSimulation>) {
    super(...args);
    if (args[5]?.kind !== "RPG_EXPLORATION" || args[3] !== region.seed)
      throw new Error("Exploração requer contexto explícito.");
    for (const [id, loadout] of Object.entries(args[5].loadouts))
      this.levels.set(id, loadout.level);
    this.nodes = generateExploration(region, this.world);
    for (const m of this.members.values()) {
      this.discoveries.set(m.id, new Set());
      this.discoveryPending.set(m.id, new Set());
    }
  }
  override update(dt: number) {
    if (this.ended) return;
    dt = Math.min(0.04, Math.max(0, dt));
    this.run.time += dt;
    this.run.simTime += dt;
    for (const m of this.members.values()) {
      if (this.departed.has(m.id)) continue;
      if (!m.connected) {
        this.gathering.delete(m.id);
        if (this.run.time - m.disconnectAt > 60) this.leave(m.id);
        continue;
      }
      const input =
        this.run.time - m.lastInput < 0.25 ? m.input : { moveX: 0, moveY: 0 };
      this.movePlayer(m.player, { x: input.moveX, y: input.moveY }, dt);
      const p = m.player,
        b = region.bounds;
      p.x = Math.max(
        b.minChunkX * CHUNK_SIZE + p.r,
        Math.min((b.maxChunkX + 1) * CHUNK_SIZE - p.r, p.x),
      );
      p.y = Math.max(
        b.minChunkY * CHUNK_SIZE + p.r,
        Math.min((b.maxChunkY + 1) * CHUNK_SIZE - p.r, p.y),
      );
      const gather = advanceGathering(
        this.gatheringActor(m.id),
        { x: input.moveX, y: input.moveY },
        this.gathering.get(m.id),
        dt,
      );
      if (gather) this.gathering.set(m.id, gather);
      else this.gathering.delete(m.id);
    }
    this.world.update();
    if (
      this.run.time >= region.maxSeconds ||
      this.departed.size === this.members.size
    ) {
      this.ended = true;
      this.state = "result";
      this.gathering.clear();
    }
  }
  private gatheringActor(userId: string) {
    const m = this.members.get(userId);
    return m
      ? {
          x: m.player.x,
          y: m.player.y,
          available: !this.ended && m.connected && !this.departed.has(userId),
          level: this.levels.get(userId)!,
        }
      : undefined;
  }
  startGather(
    userId: string,
    raw: unknown,
    now = performance.now(),
    wall = Date.now(),
  ) {
    const intent = gatheringIntent.parse(raw),
      node = this.nodes.find((n) => n.id === intent.nodeId);
    this.gathering.set(
      userId,
      startGathering(
        this.gatheringActor(userId),
        node,
        intent,
        this.gathering.get(userId),
        now,
        wall,
      ),
    );
  }
  gatheringReady(userId: string, now = performance.now()) {
    return gatheringReady(this.gathering.get(userId), now);
  }
  assertGather(userId: string, g: ActiveGathering) {
    assertGathering(this.gatheringActor(userId), g, this.gathering.get(userId));
  }
  nearbyDiscoveries(userId: string) {
    const m = this.members.get(userId);
    if (this.ended || !m?.connected || this.departed.has(userId)) return [];
    return this.nodes.filter(
      (n) =>
        inDiscoveryRange(n, m.player) &&
        !this.discoveries.get(userId)?.has(n.id) &&
        !this.discoveryPending.get(userId)?.has(n.id),
    );
  }
  leave(userId: string) {
    this.departed.add(userId);
    this.gathering.delete(userId);
    super.disconnect(userId);
  }
  override disconnect(userId: string) {
    this.gathering.delete(userId);
    super.disconnect(userId);
  }
  override reconnect(userId: string) {
    return !this.departed.has(userId) && super.reconnect(userId);
  }
  override interactOnline() {} // Survivor structures remain scenery in exploration.
  override use() {}
  override choose() {}
  override finish() {} // No combat victory or completion reward.
}
