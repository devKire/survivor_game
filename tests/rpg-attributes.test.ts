import { describe, expect, it } from "vitest";
import {
  allocateAttributePoints,
  attributesAtLevel,
  availableAttributePoints,
  grantedAttributePoints,
  initialRpgAttributes,
  RPG_ATTRIBUTE_KEYS,
  rpgAttributesSchema,
  rpgLevelFromXp,
  validateRpgAttributes,
} from "../src/game/core/rpg";

describe("Persistent RPG attribute budget", () => {
  it("starts empty and derives five points per earned level without duplicate grants", () => {
    const initial = initialRpgAttributes();
    expect(initial.attributePoints).toBe(0);
    let state = initial;
    for (let level = 1; level <= 100; level++) {
      state = attributesAtLevel(state, level);
      expect(state.attributePoints).toBe(5 * (level - 1));
      expect(attributesAtLevel(state, level)).toEqual(state);
      expect(validateRpgAttributes(state)).toEqual(state);
    }
    expect(initial.attributePoints).toBe(0);
  });
  it("spends once, preserves other attributes and recomputes balance after leveling", () => {
    const initial = initialRpgAttributes(2);
    const allocated = allocateAttributePoints(initial, "power", 3);
    expect(allocated.attributePoints).toBe(2);
    expect(allocated.attributes.power).toBe(3);
    expect(initial.attributes.power).toBe(0);
    const higher = attributesAtLevel(allocated, rpgLevelFromXp(400));
    expect(higher.level).toBe(3);
    expect(higher.attributePoints).toBe(7);
    expect(attributesAtLevel(higher, 3)).toEqual(higher);
    expect(() => attributesAtLevel(higher, 2)).toThrow();
  });
  it("rejects overdrafts, fractions, malformed state, overflows and unknown attributes", () => {
    for (const amount of [0, -1, 1.5, Infinity, NaN, 6])
      expect(() =>
        allocateAttributePoints(initialRpgAttributes(2), "power", amount),
      ).toThrow();
    const state = allocateAttributePoints(
      initialRpgAttributes(100),
      "power",
      99,
    );
    expect(() => allocateAttributePoints(state, "power", 1)).toThrow("Limite");
    expect(() =>
      allocateAttributePoints(state, "unknown" as "power", 1),
    ).toThrow();
    expect(() =>
      validateRpgAttributes({
        ...state,
        attributePoints: state.attributePoints + 1,
      }),
    ).toThrow();
    expect(() => availableAttributePoints(1, state.attributes)).toThrow();
    for (const level of [0, -1, 101, 1.1, NaN])
      expect(() => grantedAttributePoints(level)).toThrow();
    for (const attributes of [
      null,
      {},
      { ...state.attributes, extra: 0 },
      { ...state.attributes, vitality: "1" },
    ])
      expect(rpgAttributesSchema.safeParse(attributes).success).toBe(false);
  });
  it("can distribute the maximum budget across all five attributes", () => {
    let state = initialRpgAttributes(100);
    for (const key of RPG_ATTRIBUTE_KEYS)
      state = allocateAttributePoints(state, key, 99);
    expect(state.attributePoints).toBe(0);
    expect(() => rpgLevelFromXp(1_000_000_001)).toThrow();
  });
});
