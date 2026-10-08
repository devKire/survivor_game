import type { TileAtlas } from "./tile-art";
import { resolveTileSlot } from "./tile-art";
type ImageState = {
  image: HTMLImageElement;
  status: "loading" | "ready" | "failed";
};
const imageCache = new Map<string, ImageState>();
let generation = 0;
function fail(atlas: TileAtlas, state: ImageState) {
  if (state.status === "failed") return;
  state.status = "failed";
  generation++;
  if (process.env.NODE_ENV === "development")
    console.warn(
      "[tiles] Atlas unavailable; legacy fallback:",
      atlas.metadata.id,
    );
}
export function tileImage(atlas: TileAtlas): HTMLImageElement | undefined {
  let state = imageCache.get(atlas.url);
  if (!state) {
    if (typeof Image === "undefined") return;
    const image = new Image();
    state = { image, status: "loading" };
    imageCache.set(atlas.url, state);
    const cached = state;
    image.onload = () => {
      if (
        image.naturalWidth !== atlas.metadata.source.width ||
        image.naturalHeight !== atlas.metadata.source.height
      )
        fail(atlas, cached);
      else {
        cached.status = "ready";
        generation++;
      }
    };
    image.onerror = () => fail(atlas, cached);
    image.src = atlas.url;
  }
  return state.status === "ready" ? state.image : undefined;
}
export const tileImageGeneration = () => generation;
export class TileRenderer {
  drawGround(
    ctx: CanvasRenderingContext2D,
    atlas: TileAtlas | undefined,
    slot: number,
    x: number,
    y: number,
    size: number,
    alpha = 1,
  ): boolean {
    return this.draw(ctx, atlas, slot, x, y, size, alpha, false);
  }
  drawProp(
    ctx: CanvasRenderingContext2D,
    atlas: TileAtlas | undefined,
    slot: number,
    x: number,
    y: number,
    height: number,
    alpha = 1,
  ): boolean {
    return this.draw(ctx, atlas, slot, x, y, height, alpha, true);
  }
  private draw(
    ctx: CanvasRenderingContext2D,
    atlas: TileAtlas | undefined,
    index: number,
    x: number,
    y: number,
    size: number,
    alpha: number,
    anchored: boolean,
  ): boolean {
    if (!atlas || !Number.isFinite(size) || size <= 0 || alpha <= 0)
      return false;
    const slot = resolveTileSlot(atlas, index),
      image = slot ? tileImage(atlas) : undefined;
    if (!slot || !image || (anchored && !slot.anchor)) return false;
    const r = slot.rect,
      scale = size / r.height,
      width = anchored ? r.width * scale : size;
    const dx = anchored ? x - slot.anchor!.x * scale : x,
      dy = anchored ? y - slot.anchor!.y * scale : y;
    const smoothing = ctx.imageSmoothingEnabled,
      previousAlpha = ctx.globalAlpha;
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha *= Math.max(0, Math.min(1, alpha));
    try {
      ctx.drawImage(image, r.x, r.y, r.width, r.height, dx, dy, width, size);
      return true;
    } catch {
      const state = imageCache.get(atlas.url);
      if (state) fail(atlas, state);
      return false;
    } finally {
      ctx.imageSmoothingEnabled = smoothing;
      ctx.globalAlpha = previousAlpha;
    }
  }
}
export function resetTileImageCacheForTests() {
  imageCache.clear();
  generation = 0;
}
