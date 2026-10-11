import "server-only";
import { randomUUID } from "node:crypto";
import { Player } from "../../game/core/entities";
import {
  createRpgCombatLoadout,
  equipmentDefinition,
  equipmentRequirement,
  previewRpgBuild,
  type CombatStats,
  type RpgEquipment,
} from "../../game/core/rpg";
import { rpgProfileData } from "./profile";
import { rpgEquipmentData } from "./equipment";

/** Projection from one consistent profile read; no owner IDs, receipts or dates. */
export function rpgPresentation(
  profile: Awaited<ReturnType<typeof rpgProfileData>>,
  compare?: { characterId: string; instanceId: string },
) {
  let comparison: {
    characterId: string;
    instanceId: string;
    revision: number;
    error: string;
    stats: CombatStats | null;
  } | null = null;
  const items = profile.items.filter((row) => row.location === "INVENTORY").map((row) => {
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
      requiredLevel: equipment ? equipmentRequirement(equipment) : null,
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
    if (compare?.characterId === character.characterId) {
      comparison = {
        ...compare,
        revision: profile.revision,
        error: "",
        stats: null,
      };
      try {
        const selected = items.find(
          (i) => i.id === compare.instanceId,
        )?.equipment;
        if (!selected || !loadout)
          throw new Error("Equipamento ou build indisponível.");
        const slot = equipmentDefinition(
          selected.itemId,
          selected.contentVersion,
        ).slot;
        const after = createRpgCombatLoadout({
          characterId: character.characterId,
          level: character.level,
          attributes: character.attributes,
          profileRevision: profile.revision,
          equipment: [
            ...loadout.equipment
              .filter((i) => i.slot !== slot)
              .map(({ slot: ignored, ...item }) => {
                void ignored;
                return item;
              }),
            selected,
          ],
        });
        comparison.stats = previewRpgBuild(base, after).effective;
      } catch (error) {
        comparison.error =
          error instanceof RangeError
            ? error.message
            : "Equipamento ou build indisponível.";
      }
    }
    return {
      characterId: character.characterId,
      level: character.level,
      base,
      preview: loadout ? previewRpgBuild(base, loadout) : null,
    };
  });
  return {
    items: items.map(({ equipment, ...item }) => ({
      ...item,
      equipment: equipment
        ? {
            id: equipment.id,
            itemId: equipment.itemId,
            rarity: equipment.rarity,
            level: equipment.level,
            quantity: equipment.quantity,
            contentVersion: equipment.contentVersion,
            affixes: equipment.affixes,
          }
        : null,
    })),
    characters,
    comparison: comparison as {
      characterId: string;
      instanceId: string;
      revision: number;
      error: string;
      stats: CombatStats | null;
    } | null,
  };
}
export type RpgPresentation = ReturnType<typeof rpgPresentation>;
