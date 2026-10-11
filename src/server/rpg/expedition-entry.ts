import "server-only";
import type { Prisma } from "../../generated/prisma/client";
import { RPG_EXPEDITION_V1 as policy } from "../../game/content/rpg/reward-profiles";
import { economyJson } from "../economy";
import { UserError } from "../security";
import { requireRpgExpeditionsEnabled } from "./guard";
import { lockRpgAccount } from "./transaction";
import { buildRpgCombatLoadoutInTransaction } from "./loadout";
import { createRewardSeed } from "./reward-seeds";
import { rewardHash } from "./reward-integrity";

/** Internal START hook. Same Serializable transaction and Team lock as session creation. */
export async function initializeRpgExpedition(
  tx: Prisma.TransactionClient,
  sessionId: string,
) {
  requireRpgExpeditionsEnabled();
  const session = await tx.gameSession.findUniqueOrThrow({
    where: { id: sessionId },
    include: { members: true },
  });
  if (
    session.expeditionKind !== "RPG_EXPEDITION" ||
    session.status !== "RUNNING" ||
    session.mapId !== policy.mapId ||
    session.mode !== policy.mode ||
    session.duration !== policy.duration ||
    session.partySize < 1 ||
    session.partySize > 5 ||
    session.members.length !== session.partySize
  )
    throw new UserError("Configuração de expedição RPG inválida.");
  const participants = [];
  for (const member of [...session.members].sort((a, b) =>
    a.userId < b.userId ? -1 : 1,
  )) {
    const save = await lockRpgAccount(tx, member.userId);
    if (
      await tx.rpgExpeditionParticipant.findFirst({
        where: {
          userId: member.userId,
          OR: [
            { activeUserId: member.userId },
            {
              createdAt: {
                gt: new Date(Date.now() - policy.startCooldownSeconds * 1000),
              },
            },
          ],
        },
      })
    )
      throw new UserError(
        "Um membro já está em expedição ou precisa aguardar um minuto para iniciar outra.",
      );
    const loadout = await buildRpgCombatLoadoutInTransaction(
      tx,
      member.userId,
      member.character,
      save,
    );
    participants.push({
      userId: member.userId,
      characterId: member.character,
      entryRevision: loadout.profileRevision,
      entryLevel: loadout.level,
      loadout: economyJson(loadout),
      loadoutHash: rewardHash(loadout),
      activeUserId: member.userId,
    });
  }
  return tx.rpgExpeditionSession.create({
    data: {
      sessionId,
      rewardSeed: createRewardSeed(),
      participants: { create: participants },
    },
  });
}
