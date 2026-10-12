import type { VisualBiome } from "../../../content/world-biomes";
export interface ExplorationRegion {
  readonly id: string;
  readonly version: number;
  readonly generationVersion: number;
  readonly name: string;
  readonly description: string;
  readonly mapId: "ruins";
  readonly worldVersion: 3;
  readonly seed: string;
  readonly bounds: {
    readonly minChunkX: number;
    readonly maxChunkX: number;
    readonly minChunkY: number;
    readonly maxChunkY: number;
  };
  readonly spawn: { readonly x: number; readonly y: number };
  readonly maxSeconds: number;
  readonly claimsPerSession: number;
  readonly claimsPerCycle: number;
}
export interface ExplorationResource {
  readonly id: string;
  readonly name: string;
  readonly category: "MINERAL" | "VEGETAL" | "CRYSTAL";
  readonly materialId: string;
  readonly quantity: number;
  readonly durationMs: number;
  readonly radius: number;
  readonly minimumLevel: number;
  readonly biomes: readonly VisualBiome[];
  readonly visual: "rocks" | "trees/living" | "crystals";
}
export interface ExplorationNode {
  readonly id: string;
  readonly regionId: string;
  readonly version: number;
  readonly kind: "RESOURCE" | "POI";
  readonly definitionId: string;
  readonly x: number;
  readonly y: number;
  readonly radius: number;
}
