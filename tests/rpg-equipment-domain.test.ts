import { describe, expect, it } from "vitest";
import { RPG_ITEMS } from "../src/game/content/rpg/catalog";
import { RPG_RARITY_RULES } from "../src/game/content/rpg/affixes";
import {
  assertCanEquip,
  equipmentDefinition,
  rollEquipmentAffixes,
  validateEquipment,
  validateEquipmentDefinition,
  createRpgCombatLoadout,
  validateCombatLoadout,
  initialRpgAttributes,
  allocateAttributePoints,
  resolveCombatStats,
  type CombatModifier,
  type CombatStats,
  type RpgEquipment,
  type RpgRarity,
} from "../src/game/core/rpg";

const base: CombatStats = {
  maxHealth: 110,
  speed: 195,
  armor: 0,
  damage: 1,
  area: 1,
  cooldown: 1,
  duration: 1,
  amount: 0,
  pickupRange: 76,
  growth: 1,
  luck: 1,
  critChance: 0.07,
  recovery: 0,
};
export function equipmentFixture(
  itemId = "blade-weathered",
  rarity: RpgRarity = "COMMON",
  level = 1,
  seed: string | null = null,
): RpgEquipment {
  return {
    id: `fixture-${itemId}`,
    itemId,
    rarity,
    level,
    quantity: 1,
    contentVersion: 1,
    rollSeed: seed,
    affixes: seed
      ? rollEquipmentAffixes(equipmentDefinition(itemId), rarity, level, seed)
      : [],
  };
}
const modifier = (
  stat: CombatModifier["stat"],
  operation: CombatModifier["operation"],
  value: number,
  sourceId = "test",
): CombatModifier => ({ stat, operation, value, sourceId });

