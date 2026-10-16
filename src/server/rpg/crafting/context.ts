import "server-only";
import type { Prisma } from "../../../generated/prisma/client";
import type { RpgCharacterId } from "../../../game/content/rpg/catalog";
import { getQuestDefinition } from "../../../game/content/rpg/quests";

/** Only a canonical flag backed by a rewarded quest and its durable receipt unlocks a recipe. */
export async function craftingAccountContext(
  tx: Prisma.TransactionClient,
  userId: string,
  character: { characterId: string; level: number },
) {
  const rows = await tx.rpgStoryFlag.findMany({
    where: { userId },
    include: {
      sourceProgress: {
        select: {
          status: true,
          questId: true,
          questVersion: true,
          rewardReceipt: { select: { questProgressId: true } },
        },
      },
    },
  });
  const flags = new Set<string>();
  for (const row of rows) {
    const source = row.sourceProgress;
    if (source.status !== "REWARDED" || !source.rewardReceipt) continue;
    try {
      if (
        getQuestDefinition(
          source.questId,
          source.questVersion,
        ).reward.flags.includes(row.flagId)
      )
        flags.add(row.flagId);
    } catch {
      /* Unknown/retired narrative versions fail closed. */
    }
  }
  return {
    characterId: character.characterId as RpgCharacterId,
    level: character.level,
    flags,
  };
}
