import "server-only";
import { z } from "zod";
import type { Prisma } from "../../../generated/prisma/client";
import { EXPLORATION_RESOURCES } from "../../../game/content/rpg/exploration-resources";
import { explorationRegion } from "../../../game/content/rpg/exploration-regions";
import { RPG_REWARD_SOURCES } from "../../../game/content/rpg/reward-profiles";
import { generateExploration } from "../../../game/core/rpg/exploration/generation";
import type { ExplorationNode } from "../../../game/core/rpg/exploration/types";
import type { QuestObjective } from "../../../game/core/rpg/quests/types";
import {
  rewardEligibility,
  validateTerminalResult,
} from "../../../game/core/rpg/reward-policy";
import { freshSave } from "../../../game/core/save";
import { GameSimulation } from "../../../game/core/simulation";
import { rewardHash } from "../reward-integrity";

export interface QuestEvidenceProgress {
  id: string;
  scope: string;
  characterId: string;
  acceptedRevision: number;
  acceptedAt: Date;
}
export interface QuestEvidenceSource {
  sourceKind: QuestObjective["kind"];
  sourceId: string;
  quantity: number;
}

const MAX_CANDIDATES = 100;
// This projection validates only the fields used as evidence. The existing
// settlement remains the authority for equipment, materials and XP in a receipt.
const confirmedResult = z.object({
  version: z.literal(1),
  eligibility: z.literal("ELIGIBLE"),
  outcome: z.literal("VICTORY"),
  origins: z
    .array(
      z
        .object({
          source: z.enum(RPG_REWARD_SOURCES),
          eventId: z.string().min(1).max(160),
          tableId: z.string().min(1).max(60).nullable(),
          rolls: z.number().int().min(0).max(1),
        })
        .strict(),
    )
    .max(25),
});

let nodes: readonly ExplorationNode[] | undefined;
function canonicalNodes(regionId: string, regionVersion: number) {
  // The registry rejects unknown versions before the bounded, immutable cache
  // is consulted. A future region must provide its own canonical generation.
  const region = explorationRegion(regionId, regionVersion);
  if (!nodes) {
    const game = new GameSimulation(freshSave());
    game.start("nara", "normal", region.mapId, region.seed, region.maxSeconds);
    nodes = generateExploration(region, game.world);
  }
  return nodes;
}

/** Read durable authority only. The caller owns the account lock, transaction,
 * quest validation and unique proof inserts. No Team/session locks or writes
 * are acquired here. A bounded re-read (not a high-water cursor) lets a later
 * settlement or interrupted quest update become visible on the next reconcile.
 */
