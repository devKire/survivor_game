export const RPG_CHARACTERS = {
  nara: { name: "Nara", archetype: "Vanguarda" },
  orin: { name: "Orin", archetype: "Arcanista" },
  ivo: { name: "Ivo", archetype: "Batedor" },
  sena: { name: "Sena", archetype: "Guardião" },
} as const;

export type RpgCharacterId = keyof typeof RPG_CHARACTERS;

export const RPG_ITEMS = {
  "blade-weathered": { name: "Lâmina Gasta", slot: "WEAPON", rarity: "COMMON" },
  "mantle-ash": { name: "Manto de Cinzas", slot: "ARMOR", rarity: "COMMON" },
  "charm-obelisk": { name: "Talismã do Obelisco", slot: "CHARM", rarity: "RARE" },
} as const;

export const RPG_MATERIALS = {
  "obelisk-dust": { name: "Pó do Obelisco" },
  "echo-shard": { name: "Fragmento de Eco" },
} as const;
