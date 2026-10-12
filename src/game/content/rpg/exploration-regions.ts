import type { ExplorationRegion } from "../../core/rpg/exploration/types";
export const RPG_EXPLORATION_CONTENT_VERSION = 1;
export const RPG_GATHERING_RULESET_VERSION = 1;
/** Published v1 identity: changes to geometry/rewards require a new version. */
export const EXPLORATION_RUINS = Object.freeze({
  id: "ruins-outskirts",
  version: 1,
  generationVersion: 1,
  name: "Arredores das Ruínas",
  description:
    "Vestígios, vegetação e resíduos do Obelisco. Uma região de reconhecimento sem ondas de combate.",
  mapId: "ruins",
  worldVersion: 3,
  seed: "limiar:exploration:ruins-outskirts:v1",
  bounds: Object.freeze({
    minChunkX: -1,
    maxChunkX: 1,
    minChunkY: -1,
    maxChunkY: 1,
  }),
  spawn: Object.freeze({ x: 0, y: 0 }),
  maxSeconds: 900,
  claimsPerSession: 12,
  claimsPerCycle: 18,
} as const satisfies ExplorationRegion);
export function explorationRegion(
  id: string,
  version: number,
): ExplorationRegion {
  if (id !== EXPLORATION_RUINS.id || version !== 1)
    throw new Error("Região de exploração desconhecida.");
  return EXPLORATION_RUINS;
}
