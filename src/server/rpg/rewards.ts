import "server-only";
import { db } from "../db";
import { economyJson } from "../economy";
import {
  rpgAttributesSchema,
  validateCombatLoadout,
  type RpgCombatLoadout,
} from "../../game/core/rpg";
import { validateTerminalResult } from "../../game/core/rpg/reward-policy";
import { calculateRpgReward } from "../../game/core/rpg/reward-calculator";
import { applyRpgRewardXp } from "../../game/core/rpg/xp-progression";
import { requireRpgExpeditionsEnabled } from "./guard";
import { lockRpgAccount, rpgTransaction } from "./transaction";
import { deriveRewardRollSeed } from "./reward-seeds";
import { rewardHash } from "./reward-integrity";

/** No caller-supplied rewards. Only immutable, persisted authoritative terminals.
 * Lock order: Team -> expedition -> UserProgress (ascending userId).
 * Entire room (up to five users) and all receipts commit together.
 */
export async function settleRpgExpedition(sessionId: string) {
  requireRpgExpeditionsEnabled();
  const identity = await db().gameSession.findUniqueOrThrow({
    where: { id: sessionId },
    select: { teamId: true },
  });
  return rpgTransaction(async (tx) => {
    requireRpgExpeditionsEnabled();
    await tx.$queryRaw`SELECT id FROM limiar."Team" WHERE id=${identity.teamId} FOR UPDATE`;
    await tx.$queryRaw`SELECT "sessionId" FROM limiar."RpgExpeditionSession" WHERE "sessionId"=${sessionId} FOR UPDATE`;
    const expedition = await tx.rpgExpeditionSession.findUniqueOrThrow({
      where: { sessionId },
      include: {
        session: true,
        participants: {
          orderBy: { userId: "asc" },
          include: { receipt: true },
        },
      },
    });
    if (expedition.status === "SETTLED")
      return expedition.participants.map((p) => p.receipt!);
    if (
      expedition.status !== "TERMINAL" ||
      expedition.session.status !== "RUNNING" ||
      expedition.session.expeditionKind !== "RPG_EXPEDITION" ||
      expedition.rewardVersion !== 1 ||
      expedition.profileId !== "ruins-v1"
    )
      throw new Error("RPG settlement unavailable");
    const terminal = validateTerminalResult(expedition.terminal);
    if (
      rewardHash(terminal) !== expedition.terminalHash ||
      terminal.participants.length !== expedition.participants.length ||
      expedition.session.partySize !== expedition.participants.length ||
      expedition.participants.some((p) => p.receipt)
    )
      throw new Error("RPG terminal integrity failure");
    const receipts = [];
    for (const participant of expedition.participants) {
      const userId = participant.userId,
        frozen = validateCombatLoadout(
          participant.loadout as unknown as RpgCombatLoadout,
        );
      if (
        rewardHash(frozen) !== participant.loadoutHash ||
        frozen.characterId !== participant.characterId ||
        frozen.level !== participant.entryLevel ||
        frozen.profileRevision !== participant.entryRevision ||
        !terminal.participants.some(
          (p) =>
            p.userId === userId &&
            p.characterId === participant.characterId &&
            p.entryLevel === participant.entryLevel,
        )
      )
        throw new Error("RPG participant integrity failure");
      await lockRpgAccount(tx, userId);
      const reward = calculateRpgReward(
        terminal,
        userId,
        (source, eventId, index, version) =>
          deriveRewardRollSeed(
            expedition.rewardSeed,
            sessionId,
            userId,
            source,
            eventId,
            index,
            version,
          ),
      );
      const character = await tx.rpgCharacter.findUniqueOrThrow({
        where: {
          userId_characterId: { userId, characterId: participant.characterId },
        },
      });
      const next = applyRpgRewardXp(
        {
          ...character,
          attributes: rpgAttributesSchema.parse(character.attributes),
        },
        reward.xp,
      );
      const materials = [];
      for (const grant of reward.materials) {
        const where = {
          userId_materialId: { userId, materialId: grant.materialId },
        };
        const prior = await tx.rpgMaterialBalance.findUnique({ where });
        const amount = Math.min(
            1_000_000_000,
            (prior?.amount ?? 0) + grant.quantity,
          ),
          quantity = amount - (prior?.amount ?? 0);
        if (quantity)
          await tx.rpgMaterialBalance.upsert({
            where,
            create: { userId, materialId: grant.materialId, amount },
            update: { amount },
          });
        materials.push({
          ...grant,
          quantity,
          capped: quantity < grant.quantity,
        });
      }
      for (const item of reward.equipment)
        await tx.rpgItemInstance.create({
          data: { ...item, userId, affixes: economyJson(item.affixes) },
        });
      const changed =
        next.xpGranted > 0 ||
        next.level !== character.level ||
        materials.some((m) => m.quantity > 0) ||
        reward.equipment.length > 0;
      if (changed) {
        await tx.rpgCharacter.update({
          where: { id: character.id },
          data: {
            xp: next.xp,
            level: next.level,
            attributePoints: next.attributePoints,
          },
        });
        await tx.rpgProfile.update({
          where: { userId },
          data: { revision: { increment: 1 } },
        });
      }
      // Explicit public projection: neither the root seed nor derived roll seeds leave this module.
      const result = {
        version: 1,
        eligibility: reward.eligibility,
        outcome: terminal.outcome,
        xpOffered: reward.xp,
        materials,
        equipment: reward.equipment.map((item) => ({
          id: item.id,
          itemId: item.itemId,
          rarity: item.rarity,
          level: item.level,
          quantity: item.quantity,
          contentVersion: item.contentVersion,
          affixes: item.affixes,
        })),
        origins: reward.origins,
      };
      receipts.push(
        await tx.rpgRewardReceipt.create({
          data: {
            sessionId,
            userId,
            characterId: participant.characterId,
            xpGranted: next.xpGranted,
            previousLevel: character.level,
            newLevel: next.level,
            pointsGranted: next.attributePoints - character.attributePoints,
            result: economyJson(result),
          },
        }),
      );
      await tx.rpgExpeditionParticipant.update({
        where: { sessionId_userId: { sessionId, userId } },
        data: { activeUserId: null, eligibility: reward.eligibility },
      });
      await tx.gameSessionMember.update({
        where: { sessionId_userId: { sessionId, userId } },
        data: {
          survived: terminal.outcome === "VICTORY",
          result: economyJson({
            rpgReceipt: true,
            eligibility: reward.eligibility,
          }),
        },
      });
    }
    const endedAt = new Date();
    await tx.rpgExpeditionSession.update({
      where: { sessionId },
      data: { status: "SETTLED", settledAt: endedAt },
    });
    await tx.gameSession.update({
      where: { id: sessionId },
      data: {
        status: "COMPLETED",
        endedAt,
        result: economyJson({
          expeditionKind: "RPG_EXPEDITION",
          completed: terminal.outcome === "VICTORY",
        }),
      },
    });
    await tx.team.update({
      where: { id: identity.teamId },
      data: { status: "LOBBY" },
    });
    await tx.teamMember.updateMany({
      where: { teamId: identity.teamId },
      data: { ready: false },
    });
    return receipts;
  });
}
