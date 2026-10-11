import { RPG_MATERIALS } from "../../content/rpg/catalog";
import { lootTableSchema, type RpgLootTable } from "./loot-types";
import {
  equipmentDefinition,
  rollEquipmentAffixes,
  validateEquipment,
} from "./equipment";
import { RPG_RARITIES } from "./types";

export function validateLootTable(input: unknown): RpgLootTable {
  const table = lootTableSchema.parse(input);
  if (
    new Set(table.entries.map((e) => e.id)).size !== table.entries.length ||
    new Set(table.entries.map((e) => e.definitionId)).size !==
      table.entries.length
  )
    throw new RangeError("Entrada duplicada.");
  for (const e of table.entries) {
    if (e.type === "EQUIPMENT") {
      equipmentDefinition(e.definitionId, 1);
      if (
        e.minimumItemLevel > e.maximumItemLevel ||
        Object.values(e.rarityWeights).reduce((s, w) => s + w, 0) <= 0
      )
        throw new RangeError("Roll inválido.");
    } else if (
      !Object.hasOwn(RPG_MATERIALS, e.definitionId) ||
      e.minimumQuantity > e.maximumQuantity
    )
      throw new RangeError("Material inválido.");
  }
  return table;
}
/** Entropy is a private HMAC-derived 256-bit string supplied by the server. */
function entropy(seed: string) {
  if (!/^[a-f0-9]{64}$/.test(seed))
    throw new RangeError("Seed de recompensa inválida.");
  let position = 0;
  return () => {
    const at = (position++ % 8) * 8;
    return parseInt(seed.slice(at, at + 8), 16) / 4294967296;
  };
}
export function weightedPick<T>(
  entries: readonly T[],
  weight: (entry: T) => number,
  random: number,
): T {
  if (!entries.length || !Number.isFinite(random) || random < 0 || random >= 1)
    throw new RangeError("Roll inválido.");
  const weights = entries.map(weight);
  if (weights.some((w) => !Number.isInteger(w) || w < 0 || w > 10000))
    throw new RangeError("Peso inválido.");
  const total = weights.reduce((s, w) => s + w, 0);
  if (total <= 0) throw new RangeError("Tabela sem peso.");
  let target = random * total;
  for (let i = 0; i < entries.length; i++) {
    target -= weights[i];
    if (target < 0) return entries[i];
  }
  throw new RangeError("Roll não resolvido.");
}
export function rollRpgLoot(input: unknown, entryLevel: number, seed: string) {
  const table = validateLootTable(input);
  if (!Number.isInteger(entryLevel) || entryLevel < 1 || entryLevel > 100)
    throw new RangeError("Nível inválido.");
  const random = entropy(seed);
  const entries = table.entries
    .filter(
      (e) =>
        e.type !== "EQUIPMENT" ||
        (equipmentDefinition(e.definitionId).minLevel <= entryLevel &&
          e.minimumItemLevel <= entryLevel),
    )
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const entry = weightedPick(entries, (e) => e.weight, random());
  if (entry.type === "MATERIAL")
    return {
      type: "MATERIAL" as const,
      materialId: entry.definitionId,
      quantity:
        entry.minimumQuantity +
        Math.floor(
          random() * (entry.maximumQuantity - entry.minimumQuantity + 1),
        ),
    };
  const rarity = weightedPick(
    RPG_RARITIES,
    (r) => entry.rarityWeights[r],
    random(),
  );
  const maximum = Math.min(entryLevel, entry.maximumItemLevel);
  const minimum = Math.max(entry.minimumItemLevel, maximum - 2);
  const level = minimum + Math.floor(random() * (maximum - minimum + 1));
  const item = validateEquipment({
    id: "reward-" + seed.slice(0, 32),
    itemId: entry.definitionId,
    rarity,
    level,
    quantity: 1,
    contentVersion: 1,
    rollSeed: seed,
    affixes: rollEquipmentAffixes(
      equipmentDefinition(entry.definitionId),
      rarity,
      level,
      seed,
    ),
  });
  return { type: "EQUIPMENT" as const, item };
}
