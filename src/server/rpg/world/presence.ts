import "server-only";
import { randomUUID } from "node:crypto";
import { db } from "../../db";
import { UserError } from "../../security";
import { requireRpgSharedWorldEnabled } from "../guard";
import { ensureRpgProfile } from "../profile";
import { lockRpgAccount, rpgTransaction } from "../transaction";
import { buildRpgCombatLoadoutInTransaction } from "../loadout";
import type { WorldZoneId } from "../../../game/core/rpg/world/types";

export async function openWorldVisit(
  userId: string,
  authorityId: string,
  assertLive: () => void,
) {
  requireRpgSharedWorldEnabled();
  return rpgTransaction(async (tx) => {
    const save = await lockRpgAccount(tx, userId);
    requireRpgSharedWorldEnabled();
    assertLive();
    if (
      (await tx.teamMember.count({
        where: { userId, team: { status: "RUNNING" } },
      })) ||
      (await tx.arenaSeat.count({ where: { userId } })) ||
      (await tx.rpgExpeditionParticipant.count({
        where: { activeUserId: userId },
      })) ||
      (await tx.rpgExplorationParticipant.count({
        where: { activeUserId: userId },
      }))
    )
      throw new UserError(
        "Encerre a atividade atual antes de entrar no mundo.",
      );
    await ensureRpgProfile(tx, userId, save);
    const profile = await tx.rpgProfile.findUniqueOrThrow({
      where: { userId },
      include: { activeCharacter: true },
    });
    const active = profile.activeCharacter!;
    const last = await tx.rpgWorldVisit.findFirst({
      where: { userId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    await tx.rpgWorldVisit.updateMany({
      where: { activeUserId: userId },
      data: { activeUserId: null, endedAt: new Date() },
    });
    const zoneId = (last?.checkpointZone ?? "obelisk-refuge") as WorldZoneId;
    const loadout = await buildRpgCombatLoadoutInTransaction(
      tx,
      userId,
      active.characterId,
      save,
    );
    const visit = await tx.rpgWorldVisit.create({
      data: {
        userId,
        characterId: active.characterId,
        activeUserId: userId,
        authorityId,
        epoch: randomUUID(),
        checkpointZone: zoneId,
        entryRevision: profile.revision,
      },
    });
    assertLive();
    return {
      visit,
      loadout,
      xp: active.xp,
      revision: profile.revision,
      zoneId,
    };
  });
}
export async function checkpointWorldVisit(
  userId: string,
  visitId: string,
  epoch: string,
  zoneId: WorldZoneId,
  assertLive: () => void,
) {
  requireRpgSharedWorldEnabled();
  return rpgTransaction(async (tx) => {
    await lockRpgAccount(tx, userId);
    requireRpgSharedWorldEnabled();
    assertLive();
    const changed = await tx.rpgWorldVisit.updateMany({
      where: { id: visitId, activeUserId: userId },
      data: { epoch, checkpointZone: zoneId },
    });
    if (changed.count !== 1)
      throw new UserError("Presença expirada. Reconecte ao mundo.");
    assertLive();
  });
}
export async function closeWorldVisit(userId: string, visitId: string) {
  // Cleanup remains available when rollout is turned off.
  await db().rpgWorldVisit.updateMany({
    where: { id: visitId, activeUserId: userId },
    data: { activeUserId: null, endedAt: new Date() },
  });
}
export async function recoverWorldVisits() {
  // Called only after acquiring exclusive authority; never from a web request.
  await db().rpgWorldVisit.updateMany({
    where: { activeUserId: { not: null } },
    data: { activeUserId: null, endedAt: new Date() },
  });
}
