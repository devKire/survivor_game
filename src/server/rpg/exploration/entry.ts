import "server-only";
import type { Prisma } from "../../../generated/prisma/client";
import { EXPLORATION_RUINS as region } from "../../../game/content/rpg/exploration-regions";
import { economyJson } from "../../economy";
import { UserError } from "../../security";
import { requireRpgExplorationEnabled } from "../guard";
import { lockRpgAccount } from "../transaction";
import { buildRpgCombatLoadoutInTransaction } from "../loadout";
import { rewardHash } from "../reward-integrity";
/** Same Team lock and Serializable transaction as START. */
export async function initializeExploration(
  tx: Prisma.TransactionClient,
  sessionId: string,
) {
  requireRpgExplorationEnabled();
  const s = await tx.gameSession.findUniqueOrThrow({
    where: { id: sessionId },
    include: { members: true },
  });
  if (
    s.expeditionKind !== "RPG_EXPLORATION" ||
    s.status !== "RUNNING" ||
    s.seed !== region.seed ||
    s.mapId !== region.mapId ||
    s.mode !== "normal" ||
    s.duration !== region.maxSeconds ||
    s.partySize < 1 ||
    s.partySize > 5 ||
    s.members.length !== s.partySize
  )
    throw new UserError("Configuração de exploração inválida.");
  const participants = [];
  for (const m of [...s.members].sort((a, b) =>
    a.userId < b.userId ? -1 : 1,
  )) {
    const save = await lockRpgAccount(tx, m.userId);
    if (
      (await tx.rpgExpeditionParticipant.count({
        where: { activeUserId: m.userId },
      })) ||
      (await tx.rpgExplorationParticipant.count({
        where: { activeUserId: m.userId },
      }))
    )
      throw new UserError("Um participante já possui atividade RPG ativa.");
    const loadout = await buildRpgCombatLoadoutInTransaction(
      tx,
      m.userId,
      m.character,
      save,
    );
    participants.push({
      userId: m.userId,
      characterId: m.character,
      loadout: economyJson(loadout),
      loadoutHash: rewardHash(loadout),
      activeUserId: m.userId,
    });
  }
  return tx.rpgExplorationSession.create({
    data: {
      sessionId,
      regionId: region.id,
      regionVersion: region.version,
      participants: { create: participants },
    },
  });
}
