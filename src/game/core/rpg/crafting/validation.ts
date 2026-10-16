import { z } from "zod";
import { RPG_ITEMS } from "../../../content/rpg/catalog";
import { QUEST_STORY_FLAGS } from "../../../content/rpg/quests";
import {
  CRAFTING_RECIPES,
  REFINEMENT_RECIPES,
  VENDOR_STOCK,
} from "../../../content/rpg/crafting";
import { MATERIAL_IDS } from "./types";
const material = z
  .object({
    materialId: z.enum(MATERIAL_IDS),
    amount: z.number().int().min(1).max(1000),
  })
  .strict();
const ingredients = z
  .array(material)
  .min(1)
  .max(4)
  .refine(
    (rows) => new Set(rows.map((r) => r.materialId)).size === rows.length,
    "Ingrediente repetido",
  );
const key = z.string().min(1).max(80);
const recipe = z
  .object({
    id: key,
    version: z.literal(1),
    name: z.string().min(1).max(100),
    stationId: z.literal("refuge:forge"),
    outputItemId: key,
    outputQuantity: z.literal(1),
    rarity: z.enum(["COMMON", "RARE"]),
    itemLevel: z.number().int().min(1).max(100),
    materials: ingredients,
    minLevel: z.number().int().min(1).max(100),
    requirements: z
      .array(
        z
          .object({
            kind: z.literal("STORY_FLAG"),
            flagId: z.enum(QUEST_STORY_FLAGS),
          })
          .strict(),
      )
      .max(5),
  })
  .strict();
const refinement = z
  .object({
    id: key,
    version: z.literal(1),
    name: z.string().min(1).max(100),
    stationId: z.literal("refuge:refinery"),
    materials: ingredients,
    output: material,
  })
  .strict();
const stock = z
  .object({
    id: key,
    itemId: key,
    rarity: z.literal("COMMON"),
    level: z.literal(1),
    cost: z
      .object({
        gold: z.number().int().min(0).max(1000),
        materials: ingredients.or(z.array(material).length(0)),
      })
      .strict(),
  })
  .strict();
export const MATERIAL_VALUE = Object.freeze({
  "weathered-ore": 2,
  "ruins-fiber": 1,
  "obelisk-dust": 4,
  "echo-shard": 100,
});
/** Shadow values are an audit tool, never an exchange rate or public purchase endpoint. */
export function validateCraftingCatalog(
  value: unknown = {
    recipes: CRAFTING_RECIPES,
    refinements: REFINEMENT_RECIPES,
    stocks: VENDOR_STOCK,
  },
) {
  const catalog = z
    .object({
      recipes: z.array(recipe).max(20),
      refinements: z.array(refinement).max(10),
      stocks: z.array(stock).max(10),
    })
    .strict()
    .parse(value);
  const ids = [
    ...catalog.recipes,
    ...catalog.refinements,
    ...catalog.stocks,
  ].map((r) => r.id);
  if (new Set(ids).size !== ids.length)
    throw new RangeError("ID de catálogo repetido.");
  for (const r of catalog.recipes) {
    const definition = RPG_ITEMS[r.outputItemId as keyof typeof RPG_ITEMS];
    if (
      !Object.hasOwn(RPG_ITEMS, r.outputItemId) ||
      r.itemLevel < definition.minLevel ||
      r.minLevel < r.itemLevel ||
      r.rarity !== definition.baseRarity
    )
      throw new RangeError("Saída da receita incompatível.");
  }
  for (const r of catalog.refinements) {
    if (
      r.output.materialId === "echo-shard" ||
      r.output.materialId !== "obelisk-dust" ||
      r.materials.some((m) => m.materialId === r.output.materialId) ||
      r.materials.reduce(
        (n, m) => n + m.amount * MATERIAL_VALUE[m.materialId],
        0,
      ) <=
        r.output.amount * MATERIAL_VALUE[r.output.materialId]
    )
      throw new RangeError("Refinamento circular ou inflacionário.");
  }
  for (const r of catalog.stocks) {
    if (
      !Object.hasOwn(RPG_ITEMS, r.itemId) ||
      RPG_ITEMS[r.itemId as keyof typeof RPG_ITEMS].minLevel !== 1 ||
      r.cost.gold +
        r.cost.materials.reduce(
          (n, m) => n + m.amount * MATERIAL_VALUE[m.materialId],
          0,
        ) <=
        1
    )
      throw new RangeError("Estoque inválido ou arbitragem.");
  }
  return catalog;
}
