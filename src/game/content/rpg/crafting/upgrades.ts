import { freezeNarrative } from "../../../core/rpg/quests/content";
export const FORGE_UPGRADES = {
  COMMON: {
    rarity: "RARE",
    minLevel: 1,
    materials: [
      { materialId: "weathered-ore", amount: 8 },
      { materialId: "obelisk-dust", amount: 6 },
    ],
  },
  RARE: {
    rarity: "EPIC",
    minLevel: 20,
    materials: [
      { materialId: "weathered-ore", amount: 12 },
      { materialId: "ruins-fiber", amount: 8 },
      { materialId: "obelisk-dust", amount: 12 },
      { materialId: "echo-shard", amount: 2 },
    ],
  },
} as const;
export const FORGE_REFORGE = {
  RARE: [
    { materialId: "weathered-ore", amount: 4 },
    { materialId: "obelisk-dust", amount: 2 },
  ],
  EPIC: [
    { materialId: "weathered-ore", amount: 6 },
    { materialId: "obelisk-dust", amount: 4 },
  ],
  LEGENDARY: [
    { materialId: "weathered-ore", amount: 8 },
    { materialId: "obelisk-dust", amount: 6 },
    { materialId: "echo-shard", amount: 1 },
  ],
} as const;
freezeNarrative(FORGE_UPGRADES);
freezeNarrative(FORGE_REFORGE);
