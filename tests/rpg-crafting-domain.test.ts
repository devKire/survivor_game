import { describe, it, expect } from "vitest";
import {
  CRAFTING_RECIPES,
  REFINEMENT_RECIPES,
  VENDOR_STOCK,
  CRAFTING_LIMITS,
} from "../src/game/content/rpg/crafting";
import {
  validateCraftingCatalog,
  MATERIAL_VALUE,
} from "../src/game/core/rpg/crafting/validation";
import {
  assertRecipeRequirements,
  checkedMaterialAmount,
  materialChanges,
  forgeItemPlan,
  vendorSaleGold,
} from "../src/game/core/rpg/crafting/rules";
import { craftingCommandSchema } from "../src/game/core/rpg/crafting/types";
import {
  equipmentDefinition,
  rollEquipmentAffixes,
  validateEquipment,
} from "../src/game/core/rpg/equipment";
import { randomUUID } from "node:crypto";
const account = {
  characterId: "nara" as const,
  level: 1,
  flags: new Set<string>(),
};
const item = {
  id: "item",
  itemId: "blade-weathered",
  rarity: "COMMON" as const,
  level: 1,
  quantity: 1,
  contentVersion: 1 as const,
  rollSeed: null,
  affixes: [],
};
const recipe = () => validateCraftingCatalog();
describe("Crafting domain and economic invariants", () => {
  it("validates six existing definitions and rejects duplicates, versions, unknown ingredients and unsafe amounts", () => {
    expect(validateCraftingCatalog().recipes).toHaveLength(6);
    const duplicate = recipe();
    duplicate.recipes.push(duplicate.recipes[0]);
    expect(() => validateCraftingCatalog(duplicate)).toThrow();
    for (const changes of [
      { version: 2 },
      { outputQuantity: 10 },
      { outputItemId: "unknown" },
      { minLevel: 0 },
      { materials: [{ materialId: "unknown", amount: 1 }] },
      {
        materials: [
          { materialId: "weathered-ore", amount: Number.MAX_SAFE_INTEGER },
        ],
      },
    ]) {
      const c = recipe();
      Object.assign(c.recipes[0], changes);
      expect(() => validateCraftingCatalog(c)).toThrow();
    }
  });
  it("keeps basic recipes accessible and verifies active character level, restrictions and durable story flags", () => {
    expect(() =>
      assertRecipeRequirements(CRAFTING_RECIPES[0], account),
    ).not.toThrow();
    expect(() =>
      assertRecipeRequirements(CRAFTING_RECIPES[3], account),
    ).toThrow(/Nível/);
    expect(() =>
      assertRecipeRequirements(CRAFTING_RECIPES[3], { ...account, level: 5 }),
    ).toThrow(/Matéria/);
    const unlocked = {
      ...account,
      level: 5,
      flags: new Set(["material-samples-delivered"]),
    };
    expect(() =>
      assertRecipeRequirements(CRAFTING_RECIPES[3], unlocked),
    ).not.toThrow();
    expect(() =>
      assertRecipeRequirements(CRAFTING_RECIPES[4], unlocked),
    ).toThrow(/personagem/);
    for (const characterId of ["nara", "orin", "ivo", "sena"] as const)
      expect(() =>
        assertRecipeRequirements(CRAFTING_RECIPES[1], {
          ...account,
          characterId,
        }),
      ).not.toThrow();
  });
  it("normalizes material deltas and fails rather than losing costs on overflow", () => {
    expect(
      materialChanges(
        [{ materialId: "obelisk-dust", amount: 3 }],
        [{ materialId: "obelisk-dust", amount: 1 }],
      ),
    ).toEqual([["obelisk-dust", -2]]);
    expect(checkedMaterialAmount(5, -5)).toBe(0);
    for (const [n, d] of [
      [0, -1],
      [1e9, 1],
      [1.5, 1],
      [Number.MAX_SAFE_INTEGER, 1],
    ])
      expect(() => checkedMaterialAmount(n, d)).toThrow();
  });
  it("upgrades rarity within the existing resolver and preserves reforge identity and rarity", () => {
    const p = forgeItemPlan(item, account, "UPGRADE_ITEM");
    expect(p.rarity).toBe("RARE");
    expect(() => forgeItemPlan(item, account, "REFORGE_ITEM")).toThrow(
      /comuns/,
    );
    const rare = {
      ...item,
      rarity: "RARE" as const,
      rollSeed: "private-test-seed",
      affixes: rollEquipmentAffixes(
        equipmentDefinition(item.itemId),
        "RARE",
        1,
        "private-test-seed",
      ),
    };
    expect(validateEquipment(rare).affixes).toHaveLength(1);
    expect(() => forgeItemPlan(rare, account, "UPGRADE_ITEM")).toThrow(/Nível/);
    expect(forgeItemPlan(rare, account, "REFORGE_ITEM").rarity).toBe("RARE");
    expect(
      rollEquipmentAffixes(
        equipmentDefinition(item.itemId),
        "RARE",
        1,
        "private-test-seed",
      ),
    ).toEqual(rare.affixes);
    expect(() => vendorSaleGold({ ...item, quantity: 2 })).toThrow();
  });
  it("rejects client prices, quantities, seeds, owners and malformed requests", () => {
    const c = {
      operation: "CRAFT_ITEM",
      requestId: randomUUID(),
      expectedRevision: 1,
      catalogVersion: 1,
      recipeId: CRAFTING_RECIPES[0].id,
      recipeVersion: 1,
    };
    expect(craftingCommandSchema.parse(c)).toEqual(c);
    for (const extra of [
      { userId: "other" },
      { price: 0 },
      { quantity: 10 },
      { rollSeed: "mine" },
      { rarity: "LEGENDARY" },
      { affixes: [] },
    ])
      expect(() => craftingCommandSchema.parse({ ...c, ...extra })).toThrow();
    expect(() =>
      craftingCommandSchema.parse({ ...c, expectedRevision: NaN }),
    ).toThrow();
  });
  it("has no buy/sell or refining material-value cycle with guaranteed profit and bounds account minting", () => {
    for (const s of VENDOR_STOCK)
      expect(
        s.cost.gold +
          s.cost.materials.reduce(
            (n, m) => n + m.amount * MATERIAL_VALUE[m.materialId],
            0,
          ),
      ).toBeGreaterThan(vendorSaleGold({ ...item, itemId: s.itemId }));
    for (const r of REFINEMENT_RECIPES)
      expect(
        r.materials.reduce(
          (n, m) => n + m.amount * MATERIAL_VALUE[m.materialId],
          0,
        ),
      ).toBeGreaterThan(r.output.amount * MATERIAL_VALUE[r.output.materialId]);
    const c = recipe();
    c.refinements[0].output = { materialId: "echo-shard", amount: 1 };
    expect(() => validateCraftingCatalog(c)).toThrow();
    expect(CRAFTING_LIMITS.goldGranted).toBe(5);
    expect(CRAFTING_LIMITS.operations.SELL_TO_VENDOR).toBe(3);
  });
});
