import "server-only";
import type { Prisma, RpgItemInstance } from "../../generated/prisma/client";
import {
  assertCanEquip,
  validateEquipment,
  type RpgItemSlot,
} from "../../game/core/rpg";
import { UserError } from "../security";

/** Explicit projection excludes owner, database timestamps and equipment links. */
export function rpgEquipmentData(
  row: Pick<
    RpgItemInstance,
    | "id"
    | "itemId"
    | "rarity"
    | "level"
    | "quantity"
    | "contentVersion"
    | "rollSeed"
    | "affixes"
  >,
) {
  return validateEquipment({
    id: row.id,
    itemId: row.itemId,
    rarity: row.rarity,
    level: row.level,
    quantity: row.quantity,
    contentVersion: row.contentVersion,
    rollSeed: row.rollSeed,
    affixes: row.affixes,
  });
}

export interface EquipmentIntent {
  operation: "EQUIP_ITEM" | "UNEQUIP_ITEM" | "REPLACE_EQUIPMENT";
  instanceId: string;
  slot: RpgItemSlot;
  expectedEquippedItemId?: string;
}

/** Internal only: caller owns the account lock, revision and receipt transaction. */
export async function applyEquipmentIntent(
  tx: Prisma.TransactionClient,
  userId: string,
  character: { id: string; characterId: string; level: number },
  intent: EquipmentIntent,
) {
  const row = await tx.rpgItemInstance.findFirst({
    where: { id: intent.instanceId, userId },
  });
  if (!row) throw new UserError("Equipamento indisponível nesta conta.");
  if (intent.operation === "UNEQUIP_ITEM") {
    if (
      row.equippedCharacterId !== character.id ||
      row.equippedSlot !== intent.slot
    )
      throw new UserError("O equipamento neste slot mudou. Atualize o perfil.");
    // Removal must remain possible if a future catalog retires an item or raises
    // a requirement. It cannot confer stats, items or currency.
    await tx.rpgItemInstance.update({
      where: { id: row.id, userId },
      data: { equippedCharacterId: null, equippedSlot: null },
    });
    return;
  }
  try {
    assertCanEquip(rpgEquipmentData(row), character, intent.slot);
  } catch (error) {
    if (error instanceof RangeError) throw new UserError(error.message);
    throw new UserError(
      "Dados do equipamento inválidos. Não foi possível equipar.",
    );
  }
  const current = await tx.rpgItemInstance.findFirst({
    where: {
      userId,
      equippedCharacterId: character.id,
      equippedSlot: intent.slot,
    },
  });
  if (
    intent.operation === "REPLACE_EQUIPMENT" &&
    current?.id !== intent.expectedEquippedItemId
  )
    throw new UserError("O equipamento neste slot mudou. Atualize o perfil.");
  if (current?.id === row.id)
    throw new UserError("Este item já está equipado neste personagem.");
  if (current)
    await tx.rpgItemInstance.update({
      where: { id: current.id, userId },
      data: { equippedCharacterId: null, equippedSlot: null },
    });
  // Updating the single instance also atomically releases its previous character.
  await tx.rpgItemInstance.update({
    where: { id: row.id, userId },
    data: { equippedCharacterId: character.id, equippedSlot: intent.slot },
  });
}
