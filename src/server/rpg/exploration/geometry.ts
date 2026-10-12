import "server-only";
import { GameSimulation } from "../../../game/core/simulation";
import { freshSave } from "../../../game/core/save";
import { generateExploration } from "../../../game/core/rpg/exploration/generation";
import type { ExplorationNode } from "../../../game/core/rpg/exploration/types";
import { EXPLORATION_RUINS as region } from "../../../game/content/rpg/exploration-regions";
let canonical: readonly ExplorationNode[] | undefined;
/** A single bounded descriptor cache; the temporary engine/world is discarded. */
export function assertCanonicalExplorationNode(node: ExplorationNode) {
  if (!canonical) {
    const game = new GameSimulation(freshSave());
    game.start("nara", "normal", region.mapId, region.seed, region.maxSeconds);
    canonical = generateExploration(region, game.world);
  }
  const known = canonical.find((n) => n.id === node.id);
  if (
    !known ||
    known.kind !== node.kind ||
    known.regionId !== node.regionId ||
    known.version !== node.version ||
    known.definitionId !== node.definitionId ||
    known.x !== node.x ||
    known.y !== node.y ||
    known.radius !== node.radius
  )
    throw new Error("Unknown exploration descriptor");
}
