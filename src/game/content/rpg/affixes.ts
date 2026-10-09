import type { RpgAffixDefinition } from "../../core/rpg/combat-types";

// Values are fractions (0.04 = 4%); cooldown reductions use negative percentages.
export const RPG_AFFIXES = {
  force: {
    name: "Força",
    stat: "damage",
    operation: "ADD_PERCENT",
    minValue: 0.01,
    maxValue: 0.03,
    step: 0.001,
    allowedSlots: ["WEAPON"],
    weight: 4,
  },
  precision: {
    name: "Precisão",
    stat: "critChance",
    operation: "FLAT",
    minValue: 0.005,
    maxValue: 0.015,
    step: 0.001,
    allowedSlots: ["WEAPON", "CHARM"],
    weight: 2,
  },
  haste: {
    name: "Cadência",
    stat: "cooldown",
    operation: "ADD_PERCENT",
    minValue: -0.03,
    maxValue: -0.01,
    step: 0.001,
    allowedSlots: ["WEAPON"],
    weight: 2,
  },
  life: {
    name: "Vigor",
    stat: "maxHealth",
    operation: "FLAT",
    minValue: 2,
    maxValue: 6,
    step: 1,
    allowedSlots: ["ARMOR"],
    weight: 4,
  },
  guard: {
    name: "Guarda",
    stat: "armor",
    operation: "FLAT",
    minValue: 0.1,
    maxValue: 0.3,
    step: 0.1,
    allowedSlots: ["ARMOR"],
    weight: 2,
  },
  renewal: {
    name: "Renovação",
    stat: "recovery",
    operation: "FLAT",
    minValue: 0.02,
    maxValue: 0.08,
    step: 0.01,
    allowedSlots: ["ARMOR", "CHARM"],
    weight: 2,
  },
  reach: {
    name: "Alcance",
    stat: "area",
    operation: "ADD_PERCENT",
    minValue: 0.01,
    maxValue: 0.03,
    step: 0.001,
    allowedSlots: ["CHARM"],
    weight: 3,
  },
  fortune: {
    name: "Fortuna",
    stat: "luck",
    operation: "ADD_PERCENT",
    minValue: 0.01,
    maxValue: 0.03,
    step: 0.001,
    allowedSlots: ["CHARM"],
    weight: 3,
  },
} as const satisfies Record<string, RpgAffixDefinition>;

export const RPG_AFFIX_POOLS: Readonly<
  Record<string, readonly (keyof typeof RPG_AFFIXES)[]>
> = {
  offense: ["force", "precision", "haste"],
  defense: ["life", "guard", "renewal"],
  limiar: ["precision", "renewal", "reach", "fortune"],
};
export const RPG_RARITY_RULES = {
  COMMON: { maxAffixes: 0, maxTier: 1 },
  RARE: { maxAffixes: 1, maxTier: 1 },
  EPIC: { maxAffixes: 2, maxTier: 2 },
  LEGENDARY: { maxAffixes: 3, maxTier: 3 },
} as const;
