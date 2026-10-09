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
