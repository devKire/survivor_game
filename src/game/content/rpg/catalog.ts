import type { RpgEquipmentDefinition } from "../../core/rpg/combat-types";

export const RPG_CHARACTERS = {
  nara: { name: "Nara", archetype: "Vanguarda" },
  orin: { name: "Orin", archetype: "Arcanista" },
  ivo: { name: "Ivo", archetype: "Batedor" },
  sena: { name: "Sena", archetype: "Guardião" },
} as const;

export type RpgCharacterId = keyof typeof RPG_CHARACTERS;

export const RPG_ITEMS = {
  "blade-weathered": {
    id: "blade-weathered",
    name: "Lâmina Gasta",
    description: "Um foco ofensivo marcado por antigas travessias.",
    slot: "WEAPON",
    baseRarity: "COMMON",
    minLevel: 1,
    baseModifiers: [{ stat: "damage", operation: "ADD_PERCENT", value: 0.04 }],
    affixPoolId: "offense",
    contentVersion: 1,
  },
  "mantle-ash": {
    id: "mantle-ash",
    name: "Manto de Cinzas",
    description: "Cinzas tecidas para amparar o sobrevivente.",
    slot: "ARMOR",
    baseRarity: "COMMON",
    minLevel: 1,
    baseModifiers: [{ stat: "maxHealth", operation: "FLAT", value: 8 }],
    affixPoolId: "defense",
    contentVersion: 1,
  },
  "charm-obelisk": {
    id: "charm-obelisk",
    name: "Talismã do Obelisco",
    description: "Um fragmento que amplia a presença do seu portador.",
    slot: "CHARM",
    baseRarity: "RARE",
    minLevel: 1,
    baseModifiers: [{ stat: "area", operation: "ADD_PERCENT", value: 0.03 }],
    affixPoolId: "limiar",
    contentVersion: 1,
  },
  "blade-echo": {
    id: "blade-echo",
    name: "Lâmina do Eco",
    description: "Precisão para a vanguarda e o batedor.",
    slot: "WEAPON",
    baseRarity: "RARE",
    minLevel: 5,
    allowedCharacters: ["nara", "ivo"],
    baseModifiers: [
      { stat: "damage", operation: "ADD_PERCENT", value: 0.05 },
      { stat: "critChance", operation: "FLAT", value: 0.01 },
    ],
    affixPoolId: "offense",
    contentVersion: 1,
  },
  "mantle-still": {
    id: "mantle-still",
    name: "Manto da Quietude",
    description: "Proteção para quem escuta o Limiar.",
    slot: "ARMOR",
    baseRarity: "RARE",
    minLevel: 5,
    allowedCharacters: ["orin", "sena"],
    baseModifiers: [
      { stat: "armor", operation: "FLAT", value: 0.5 },
      { stat: "recovery", operation: "FLAT", value: 0.1 },
    ],
    affixPoolId: "defense",
    contentVersion: 1,
  },
  "charm-lens": {
    id: "charm-lens",
    name: "Lente do Limiar",
    description: "Ecos mais duradouros, sem alterar sua arma.",
    slot: "CHARM",
    baseRarity: "RARE",
    minLevel: 5,
    baseModifiers: [
      { stat: "duration", operation: "ADD_PERCENT", value: 0.04 },
      { stat: "pickupRange", operation: "FLAT", value: 4 },
    ],
    affixPoolId: "limiar",
    contentVersion: 1,
  },
} as const satisfies Record<string, RpgEquipmentDefinition>;

export const RPG_MATERIALS = {
  "obelisk-dust": { name: "Pó do Obelisco" },
  "echo-shard": { name: "Fragmento de Eco" },
} as const;
