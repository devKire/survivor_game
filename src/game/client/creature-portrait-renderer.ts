import { assetUrl } from "./character-art";
import { resolveCreatureArt } from "./creature-art";
import type { Enemy } from "../core/types";

type Asset = { image: HTMLImageElement; ready: boolean; failed: boolean };
// Shared across renderers, sessions and hundreds of instances. Never read pixels.
const images = new Map<string, Asset>();
function load(url: string): Asset | undefined {
  const cached = images.get(url);
  if (cached) return cached;
  if (typeof Image === "undefined") return;
  const image = new Image();
  const asset: Asset = { image, ready: false, failed: false };
  images.set(url, asset);
  const fail = () => {
    if (asset.failed) return;
    asset.failed = true;
    asset.ready = false;
    if (process.env.NODE_ENV === "development")
      console.warn("Creature portrait unavailable:", url);
  };
  image.onload = () => {
    if (image.naturalWidth > 0 && image.naturalHeight > 0) asset.ready = true;
    else fail();
  };
  image.onerror = fail;
  image.src = url;
  return asset;
}

export class CreaturePortraitRenderer {
  /** Returns false while loading or after failure, allowing the legacy body. */
  draw(
    ctx: CanvasRenderingContext2D,
    enemy: Pick<Enemy, "type" | "name" | "x" | "y" | "flash">,
  ): boolean {
    const art = resolveCreatureArt(enemy);
    if (!art) return false;
    const asset = load(assetUrl(art.portrait));
    if (!asset?.ready || asset.failed) return false;
    const height = art.worldHeight;
    const width =
      (height * asset.image.naturalWidth) / asset.image.naturalHeight;
    const groundY = enemy.y + art.groundOffsetY;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    if (enemy.flash > 0) ctx.globalAlpha *= 0.55;
    ctx.drawImage(
      asset.image,
      enemy.x - width / 2,
      groundY - height * art.footY,
      width,
      height,
    );
    ctx.restore();
    return true;
  }
}
