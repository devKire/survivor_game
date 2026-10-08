import type { RpgCharacterId } from "../../content/rpg";

export const RPG_MAX_LEVEL = 100;
export const RPG_ITEM_SLOTS = ["WEAPON", "ARMOR", "CHARM"] as const;
export const RPG_RARITIES = ["COMMON", "RARE", "EPIC", "LEGENDARY"] as const;

export type RpgItemSlot = (typeof RPG_ITEM_SLOTS)[number];
export type RpgRarity = (typeof RPG_RARITIES)[number];

export interface RpgCharacterProgress {
  characterId: RpgCharacterId;
  level: number;
  xp: number;
}
