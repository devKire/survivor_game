import "server-only";
import type { Prisma } from "../../../generated/prisma/client";
import {
  gatheringIntent,
  gatheringQuantity,
} from "../../../game/core/rpg/exploration/gathering";
import type { ExplorationNode } from "../../../game/core/rpg/exploration/types";
import { explorationRegion } from "../../../game/content/rpg/exploration-regions";
import { explorationResource } from "../../../game/content/rpg/exploration-resources";
import { UserError } from "../../security";
import { assertCanonicalExplorationNode } from "./geometry";
export type ClaimSource =
  | { sessionId: string; worldVisitId?: never }
  | { worldVisitId: string; sessionId?: never };
/** Shared grant implementation. Caller owns account lock and trusted source authorization. */
export async function applyGatheringClaim(
  tx: Prisma.TransactionClient,
  userId: string,
  node: ExplorationNode,
  cycle: number,
  raw: unknown,
  source: ClaimSource,
  payloadHash: string,
  authorize: () => Promise<void>,
  assertLive: () => void,
) {
  const intent = gatheringIntent.parse(raw);
  if (
    node.kind !== "RESOURCE" ||
    intent.nodeId !== node.id ||
    !Number.isInteger(cycle) ||
    cycle < 0 ||
    cycle > 1000000
  )
    throw new UserError("Coleta inválida.");
  assertCanonicalExplorationNode(node);
  const prior = await tx.rpgResourceClaim.findUnique({
    where: { userId_requestId: { userId, requestId: intent.requestId } },
  });
  if (prior) {
    if (prior.payloadHash !== payloadHash)
      throw new UserError("Pedido já utilizado com outra intenção.");
    return claimResult(prior);
  }
  await authorize();
  const region = explorationRegion(node.regionId, node.version);
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
    (await tx.rpgResourceClaim.count({ where: { userId, ...source } })) >=
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
  const quantity = gatheringQuantity(definition.quantity, balance?.amount ?? 0);
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
  assertLive();
  const result = claimResult(
    await tx.rpgResourceClaim.create({
      data: {
        ...source,
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
  assertLive();
  return result;
}
export function claimResult(row: {
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
export async function applyDiscoveryProof(
  tx: Prisma.TransactionClient,
  userId: string,
  node: ExplorationNode,
  assertLive: () => void,
) {
  assertCanonicalExplorationNode(node);
  if (node.kind !== "POI") throw new UserError("Local inválido.");
  assertLive();
  const inserted = await tx.rpgDiscoveredPoi.createMany({
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
  if (inserted.count)
    await tx.rpgProfile.update({
      where: { userId },
      data: { revision: { increment: 1 } },
    });
  assertLive();
  return node.id;
}
