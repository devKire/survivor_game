import "server-only";
import type { Prisma } from "../../../generated/prisma/client";
import {
  QUEST_DEFINITIONS,
  getQuestDefinition,
} from "../../../game/content/rpg/quests";
import { DIALOGUE_DEFINITIONS } from "../../../game/content/rpg/dialogues";
import { RPG_MATERIALS } from "../../../game/content/rpg";
import {
  objectiveCount,
  derivedQuestStatus,
  questScopeKey,
  validateQuestCatalog,
  type QuestRequirementContext,
  type QuestObjective,
} from "../../../game/core/rpg/quests";
import { collectQuestEvidence } from "./evidence";
import type { QuestJournalData, QuestRewardResult } from "./types";
validateQuestCatalog(QUEST_DEFINITIONS, DIALOGUE_DEFINITIONS);
export async function readQuestState(
  tx: Prisma.TransactionClient,
  userId: string,
) {
  const profile = await tx.rpgProfile.findUniqueOrThrow({
    where: { userId },
    include: { activeCharacter: true },
  });
  const quests = await tx.rpgQuestProgress.findMany({
    where: { userId },
    include: { proofs: true, rewardReceipt: true },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: 100,
  });
  const choices = await tx.rpgNarrativeChoice.findMany({
    where: { userId },
    take: 20,
  });
  const flags = await tx.rpgStoryFlag.findMany({
    where: { userId },
    take: 100,
  });
  return { profile, quests, choices, flags };
}
export type QuestState = Awaited<ReturnType<typeof readQuestState>>;
export function questContext(state: QuestState): QuestRequirementContext {
  return {
    activeCharacterId: state.profile.activeCharacter!.characterId,
    rewardedQuestIds: state.quests
      .filter((q) => q.status === "REWARDED")
      .map((q) => q.questId),
    activeQuestIds: state.quests
      .filter((q) => q.status === "ACTIVE")
      .map((q) => q.questId),
    completedQuestIds: state.quests
      .filter((q) => q.status === "COMPLETED" || q.status === "REWARDED")
      .map((q) => q.questId),
    completedObjectives: state.quests.flatMap((q) =>
      getQuestDefinition(q.questId, q.questVersion)
        .objectives.filter((o) => count(q, o) >= o.target)
        .map((o) => `${q.questId}:${o.id}`),
    ),
    choices: Object.fromEntries(state.choices.map((c) => [c.groupId, c.value])),
    storyFlags: state.flags.map((f) => f.flagId),
  };
}
export function count(q: QuestState["quests"][number], o: QuestObjective) {
  return objectiveCount(
    o,
    q.proofs
      .filter((p) => p.objectiveId === o.id)
      .map((p) => ({
        ...p,
        sourceKind: p.sourceKind as QuestObjective["kind"],
      })),
  );
}
/** At most five initial quests, 100 sources per objective. No live simulation IO. */
export async function reconcileQuestState(
  tx: Prisma.TransactionClient,
  userId: string,
  state: QuestState,
) {
  let changed = false;
  for (const q of state.quests) {
    if (q.status !== "ACTIVE") continue;
    const definition = getQuestDefinition(q.questId, q.questVersion);
    for (const objective of definition.objectives) {
      const remaining = objective.target - count(q, objective);
      if (!remaining) continue;
      const sources = await collectQuestEvidence(
        tx,
        userId,
        q,
        objective,
        q.proofs
          .filter((p) => p.objectiveId === objective.id)
          .map((p) => p.sourceId),
        remaining,
      );
      for (const source of sources) {
        const proof = await tx.rpgQuestObjectiveProof.create({
          data: {
            userId,
            questProgressId: q.id,
            objectiveId: objective.id,
            ...source,
          },
        });
        q.proofs.push(proof);
        changed = true;
      }
    }
    if (definition.objectives.every((o) => count(q, o) >= o.target)) {
      const now = new Date(Math.max(Date.now(), q.acceptedAt.getTime()));
      await tx.rpgQuestProgress.update({
        where: { id: q.id },
        data: { status: "COMPLETED", completedAt: now },
      });
      q.status = "COMPLETED";
      q.completedAt = now;
      changed = true;
    }
  }
  return changed;
}
const npcNames: Record<string, string> = {
  "refuge:guardian": "Guardião do Refúgio",
  "refuge:guide": "Orientador",
  "refuge:keeper": "Responsável pelo Depósito",
  "refuge:armorer": "Armeiro",
};
function label(o: QuestObjective) {
  switch (o.kind) {
    case "TALK_TO_NPC":
      return `Confirmar conversa com ${npcNames[o.npcId] ?? o.npcId}`;
    case "DISCOVER_POI":
      return "Registrar vestígios distintos nos Arredores das Ruínas (descobertas anteriores contam)";
    case "GATHER_RESOURCE":
      return `Coletar ${RPG_MATERIALS[o.materialId as keyof typeof RPG_MATERIALS]?.name ?? o.materialId} após aceitar`;
    case "COMPLETE_RPG_EXPEDITION":
      return "Iniciar e concluir uma nova Expedição RPG elegível";
    case "DEFEAT_BOSS":
      return `Derrotar ${o.bossId} em nova expedição elegível`;
  }
}
export function projectJournal(
  state: QuestState,
  cursor?: string,
): QuestJournalData {
  const context = questContext(state),
    active = context.activeCharacterId;
  const history = state.quests;
  const anchor = cursor ? history.findIndex((q) => q.id === cursor) : -1;
  if (cursor && anchor < 0) throw new RangeError("Histórico indisponível.");
  const page = history.slice(anchor + 1, anchor + 22);
  return {
    revision: state.profile.revision,
    activeCharacterId: active,
    quests: QUEST_DEFINITIONS.filter(
      (q, i, a) => a.findIndex((t) => t.id === q.id) === i,
    ).map((latest) => {
      const row = state.quests.find(
        (q) =>
          q.questId === latest.id &&
          q.scopeKey === questScopeKey(latest.scope, active),
      );
      const d = row
        ? getQuestDefinition(row.questId, row.questVersion)
        : latest;
      return {
        id: d.id,
        version: d.version,
        title: d.title,
        description: d.description,
        category: d.category,
        scope: d.scope,
        npcId: d.npcId,
        ...(d.regionId ? { regionId: d.regionId } : {}),
        characterId: row?.characterId ?? null,
        status: derivedQuestStatus(
          d,
          context,
          row?.status as "ACTIVE" | "COMPLETED" | "REWARDED" | undefined,
        ),
        objectives: d.objectives.map((o) => ({
          id: o.id,
          kind: o.kind,
          label: label(o),
          current: row ? count(row, o) : 0,
          target: o.target,
        })),
        requirements: d.requirements.map((r) =>
          "questId" in r
            ? `Concluir e resgatar: ${getQuestDefinition(r.questId).title}`
            : "Requisito narrativo",
        ),
        reward: d.reward,
        receipt:
          (row?.rewardReceipt?.result as unknown as QuestRewardResult) ?? null,
        acceptedAt: row?.acceptedAt.toISOString() ?? null,
        rewardedAt: row?.rewardedAt?.toISOString() ?? null,
      };
    }),
    choices: state.choices.map((c) => ({
      groupId: c.groupId,
      value: c.value,
      createdAt: c.createdAt.toISOString(),
    })),
    flags: context.storyFlags.slice(),
    history: page
      .slice(0, 20)
      .map((q) => ({
        id: q.id,
        questId: q.questId,
        title: getQuestDefinition(q.questId, q.questVersion).title,
        status: q.status,
        at: q.updatedAt.toISOString(),
      })),
    nextCursor: page.length > 20 ? page[19].id : null,
  };
}
