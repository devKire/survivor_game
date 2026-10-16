import type { ExplorationNode } from "./types";
import { gatheringIntent, gatheringCycle } from "./gathering";
import { explorationResource } from "../../../content/rpg/exploration-resources";
import type { Vec } from "../../types";
export interface ActiveGathering {
  node: ExplorationNode;
  intent: ReturnType<typeof gatheringIntent.parse>;
  cycle: number;
  startedAt: number;
  elapsed: number;
  pending: boolean;
}
export interface GatheringActor extends Vec {
  available: boolean;
  level: number;
}
/** Common runtime for legacy sessions and shared regions. Time is server-owned. */
export function startGathering(
  actor: GatheringActor | undefined,
  node: ExplorationNode | undefined,
  raw: unknown,
  current?: ActiveGathering,
  now = performance.now(),
  wall = Date.now(),
): ActiveGathering {
  const intent = gatheringIntent.parse(raw);
  if (
    !actor?.available ||
    !node ||
    node.kind !== "RESOURCE" ||
    node.id !== intent.nodeId ||
    Math.hypot(actor.x - node.x, actor.y - node.y) > node.radius
  )
    throw new Error("Aproxime-se de um recurso disponível.");
  if (current) {
    if (JSON.stringify(current.intent) === JSON.stringify(intent))
      return current;
    throw new Error("Uma coleta já está em andamento.");
  }
  if (actor.level < explorationResource(node.definitionId).minimumLevel)
    throw new Error("Nível insuficiente.");
  return {
    node,
    intent,
    cycle: gatheringCycle(wall),
    startedAt: now,
    elapsed: 0,
    pending: false,
  };
}
export function gatheringReady(
  g: ActiveGathering | undefined,
  now = performance.now(),
) {
  if (!g || g.pending) return undefined;
  const duration = explorationResource(g.node.definitionId).durationMs;
  return g.elapsed >= duration && now - g.startedAt >= duration ? g : undefined;
}
export function assertGathering(
  actor: GatheringActor | undefined,
  g: ActiveGathering,
  current: ActiveGathering | undefined,
  now = performance.now(),
) {
  const duration = explorationResource(g.node.definitionId).durationMs;
  if (
    !actor?.available ||
    current !== g ||
    g.elapsed < duration ||
    now - g.startedAt < duration ||
    Math.hypot(actor.x - g.node.x, actor.y - g.node.y) > g.node.radius
  )
    throw new Error("Coleta cancelada.");
}
export function advanceGathering(
  actor: GatheringActor | undefined,
  input: Vec,
  g: ActiveGathering | undefined,
  dt: number,
) {
  if (!g) return undefined;
  if (
    !actor?.available ||
    Math.hypot(actor.x - g.node.x, actor.y - g.node.y) > g.node.radius ||
    Math.hypot(input.x, input.y) > 0.01
  )
    return undefined;
  g.elapsed += Math.max(0, Math.min(0.04, dt)) * 1000;
  return g;
}
