import { z } from "zod";
import type { RpgCharacterId } from "../../../content/rpg/catalog";
import type { RpgRarity } from "../types";

export const MATERIAL_IDS = [
  "weathered-ore",
  "ruins-fiber",
  "obelisk-dust",
  "echo-shard",
] as const;
export type MaterialId = (typeof MATERIAL_IDS)[number];
export interface MaterialAmount {
  readonly materialId: MaterialId;
  readonly amount: number;
}
export interface ForgeCost {
  readonly gold: number;
  readonly materials: readonly MaterialAmount[];
}
export type RecipeRequirement = {
  readonly kind: "STORY_FLAG";
  readonly flagId: string;
};
export interface RecipeDefinition {
  readonly id: string;
  readonly version: 1;
  readonly name: string;
  readonly stationId: "refuge:forge";
  readonly outputItemId: string;
  readonly outputQuantity: 1;
  readonly rarity: RpgRarity;
  readonly itemLevel: number;
  readonly materials: readonly MaterialAmount[];
  readonly minLevel: number;
  readonly requirements: readonly RecipeRequirement[];
}
export interface RefinementDefinition {
  readonly id: string;
  readonly version: 1;
  readonly name: string;
  readonly stationId: "refuge:refinery";
  readonly materials: readonly MaterialAmount[];
  readonly output: MaterialAmount;
}
export interface VendorStock {
  readonly id: string;
  readonly itemId: string;
  readonly rarity: "COMMON";
  readonly level: 1;
  readonly cost: ForgeCost;
}
export interface CraftingAccount {
  readonly characterId: RpgCharacterId;
  readonly level: number;
  readonly flags: ReadonlySet<string>;
}
const shared = {
  requestId: z.uuid(),
  expectedRevision: z.number().int().min(1).max(2147483646),
  catalogVersion: z.literal(1),
};
const recipe = {
  ...shared,
  recipeId: z.string().min(1).max(80),
  recipeVersion: z.literal(1),
};
const instance = { ...shared, instanceId: z.string().min(1).max(100) };
const vendor = { ...shared, vendorId: z.literal("refuge:trader") };
export const craftingCommandSchema = z.discriminatedUnion("operation", [
  z.object({ ...recipe, operation: z.literal("CRAFT_ITEM") }).strict(),
  z.object({ ...recipe, operation: z.literal("REFINE_MATERIAL") }).strict(),
  z.object({ ...instance, operation: z.literal("UPGRADE_ITEM") }).strict(),
  z.object({ ...instance, operation: z.literal("REFORGE_ITEM") }).strict(),
  z
    .object({
      ...vendor,
      operation: z.literal("BUY_FROM_VENDOR"),
      stockItemId: z.string().min(1).max(80),
    })
    .strict(),
  z
    .object({
      ...vendor,
      operation: z.literal("SELL_TO_VENDOR"),
      instanceId: instance.instanceId,
    })
    .strict(),
]);
export type CraftingCommand = z.infer<typeof craftingCommandSchema>;
export type CraftingOperation = CraftingCommand["operation"];
export const CRAFTING_OPERATIONS = [
  "CRAFT_ITEM",
  "REFINE_MATERIAL",
  "UPGRADE_ITEM",
  "REFORGE_ITEM",
  "BUY_FROM_VENDOR",
  "SELL_TO_VENDOR",
] as const;
export function isCraftingOperation(
  operation: string,
): operation is CraftingOperation {
  return (CRAFTING_OPERATIONS as readonly string[]).includes(operation);
}
const material = z
  .object({
    materialId: z.enum(MATERIAL_IDS),
    amount: z.number().int().min(1).max(1000000000),
  })
  .strict();
export const publicForgeItem = z
  .object({
    id: z.string().min(1).max(100),
    itemId: z.string().min(1).max(60),
    rarity: z.enum(["COMMON", "RARE", "EPIC", "LEGENDARY"]),
    level: z.number().int().min(1).max(100),
    quantity: z.literal(1),
    contentVersion: z.literal(1),
    affixes: z
      .array(
        z
          .object({
            id: z.string().max(60),
            tier: z.number().int().min(1).max(3),
            value: z.number().finite(),
          })
          .strict(),
      )
      .max(3),
  })
  .strict();
export const craftingResultSchema = z
  .object({
    version: z.literal(1),
    requestId: z.uuid(),
    operation: z.enum([
      "CRAFT_ITEM",
      "REFINE_MATERIAL",
      "UPGRADE_ITEM",
      "REFORGE_ITEM",
      "BUY_FROM_VENDOR",
      "SELL_TO_VENDOR",
    ]),
    revision: z.number().int().positive(),
    characterId: z.enum(["nara", "orin", "ivo", "sena"]),
    at: z.iso.datetime(),
    sourceId: z.string().min(1).max(100),
    costs: z
      .object({
        gold: z.number().int().min(0).max(1000000000),
        materials: z.array(material).max(4),
      })
      .strict(),
    gains: z
      .object({
        gold: z.number().int().min(0).max(5),
        materials: z.array(material).max(4),
      })
      .strict(),
    before: publicForgeItem.nullable(),
    item: publicForgeItem.nullable(),
  })
  .strict();
export type CraftingResult = z.infer<typeof craftingResultSchema>;
