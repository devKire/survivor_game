import "server-only";
import {
  createRpgCombatLoadout,
  equipmentDefinition,
  rpgCharacterIdSchema,
} from "../../game/core/rpg";
import { rpgProfileData } from "./profile";
import { rpgEquipmentData } from "./equipment";
import { requireRpgEnabled } from "./guard";
import { UserError } from "../security";
import type { Prisma } from "../../generated/prisma/client";
import type { SaveData } from "../../game/core/types";
import {
  accessibleRpgCharacters,
  rpgAttributesSchema,
  validateRpgAttributes,
} from "../../game/core/rpg";
import { ensureRpgProfile } from "./profile";

/** Caller holds UserProgress FOR UPDATE. No nested transaction or unlocked read. */
export async function buildRpgCombatLoadoutInTransaction(
  tx: Prisma.TransactionClient,
  userId: string,
  characterId: string,
  save: SaveData,
) {
  const id = rpgCharacterIdSchema.parse(characterId);
  if (!accessibleRpgCharacters(save.unlocked).includes(id))
    throw new UserError("Personagem ainda não desbloqueado.");
  await ensureRpgProfile(tx, userId, save);
  const character = await tx.rpgCharacter.findUniqueOrThrow({
    where: { userId_characterId: { userId, characterId } },
  });
  const attributes = rpgAttributesSchema.parse(character.attributes);
  validateRpgAttributes({ ...character, attributes });
  const profile = await tx.rpgProfile.findUniqueOrThrow({ where: { userId } });
  const rows = await tx.rpgItemInstance.findMany({
    where: { userId, equippedCharacterId: character.id },
  });
  const equipment = rows.map((row) => {
    const item = rpgEquipmentData(row);
    if (
      row.location !== "INVENTORY" ||
      row.equippedSlot !==
      equipmentDefinition(item.itemId, item.contentVersion).slot
    )
      throw new UserError("Slot de equipamento inválido.");
    return item;
  });
  return createRpgCombatLoadout({
    characterId,
    level: character.level,
    attributes,
    equipment,
    profileRevision: profile.revision,
  });
}

/** Caller supplies the authenticated session participant, not a client loadout. */
export async function buildRpgCombatLoadout(
  userId: string,
  characterId: string,
) {
  requireRpgEnabled();
  rpgCharacterIdSchema.parse(characterId);
  const profile = await rpgProfileData(userId);
  const character = profile.characters.find(
    (c) => c.characterId === characterId,
  );
  if (!character) throw new UserError("Personagem RPG indisponível.");
  const equipment = profile.items
    .filter((i) => i.equippedCharacterId === character.id)
    .map((row) => {
      const item = rpgEquipmentData(row);
      if (
        row.location !== "INVENTORY" ||
      row.equippedSlot !==
        equipmentDefinition(item.itemId, item.contentVersion).slot
      )
        throw new UserError("Slot de equipamento inválido.");
      return item;
    });
  return createRpgCombatLoadout({
    characterId,
    level: character.level,
    attributes: character.attributes,
    equipment,
    profileRevision: profile.revision,
  });
}