describe("versioned equipment and affixes", () => {
  it("validates every definition and preserves the three original IDs/slots", () => {
    for (const definition of Object.values(RPG_ITEMS))
      expect(validateEquipmentDefinition(definition)).toEqual(definition);
    expect(
      ["blade-weathered", "mantle-ash", "charm-obelisk"].map(
        (id) => equipmentDefinition(id).slot,
      ),
    ).toEqual(["WEAPON", "ARMOR", "CHARM"]);
    for (const bad of [
      { ...RPG_ITEMS["blade-weathered"], slot: "HEAD" },
      { ...RPG_ITEMS["blade-weathered"], affixPoolId: "defense" },
      { ...RPG_ITEMS["blade-weathered"], contentVersion: 2 },
      {
        ...RPG_ITEMS["blade-weathered"],
        baseModifiers: [{ stat: "damage", operation: "EXEC", value: 1 }],
      },
    ])
      expect(() => validateEquipmentDefinition(bad)).toThrow();
  });
  it("retains old instances with any existing rarity and no invented rolls", () => {
    for (const rarity of Object.keys(RPG_RARITY_RULES) as RpgRarity[])
      expect(
        validateEquipment(equipmentFixture("charm-obelisk", rarity)),
      ).toEqual(equipmentFixture("charm-obelisk", rarity));
  });
  it("rolls reproducibly, respects rarity/tier/slot limits and uses weighted pools without duplicates", () => {
    const seen = new Map<string, number>();
    for (const rarity of Object.keys(RPG_RARITY_RULES) as RpgRarity[]) {
      for (let i = 0; i < 300; i++) {
        const seed = `distribution-${i}`;
        for (const id of ["blade-weathered", "mantle-ash", "charm-obelisk"]) {
          const item = equipmentFixture(id, rarity, 100, seed);
          expect(validateEquipment(JSON.parse(JSON.stringify(item)))).toEqual(
            item,
          );
          expect(item.affixes).toEqual(
            rollEquipmentAffixes(equipmentDefinition(id), rarity, 100, seed),
          );
          expect(item.affixes).toHaveLength(
            RPG_RARITY_RULES[rarity].maxAffixes,
          );
          expect(new Set(item.affixes.map((a) => a.id)).size).toBe(
            item.affixes.length,
          );
          if (rarity === "RARE" && id === "blade-weathered")
            seen.set(
              item.affixes[0].id,
              (seen.get(item.affixes[0].id) ?? 0) + 1,
            );
        }
      }
    }
    expect(seen.size).toBe(3);
    expect(seen.get("force")!).toBeGreaterThan(seen.get("precision")!);
    expect(seen.get("force")!).toBeGreaterThan(seen.get("haste")!);
    expect(
      equipmentFixture("blade-weathered", "LEGENDARY", 1, "tier").affixes.every(
        (a) => a.tier === 1,
      ),
    ).toBe(true);
  });
  it("rejects unknown IDs, impossible tiers, tampering, duplicate affixes and nonfinite values", () => {
    const rolled = equipmentFixture(
      "blade-weathered",
      "LEGENDARY",
      100,
      "fixed",
    );
    for (const item of [
      { ...rolled, itemId: "ember" },
      { ...rolled, rarity: "MYTHIC" },
      { ...rolled, contentVersion: 2 },
      { ...rolled, rollSeed: null },
      { ...rolled, affixes: [rolled.affixes[0], rolled.affixes[0]] },
      ...["arbitrary", "life"].map((id) => ({
        ...rolled,
        affixes: [{ id, tier: 1, value: 0.02 }],
      })),
      ...[NaN, Infinity, 1e20, -0.1].map((value) => ({
        ...rolled,
        affixes: [{ ...rolled.affixes[0], value }],
      })),
      { ...rolled, affixes: [{ ...rolled.affixes[0], tier: 4 }] },
      { ...rolled, affixes: [{ ...rolled.affixes[0], code: "alert()" }] },
    ])
      expect(() => validateEquipment(item)).toThrow();
  });
  it("enforces quantity, exact slot, character and both level requirements", () => {
    const item = equipmentFixture("blade-echo");
    expect(() =>
      assertCanEquip(item, { characterId: "nara", level: 5 }, "WEAPON"),
    ).not.toThrow();
    for (const [characterId, level, slot] of [
      ["nara", 4, "WEAPON"],
      ["sena", 5, "WEAPON"],
      ["nara", 5, "ARMOR"],
    ] as const)
      expect(() =>
        assertCanEquip(item, { characterId, level }, slot),
      ).toThrow();
    expect(() =>
      assertCanEquip(
        { ...item, quantity: 2 },
        { characterId: "nara", level: 5 },
        "WEAPON",
      ),
    ).toThrow();
    expect(() =>
      assertCanEquip(
        { ...item, level: 10 },
        { characterId: "nara", level: 5 },
        "WEAPON",
      ),
    ).toThrow();
  });
});

