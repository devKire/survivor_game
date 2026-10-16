import type { VendorStock } from "../../../core/rpg/crafting/types";
import { freezeNarrative } from "../../../core/rpg/quests/content";
export const VENDOR_ID = "refuge:trader";
export const VENDOR_STOCK: readonly VendorStock[] = [
  {
    id: "stock:blade",
    itemId: "blade-weathered",
    rarity: "COMMON",
    level: 1,
    cost: { gold: 12, materials: [] },
  },
  {
    id: "stock:mantle",
    itemId: "mantle-ash",
    rarity: "COMMON",
    level: 1,
    cost: { gold: 10, materials: [] },
  },
  {
    id: "stock:barter-mantle",
    itemId: "mantle-ash",
    rarity: "COMMON",
    level: 1,
    cost: {
      gold: 0,
      materials: [
        { materialId: "weathered-ore", amount: 2 },
        { materialId: "ruins-fiber", amount: 6 },
      ],
    },
  },
];
freezeNarrative(VENDOR_STOCK);
