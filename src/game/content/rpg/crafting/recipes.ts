import type {
  RecipeDefinition,
  MaterialAmount,
} from "../../../core/rpg/crafting/types";
import { freezeNarrative } from "../../../core/rpg/quests/content";
import { RPG_ITEMS } from "../catalog";
const materials = (
  ore: number,
  fiber: number,
  dust: number,
  shards = 0,
): readonly MaterialAmount[] =>
  (
    [
      ["weathered-ore", ore],
      ["ruins-fiber", fiber],
      ["obelisk-dust", dust],
      ["echo-shard", shards],
    ] as const
  )
    .filter(([, n]) => n > 0)
    .map(([materialId, amount]) => ({ materialId, amount }));
const definitions = [
  ["blade-weathered", 6, 0, 2, 0],
  ["mantle-ash", 2, 4, 0, 0],
  ["charm-obelisk", 0, 4, 3, 0],
  ["blade-echo", 8, 0, 4, 1],
  ["mantle-still", 0, 8, 2, 1],
  ["charm-lens", 0, 3, 6, 2],
] as const;
export const CRAFTING_RECIPES: readonly RecipeDefinition[] = definitions.map(
  ([id, ore, fiber, dust, shards]) => ({
    id: "recipe:" + id,
    version: 1,
    name: RPG_ITEMS[id].name,
    stationId: "refuge:forge",
    outputItemId: id,
    outputQuantity: 1,
    rarity: RPG_ITEMS[id].baseRarity,
    itemLevel: RPG_ITEMS[id].minLevel,
    materials: materials(ore, fiber, dust, shards),
    minLevel: RPG_ITEMS[id].minLevel,
    requirements: shards
      ? [{ kind: "STORY_FLAG", flagId: "material-samples-delivered" }]
      : [],
  }),
);
freezeNarrative(CRAFTING_RECIPES);
