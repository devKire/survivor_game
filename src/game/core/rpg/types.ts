import type { RpgCharacterId } from "../../content/rpg";

export const RPG_MAX_LEVEL = 100;
export const RPG_MAX_XP = 1_000_000_000;
export const RPG_ATTRIBUTE_KEYS = [
  "vitality",
  "power",
  "agility",
  "focus",
  "will",
] as const;
export const RPG_ATTRIBUTE_MAX = 99;
export const RPG_POINTS_PER_LEVEL = 5;
export type RpgAttribute = (typeof RPG_ATTRIBUTE_KEYS)[number];
export type RpgAttributes = Record<RpgAttribute, number>;

export interface RpgAttributeState {
  level: number;
  attributePoints: number;
  attributes: RpgAttributes;
}
export const RPG_ITEM_SLOTS = ["WEAPON", "ARMOR", "CHARM"] as const;
export const RPG_RARITIES = ["COMMON", "RARE", "EPIC", "LEGENDARY"] as const;

export type RpgItemSlot = (typeof RPG_ITEM_SLOTS)[number];
export type RpgRarity = (typeof RPG_RARITIES)[number];

export interface RpgCharacterProgress extends RpgAttributeState {
  characterId: RpgCharacterId;
  xp: number;
}
