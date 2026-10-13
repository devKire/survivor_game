import { CoopSimulation } from "../../coop";
import { CHUNK_SIZE } from "../../../content/catalog";
import { EXPLORATION_RUINS as region } from "../../../content/rpg/exploration-regions";
import { explorationResource } from "../../../content/rpg/exploration-resources";
import { generateExploration, inDiscoveryRange } from "./generation";
import { gatheringCycle, gatheringIntent } from "./gathering";
import type { ExplorationNode } from "./types";
export interface ActiveGathering {
  node: ExplorationNode;
  intent: ReturnType<typeof gatheringIntent.parse>;
  cycle: number;
  startedAt: number;
  elapsed: number;
  pending: boolean;
}
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
      const gather = this.gathering.get(m.id);
      if (gather) {
        if (
          Math.hypot(p.x - gather.node.x, p.y - gather.node.y) >
            gather.node.radius ||
          Math.hypot(input.moveX, input.moveY) > 0.01
        )
          this.gathering.delete(m.id);
        else gather.elapsed += dt * 1000;
      }
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
  startGather(
    userId: string,
    raw: unknown,
    now = performance.now(),
    wall = Date.now(),
  ) {
    const intent = gatheringIntent.parse(raw),
      m = this.members.get(userId);
    const node = this.nodes.find(
      (n) => n.id === intent.nodeId && n.kind === "RESOURCE",
    );
    if (
      this.ended ||
      !m?.connected ||
      this.departed.has(userId) ||
      !node ||
      Math.hypot(m.player.x - node.x, m.player.y - node.y) > node.radius
    )
      throw new Error("Aproxime-se de um recurso disponível.");
    const existing = this.gathering.get(userId);
    if (existing) {
      if (JSON.stringify(existing.intent) === JSON.stringify(intent)) return;
      throw new Error("Uma coleta já está em andamento.");
    }
    const loadout = this.levels.get(userId)!;
    if (loadout < explorationResource(node.definitionId).minimumLevel)
      throw new Error("Nível insuficiente.");
    this.gathering.set(userId, {
      node,
      intent,
      cycle: gatheringCycle(wall),
      startedAt: now,
      elapsed: 0,
      pending: false,
    });
  }
  gatheringReady(userId: string, now = performance.now()) {
    const g = this.gathering.get(userId);
    if (!g || g.pending) return undefined;
    const duration = explorationResource(g.node.definitionId).durationMs;
    return g.elapsed >= duration && now - g.startedAt >= duration
      ? g
      : undefined;
  }
  assertGather(userId: string, g: ActiveGathering) {
    const m = this.members.get(userId);
    if (
      this.ended ||
      !m?.connected ||
      this.departed.has(userId) ||
      this.gathering.get(userId) !== g ||
      g.elapsed < explorationResource(g.node.definitionId).durationMs ||
      performance.now() - g.startedAt <
        explorationResource(g.node.definitionId).durationMs ||
      Math.hypot(m.player.x - g.node.x, m.player.y - g.node.y) > g.node.radius
    )
      throw new Error("Coleta cancelada.");
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
