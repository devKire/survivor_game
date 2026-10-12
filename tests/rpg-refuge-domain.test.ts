import { describe, expect, it } from "vitest";
import { REFUGE } from "../src/game/content/rpg/refuge";
import { REFUGE_DIALOGUES } from "../src/game/content/rpg/refuge-npcs";
import { REFUGE_SERVICES } from "../src/game/core/rpg/refuge/types";
import {
  moveInRefuge,
  refugePositionAllowed,
  refugeTarget,
  validateRefuge,
} from "../src/game/core/rpg/refuge/scene";
import {
  directionFromVector,
  frameForAnimation,
} from "../src/game/client/character-sprite-renderer";
describe("Safe deterministic refuge domain", () => {
  it("has unique versioned objects, valid spawn and known services/dialogues", () => {
    expect(() => validateRefuge(REFUGE)).not.toThrow();
    expect(() =>
      validateRefuge({
        ...REFUGE,
        structures: [...REFUGE.structures, REFUGE.structures[0]],
      }),
    ).toThrow();
    for (const target of [...REFUGE.structures, ...REFUGE.npcs]) {
      if ("service" in target && target.service)
        expect(REFUGE_SERVICES).toContain(target.service);
      if ("dialogueId" in target && target.dialogueId)
        expect(REFUGE_DIALOGUES).toHaveProperty(target.dialogueId);
    }
    expect(JSON.parse(JSON.stringify(REFUGE))).toEqual(REFUGE);
    expect(REFUGE).not.toHaveProperty("enemies");
    expect(REFUGE).not.toHaveProperty("loot");
    expect(REFUGE).not.toHaveProperty("settlement");
  });
  it("normalizes diagonals, limits delta and moves independently of frame rate", () => {
    const p = REFUGE.spawn;
    const a = moveInRefuge(REFUGE, p, { x: 0, y: -1 }, 0.05),
      b = moveInRefuge(REFUGE, p, { x: -1, y: -1 }, 0.05);
    expect(Math.hypot(b.x - p.x, b.y - p.y)).toBeCloseTo(p.y - a.y);
    expect(moveInRefuge(REFUGE, p, { x: 0, y: -1 }, 100)).toEqual(a);
    let c = { ...p };
    for (let i = 0; i < 5; i++)
      c = moveInRefuge(REFUGE, c, { x: 0, y: -1 }, 0.01) as typeof c;
    expect(c.y).toBeCloseTo(a.y);
    expect(moveInRefuge(REFUGE, p, { x: NaN, y: 0 }, 0.05)).toEqual(p);
  });
  it("blocks obstacles and bounds, and only selects nearby known targets", () => {
    expect(refugePositionAllowed(REFUGE, { x: 600, y: 350 })).toBe(false);
    expect(refugePositionAllowed(REFUGE, { x: -1, y: 400 })).toBe(false);
    let p = { x: 600, y: 450 };
    for (let i = 0; i < 100; i++)
      p = moveInRefuge(REFUGE, p, { x: 0, y: -1 }, 0.05);
    expect(p.y).toBeGreaterThanOrEqual(397);
    expect(refugeTarget(REFUGE, REFUGE.spawn)?.id).toBe("refuge:guardian");
    expect(refugeTarget(REFUGE, { x: 40, y: 40 })).toBeUndefined();
  });
  it("reuses all eight sprite directions and idle/walk frames", () => {
    const directions = Array.from({ length: 8 }, (_, i) =>
      directionFromVector(
        Math.cos((i * Math.PI) / 4),
        Math.sin((i * Math.PI) / 4),
      ),
    );
    expect(new Set(directions).size).toBe(8);
    expect(frameForAnimation(false, 1, 0).row).toBe(0);
    expect(frameForAnimation(true, 1, 0).row).toBeGreaterThan(0);
  });
});
