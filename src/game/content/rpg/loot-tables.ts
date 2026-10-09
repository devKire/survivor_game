import type { RpgLootTable } from "../../core/rpg/loot-types";
const basic = ["blade-weathered", "mantle-ash", "charm-obelisk"];
const all = [...basic, "blade-echo", "mantle-still", "charm-lens"];
const tables: Record<string, RpgLootTable> = {
  "completion-v1": {
    id: "completion-v1",
    version: 1,
    rolls: 1,
    entries: basic.map((definitionId) => ({
      id: definitionId,
      definitionId,
      type: "EQUIPMENT",
      weight: 10,
      minimumItemLevel: 1,
      maximumItemLevel: 100,
      rarityWeights: { COMMON: 80, RARE: 18, EPIC: 2, LEGENDARY: 0 },
    })),
  },
  "boss-v1": {
    id: "boss-v1",
    version: 1,
    rolls: 1,
    entries: [
      ...all.map((definitionId) => ({
        id: definitionId,
        definitionId,
        type: "EQUIPMENT" as const,
        weight: 10,
        minimumItemLevel: 1,
        maximumItemLevel: 100,
        rarityWeights: { COMMON: 60, RARE: 32, EPIC: 7, LEGENDARY: 1 },
      })),
      {
        id: "dust",
        definitionId: "obelisk-dust",
        type: "MATERIAL",
        weight: 20,
        minimumQuantity: 2,
        maximumQuantity: 4,
      },
      {
        id: "shard",
        definitionId: "echo-shard",
        type: "MATERIAL",
        weight: 20,
        minimumQuantity: 1,
        maximumQuantity: 2,
      },
    ],
  },
};
function freeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
export const RPG_LOOT_TABLES_V1 = freeze(tables);
