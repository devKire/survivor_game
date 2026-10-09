import "server-only";
import { randomUUID } from "node:crypto";
import { Player } from "../../game/core/entities";
import {
  createRpgCombatLoadout,
  equipmentDefinition,
  type RpgEquipment,
} from "../../game/core/rpg";
import { rpgProfileData } from "./profile";
import { rpgEquipmentData } from "./equipment";

/** Projection from one consistent profile read; no owner IDs, receipts or dates. */
export function rpgPresentation(
  profile: Awaited<ReturnType<typeof rpgProfileData>>,
) {
  const items = profile.items.map((row) => {
    let equipment: RpgEquipment | null = null;
    try {
      equipment = rpgEquipmentData(row);
    } catch {
      /* Retired/corrupt items remain removable. */
    }
    return {
      id: row.id,
      itemId: row.itemId,
      rarity: row.rarity,
      level: row.level,
      quantity: row.quantity,
      equipment,
      equippedCharacter:
        profile.characters.find((c) => c.id === row.equippedCharacterId)
          ?.characterId ?? null,
      equippedSlot: row.equippedSlot,
      requestId: randomUUID(),
    };
  });
  const characters = profile.characters.map((character) => {
    const player = new Player(character.characterId, {}, "PVE");
    const base = {
      ...player.stats,
      maxHealth: player.maxHealth,
      speed: player.speed,
      armor: player.armor,
    };
    let loadout = null;
    try {
      const rows = items.filter(
        (i) => i.equippedCharacter === character.characterId,
      );
      if (
        rows.some(
          (i) =>
            !i.equipment ||
            i.equippedSlot !==
              equipmentDefinition(i.itemId, i.equipment.contentVersion).slot,
        )
      )
        throw new Error("Invalid equipment");
      loadout = createRpgCombatLoadout({
        characterId: character.characterId,
        level: character.level,
        attributes: character.attributes,
        equipment: rows.map((i) => i.equipment!),
        profileRevision: profile.revision,
      });
    } catch {
      /* Do not display an estimated build that the server would reject. */
    }
    return {
      characterId: character.characterId,
      level: character.level,
      base,
      loadout,
    };
  });
  return { items, characters };
}
export type RpgPresentation = ReturnType<typeof rpgPresentation>;
