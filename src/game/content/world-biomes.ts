import type { GroundFamily, PropFamily } from "./tile-types";
export type VisualBiome = GroundFamily | "mine" | "volcanic_cave" | "volcano";
export type TerrainProfile =
  "ruins" | "gardens" | "cave" | "mine" | "volcanic_cave" | "volcano";
export type Weighted<T> = readonly (readonly [T, number])[];
export interface VisualBiomeDefinition {
  ground: GroundFamily;
  props: Weighted<PropFamily>;
  density: number;
  tint: string;
  groundSlots: readonly number[];
  tree: PropFamily;
}
const range = (a: number, b: number) =>
  Array.from({ length: b - a + 1 }, (_, i) => a + i);
const biome = (
  ground: GroundFamily,
  props: Weighted<PropFamily>,
  density: number,
  tint: string,
  groundSlots: readonly number[],
  tree: PropFamily = "trees_living",
): VisualBiomeDefinition => ({
  ground,
  props,
  density,
  tint,
  groundSlots,
  tree,
});
// Pools are visually reviewed surface variants, not invented edge/adjacency codes.
export const WORLD_BIOMES: Record<VisualBiome, VisualBiomeDefinition> = {
  ruins: biome(
    "ruins",
    [
      ["ruins", 5],
      ["rocks", 4],
      ["trees_living", 1],
      ["beast_damage", 1],
    ],
    0.44,
    "#333932",
    range(0, 15),
  ),
  forest: biome(
    "forest",
    [
      ["trees_living", 4],
      ["rocks", 3],
      ["swamp", 1],
      ["ruins", 1],
    ],
    0.64,
    "#24352b",
    range(0, 23),
  ),
  dead: biome(
    "dead",
    [
      ["trees_dead", 4],
      ["beast_damage", 4],
      ["rocks", 3],
    ],
    0.48,
    "#3a352e",
    range(0, 15),
    "trees_dead",
  ),
  corrupted: biome(
    "corrupted",
    [
      ["trees_petrified", 3],
      ["corruption", 4],
      ["rocks", 3],
      ["beast_damage", 1],
    ],
    0.5,
    "#322d39",
    range(0, 15),
    "trees_petrified",
  ),
  rock: biome(
    "rock",
    [
      ["rocks", 6],
      ["minerals", 3],
      ["crystals", 1],
    ],
    0.4,
    "#33383b",
    range(0, 23),
    "trees_dead",
  ),
  sand: biome(
    "sand",
    [
      ["rocks", 4],
      ["beast_damage", 2],
      ["trees_dead", 1],
      ["ruins", 1],
    ],
    0.25,
    "#484031",
    range(0, 15),
    "trees_dead",
  ),
  swamp: biome(
    "swamp",
    [
      ["swamp", 7],
      ["trees_living", 1],
      ["trees_dead", 1],
      ["rocks", 2],
      ["crystals", 0.3],
    ],
    0.58,
    "#263b35",
    range(0, 11),
  ),
  cave: biome(
    "cave",
    [
      ["cave", 5],
      ["rocks", 3],
      ["minerals", 2],
      ["crystals", 1],
    ],
    0.46,
    "#30343a",
    range(0, 11),
    "trees_petrified",
  ),
  lava: biome(
    "lava",
    [
      ["volcano", 6],
      ["rocks", 3],
      ["minerals", 1],
    ],
    0.4,
    "#392b2a",
    range(0, 15),
    "trees_petrified",
  ),
  mine: biome(
    "cave",
    [
      ["cave", 2],
      ["minerals", 4],
      ["mines", 4],
      ["rocks", 2],
    ],
    0.46,
    "#36322c",
    range(0, 11),
    "trees_dead",
  ),
  volcanic_cave: biome(
    "lava",
    [
      ["cave", 3],
      ["volcano", 5],
      ["minerals", 1],
    ],
    0.45,
    "#322b2d",
    range(8, 23),
    "trees_petrified",
  ),
  volcano: biome(
    "lava",
    [
      ["volcano", 7],
      ["rocks", 2],
    ],
    0.38,
    "#372b2a",
    range(8, 23),
    "trees_petrified",
  ),
};
export const TERRAIN_PROFILES: Record<TerrainProfile, Weighted<VisualBiome>> = {
  ruins: [
    ["ruins", 44],
    ["forest", 20],
    ["rock", 18],
    ["dead", 8],
    ["sand", 6],
    ["corrupted", 4],
  ],
  gardens: [
    ["forest", 34],
    ["swamp", 34],
    ["ruins", 16],
    ["rock", 9],
    ["dead", 5],
    ["corrupted", 2],
  ],
  cave: [
    ["cave", 8],
    ["rock", 2],
  ],
  mine: [
    ["mine", 7],
    ["cave", 3],
  ],
  volcanic_cave: [
    ["volcanic_cave", 7],
    ["cave", 3],
  ],
  volcano: [
    ["volcano", 8],
    ["rock", 2],
  ],
};
export const PROP_HEIGHT: Record<PropFamily, number> = {
  trees_living: 126,
  trees_dead: 112,
  trees_petrified: 120,
  rocks: 48,
  minerals: 48,
  crystals: 52,
  ruins: 85,
  corruption: 60,
  beast_damage: 46,
  swamp: 46,
  volcano: 64,
  mines: 85,
  cave: 76,
};
export const CORRUPTION_WINDOW = 55;