export async function collectQuestEvidence(
  tx: Prisma.TransactionClient,
  userId: string,
  progress: QuestEvidenceProgress,
  objective: QuestObjective,
  alreadyUsedSourceIds: readonly string[],
  remainingTarget = objective.target,
): Promise<QuestEvidenceSource[]> {
  if (
    !["ACCOUNT", "CHARACTER"].includes(progress.scope) ||
    !Number.isSafeInteger(progress.acceptedRevision) ||
    progress.acceptedRevision < 1 ||
    !Number.isSafeInteger(remainingTarget) ||
    remainingTarget < 0 ||
    remainingTarget > objective.target ||
    alreadyUsedSourceIds.length > MAX_CANDIDATES
  )
    throw new RangeError("Escopo ou limite de evidência inválido.");
  if (remainingTarget === 0 || objective.kind === "TALK_TO_NPC") return [];
  const used = new Set(alreadyUsedSourceIds);
  const result: QuestEvidenceSource[] = [];
  let remaining = remainingTarget;
  const append = (sourceId: string, quantity: number) => {
    if (
      remaining <= 0 ||
      used.has(sourceId) ||
      !Number.isSafeInteger(quantity) ||
      quantity <= 0
    )
      return;
    const counted = Math.min(quantity, remaining);
    result.push({ sourceKind: objective.kind, sourceId, quantity: counted });
    used.add(sourceId);
    remaining -= counted;
  };

  if (objective.kind === "DISCOVER_POI") {
    // Phase 5 stores first discovery by account, without character attribution
    // or a revision ordered by the account lock. A timestamp alone cannot turn
    // this into evidence of a post-acceptance action or a rediscovery.
    if (
      progress.scope !== "ACCOUNT" ||
      objective.policy !== "ALREADY_DISCOVERED_ALLOWED"
    )
      throw new RangeError(
        "Política de descoberta não suportada por esta origem.",
      );
    const validIds = canonicalNodes(objective.regionId, objective.regionVersion)
      .filter(
        (node) =>
          node.kind === "POI" &&
          (!objective.definitionId ||
            node.definitionId === objective.definitionId),
      )
      .map((node) => node.id)
      .filter((id) => !used.has(id));
    if (!validIds.length) return [];
    const rows = await tx.rpgDiscoveredPoi.findMany({
      where: {
        userId,
        regionId: objective.regionId,
        regionVersion: objective.regionVersion,
        poiId: { in: validIds, notIn: [...used] },
      },
      select: { poiId: true },
      orderBy: [{ discoveredAt: "asc" }, { poiId: "asc" }],
      take: Math.min(MAX_CANDIDATES, remaining),
    });
    for (const row of rows)
      if (validIds.includes(row.poiId)) append(row.poiId, 1);
    return result;
  }

  if (objective.kind === "GATHER_RESOURCE") {
    const definitions = new Set(
      EXPLORATION_RESOURCES.filter(
        (definition) => definition.materialId === objective.materialId,
      ).map((definition) => definition.id),
    );
    const validNodes = canonicalNodes(
      objective.regionId,
      objective.regionVersion,
    )
      .filter(
        (node) =>
          node.kind === "RESOURCE" && definitions.has(node.definitionId),
      )
      .map((node) => node.id);
    if (!validNodes.length) return [];
    const rows = await tx.rpgResourceClaim.findMany({
      where: {
        userId,
        regionId: objective.regionId,
        regionVersion: objective.regionVersion,
        rulesVersion: 1,
        materialId: objective.materialId,
        nodeId: { in: validNodes },
        quantity: { gt: 0 },
        revision: { gt: progress.acceptedRevision },
        id: { notIn: [...used] },
        ...(progress.scope === "CHARACTER"
          ? { participant: { characterId: progress.characterId } }
          : {}),
      },
      select: { id: true, quantity: true },
      orderBy: [{ revision: "asc" }, { id: "asc" }],
      take: Math.min(MAX_CANDIDATES, remaining),
    });
    for (const row of rows) append(row.id, row.quantity);
    return result;
  }

  const rows = await tx.rpgExpeditionParticipant.findMany({
    where: {
      userId,
      entryRevision: { gte: progress.acceptedRevision },
      eligibility: "ELIGIBLE",
      sessionId: { notIn: [...used] },
      ...(progress.scope === "CHARACTER"
        ? { characterId: progress.characterId }
        : {}),
      receipt: {
        is: {
          result: { path: ["eligibility"], equals: "ELIGIBLE" },
          ...(objective.kind === "DEFEAT_BOSS"
            ? {
                AND: [
                  {
                    result: {
                      path: ["origins"],
                      array_contains: [{ source: "BOSS_DEFEAT" }],
                    },
                  },
                ],
              }
            : {}),
        },
      },
      session: {
        status: "SETTLED",
        expeditionKind: "RPG_EXPEDITION",
        rewardVersion: 1,
        profileId: objective.profileId,
        session: { expeditionKind: "RPG_EXPEDITION", status: "COMPLETED" },
        ...(objective.kind === "DEFEAT_BOSS"
          ? {
              terminal: {
                path: ["events"],
                array_contains: [
                  { source: "BOSS_DEFEAT", definitionId: objective.bossId },
                ],
              },
            }
          : {}),
      },
    },
    select: {
      sessionId: true,
      userId: true,
      characterId: true,
      entryLevel: true,
      receipt: { select: { result: true, characterId: true } },
      session: { select: { terminal: true, terminalHash: true } },
    },
    orderBy: [{ createdAt: "asc" }, { sessionId: "asc" }],
    take: MAX_CANDIDATES,
  });
  for (const row of rows) {
    if (row.userId !== userId || row.receipt?.characterId !== row.characterId)
      continue;
    const receipt = confirmedResult.safeParse(row.receipt?.result);
    if (!receipt.success) continue;
    try {
      const terminal = validateTerminalResult(row.session.terminal);
      const participant = terminal.participants.find(
        (entry) =>
          entry.userId === userId &&
          entry.characterId === row.characterId &&
          entry.entryLevel === row.entryLevel,
      );
      if (
        rewardHash(terminal) !== row.session.terminalHash ||
        !participant ||
        rewardEligibility(terminal, participant) !== "ELIGIBLE"
      )
        continue;
      const origins = receipt.data.origins;
      if (
        new Set(origins.map((origin) => `${origin.source}:${origin.eventId}`))
          .size !== origins.length
      )
        continue;
      const confirmed =
        objective.kind === "COMPLETE_RPG_EXPEDITION"
          ? origins.some(
              (origin) =>
                origin.source === "EXPEDITION_COMPLETION" &&
                origin.eventId === "completion" &&
                origin.tableId === "completion-v1" &&
                origin.rolls === 1,
            )
          : terminal.events.some(
              (event) =>
                event.source === "BOSS_DEFEAT" &&
                event.definitionId === objective.bossId &&
                origins.some(
                  (origin) =>
                    origin.source === "BOSS_DEFEAT" &&
                    origin.eventId === event.eventId &&
                    origin.tableId === "boss-v1" &&
                    origin.rolls === 1,
                ),
            );
      // One session contributes at most once to an objective, even if several
      // matching bosses were defeated. Event IDs are checked, not client counts.
      if (confirmed) append(row.sessionId, 1);
    } catch (error) {
      // Malformed or inconsistent durable evidence must never complete a quest.
      // Database/transport errors happen outside this parsing block and propagate.
      if (!(error instanceof z.ZodError || error instanceof RangeError))
        throw error;
    }
    if (remaining === 0) break;
  }
  return result;
}
