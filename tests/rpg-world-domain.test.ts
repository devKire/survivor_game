import { describe, expect, it } from "vitest";
import { WORLD_ZONES } from "../src/game/content/rpg/world-zones";
import { REFUGE } from "../src/game/content/rpg/refuge";
import {
  moveInRefuge,
  refugePositionAllowed,
} from "../src/game/core/rpg/refuge/scene";
import { WorldInterest } from "../src/game/core/rpg/world/interest";
import {
  acceptWorldInput,
  clampWorldPosition,
  normalizedWorldMove,
  worldPortal,
} from "../src/game/core/rpg/world/rules";
import { WORLD_ZONE_CAPACITY } from "../src/game/core/rpg/world/types";

describe("Shared world domain", () => {
  it("has connected versioned zones, safe spawns and population independent of group size", () => {
    expect(WORLD_ZONE_CAPACITY).toBeGreaterThan(5);
    for (const z of Object.values(WORLD_ZONES)) {
      expect(z.version).toBe(z.id === "obelisk-refuge" ? 2 : 1);
      expect(clampWorldPosition(z, z.spawn)).toEqual(z.spawn);
      for (const portal of z.portals) {
        expect(worldPortal(z, portal, portal.id).destination).toBe(
          portal.destination,
        );
        expect(
          WORLD_ZONES[portal.destination].portals.some(
            (p) => p.destination === z.id,
          ),
        ).toBe(true);
        expect(() => worldPortal(z, { x: 9000, y: 9000 }, portal.id)).toThrow();
      }
    }
    expect(refugePositionAllowed(REFUGE, REFUGE.spawn)).toBe(true);
  });
  it("rejects stale generations, replay, arbitrary positions and excessive movement", () => {
    const v = { epoch: "new", sequence: 2, moveX: 1, moveY: 1 };
    expect(acceptWorldInput("new", 1, v)).toBe(true);
    expect(acceptWorldInput("old", 1, v)).toBe(false);
    expect(acceptWorldInput("new", 2, v)).toBe(false);
    expect(acceptWorldInput("new", 1, { ...v, moveX: 20 })).toBe(false);
    expect(Math.hypot(...Object.values(normalizedWorldMove(1, 1)))).toBeCloseTo(
      1,
    );
    expect(() => normalizedWorldMove(NaN, 0)).toThrow();
    expect(
      clampWorldPosition(WORLD_ZONES["obelisk-refuge"], { x: -100, y: 10000 }),
    ).toEqual({ x: 13, y: 887 });
    let p: {x:number;y:number} = { ...REFUGE.spawn };
    for (let i = 0; i < 500; i++)
      p = moveInRefuge(REFUGE, p, { x: 0, y: -1 }, 0.04);
    expect(refugePositionAllowed(REFUGE, p)).toBe(true);
    expect(p.y).toBeGreaterThan(REFUGE.structures[1].y);
  });
  it("updates AOI on movement, removal, reentry and zone cleanup without ghosts", () => {
    const index = new WorldInterest<{ id: string; x: number; y: number }>();
    for (let i = 0; i < 1000; i++)
      index.upsert({ id: String(i), x: i * 100, y: 0 });
    expect(index.query({ x: 0, y: 0 }, 250).map((p) => p.id)).toEqual([
      "0",
      "1",
      "2",
    ]);
    index.upsert({ id: "1", x: 3000, y: 0 });
    expect(index.query({ x: 0, y: 0 }, 250).map((p) => p.id)).toEqual([
      "0",
      "2",
    ]);
    index.remove("0");
    index.upsert({ id: "1", x: 1, y: 0 });
    expect(index.query({ x: 0, y: 0 }, 250).map((p) => p.id)).toEqual([
      "1",
      "2",
    ]);
    expect(index.size).toBe(999);
    index.clear();
    expect(index.cellCount).toBe(0);
    expect(index.query({ x: 0, y: 0 })).toEqual([]);
  });
});
