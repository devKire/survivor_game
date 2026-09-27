import { afterEach, describe, expect, it, vi } from "vitest";
import { Player, Weapon } from "../src/game/core/entities";
import { WorldRenderer } from "../src/game/client/world-renderer";
import {
  CharacterSpriteRenderer,
  CHARACTER_ANIMATION_CONFIG,
  CHARACTER_SPRITE,
  directionFromVector,
  frameForAnimation,
  resetCharacterSpriteImageCacheForTests,
} from "../src/game/client/character-sprite-renderer";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
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
  function readyImages(width = 2048, height = 2048, emitLoad = true) {
    let created = 0;
    class FakeImage {
      complete = false;
      naturalWidth = width;
      naturalHeight = height;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) {
        created++;
        this.complete = true;
        if (emitLoad) this.onload?.();
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

  function world(player: Player) {
    const calls = new Map<string, number>();
    const target = new Proxy(
      { imageSmoothingEnabled: true },
      {
        get(object, key, receiver) {
          if (key in object) return Reflect.get(object, key, receiver);
          if (key === "createPattern") return () => null;
          return () => {
            calls.set(String(key), (calls.get(String(key)) || 0) + 1);
          };
        },
      },
    ) as unknown as CanvasRenderingContext2D;
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
    return { renderer, calls };
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
    expect(draws[0].slice(-4)).toEqual([-48, -66.5, 96, 96]);
    expect(ctx.imageSmoothingEnabled).toBe(true);
  });

  it("uses the direction vector instead of a positional correction for facing", () => {
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
    expect(draws.at(-1)?.[1]).toBe(4 * 256);
    player.dx = player.dy = 0;
    player.x += 2;
    player.y += 2;
    renderer.draw(ctx, player, 0.3);
    expect(draws.at(-1)?.[1]).toBe(7 * 256);
    renderer.draw(ctx, player, 0.5);
    expect(draws.at(-1)?.[1]).toBe(7 * 256);
    expect(draws.at(-1)?.[2]).toBe(0);
  });

  it.each([
    ["nara", [1, 2, 3, 1, 2, 3]],
    ["ivo", [1, 2, 3, 1, 2, 3]],
    ["orin", [1, 2, 3, 4, 1, 2]],
    ["sena", [1, 2, 3, 4, 1, 2]],
  ] as const)("uses the configured walk rows for %s", (character, expected) => {
    readyImages();
    const renderer = new CharacterSpriteRenderer();
    const { ctx, draws } = context();
    const player = new Player(character);
    renderer.setMotion(player, { x: 1, y: 0 });
    for (const time of [10, 10.13, 10.26, 10.39, 10.51, 10.64]) {
      renderer.draw(ctx, player, time);
    }
    expect(draws.map((draw) => Number(draw[2]) / 256)).toEqual(expected);
    expect(CHARACTER_ANIMATION_CONFIG[character].attackRows).toEqual([5, 6, 7]);
  });

  it("starts each idle-to-walk transition at walk0 without resetting on turns", () => {
    readyImages();
    const renderer = new CharacterSpriteRenderer();
    const { ctx, draws } = context();
    const player = new Player("orin");
    renderer.setMotion(player, { x: 0, y: 0 });
    renderer.draw(ctx, player, 5);
    renderer.setMotion(player, { x: 0, y: 1 });
    renderer.draw(ctx, player, 5.07);
    expect(draws.at(-1)?.slice(1, 3)).toEqual([0, 256]);
    renderer.draw(ctx, player, 5.2);
    expect(draws.at(-1)?.[2]).toBe(2 * 256);
    renderer.setMotion(player, { x: -1, y: 0 });
    renderer.draw(ctx, player, 5.33);
    expect(draws.at(-1)?.slice(1, 3)).toEqual([2 * 256, 3 * 256]);
    renderer.setMotion(player, { x: 0, y: 0 });
    renderer.draw(ctx, player, 5.55);
    expect(draws.at(-1)?.[2]).toBe(0);
    renderer.setMotion(player, { x: -1, y: 0 });
    renderer.draw(ctx, player, 5.61);
    expect(draws.at(-1)?.[2]).toBe(256);
  });

  it("keeps walking through small motion variations and stops after the grace period", () => {
    readyImages();
    const renderer = new CharacterSpriteRenderer();
    const { ctx, draws } = context();
    const player = new Player("orin");
    for (const [time, x] of [
      [0, 0.09],
      [0.04, 0.06],
      [0.08, 0.03],
      [0.12, 0.06],
      [0.15, 0],
    ]) {
      renderer.setMotion(player, { x, y: 0 });
      renderer.draw(ctx, player, time);
      expect(renderer.isMoving(player)).toBe(true);
      expect(draws.at(-1)?.[2]).not.toBe(0);
    }
    renderer.draw(ctx, player, 0.24);
    expect(renderer.isMoving(player)).toBe(false);
    expect(draws.at(-1)?.[2]).toBe(0);
    renderer.setMotion(player, { x: 0.09, y: 0 });
    renderer.draw(ctx, player, 0.25);
    expect(draws.at(-1)?.[2]).toBe(256);
  });

  it("uses an explicit motion vector before retained facing or positional corrections", () => {
    readyImages();
    const renderer = new CharacterSpriteRenderer();
    const { ctx, draws } = context();
    const player = new Player("nara");
    renderer.setMotion(player, { x: 0, y: -1 });
    renderer.draw(ctx, player, 0);
    expect(draws.at(-1)?.slice(1, 3)).toEqual([4 * 256, 256]);
    renderer.setMotion(player, { x: 0, y: 0 });
    player.x += 100;
    player.y += 100;
    renderer.draw(ctx, player, 0.2);
    expect(draws.at(-1)?.slice(1, 3)).toEqual([4 * 256, 0]);
  });

  it("does not animate a stationary player merely because dx/dy retain facing", () => {
    readyImages();
    const renderer = new CharacterSpriteRenderer();
    const { ctx, draws } = context();
    const player = new Player("ivo");
    renderer.draw(ctx, player, 0);
    renderer.draw(ctx, player, 1);
    expect(renderer.isMoving(player)).toBe(false);
    expect(draws.map((draw) => draw[2])).toEqual([0, 0]);
    expect(draws.at(-1)?.[1]).toBe(6 * 256);
  });

  it.each([30, 60, 240])(
    "detects remote motion at %i FPS independently of per-draw distance",
    (fps) => {
      readyImages();
      const renderer = new CharacterSpriteRenderer();
      const { ctx, draws } = context();
      const player = new Player("orin");
      renderer.draw(ctx, player, 0);
      for (let tick = 1; tick <= fps; tick++) {
        player.x = (tick / fps) * 60;
        renderer.draw(ctx, player, tick / fps);
        expect(renderer.isMoving(player)).toBe(true);
        expect(draws.at(-1)?.[2]).not.toBe(0);
      }
      renderer.draw(ctx, player, 1.05);
      expect(renderer.isMoving(player)).toBe(true);
      renderer.draw(ctx, player, 1.11);
      expect(renderer.isMoving(player)).toBe(false);
      expect(draws.at(-1)?.[2]).toBe(0);
    },
  );

  it.each(["nara", "orin", "ivo", "sena"])(
    "keeps %s's ground point fixed across idle, walk and attack rows",
    (character) => {
      readyImages();
      const renderer = new CharacterSpriteRenderer();
      const { ctx, draws } = context();
      const player = new Player(character);
      player.x = 123;
      player.y = 456;
      let time = 0;
      let sequence = 0;
      for (const vector of [
        { x: 0, y: 1 },
        { x: -1, y: 0 },
        { x: 0, y: -1 },
        { x: 1, y: 0 },
      ]) {
        renderer.setMotion(player, vector);
        for (const elapsed of [0, 0.13, 0.26, 0.39]) {
          renderer.draw(ctx, player, time + elapsed, sequence);
        }
        time += 0.5;
        sequence++;
        for (const elapsed of [0, 0.08, 0.16]) {
          renderer.draw(ctx, player, time + elapsed, sequence);
        }
        renderer.setMotion(player, { x: 0, y: 0 });
        time += 0.4;
        renderer.draw(ctx, player, time, sequence);
        time += 0.5;
      }
      expect(CHARACTER_SPRITE.groundOffsetY).toBe(16);
      const scale = CHARACTER_SPRITE.worldSize / CHARACTER_SPRITE.cellSize;
      for (const draw of draws) {
        expect(Number(draw[5]) + CHARACTER_SPRITE.footX * scale).toBe(player.x);
        expect(Number(draw[6]) + CHARACTER_SPRITE.footY * scale).toBe(
          player.y + 16,
        );
        expect(draw.slice(-2)).toEqual([96, 96]);
      }
    },
  );

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

  it("finishes attack 5,6,7 once despite rapid sequence increments, then resumes walking", () => {
    readyImages();
    const renderer = new CharacterSpriteRenderer();
    const { ctx, draws } = context();
    const player = new Player("sena");
    renderer.setMotion(player, { x: 1, y: 0 });
    renderer.setAttackSequence(player, 0);
    renderer.draw(ctx, player, 0);
    for (const [time, sequence] of [
      [1, 1],
      [1.08, 2],
      [1.16, 3],
    ]) {
      renderer.setAttackSequence(player, sequence);
      renderer.draw(ctx, player, time);
    }
    expect(draws.slice(-3).map((draw) => Number(draw[2]) / 256)).toEqual([
      5, 6, 7,
    ]);
    renderer.draw(ctx, player, 1.23);
    expect(draws.at(-1)?.[2]).toBe(2 * 256);
    renderer.setAttackSequence(player, 4);
    renderer.draw(ctx, player, 1.3);
    expect(draws.at(-1)?.[2]).toBe(5 * 256);
    renderer.setMotion(player, { x: 0, y: 0 });
    renderer.draw(ctx, player, 1.6);
    expect(draws.at(-1)?.[2]).toBe(0);
  });

  it("preserves gameplay state when selecting, placing and attacking sprites", () => {
    readyImages();
    const renderer = new CharacterSpriteRenderer();
    const { ctx } = context();
    const player = new Player("nara");
    player.weapons = [new Weapon("chain")];
    player.x = 17;
    player.y = 29;
    const before = structuredClone(player);
    renderer.setMotion(player, { x: -1, y: 0 });
    renderer.draw(ctx, player, 0, 0);
    renderer.draw(ctx, player, 1, 1);
    renderer.draw(ctx, player, 1.16, 1);
    renderer.draw(ctx, player, 2, 1);
    expect(structuredClone(player)).toEqual(before);
  });

  it.each([
    [1254, 1254, true],
    [2048, 1254, true],
    [1254, 2048, true],
    [1254, 1254, false],
    [2048, 1254, false],
    [1254, 2048, false],
  ])(
    "falls back for a %ix%i source (load event: %s)",
    (width, height, emitLoad) => {
      readyImages(width, height, emitLoad);
      const player = new Player("nara");
      const { renderer, calls } = world(player);
      renderer.player(player, 0);
      renderer.player(player, 0.1);
      expect(calls.get("closePath")).toBeGreaterThan(0);
      expect(calls.get("drawImage") || 0).toBe(0);
    },
  );

  it("accepts an already-complete canonical source without waiting for onload", () => {
    readyImages(2048, 2048, false);
    const renderer = new CharacterSpriteRenderer();
    const { ctx, draws } = context();
    expect(renderer.draw(ctx, new Player("ivo"), 0)).toBe(true);
    expect(draws).toHaveLength(1);
  });

  it("warns only once per invalid source in development", () => {
    vi.stubEnv("NODE_ENV", "development");
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    const created = readyImages(1254, 1254);
    const renderer = new CharacterSpriteRenderer();
    const { ctx } = context();
    for (const time of [0, 0.1, 0.2]) {
      expect(renderer.draw(ctx, new Player("nara"), time)).toBe(false);
    }
    expect(created()).toBe(1);
    expect(warning).toHaveBeenCalledTimes(1);
  });

  it("does not warn for invalid sources in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    readyImages(1254, 1254);
    const { ctx } = context();
    expect(new CharacterSpriteRenderer().draw(ctx, new Player("nara"), 0)).toBe(
      false,
    );
    expect(warning).not.toHaveBeenCalled();
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
    const player = new Player("nara");
    const { renderer, calls } = world(player);
    renderer.player(player, 0);
    expect(calls.get("closePath")).toBeGreaterThan(0);
    expect(calls.get("drawImage") || 0).toBe(0);
  });
});
