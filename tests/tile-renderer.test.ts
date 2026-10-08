import { afterEach, describe, expect, it, vi } from "vitest";
import {
  TileRenderer,
  resetTileImageCacheForTests,
} from "../src/game/client/tile-renderer";
import {
  resolveGroundAtlas,
  resolvePropAtlas,
  TILE_ATLASES,
} from "../src/game/client/tile-art";
afterEach(() => {
  vi.unstubAllGlobals();
  resetTileImageCacheForTests();
});
describe("tile rendering", () => {
  it("deduplicates sources and falls back without browser APIs", () => {
    expect(TILE_ATLASES).toHaveLength(23);
    const ctx = { drawImage: vi.fn() } as unknown as CanvasRenderingContext2D;
    expect(
      new TileRenderer().drawGround(
        ctx,
        resolveGroundAtlas("forest"),
        0,
        0,
        0,
        192,
      ),
    ).toBe(false);
    expect(ctx.drawImage).not.toHaveBeenCalled();
  });
  it("loads once, uses source rectangles and restores context without mutating metadata", () => {
    let loads = 0;
    class FakeImage {
      naturalWidth = 1254;
      naturalHeight = 1254;
      onload?: () => void;
      set src(_url: string) {
        loads++;
        this.onload?.();
      }
    }
    vi.stubGlobal("Image", FakeImage);
    const atlas = resolvePropAtlas("trees_living")!;
    const original = JSON.stringify(atlas.metadata);
    const ctx = {
      imageSmoothingEnabled: true,
      globalAlpha: 0.7,
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D;
    const renderer = new TileRenderer();
    for (let i = 0; i < 100; i++)
      expect(renderer.drawProp(ctx, atlas, 0, 20, 40, 130, 0.5)).toBe(true);
    expect(loads).toBe(1);
    expect(ctx.drawImage).toHaveBeenCalledTimes(100);
    expect(ctx.imageSmoothingEnabled).toBe(true);
    expect(ctx.globalAlpha).toBe(0.7);
    expect(JSON.stringify(atlas.metadata)).toBe(original);
    const slot = atlas.metadata.slots[0],
      r = slot.rect;
    expect(vi.mocked(ctx.drawImage).mock.calls[0].slice(1, 5)).toEqual([
      r.x,
      r.y,
      r.width,
      r.height,
    ]);
  });
  it("fails closed on invalid image dimensions and absent atlas", () => {
    class FakeImage {
      naturalWidth = 1;
      naturalHeight = 1;
      onload?: () => void;
      set src(_url: string) {
        this.onload?.();
      }
    }
    vi.stubGlobal("Image", FakeImage);
    const ctx = { drawImage: vi.fn() } as unknown as CanvasRenderingContext2D;
    const renderer = new TileRenderer();
    expect(renderer.drawProp(ctx, resolvePropAtlas("rocks"), 0, 0, 0, 60)).toBe(
      false,
    );
    expect(renderer.drawGround(ctx, undefined, 0, 0, 0, 192)).toBe(false);
    expect(ctx.drawImage).not.toHaveBeenCalled();
  });
});
