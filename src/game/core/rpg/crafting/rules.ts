import { RPG_ITEMS } from "../../../content/rpg/catalog";
import {
  FORGE_REFORGE,
  FORGE_UPGRADES,
  VENDOR_SELL_GOLD,
} from "../../../content/rpg/crafting";
import { equipmentDefinition, validateEquipment } from "../equipment";
import type { RpgEquipment } from "../combat-types";
import type {
  CraftingAccount,
  CraftingOperation,
  MaterialAmount,
  RecipeDefinition,
} from "./types";

export function craftingStation(operation: CraftingOperation) {
  return operation === "REFINE_MATERIAL"
    ? "refuge:refinery"
    : operation === "BUY_FROM_VENDOR" || operation === "SELL_TO_VENDOR"
      ? "refuge:trader"
      : "refuge:forge";
}
export function assertRecipeRequirements(
  recipe: RecipeDefinition,
  account: CraftingAccount,
) {
  const definition = equipmentDefinition(recipe.outputItemId);
  if (
    !Number.isInteger(account.level) ||
    account.level <
      Math.max(recipe.minLevel, recipe.itemLevel, definition.minLevel)
  )
    throw new RangeError("Nível RPG insuficiente para esta receita.");
  if (
    definition.allowedCharacters &&
    !definition.allowedCharacters.includes(account.characterId)
  )
    throw new RangeError("Receita incompatível com este personagem.");
  if (recipe.requirements.some((r) => !account.flags.has(r.flagId)))
    throw new RangeError(
      "Conclua Os Ecos da Matéria para desbloquear esta receita.",
    );
}
export function checkedMaterialAmount(current: number, delta: number) {
  const next = current + delta;
  if (
    ![current, delta, next].every(Number.isSafeInteger) ||
    current < 0 ||
    current > 1000000000 ||
    next < 0 ||
    next > 1000000000
  )
    throw new RangeError(
      "Materiais insuficientes ou limite de saldo atingido.",
    );
  return next;
}
export function materialChanges(
  costs: readonly MaterialAmount[],
  gains: readonly MaterialAmount[] = [],
) {
  const changes = new Map<string, number>();
  for (const [rows, sign] of [
    [costs, -1],
    [gains, 1],
  ] as const)
    for (const row of rows) {
      if (
        !Number.isSafeInteger(row.amount) ||
        row.amount < 1 ||
        row.amount > 1000000000
      )
        throw new RangeError("Custo inválido.");
      changes.set(
        row.materialId,
        (changes.get(row.materialId) ?? 0) + sign * row.amount,
      );
    }
  return [...changes].sort(([a], [b]) => a.localeCompare(b));
}
export function forgeItemPlan(
  item: RpgEquipment,
  account: CraftingAccount,
  operation: "UPGRADE_ITEM" | "REFORGE_ITEM",
) {
  validateEquipment(item);
  const definition = equipmentDefinition(item.itemId);
  if (
    item.quantity !== 1 ||
    account.level < Math.max(item.level, definition.minLevel) ||
    (definition.allowedCharacters &&
      !definition.allowedCharacters.includes(account.characterId))
  )
    throw new RangeError(
      "Item incompatível com o personagem ou quantidade inválida.",
    );
  if (operation === "UPGRADE_ITEM") {
    if (item.rarity !== "COMMON" && item.rarity !== "RARE")
      throw new RangeError(
        "Este equipamento atingiu o limite de aprimoramento.",
      );
    const upgrade = FORGE_UPGRADES[item.rarity];
    if (account.level < upgrade.minLevel)
      throw new RangeError("Nível RPG insuficiente para este aprimoramento.");
    return { rarity: upgrade.rarity, materials: upgrade.materials };
  }
  if (item.rarity === "COMMON")
    throw new RangeError(
      "Equipamentos comuns não possuem affixes para reforjar.",
    );
  return { rarity: item.rarity, materials: FORGE_REFORGE[item.rarity] };
}
export function vendorSaleGold(item: RpgEquipment) {
  validateEquipment(item);
  if (
    item.quantity !== 1 ||
    !Object.hasOwn(RPG_ITEMS, item.itemId) ||
    !VENDOR_SELL_GOLD[item.rarity]
  )
    throw new RangeError("Este item não está disponível para venda.");
  return VENDOR_SELL_GOLD[item.rarity];
}
