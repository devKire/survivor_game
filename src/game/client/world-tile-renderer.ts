import { TileRenderer, tileImage, tileImageGeneration } from "./tile-renderer";
import { resolveGroundAtlas, resolvePropAtlas } from "./tile-art";
import {
  VisualChunkCache,
  VISUAL_CHUNK_SIZE,
  GROUND_TILE_WORLD_SIZE,
  corruptionAlpha,
  propStages,
  propClearOfStructures,
  structureArt,
  type VisualConfig,
  type VisualChunk,
  type VisualProp,
  type StructureArt,
} from "../core/world-visuals";
import { WORLD_BIOMES, type VisualBiome } from "../content/world-biomes";
import type { Structure, Vec } from "../core/types";
import type { GroundFamily } from "../content/tile-types";
interface Raster {
  canvas: HTMLCanvasElement;
  generation: number;
  complete: boolean;
}
const RASTER_SCALE = 0.5,
  MAX_RASTERS = 36;
/** Bounded client-only ground raster cache. No entity or protocol changes. */
export class WorldTileRenderer {
  previewBiome?: VisualBiome;
  readonly chunks = new VisualChunkCache();
  readonly tiles = new TileRenderer();
  private rasters = new Map<string, Raster>();
  private structureCache = new Map<string, StructureArt | undefined>();
  private scratch?: HTMLCanvasElement;
  private mask?: HTMLCanvasElement;
  private visible: VisualChunk[] = [];
  private propKey = "";
  private props: VisualProp[] = [];
  private config?: VisualConfig;
  private budget = 0;
  begin(config: VisualConfig, camera: Vec, width: number, height: number) {
    if (process.env.NODE_ENV === "development" && this.previewBiome)
      config = { ...config, biomeOverride: this.previewBiome };
    if (this.chunks.configure(config)) {
      this.rasters.clear();
      this.structureCache.clear();
      this.propKey = "";
    }
    this.config = config;
    this.budget = 2;
    const margin = 180;
    const x0 = Math.floor((camera.x - width / 2 - margin) / VISUAL_CHUNK_SIZE),
      x1 = Math.floor((camera.x + width / 2 + margin) / VISUAL_CHUNK_SIZE);
    const y0 = Math.floor((camera.y - height / 2 - margin) / VISUAL_CHUNK_SIZE),
      y1 = Math.floor((camera.y + height / 2 + margin) / VISUAL_CHUNK_SIZE);
    this.chunks.retain(x0 - 1, y0 - 1, x1 + 1, y1 + 1);
    this.visible.length = 0;
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++)
        this.visible.push(this.chunks.get(config, x, y));
    const propKey = `${x0}:${y0}:${x1}:${y1}`;
    if (this.propKey !== propKey) {
      this.propKey = propKey;
      this.props = this.visible
        .flatMap((c) => c.props)
        .sort((a, b) => a.y - b.y || a.x - b.x);
    }
    // Raster cap also limits memory when zooming out or traversing infinitely.
    for (const [key] of this.rasters) {
      const [x, y] = key.split(":").slice(1).map(Number);
      if (x < x0 - 1 || x > x1 + 1 || y < y0 - 1 || y > y1 + 1)
        this.rasters.delete(key);
    }
    if (this.structureCache.size > 512) this.structureCache.clear();
  }
  ground(ctx: CanvasRenderingContext2D, pressure: number): boolean {
    let drawn = false;
    const smoothing = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    try {
      for (const chunk of this.visible) {
        const base = this.raster(chunk, "base");
        if (base) {
          ctx.drawImage(
            base,
            chunk.cx * VISUAL_CHUNK_SIZE,
            chunk.cy * VISUAL_CHUNK_SIZE,
            VISUAL_CHUNK_SIZE,
            VISUAL_CHUNK_SIZE,
          );
          drawn = true;
        }
        // These layers are cached; the temporal cue changes opacity only.
        for (const [family, alpha] of [
          ["dead", pressure * 0.32],
          ["corrupted", Math.max(0, pressure - 0.35) * 0.65],
        ] as const) {
          if (alpha <= 0) continue;
          const raster = this.raster(chunk, family);
          if (!raster) continue;
          const prev = ctx.globalAlpha;
          ctx.globalAlpha *= alpha;
          ctx.drawImage(
            raster,
            chunk.cx * VISUAL_CHUNK_SIZE,
            chunk.cy * VISUAL_CHUNK_SIZE,
            VISUAL_CHUNK_SIZE,
            VISUAL_CHUNK_SIZE,
          );
          ctx.globalAlpha = prev;
        }
      }
    } finally {
      ctx.imageSmoothingEnabled = smoothing;
    }
    return drawn;
  }
  private raster(
    chunk: VisualChunk,
    layer: "base" | GroundFamily,
  ): HTMLCanvasElement | undefined {
    const key = `${layer}:${chunk.cx}:${chunk.cy}`,
      existing = this.rasters.get(key),
      generation = tileImageGeneration();
    if (existing && (existing.complete || existing.generation === generation)) {
      this.rasters.delete(key);
      this.rasters.set(key, existing);
      return existing.canvas;
    }
    // Start image requests for this region only, even if baking is deferred.
    let complete = true,
      available = 0;
    for (const cell of chunk.ground) {
      const atlas = resolveGroundAtlas(
        layer === "base" ? cell.family : layer,
        cell.variant,
      );
      if (!atlas || !tileImage(atlas)) complete = false;
      else available++;
    }
    if (!available) return existing?.canvas;
    if (this.budget <= 0 || typeof document === "undefined")
      return existing?.canvas;
    this.budget--;
    const size = VISUAL_CHUNK_SIZE * RASTER_SCALE;
    const canvas = existing?.canvas ?? document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const c = canvas.getContext("2d");
    if (!c) return;
    c.imageSmoothingEnabled = false;
    // Underpainting ensures no transparent cracks between neighboring patches.
    c.fillStyle = WORLD_BIOMES[chunk.ground[14].biome].tint;
    c.fillRect(0, 0, size, size);
    this.prepareBrush();
    const brush = this.scratch!,
      mask = this.mask!,
      b = brush.getContext("2d")!;
    for (const cell of chunk.ground) {
      const atlas = resolveGroundAtlas(
        layer === "base" ? cell.family : layer,
        cell.variant,
      );
      const slot = layer === "base" ? cell.slot : cell.slot % 16;
      b.clearRect(0, 0, brush.width, brush.height);
      if (!this.tiles.drawGround(b, atlas, slot, 0, 0, brush.width)) continue;
      b.globalCompositeOperation = "destination-in";
      b.drawImage(mask, 0, 0);
      b.globalCompositeOperation = "source-over";
      const margin = 24;
      c.drawImage(
        brush,
        (cell.x - chunk.cx * VISUAL_CHUNK_SIZE - margin) * RASTER_SCALE,
        (cell.y - chunk.cy * VISUAL_CHUNK_SIZE - margin) * RASTER_SCALE,
      );
    }
    // Keep detailed sources subordinate to projectiles and creature silhouettes.
    c.fillStyle = "#07151988";
    c.fillRect(0, 0, size, size);
    this.rasters.delete(key);
    this.rasters.set(key, {
      canvas,
      generation: tileImageGeneration(),
      complete,
    });
    while (this.rasters.size > MAX_RASTERS)
      this.rasters.delete(this.rasters.keys().next().value!);
    return canvas;
  }
  private prepareBrush() {
    if (this.scratch) return;
    const size = (GROUND_TILE_WORLD_SIZE + 48) * RASTER_SCALE,
      fade = 24 * RASTER_SCALE;
    this.scratch = document.createElement("canvas");
    this.scratch.width = size;
    this.scratch.height = size;
    this.mask = document.createElement("canvas");
    this.mask.width = size;
    this.mask.height = size;
    const c = this.mask.getContext("2d")!;
    c.fillStyle = "#fff";
    c.fillRect(0, 0, size, size);
    c.globalCompositeOperation = "destination-in";
    for (const axis of [0, 1]) {
      const g = c.createLinearGradient(
        0,
        0,
        axis === 0 ? size : 0,
        axis === 1 ? size : 0,
      );
      g.addColorStop(0, "#ffffff00");
      g.addColorStop(fade / size, "#fff");
      g.addColorStop(1 - fade / size, "#fff");
      g.addColorStop(1, "#ffffff00");
      c.fillStyle = g;
      c.fillRect(0, 0, size, size);
    }
  }
  decoration(
    ctx: CanvasRenderingContext2D,
    structures: readonly Structure[],
    player: Vec,
    pressure: number,
  ) {
    // A small spatial index avoids O(all structures * all props) at every draw.
    const cells = new Map<string, Structure[]>();
    for (const s of structures) {
      if (s.destroyed) continue;
      const key = `${Math.floor(s.x / 256)},${Math.floor(s.y / 256)}`;
      const list = cells.get(key) ?? [];
      list.push(s);
      cells.set(key, list);
    }
    for (const prop of this.props) {
      const gx = Math.floor(prop.x / 256),
        gy = Math.floor(prop.y / 256);
      let clear = true;
      for (let y = gy - 1; y <= gy + 1 && clear; y++)
        for (let x = gx - 1; x <= gx + 1 && clear; x++)
          clear = propClearOfStructures(prop, cells.get(`${x},${y}`) ?? []);
      if (!clear) continue;
      const alpha = prop.corruptionOnly
        ? corruptionAlpha(pressure, prop.threshold)
        : 0.82;
      if (alpha <= 0) continue;
      this.drawProp(ctx, prop, player, pressure, alpha);
    }
  }
  private drawProp(
    ctx: CanvasRenderingContext2D,
    prop: VisualProp,
    player: Vec,
    pressure: number,
    alpha: number,
  ) {
    const stages = propStages(prop.family),
      progress =
        corruptionAlpha(pressure, prop.threshold) * (stages.length - 1);
    const index = Math.min(stages.length - 1, Math.floor(progress)),
      mix = progress - index;
    // Contextual fade plus entities drawn later keeps the player readable beneath canopies.
    const behind =
      player.y < prop.y &&
      player.y > prop.y - prop.height &&
      Math.abs(player.x - prop.x) < prop.height * 0.6;
    const opacity = alpha * (behind ? 0.42 : 1);
    const next = stages[Math.min(index + 1, stages.length - 1)],
      nextAtlas = resolvePropAtlas(next, prop.variant);
    const ready = !!(mix > 0 && nextAtlas && tileImage(nextAtlas));
    let currentAtlas = resolvePropAtlas(stages[index], prop.variant);
    // A cold cache during reconnect must not make an existing tree disappear.
    if (currentAtlas && !tileImage(currentAtlas)) {
      for (let previous = index - 1; previous >= 0; previous--) {
        const candidate = resolvePropAtlas(stages[previous], prop.variant);
        if (candidate && tileImage(candidate)) {
          currentAtlas = candidate;
          break;
        }
      }
    }
    this.tiles.drawProp(
      ctx,
      currentAtlas,
      prop.slot,
      prop.x,
      prop.y,
      prop.height,
      opacity * (ready ? 1 - mix : 1),
    );
    if (ready)
      this.tiles.drawProp(
        ctx,
        nextAtlas,
        prop.slot,
        prop.x,
        prop.y,
        prop.height,
        opacity * mix,
      );
  }
  structure(ctx: CanvasRenderingContext2D, s: Structure, player: Vec): boolean {
    if (!this.config || s.destroyed) return false;
    let art = this.structureCache.get(s.id);
    if (!this.structureCache.has(s.id)) {
      art = structureArt(this.config, s);
      this.structureCache.set(s.id, art);
    }
    if (!art) return false;
    const fade =
      player.y < s.y &&
      player.y > s.y - art.height &&
      Math.abs(player.x - s.x) < art.height * 0.5
        ? 0.45
        : 1;
    return this.tiles.drawProp(
      ctx,
      resolvePropAtlas(art.family, art.variant),
      art.slot,
      s.x,
      s.y,
      art.height,
      fade * (s.used || s.opened ? 0.46 : 1),
    );
  }
  get cacheStats() {
    return {
      visualChunks: this.chunks.chunks.size,
      rasters: this.rasters.size,
      rasterBytes:
        this.rasters.size * (VISUAL_CHUNK_SIZE * RASTER_SCALE) ** 2 * 4,
    };
  }
}
