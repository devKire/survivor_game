import { afterEach, describe, expect, it, vi } from "vitest";
import { Player, Weapon } from "../src/game/core/entities";
import { WorldRenderer } from "../src/game/client/world-renderer";
import {
  CharacterSpriteRenderer,
  CHARACTER_SPRITE,
  directionFromVector,
  frameForAnimation,
  resetCharacterSpriteImageCacheForTests,
} from "../src/game/client/character-sprite-renderer";

afterEach(() => {
  vi.unstubAllGlobals();
  resetCharacterSpriteImageCacheForTests();
});

describe("canonical character sprite frames", () => {
  it.each([
    ["south", 0, 1, 0],
    ["southwest", -1, 1, 1],
    ["west", -1, 0, 2],
    ["northwest", -1, -1, 3],
    ["north", 0, -1, 4],
    ["northeast", 1, -1, 5],
    ["east", 1, 0, 6],
    ["southeast", 1, 1, 7],
  ])("maps %s to column %i", (_name, dx, dy, expected) => {
    expect(directionFromVector(dx, dy)).toBe(expected);
  });

  it("keeps the last direction through stationary noise", () => {
    expect(directionFromVector(0.02, -0.03, 7)).toBe(7);
    expect(directionFromVector(0, 0, 3)).toBe(3);
  });

  it("uses idle row zero and retains the requested direction", () => {
    expect(frameForAnimation(false, 15, 0, 4)).toEqual({ column: 4, row: 0 });
  });

  it("loops only the four walk rows at the configured rate", () => {
    expect(
      [0, 0.13, 0.26, 0.39].map((time) => frameForAnimation(true, time, 0).row),
    ).toEqual([1, 2, 3, 4]);
    expect(frameForAnimation(true, 0.5, 0).row).toBe(1);
    expect(CHARACTER_SPRITE.walkFps).toBe(8);
  });

  it("plays three attack frames then returns to idle or walk", () => {
    expect(
      [0, 1 / 14, 2 / 14].map(
        (time) => frameForAnimation(false, time, 3 / 14).row,
      ),
    ).toEqual([5, 6, 7]);
    expect(frameForAnimation(false, 1, 1).row).toBe(0);
    expect(frameForAnimation(true, 1, 1).row).toBe(1);
  });
});

describe("shared sprite renderer", () => {
  function readyImages() {
    let created = 0;
    class FakeImage {
      complete = false;
      naturalWidth = 2048;
      naturalHeight = 2048;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) {
        created++;
        this.complete = true;
        this.onload?.();
      }
    }
    vi.stubGlobal("Image", FakeImage);
    return () => created;
  }

  function context() {
    const draws: unknown[][] = [];
    const ctx = {
      imageSmoothingEnabled: true,
      drawImage: (...args: unknown[]) => draws.push(args),
    } as unknown as CanvasRenderingContext2D;
    return { ctx, draws };
  }

  it("uses the cached base PNG even when a character skin is present", () => {
    const created = readyImages();
    const renderer = new CharacterSpriteRenderer();
    const { ctx, draws } = context();
    const nara = new Player("nara");
    nara.dx = 0;
    nara.dy = 1;
    nara.cosmetics = { CHARACTER_SKIN: "character_skin_4" };
    expect(renderer.draw(ctx, nara, 0)).toBe(true);
    expect(renderer.draw(ctx, new Player("nara"), 0)).toBe(true);
    expect(created()).toBe(1);
    expect(draws).toHaveLength(2);
    expect(draws[0][1]).toBe(0);
    expect(draws[0][2]).toBe(0);
    expect(draws[0].slice(-4)).toEqual([-48, -82.5, 96, 96]);
    expect(ctx.imageSmoothingEnabled).toBe(true);
  });

  it("keeps last facing while idle and follows actual displacement", () => {
    readyImages();
    const renderer = new CharacterSpriteRenderer();
    const { ctx, draws } = context();
    const player = new Player("ivo");
    player.dx = 0;
    player.dy = -1;
    renderer.draw(ctx, player, 0);
    renderer.draw(ctx, player, 0.1);
    expect(draws.at(-1)?.[1]).toBe(4 * 256);
    player.x -= 2;
    player.y += 2;
    renderer.draw(ctx, player, 0.2);
    expect(draws.at(-1)?.[1]).toBe(1 * 256);
    player.dx = player.dy = 0;
    renderer.draw(ctx, player, 0.3);
    expect(draws.at(-1)?.[1]).toBe(1 * 256);
  });

  it("detects local weapon shots without changing weapon update", () => {
    readyImages();
    const renderer = new CharacterSpriteRenderer();
    const { ctx, draws } = context();
    const player = new Player("sena");
    const weapon = new Weapon("chain");
    player.weapons = [weapon];
    renderer.draw(ctx, player, 0);
    weapon.shots++;
    renderer.draw(ctx, player, 1);
    expect(draws.at(-1)?.[2]).toBe(5 * 256);
    renderer.draw(ctx, player, 1 + 1 / 14);
    expect(draws.at(-1)?.[2]).toBe(6 * 256);
    renderer.draw(ctx, player, 1 + 2 / 14);
    expect(draws.at(-1)?.[2]).toBe(7 * 256);
    renderer.draw(ctx, player, 1 + 4 / 14);
    expect(draws.at(-1)?.[2]).toBe(0);
  });

  it("returns false for a missing sprite so WorldRenderer can draw legacy", () => {
    readyImages();
    const renderer = new CharacterSpriteRenderer();
    const { ctx, draws } = context();
    expect(renderer.draw(ctx, new Player("unlisted"), 0)).toBe(false);
    expect(draws).toHaveLength(0);
  });

  it("uses the preserved legacy body when the PNG load fails", () => {
    resetCharacterSpriteImageCacheForTests();
    class BrokenImage {
      complete = false;
      naturalWidth = 0;
      naturalHeight = 0;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) {
        this.onerror?.();
      }
    }
    vi.stubGlobal("Image", BrokenImage);
    const calls = new Map<string, number>();
    const target = new Proxy(
      { imageSmoothingEnabled: true },
      {
        get(object, key, receiver) {
          if (key in object) return Reflect.get(object, key, receiver);
          if (key === "createPattern") return () => null;
          return (...args: unknown[]) => {
            void args;
            calls.set(String(key), (calls.get(String(key)) || 0) + 1);
          };
        },
      },
    ) as unknown as CanvasRenderingContext2D;
    const player = new Player("nara");
    const renderer = new WorldRenderer({
      ctx: target,
      camera: { x: 0, y: 0 },
      viewW: 320,
      viewH: 240,
      run: { worldSeed: "test", simTime: 0 },
      player,
      debug: {
        chunks: false,
        structureIds: false,
        collisions: false,
        hitboxes: false,
      },
    });
    renderer.player(player, 0);
    expect(calls.get("closePath")).toBeGreaterThan(0);
    expect(calls.get("drawImage") || 0).toBe(0);
  });
});
