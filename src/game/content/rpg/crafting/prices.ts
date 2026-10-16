import { freezeNarrative } from "../../../core/rpg/quests/content";
export const VENDOR_SELL_GOLD = Object.freeze({
  COMMON: 1,
  RARE: 2,
  EPIC: 3,
  LEGENDARY: 0,
});
export const CRAFTING_LIMITS = {
  inventoryCreationCap: 200,
  rareCrafts: 2,
  goldGranted: 5,
  operations: {
    CRAFT_ITEM: 6,
    REFINE_MATERIAL: 3,
    UPGRADE_ITEM: 2,
    REFORGE_ITEM: 3,
    BUY_FROM_VENDOR: 2,
    SELL_TO_VENDOR: 3,
  },
} as const;
freezeNarrative(CRAFTING_LIMITS);
