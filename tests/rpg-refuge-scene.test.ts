import { afterEach, expect, it, vi } from "vitest";
import {
  RefugeScene,
  refugeDiagnostics,
} from "../src/game/client/refuge-scene";
import { CharacterSpriteRenderer } from "../src/game/client/character-sprite-renderer";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
it("owns one loop, uses shared sprites, blocks repeated interaction and disposes idempotently", () => {
  const callbacks = new Map<number, FrameRequestCallback>();
  let id = 0;
  const cancel = vi.fn((id: number) => callbacks.delete(id));
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    callbacks.set(++id, cb);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", cancel);
  vi.stubGlobal(
    "window",
    Object.assign(new EventTarget(), { devicePixelRatio: 1 }),
  );
  vi.stubGlobal(
    "document",
    Object.assign(new EventTarget(), {
      hidden: false,
      createElement: () => ({ width: 1, height: 1, getContext: () => ctx }),
    }),
  );
  const disconnect = vi.fn();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect = disconnect;
    },
  );
  const ctx = new Proxy(
    { measureText: () => ({ width: 60 }) },
    {
      get: (o, key) => (key in o ? o[key as keyof typeof o] : () => {}),
      set: () => true,
    },
  );
  const canvas = Object.assign(new EventTarget(), {
    dataset: {} as Record<string, string>,
    width: 1,
    height: 1,
    getContext: () => ctx,
    getBoundingClientRect: () => ({ width: 800, height: 600 }),
  }) as unknown as HTMLCanvasElement;
  const sprite = vi
    .spyOn(CharacterSpriteRenderer.prototype, "draw")
    .mockReturnValue(true);
  const target = vi.fn(),
    interact = vi.fn();
  const scene = new RefugeScene(canvas, "nara", target, interact);
  const tick = (now: number) => {
    const entry = callbacks.entries().next().value!;
    callbacks.delete(entry[0]);
    entry[1](now);
  };
  tick(1000);
  tick(1016);
  expect(sprite).toHaveBeenCalled();
  expect(callbacks.size).toBe(1);
  expect(target).toHaveBeenCalledWith(
    expect.objectContaining({ id: "refuge:guardian" }),
  );
  scene.interact();
  scene.interact();
  expect(interact).toHaveBeenCalledTimes(1);
  scene.setPaused(true);
  scene.interact();
  expect(interact).toHaveBeenCalledTimes(1);
  scene.setCharacter("ivo");
  tick(1400);
  expect(canvas.dataset.character).toBe("ivo");
  expect(() => scene.setCharacter("forged")).toThrow();
  scene.dispose();
  scene.dispose();
  expect(callbacks.size).toBe(0);
  expect(disconnect).toHaveBeenCalledTimes(1);
  expect(refugeDiagnostics).toMatchObject({
    instances: 0,
    loops: 0,
    listeners: 0,
    observers: 0,
  });
});
