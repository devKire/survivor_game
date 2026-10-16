import { worldRewardHistory } from "../../server/rpg/world/rewards";
import {
  craftingCatalog,
  craftingCatalogInput,
  craftingHistory,
  craftingHistoryInput,
} from "../../server/rpg/crafting/catalog";
import { mutateCrafting } from "../../server/rpg/crafting/service";
import {
  craftingCommandSchema,
  isCraftingOperation,
} from "../../game/core/rpg/crafting/types";
import { craftingStation } from "../../game/core/rpg/crafting/rules";
import { requireRpgCraftingEnabled } from "../../server/rpg/guard";
import { recordCraftingMetric } from "../../server/rpg/crafting/metrics";
import { z } from "zod";
import { UserError } from "../../server/security";
import { WORLD_REFUGE as REFUGE } from "../../game/content/rpg/world-refuge";
import { withinWorldInteraction } from "../../game/core/rpg/world/rules";
import type { WorldOperation } from "../../game/network/world";
import { rpgProfileData } from "../../server/rpg/profile";
import {
  mutateRpgEquipment,
  selectRpgCharacter,
  allocateRpgAttributes,
} from "../../server/rpg/mutations";
import { transferRpgItem } from "../../server/rpg/storage";
import {
  mutateQuest,
  mutateDialogue,
  questCommandSchema,
  dialogueCommandSchema,
} from "../../server/rpg/quests/service";
import { rpgQuestJournal } from "../../server/rpg/quests/journal";
import { getQuestDefinition } from "../../game/content/rpg/quests";
import { withWorldServicePermit } from "../../server/rpg/world/service-context";
import type { WorldConnection, WorldPresence } from "./coordinator";

function near(p: WorldPresence, id: string) {
  const target = [...REFUGE.npcs, ...REFUGE.structures].find(
    (t) => t.id === id,
  );
  return (
    p.zone.zoneId === "obelisk-refuge" &&
    !!target &&
    withinWorldInteraction(p.avatar.player, target)
  );
}
export function authorizeWorldService(
  p: WorldPresence,
  operation: WorldOperation,
  args: unknown,
) {
  if (p.avatar.player.health <= 0)
    throw new UserError("Aguarde o retorno ao ponto seguro.");
  if (
    isCraftingOperation(operation) ||
    operation === "CRAFTING_CATALOG" ||
    operation === "CRAFTING_HISTORY"
  ) {
    requireRpgCraftingEnabled();
    let station: string;
    if (isCraftingOperation(operation)) {
      const parsed = craftingCommandSchema.safeParse(args);
      if (!parsed.success) {
        recordCraftingMetric("invalid-intent", operation);
        throw new UserError(
          "Pedido de estação inválido. Atualize os dados e tente novamente.",
        );
      }
      const command = parsed.data;
      if (command.operation !== operation)
        throw new UserError("Operação de estação inválida.");
      station = craftingStation(command.operation);
    } else
      station = (
        operation === "CRAFTING_CATALOG"
          ? craftingCatalogInput
          : craftingHistoryInput
      ).parse(args).stationId;
    if (!near(p, station)) {
      recordCraftingMetric("spatial-rejected", operation);
      throw new UserError(
        "Aproxime-se da estação no Refúgio para utilizar este serviço.",
      );
    }
  }
  if (
    ["CHARACTER", "ATTRIBUTES", "EQUIPMENT"].includes(operation) &&
    p.zone.zoneId !== "obelisk-refuge"
  )
    throw new UserError("Prepare sua build no Refúgio.");
  if (
    operation === "STORAGE" &&
    !near(p, "refuge:stash") &&
    !near(p, "refuge:keeper")
  )
    throw new UserError("Aproxime-se do Depósito.");
  if (operation === "DIALOGUE") {
    const v = dialogueCommandSchema.parse(args);
    if (!near(p, v.npcId))
      throw new UserError("Aproxime-se do NPC para conversar.");
  }
  if (operation === "QUEST") {
    const v = questCommandSchema.parse(args),
      definition = getQuestDefinition(v.questId);
    if (!near(p, definition.npcId))
      throw new UserError("Aproxime-se do responsável pela missão.");
  }
}
export async function executeWorldService(
  c: WorldConnection,
  p: WorldPresence,
  operation: WorldOperation,
  args: unknown,
  assertCurrent: () => void,
) {
  const assertLive = () => {
    assertCurrent();
    authorizeWorldService(p, operation, args);
  };
  assertLive();
  return withWorldServicePermit(
    { userId: c.userId, visitId: p.avatar.visitId, assertLive },
    async () => {
      if (operation === "CRAFTING_CATALOG")
        return craftingCatalog(c.userId, args);
      if (operation === "CRAFTING_HISTORY")
        return craftingHistory(c.userId, args);
      if (isCraftingOperation(operation)) return mutateCrafting(c.userId, args);
      if (operation === "PROFILE") {
        z.object({}).strict().parse(args);
        const profile = await rpgProfileData(c.userId);
        return { revision: profile.revision };
      }
      if (operation === "REWARDS") return worldRewardHistory(c.userId, args);
      if (operation === "JOURNAL") return rpgQuestJournal(c.userId, args);
      if (operation === "CHARACTER") return selectRpgCharacter(c.userId, args);
      if (operation === "ATTRIBUTES")
        return allocateRpgAttributes(c.userId, args);
      if (operation === "EQUIPMENT") return mutateRpgEquipment(c.userId, args);
      if (operation === "STORAGE") return transferRpgItem(c.userId, args);
      if (operation === "QUEST") return mutateQuest(c.userId, args);
      return mutateDialogue(c.userId, args);
    },
  );
}
