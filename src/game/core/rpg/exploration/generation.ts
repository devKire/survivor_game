import { CHUNK_SIZE } from "../../../content/catalog";
import { EXPLORATION_RESOURCES } from "../../../content/rpg/exploration-resources";
import { hashString, mulberry32 } from "../../math";
import { biomeAt } from "../../world-visuals";
import type { World } from "../../world";
import type { ExplorationNode, ExplorationRegion } from "./types";

export function regionContains(
  region: ExplorationRegion,
  x: number,
  y: number,
  margin = 0,
) {
  const b = region.bounds;
  return (
    Number.isFinite(x + y) &&
    x >= b.minChunkX * CHUNK_SIZE + margin &&
    x <= (b.maxChunkX + 1) * CHUNK_SIZE - margin &&
    y >= b.minChunkY * CHUNK_SIZE + margin &&
    y <= (b.maxChunkY + 1) * CHUNK_SIZE - margin
  );
}
export function validateRegion(region: ExplorationRegion) {
  const b = region.bounds,
    values = Object.values(b);
  if (
    !/^[a-z0-9-]{1,50}$/.test(region.id) ||
    region.version < 1 ||
    !Number.isInteger(region.version) ||
    region.generationVersion !== 1 ||
    region.worldVersion !== 3 ||
    region.mapId !== "ruins" ||
    values.some((n) => !Number.isSafeInteger(n) || Math.abs(n) > 1024) ||
    !region.seed ||
    region.seed.length > 128 ||
    !Number.isInteger(region.maxSeconds) ||
    region.maxSeconds < 60 ||
    region.maxSeconds > 900 ||
    !Number.isInteger(region.claimsPerSession) ||
    region.claimsPerSession < 1 ||
    region.claimsPerSession > 12 ||
    !Number.isInteger(region.claimsPerCycle) ||
    region.claimsPerCycle < region.claimsPerSession ||
    region.claimsPerCycle > 18 ||
    b.minChunkX > b.maxChunkX ||
    b.minChunkY > b.maxChunkY ||
    (b.maxChunkX - b.minChunkX + 1) * (b.maxChunkY - b.minChunkY + 1) > 9 ||
    !regionContains(region, region.spawn.x, region.spawn.y, 125)
  )
    throw new Error("Região inválida.");
}
/** Bounded independent RNG. Does not consume or mutate World generation/chunks. */
export function generateExploration(
  region: ExplorationRegion,
  world: Pick<World, "createChunk" | "seed" | "mapId">,
): readonly ExplorationNode[] {
  validateRegion(region);
  if (world.seed !== region.seed || world.mapId !== region.mapId)
    throw new Error("Mundo incompatível.");
  const nodes: ExplorationNode[] = [],
    b = region.bounds;
  const config = {
    seed: region.seed,
    mapId: region.mapId,
    profile: "ruins" as const,
    density: 0.5,
  };
  for (let cy = b.minChunkY; cy <= b.maxChunkY; cy++)
    for (let cx = b.minChunkX; cx <= b.maxChunkX; cx++) {
      const structures = world.createChunk(cx, cy).structures;
      const definitions = [
        ...EXPLORATION_RESOURCES.map((r) => ({
          id: r.id,
          radius: r.radius,
          kind: "RESOURCE" as const,
          biomes: r.biomes,
        })),
        { id: "ruins-remnant", radius: 95, kind: "POI" as const, biomes: null },
      ];
      for (const definition of definitions) {
        const rng = mulberry32(
          hashString(
            `${region.seed}|explore:${region.generationVersion}|${cx}:${cy}|${definition.id}`,
          ),
        );
        for (let attempt = 0; attempt < 80; attempt++) {
          const x = Math.round(
              cx * CHUNK_SIZE + 85 + rng() * (CHUNK_SIZE - 170),
            ),
            y = Math.round(cy * CHUNK_SIZE + 85 + rng() * (CHUNK_SIZE - 170));
          if (
            Math.hypot(x - region.spawn.x, y - region.spawn.y) < 150 ||
            structures.some((s) => Math.hypot(x - s.x, y - s.y) < s.r + 75) ||
            nodes.some((n) => Math.hypot(n.x - x, n.y - y) < 125) ||
            (definition.biomes &&
              !definition.biomes.includes(biomeAt(config, x, y)))
          )
            continue;
          nodes.push(
            Object.freeze({
              id: `explore:v${region.version}:${region.id}:${cx}:${cy}:${definition.id}:0`,
              regionId: region.id,
              version: region.version,
              kind: definition.kind,
              definitionId: definition.id,
              x,
              y,
              radius: definition.radius,
            }),
          );
          break;
        }
      }
    }
  return Object.freeze(nodes);
}
export function inDiscoveryRange(
  node: ExplorationNode,
  position: { x: number; y: number },
) {
  return (
    node.kind === "POI" &&
    Math.hypot(position.x - node.x, position.y - node.y) <= node.radius
  );
}
