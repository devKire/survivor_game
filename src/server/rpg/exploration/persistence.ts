import { applyGatheringClaim, applyDiscoveryProof } from "./claim";
import "server-only";
import { assertCanonicalExplorationNode } from "./geometry";
import type { Prisma } from "../../../generated/prisma/client";
import { gatheringIntent } from "../../../game/core/rpg/exploration/gathering";
import { explorationRegion } from "../../../game/content/rpg/exploration-regions";
import type { ExplorationNode } from "../../../game/core/rpg/exploration/types";
import { requireRpgExplorationEnabled } from "../guard";
import { lockRpgAccount, rpgTransaction } from "../transaction";
import { rewardHash } from "../reward-integrity";
import { UserError } from "../../security";
import { db } from "../../db";

/** Internal evidence from the bound live simulation only. Never exported by an action. */
export interface GatheringEvidence {
  sessionId: string;
  userId: string;
  node: ExplorationNode;
  cycle: number;
  intent: ReturnType<typeof gatheringIntent.parse>;
  /** Recheck the live capability after asynchronous locks; throws if cancelled. */
  assertLive: () => void;
}
async function lockSession(tx: Prisma.TransactionClient, sessionId: string) {
  const game = await tx.gameSession.findUnique({ where: { id: sessionId } });
  if (!game || game.expeditionKind !== "RPG_EXPLORATION")
    throw new UserError("Exploração indisponível.");
  await tx.$queryRaw`SELECT id FROM limiar."Team" WHERE id=${game.teamId} FOR UPDATE`;
  await tx.$queryRaw`SELECT "sessionId" FROM limiar."RpgExplorationSession" WHERE "sessionId"=${sessionId} FOR UPDATE`;
  return tx.rpgExplorationSession.findUniqueOrThrow({
    where: { sessionId },
    include: { session: true },
  });
}
export async function persistGathering(evidence: GatheringEvidence) {
  requireRpgExplorationEnabled();
  const { sessionId, userId, node, cycle } = evidence,
    intent = gatheringIntent.parse(evidence.intent);
  if (
    node.kind !== "RESOURCE" ||
    intent.nodeId !== node.id ||
    !Number.isInteger(cycle) ||
    cycle < 0 ||
    cycle > 1000000
  )
    throw new UserError("Coleta inválida.");
  assertCanonicalExplorationNode(node);
  const payloadHash = rewardHash({ sessionId, ...intent });
  return rpgTransaction(async (tx) => {
    requireRpgExplorationEnabled();
    const s = await lockSession(tx, sessionId);
    await lockRpgAccount(tx, userId);
    return applyGatheringClaim(
      tx,
      userId,
      node,
      cycle,
      intent,
      { sessionId },
      payloadHash,
      async () => {
        const participant = await tx.rpgExplorationParticipant.findUnique({
          where: { sessionId_userId: { sessionId, userId } },
        });
        if (
          s.status !== "RUNNING" ||
          s.session.status !== "RUNNING" ||
          !participant?.activeUserId ||
          Date.now() - s.createdAt.getTime() > 900000
        )
          throw new UserError("Exploração encerrada.");
        const region = explorationRegion(s.regionId, s.regionVersion);
        if (node.regionId !== region.id || node.version !== region.version)
          throw new UserError("Região inválida.");
        evidence.assertLive();
      },
      evidence.assertLive,
    );
  });
}
export async function persistDiscovery(
  sessionId: string,
  userId: string,
  node: ExplorationNode,
  assertLive: () => void,
) {
  requireRpgExplorationEnabled();
  assertCanonicalExplorationNode(node);
  if (node.kind !== "POI") throw new UserError("Local inválido.");
  return rpgTransaction(async (tx) => {
    requireRpgExplorationEnabled();
    const s = await lockSession(tx, sessionId);
    await lockRpgAccount(tx, userId);
    const p = await tx.rpgExplorationParticipant.findUnique({
      where: { sessionId_userId: { sessionId, userId } },
    });
    if (
      s.status !== "RUNNING" ||
      s.session.status !== "RUNNING" ||
      !p?.activeUserId ||
      s.regionId !== node.regionId ||
      s.regionVersion !== node.version
    )
      throw new UserError("Exploração encerrada.");
    assertLive();
    return applyDiscoveryProof(tx, userId, node, assertLive);
  });
}
/** No reward on departure, timeout or recovery. Can run with rollout disabled. */
export async function closeExploration(
  sessionId: string,
  userId?: string,
  interrupted = false,
) {
  return db().$transaction(
    async (tx) => {
      const s = await lockSession(tx, sessionId);
      if (s.status !== "RUNNING") return;
      const now = new Date();
      await tx.rpgExplorationParticipant.updateMany({
        where: {
          sessionId,
          activeUserId: { not: null },
          ...(userId ? { userId } : {}),
        },
        data: { activeUserId: null, leftAt: now },
      });
      if (
        await tx.rpgExplorationParticipant.count({
          where: { sessionId, activeUserId: { not: null } },
        })
      )
        return;
      const status = interrupted ? "INTERRUPTED" : "COMPLETED";
      await tx.rpgExplorationSession.update({
        where: { sessionId },
        data: { status, endedAt: now },
      });
      await tx.gameSession.update({
        where: { id: sessionId },
        data: { status, endedAt: now },
      });
      await tx.team.update({
        where: { id: s.session.teamId },
        data: { status: "LOBBY" },
      });
      await tx.teamMember.updateMany({
        where: { teamId: s.session.teamId },
        data: { ready: false },
      });
    },
    { timeout: 20000 },
  );
}
export async function interruptLostExplorations() {
  for (const s of await db().rpgExplorationSession.findMany({
    where: { status: "RUNNING" },
    select: { sessionId: true },
  }))
    await closeExploration(s.sessionId, undefined, true);
}
