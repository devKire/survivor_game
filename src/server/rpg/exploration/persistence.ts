import "server-only";
import { assertCanonicalExplorationNode } from "./geometry";
import type { Prisma } from "../../../generated/prisma/client";
import {
  gatheringIntent,
  gatheringQuantity,
} from "../../../game/core/rpg/exploration/gathering";
import { explorationRegion } from "../../../game/content/rpg/exploration-regions";
import { explorationResource } from "../../../game/content/rpg/exploration-resources";
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
    const prior = await tx.rpgResourceClaim.findUnique({
      where: { userId_requestId: { userId, requestId: intent.requestId } },
    });
    if (prior) {
      if (prior.payloadHash !== payloadHash)
        throw new UserError("Pedido já utilizado com outra intenção.");
      return claimResult(prior);
    }
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
    const existing = await tx.rpgResourceClaim.findUnique({
      where: {
        userId_regionId_regionVersion_nodeId_cycle: {
          userId,
          regionId: region.id,
          regionVersion: region.version,
          nodeId: node.id,
          cycle,
        },
      },
    });
    if (existing) return claimResult(existing);
    const profile = await tx.rpgProfile.findUniqueOrThrow({
      where: { userId },
    });
    if (profile.revision !== intent.expectedRevision)
      throw new UserError(
        "O perfil RPG mudou. Atualize a exploração e tente novamente.",
      );
    if (
      (await tx.rpgResourceClaim.count({ where: { userId, cycle } })) >=
        region.claimsPerCycle ||
      (await tx.rpgResourceClaim.count({ where: { userId, sessionId } })) >=
        region.claimsPerSession
    )
      throw new UserError(
        "Limite de coletas atingido nesta sessão ou ciclo UTC.",
      );
    const definition = explorationResource(node.definitionId);
    const balance = await tx.rpgMaterialBalance.findUnique({
      where: {
        userId_materialId: { userId, materialId: definition.materialId },
      },
    });
    const quantity = gatheringQuantity(
      definition.quantity,
      balance?.amount ?? 0,
    );
    if (quantity) {
      await tx.rpgMaterialBalance.upsert({
        where: {
          userId_materialId: { userId, materialId: definition.materialId },
        },
        create: { userId, materialId: definition.materialId, amount: quantity },
        update: { amount: { increment: quantity } },
      });
      await tx.rpgProfile.update({
        where: { userId },
        data: { revision: { increment: 1 } },
      });
    }
    evidence.assertLive();
    return claimResult(
      await tx.rpgResourceClaim.create({
        data: {
          sessionId,
          userId,
          regionId: region.id,
          regionVersion: region.version,
          nodeId: node.id,
          cycle,
          requestId: intent.requestId,
          payloadHash,
          materialId: definition.materialId,
          quantity,
          revision: profile.revision + Number(quantity > 0),
        },
      }),
    );
  });
}
function claimResult(row: {
  id: string;
  nodeId: string;
  cycle: number;
  materialId: string;
  quantity: number;
  revision: number;
}) {
  return {
    claimId: row.id,
    nodeId: row.nodeId,
    cycle: row.cycle,
    materialId: row.materialId,
    quantity: row.quantity,
    revision: row.revision,
  };
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
    const created = await tx.rpgDiscoveredPoi.createMany({
      data: [
        {
          userId,
          regionId: node.regionId,
          regionVersion: node.version,
          poiId: node.id,
        },
      ],
      skipDuplicates: true,
    });
    if (created.count)
      await tx.rpgProfile.update({
        where: { userId },
        data: { revision: { increment: 1 } },
      });
    assertLive();
    return node.id;
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