describe("pure combat stat resolver", () => {
  it("preserves every value with zero modifiers, including existing bonuses above RPG caps", () => {
    const original = {
      ...base,
      cooldown: 0.4,
      critChance: 0.75,
      amount: 5,
      damage: 3,
      recovery: 2,
    };
    expect(resolveCombatStats(original, [])).toEqual(original);
    expect(resolveCombatStats(original, [])).not.toBe(original);
  });
  it("applies flat then summed percentages then deterministic multiplication without mutation", () => {
    const mods = [
      modifier("damage", "FLAT", 0.01),
      modifier("damage", "ADD_PERCENT", 0.02, "b"),
      modifier("damage", "ADD_PERCENT", 0.03, "a"),
      modifier("damage", "MULTIPLY", 1.02, "z"),
      modifier("damage", "MULTIPLY", 1.01, "x"),
    ];
    const result = resolveCombatStats(base, mods);
    expect(result.damage).toBeCloseTo(1.01 * 1.05 * 1.01 * 1.02, 12);
    expect(resolveCombatStats(base, [...mods].reverse())).toEqual(result);
    expect(resolveCombatStats(base, mods)).toEqual(result);
    expect(base.damage).toBe(1);
  });
  it("caps boosts and cooldown reductions without generating projectiles or growth", () => {
    const result = resolveCombatStats(base, [
      modifier("damage", "MULTIPLY", 1.5),
      modifier("maxHealth", "FLAT", 100),
      modifier("speed", "ADD_PERCENT", 0.5),
      modifier("cooldown", "ADD_PERCENT", -0.5),
      modifier("armor", "FLAT", 10),
      modifier("critChance", "FLAT", 0.5),
      modifier("recovery", "FLAT", 10),
    ]);
    expect(result).toMatchObject({
      damage: 1.35,
      maxHealth: 165,
      speed: 234,
      cooldown: 0.8,
      armor: 3,
      critChance: 0.17,
      recovery: 1,
      amount: 0,
      growth: 1,
    });
    expect(
      resolveCombatStats({ ...base, cooldown: 0.4 }, [
        modifier("cooldown", "ADD_PERCENT", -0.5),
      ]).cooldown,
    ).toBeCloseTo(0.32);
    expect(() =>
      resolveCombatStats(base, [
        {
          ...modifier("damage", "FLAT", 1),
          stat: "amount",
        } as unknown as CombatModifier,
      ]),
    ).toThrow();
  });
  it("rejects nonfinite values, unknown operations, excessive modifiers and versions", () => {
    for (const value of [NaN, Infinity, -Infinity, 101])
      expect(() =>
        resolveCombatStats(base, [modifier("damage", "FLAT", value)]),
      ).toThrow();
    for (const value of [NaN, Infinity])
      expect(() =>
        resolveCombatStats({ ...base, damage: value }, []),
      ).toThrow();
    expect(() =>
      resolveCombatStats(base, Array(65).fill(modifier("damage", "FLAT", 1))),
    ).toThrow();
    expect(() => resolveCombatStats(base, [], 2)).toThrow();
    expect(() =>
      resolveCombatStats(base, [
        {
          ...modifier("damage", "FLAT", 1),
          operation: "eval",
        } as unknown as CombatModifier,
      ]),
    ).toThrow();
  });
});

describe("immutable combat builds", () => {
  it("assembles named sources and freezes a detached loadout across serialization", () => {
    const attributes = allocateAttributePoints(
      initialRpgAttributes(2),
      "power",
      5,
    ).attributes;
    const item = equipmentFixture("blade-weathered", "RARE", 1, "source");
    const loadout = createRpgCombatLoadout({
      characterId: "nara",
      level: 2,
      attributes,
      equipment: [item],
      profileRevision: 7,
    });
    expect(loadout.modifiers.map((m) => m.sourceId)).toContain(
      "rpg-attribute:power",
    );
    expect(loadout.modifiers.map((m) => m.sourceId)).toContain(
      `rpg-item:${item.id}`,
    );
    expect(
      loadout.modifiers.some((m) => m.sourceId.startsWith("rpg-affix:")),
    ).toBe(true);
    attributes.power = 0;
    expect(loadout.attributes.power).toBe(5);
    expect(Object.isFrozen(loadout.equipment[0].affixes)).toBe(true);
    expect(validateCombatLoadout(JSON.parse(JSON.stringify(loadout)))).toEqual(
      loadout,
    );
    expect(() =>
      validateCombatLoadout({ ...loadout, modifiers: [] }),
    ).toThrow();
  });
  it("rejects overspent attributes and repeated slots or instance IDs", () => {
    const input = {
      characterId: "nara",
      level: 1,
      attributes: initialRpgAttributes().attributes,
      equipment: [equipmentFixture()],
      profileRevision: 1,
    };
    expect(() =>
      createRpgCombatLoadout({
        ...input,
        attributes: { ...input.attributes, power: 1 },
      }),
    ).toThrow();
    expect(() =>
      createRpgCombatLoadout({
        ...input,
        equipment: [...input.equipment, { ...equipmentFixture(), id: "other" }],
      }),
    ).toThrow();
  });
});
