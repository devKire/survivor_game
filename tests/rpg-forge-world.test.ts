import { describe, expect, it } from "vitest";
import { REFUGE } from "../src/game/content/rpg/refuge";
import { WORLD_REFUGE } from "../src/game/content/rpg/world-refuge";
import {
  validateRefuge,
  refugePositionAllowed,
  refugeTarget,
  moveInRefuge,
} from "../src/game/core/rpg/refuge/scene";
import { worldCommand } from "../src/game/network/world";
import { WORLD_PROTOCOL } from "../src/game/core/rpg/world/types";
describe("Forge world geometry and protocol", () => {
  it("preserves legacy geometry and adds reachable stations without moving old objects", () => {
    validateRefuge(REFUGE);
    validateRefuge(WORLD_REFUGE);
    expect(REFUGE.version).toBe(1);
    expect(WORLD_REFUGE.version).toBe(2);
    for (const old of [...REFUGE.structures, ...REFUGE.npcs])
      expect(
        [...WORLD_REFUGE.structures, ...WORLD_REFUGE.npcs].find(
          (r) => r.id === old.id,
        ),
      ).toEqual(old);
    for (const [id, point] of [
      ["refuge:forge", { x: 280, y: 480 }],
      ["refuge:refinery", { x: 990, y: 540 }],
      ["refuge:trader", { x: 900, y: 755 }],
    ] as const) {
      expect(refugePositionAllowed(WORLD_REFUGE, point)).toBe(true);
      expect(refugeTarget(WORLD_REFUGE, point)?.id).toBe(id);
      const station = [...WORLD_REFUGE.structures, ...WORLD_REFUGE.npcs].find(
        (r) => r.id === id,
      )!;
      expect(refugePositionAllowed(WORLD_REFUGE, station)).toBe(false);
      let position: { x: number; y: number } = { ...point };
      for (let t = 0; t < 40; t++)
        position = moveInRefuge(
          WORLD_REFUGE,
          position,
          { x: station.x - position.x, y: station.y - position.y },
          0.04,
        );
      expect(
        Math.hypot(position.x - station.x, position.y - station.y),
      ).toBeGreaterThanOrEqual(station.collisionRadius + 13);
    }
  });
  it("negotiates a new WORLD protocol without modifying legacy commands", () => {
    expect(WORLD_PROTOCOL).toBe(2);
    expect(
      worldCommand.parse({ type: "WORLD_ENTER", protocol: 1 }),
    ).toMatchObject({ protocol: 1 });
    expect(
      worldCommand.parse({ type: "WORLD_ENTER", protocol: 2 }),
    ).toMatchObject({ protocol: 2 });
    expect(() =>
      worldCommand.parse({ type: "WORLD_ENTER", protocol: 3 }),
    ).toThrow();
    expect(() =>
      worldCommand.parse({ type: "WORLD_ENTER", protocol: 2, loadout: {} }),
    ).toThrow();
  });
});
