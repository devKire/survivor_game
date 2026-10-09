import type { Stats } from "../types";
import type { RpgCharacterId } from "../../content/rpg/catalog";
import type { RpgAttributes, RpgItemSlot, RpgRarity } from "./types";

export const COMBAT_STAT_KEYS = [
  "maxHealth",
  "speed",
  "armor",
  "damage",
  "area",
  "cooldown",
  "duration",
  "pickupRange",
  "luck",
  "critChance",
  "recovery",
] as const;
export type CombatStatKey = (typeof COMBAT_STAT_KEYS)[number];
export type CombatStats = Stats & {
  maxHealth: number;
  speed: number;
  armor: number;
};
export type ModifierOperation = "FLAT" | "ADD_PERCENT" | "MULTIPLY";
export interface CombatModifierDefinition {
  stat: CombatStatKey;
  operation: ModifierOperation;
  value: number;
}
export interface CombatModifier extends CombatModifierDefinition {
  sourceId: string;
}
export interface RpgEquipmentDefinition {
  id: string;
  name: string;
  description: string;
  slot: RpgItemSlot;
  baseRarity: RpgRarity;
  minLevel: number;
  allowedCharacters?: readonly RpgCharacterId[];
  baseModifiers: readonly CombatModifierDefinition[];
  affixPoolId: string;
  contentVersion: number;
}
export interface RpgAffix {
  id: string;
  tier: number;
  value: number;
}
export interface RpgAffixDefinition {
  name: string;
  stat: CombatStatKey;
  operation: ModifierOperation;
  minValue: number;
  maxValue: number;
  step: number;
  allowedSlots: readonly RpgItemSlot[];
  weight: number;
}
export interface RpgEquipment {
  id: string;
  itemId: string;
  rarity: RpgRarity;
  level: number;
  quantity: number;
  contentVersion: number;
  rollSeed: string | null;
  affixes: readonly RpgAffix[];
}
export interface RpgEquippedItemSnapshot extends RpgEquipment {
  slot: RpgItemSlot;
}
export interface RpgCombatLoadout {
  readonly characterId: RpgCharacterId;
  readonly level: number;
  readonly attributes: Readonly<RpgAttributes>;
  readonly equipment: readonly RpgEquippedItemSnapshot[];
  readonly modifiers: readonly CombatModifier[];
  readonly profileRevision: number;
  readonly rulesetVersion: number;
}
export type CombatContext =
  | { readonly kind: "SURVIVOR" }
  | { readonly kind: "PVP" }
  | { readonly kind: "RPG_EXPEDITION"; readonly loadout: RpgCombatLoadout };
