import "server-only";
import { db } from "../../db";
import { UserError } from "../../security";
import { requireRpgSharedWorldEnabled } from "../guard";
import { lockRpgAccount, rpgTransaction } from "../transaction";
import { rewardHash } from "../reward-integrity";
import { gatheringIntent } from "../../../game/core/rpg/exploration/gathering";
import { applyGatheringClaim, applyDiscoveryProof } from "../exploration/claim";
import { assertCanonicalExplorationNode } from "../exploration/geometry";
import type { ExplorationNode } from "../../../game/core/rpg/exploration/types";
import type { ActiveGathering } from "../../../game/core/rpg/exploration/runtime";
import { gatheringCycle } from "../../../game/core/rpg/exploration/gathering";

async function authorizeVisit(
  tx: Parameters<Parameters<typeof rpgTransaction>[0]>[0],
  userId: string,
  visitId: string,
  epoch: string,
  assertLive: () => void,
) {
  requireRpgSharedWorldEnabled();
  assertLive();
  const visit = await tx.rpgWorldVisit.findUnique({ where: { id: visitId } });
  if (
    !visit ||
    visit.userId !== userId ||
    visit.activeUserId !== userId ||
    visit.epoch !== epoch ||
    visit.checkpointZone !== "ruins-outskirts"
  )
    throw new UserError("Presença inválida para exploração.");
  assertLive();
}
/** Only the coordinator can construct this live, timed evidence. No public grant action. */
export async function persistWorldGathering(
  userId: string,
  visitId: string,
  epoch: string,
  g: ActiveGathering,
  assertLive: () => void,
) {
  requireRpgSharedWorldEnabled();
  return rpgTransaction(async (tx) => {
    await lockRpgAccount(tx, userId);
    return applyGatheringClaim(
      tx,
      userId,
      g.node,
      g.cycle,
      g.intent,
      { worldVisitId: visitId },
      rewardHash({ kind: "WORLD_GATHER", ...g.intent }),
      () => authorizeVisit(tx, userId, visitId, epoch, assertLive),
      () => {
        requireRpgSharedWorldEnabled();
        assertLive();
      },
    );
  });
}
export async function persistWorldDiscovery(
  userId: string,
  visitId: string,
  epoch: string,
  node: ExplorationNode,
  assertLive: () => void,
) {
  requireRpgSharedWorldEnabled();
  assertCanonicalExplorationNode(node);
  if (node.kind !== "POI") throw new UserError("Local inválido.");
  return rpgTransaction(async (tx) => {
    await lockRpgAccount(tx, userId);
    await authorizeVisit(tx, userId, visitId, epoch, assertLive);
    return applyDiscoveryProof(tx, userId, node, () => {
      requireRpgSharedWorldEnabled();
      assertLive();
    });
  });
}
export async function readWorldResources(userId: string) {
  requireRpgSharedWorldEnabled();
  const cycle = gatheringCycle(Date.now());
  const [profile, claims, pois] = await db().$transaction(
    [
      db().rpgProfile.findUniqueOrThrow({
        where: { userId },
        select: { revision: true },
      }),
      db().rpgResourceClaim.findMany({
        where: { userId, cycle, regionId: "ruins-outskirts", regionVersion: 1 },
        select: { nodeId: true },
        take: 100,
      }),
      db().rpgDiscoveredPoi.findMany({
        where: { userId, regionId: "ruins-outskirts", regionVersion: 1 },
        select: { poiId: true },
        take: 100,
      }),
    ],
    { isolationLevel: "RepeatableRead" },
  );
  return {
    cycle,
    revision: profile.revision,
    depleted: claims.map((c) => c.nodeId),
    discovered: pois.map((p) => p.poiId),
  };
}
export async function worldGatheringReplay(userId: string, raw: unknown) {
  requireRpgSharedWorldEnabled();
  const intent = gatheringIntent.parse(raw);
  const prior = await db().rpgResourceClaim.findUnique({
    where: { userId_requestId: { userId, requestId: intent.requestId } },
  });
  if (
    prior &&
    (!prior.worldVisitId ||
      prior.payloadHash !== rewardHash({ kind: "WORLD_GATHER", ...intent }))
  )
    throw new UserError("Pedido já utilizado com outra intenção.");
  return prior
    ? {
        claimId: prior.id,
        nodeId: prior.nodeId,
        quantity: prior.quantity,
        materialId: prior.materialId,
        revision: prior.revision,
        cycle: prior.cycle,
      }
    : undefined;
}
