import { hashString, mulberry32, clamp } from "./math";
import {
  WORLD_BIOMES,
  TERRAIN_PROFILES,
  PROP_HEIGHT,
  CORRUPTION_WINDOW,
  type VisualBiome,
  type TerrainProfile,
  type Weighted,
} from "../content/world-biomes";
import type { GroundFamily, PropFamily } from "../content/tile-types";
import type { Structure } from "./types";
export const VISUAL_VERSION = 1;
export const GROUND_TILE_WORLD_SIZE = 192;
export const VISUAL_CHUNK_SIZE = 768;
export const MACRO_BIOME_SIZE = 1152;
export interface VisualConfig {
  seed: string;
  mapId: string;
  profile: TerrainProfile;
  density: number;
  biomeOverride?: VisualBiome;
}
export interface VisualGroundCell {
  x: number;
  y: number;
  family: GroundFamily;
  slot: number;
  variant: number;
  biome: VisualBiome;
}
export interface VisualProp {
  x: number;
  y: number;
  family: PropFamily;
  slot: number;
  variant: number;
  height: number;
  threshold: number;
  corruptionOnly: boolean;
}
export interface VisualChunk {
  cx: number;
  cy: number;
  ground: VisualGroundCell[];
  props: VisualProp[];
}
function pick<T>(values: Weighted<T>, n: number): T {
  let roll = n * values.reduce((a, v) => a + v[1], 0);
  for (const [v, w] of values) {
    roll -= w;
    if (roll < 0) return v;
  }
  return values[values.length - 1][0];
}
/** Jittered Voronoi regions: shared world coordinates make chunk borders seamless. */
export function biomeAt(
  config: VisualConfig,
  x: number,
  y: number,
): VisualBiome {
  if (config.biomeOverride) return config.biomeOverride;
  const cx = Math.floor(x / MACRO_BIOME_SIZE),
    cy = Math.floor(y / MACRO_BIOME_SIZE);
  let closest = Infinity,
    biome: VisualBiome = "ruins";
  for (let yy = cy - 1; yy <= cy + 1; yy++)
    for (let xx = cx - 1; xx <= cx + 1; xx++) {
      const rng = mulberry32(
        hashString(
          `${config.seed}|visual${VISUAL_VERSION}|${config.mapId}|macro|${xx}|${yy}`,
        ),
      );
      const px = (xx + 0.2 + rng() * 0.6) * MACRO_BIOME_SIZE,
        py = (yy + 0.2 + rng() * 0.6) * MACRO_BIOME_SIZE;
      const d = (px - x) ** 2 + (py - y) ** 2;
      if (d < closest) {
        closest = d;
        biome = pick(TERRAIN_PROFILES[config.profile], rng());
      }
    }
  return biome;
}
export function groundCell(
  config: VisualConfig,
  gx: number,
  gy: number,
): VisualGroundCell {
  const x = gx * GROUND_TILE_WORLD_SIZE,
    y = gy * GROUND_TILE_WORLD_SIZE;
  const biome = biomeAt(config, x + 96, y + 96),
    d = WORLD_BIOMES[biome];
  const rng = mulberry32(
    hashString(
      `${config.seed}|visual${VISUAL_VERSION}|${config.mapId}|ground|${gx}|${gy}`,
    ),
  );
  return {
    x,
    y,
    biome,
    family: d.ground,
    slot: d.groundSlots[Math.floor(rng() * d.groundSlots.length)],
    variant: hashString(
      `${config.seed}|${config.mapId}|atlas|${Math.floor(gx / 6)}|${Math.floor(gy / 6)}`,
    ),
  };
}
export function generateVisualChunk(
  config: VisualConfig,
  cx: number,
  cy: number,
): VisualChunk {
  const ground: VisualGroundCell[] = [],
    props: VisualProp[] = [];
  // One extra border of descriptors is required when baking overlapping ground patches.
  for (let gy = cy * 4 - 1; gy <= cy * 4 + 4; gy++)
    for (let gx = cx * 4 - 1; gx <= cx * 4 + 4; gx++)
      ground.push(groundCell(config, gx, gy));
  const step = 192;
  for (let iy = 0; iy < 4; iy++)
    for (let ix = 0; ix < 4; ix++) {
      const rng = mulberry32(
        hashString(
          `${config.seed}|visual${VISUAL_VERSION}|${config.mapId}|prop|${cx}|${cy}|${ix}|${iy}`,
        ),
      );
      const x = cx * VISUAL_CHUNK_SIZE + (ix + 0.25 + rng() * 0.5) * step,
        y = cy * VISUAL_CHUNK_SIZE + (iy + 0.25 + rng() * 0.5) * step;
      const biome = biomeAt(config, x, y),
        d = WORLD_BIOMES[biome];
      const existence = rng(),
        family = pick(d.props, rng()),
        slot = Math.floor(rng() * 64),
        variant = Math.floor(rng() * 0xffffffff),
        height = PROP_HEIGHT[family] * [0.8, 1, 1.15][Math.floor(rng() * 3)],
        threshold = 0.15 + rng() * 0.65;
      if (Math.hypot(x, y) < 210) continue;
      // Clear strips around macro-cell centers form readable corridors through clusters.
      const clearing = Math.abs(Math.sin(x / 330) * Math.cos(y / 390));
      if (
        existence < d.density * config.density * 1.3 &&
        (!family.startsWith("trees_") || clearing > 0.28)
      )
        props.push({
          x,
          y,
          family,
          slot,
          variant,
          height,
          threshold,
          corruptionOnly: false,
        });
      else if (existence > 0.87)
        props.push({
          x,
          y,
          family: "corruption",
          slot: slot % 24,
          variant,
          height: 48,
          threshold,
          corruptionOnly: true,
        });
    }
  props.sort((a, b) => a.y - b.y || a.x - b.x);
  return { cx, cy, ground, props };
}
const smooth = (t: number) => {
  const n = clamp(t, 0, 1);
  return n * n * (3 - 2 * n);
};
/** Temporal cue only: no enemy scheduling, state mutation or locally inferred damage. */
export function corruptionPressure(
  time: number,
  schedule: readonly number[],
  window = CORRUPTION_WINDOW,
): number {
  if (!Number.isFinite(time) || window <= 0) return 0;
  let pressure = 0;
  for (const at of schedule) {
    const dt = time - at;
    if (dt >= -window && dt <= window)
      pressure = Math.max(
        pressure,
        dt < 0 ? smooth(1 + dt / window) : 1 - smooth(dt / window),
      );
  }
  return pressure;
}
export function corruptionAlpha(pressure: number, threshold: number) {
  return smooth((pressure - threshold) / 0.25);
}
export function propStages(family: PropFamily): readonly PropFamily[] {
  if (family === "trees_living")
    return ["trees_living", "trees_dead", "trees_petrified"];
  if (family === "trees_dead") return ["trees_dead", "trees_petrified"];
  if (family === "rocks") return ["rocks", "corruption"];
  return [family];
}
/** Spatial query can supply only nearby authoritative structures. Decoration has no collider. */
export function propClearOfStructures(
  prop: Pick<VisualProp, "x" | "y" | "height">,
  structures: readonly Structure[],
): boolean {
  return !structures.some(
    (s) =>
      !s.destroyed &&
      (s.x - prop.x) ** 2 + (s.y - prop.y) ** 2 <
        (s.r + 32 + prop.height * 0.45) ** 2,
  );
}
export interface StructureArt {
  family: PropFamily;
  slot: number;
  variant: number;
  height: number;
}
export function structureArt(
  config: VisualConfig,
  s: Pick<Structure, "id" | "type" | "x" | "y">,
): StructureArt | undefined {
  const biome = biomeAt(config, s.x, s.y),
    hash = hashString(`${s.id}|art|${config.mapId}|${biome}`);
  const pools: Record<string, readonly number[]> = {
    column: [0, 1, 2, 3, 4, 8, 9, 29],
    wall: [10, 11, 12, 13, 14, 15, 16, 17],
    ruin: [18, 19, 24, 28, 30, 31, 32, 34, 35, 40, 41],
    platform: [6, 28, 41],
  };
  let family: PropFamily, height: number;
  if (s.type in pools) {
    family = "ruins";
    height = s.type === "column" ? 90 : s.type === "platform" ? 55 : 75;
  } else if (s.type === "stone") {
    family = "rocks";
    height = 65;
  } else if (s.type === "tree") {
    family = WORLD_BIOMES[biome].tree;
    height = 134;
  } else if (s.type === "rift") {
    family = "corruption";
    height = 76;
  } else if (s.type === "thorn") {
    family = "swamp";
    height = 68;
  } else return;
  const pool = pools[s.type];
  const slot = pool
    ? pool[hash % pool.length]
    : s.type === "rift"
      ? hash % 16
      : s.type === "thorn"
        ? 32 + (hash % 16)
        : hash % 64;
  return { family, slot, variant: hash, height };
}

/** Independent of World.chunks (which remote clients rebuild from snapshots). */
export class VisualChunkCache {
  private identity = "";
  readonly chunks = new Map<string, VisualChunk>();
  configure(config: VisualConfig) {
    const key = JSON.stringify(config);
    if (key !== this.identity) {
      this.identity = key;
      this.chunks.clear();
      return true;
    }
    return false;
  }
  get(config: VisualConfig, cx: number, cy: number) {
    const key = `${cx},${cy}`;
    let chunk = this.chunks.get(key);
    if (!chunk) {
      chunk = generateVisualChunk(config, cx, cy);
      this.chunks.set(key, chunk);
    }
    return chunk;
  }
  retain(minX: number, minY: number, maxX: number, maxY: number) {
    for (const [key, c] of this.chunks)
      if (c.cx < minX || c.cy < minY || c.cx > maxX || c.cy > maxY)
        this.chunks.delete(key);
  }
}
