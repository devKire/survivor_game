import "server-only";
import { z } from "zod";
import type { Prisma } from "../../../generated/prisma/client";
import { economyJson } from "../../economy";
import { UserError } from "../../security";
import { requireRpgQuestsEnabled } from "../guard";
import { rpgTransaction, lockRpgAccount } from "../transaction";
import { ensureRpgProfile } from "../profile";
import { rewardHash } from "../reward-integrity";
import { getQuestDefinition } from "../../../game/content/rpg/quests";
import {
  DIALOGUE_DEFINITIONS,
  getDialogueDefinition,
} from "../../../game/content/rpg/dialogues";
import { requirementsMet, questScopeKey } from "../../../game/core/rpg/quests";
import {
  rpgAttributesSchema,
  canAccessRpgCharacter,
} from "../../../game/core/rpg";
import { applyRpgProgressionXp } from "../../../game/core/rpg/xp-progression";
import {
  readQuestState,
  reconcileQuestState,
  projectJournal,
  questContext,
  count,
  type QuestState,
} from "./state";
import type {
  DialogueView,
  QuestMutationResult,
  QuestRewardResult,
} from "./types";
const common = {
  expectedRevision: z.number().int().min(1).max(2147483646),
  requestId: z.uuid(),
};
export const questCommandSchema = z
  .object({
    ...common,
    kind: z.enum(["ACCEPT", "CLAIM"]),
    questId: z.string().min(1).max(120),
  })
  .strict();
export const dialogueCommandSchema = z.discriminatedUnion("kind", [
  z
    .object({
      ...common,
      kind: z.literal("OPEN"),
      npcId: z.string().min(1).max(120),
    })
    .strict(),
  z
    .object({
      ...common,
      kind: z.literal("CHOOSE"),
      npcId: z.string().min(1).max(120),
      choiceId: z.string().min(1).max(80),
    })
    .strict(),
]);
function dialogueView(
  d: ReturnType<typeof getDialogueDefinition>,
  nodeId: string,
  state: QuestState,
): DialogueView {
  const node = d.nodes.find((n) => n.id === nodeId);
  if (!node) throw new Error("Unknown persisted dialogue node");
  const context = questContext(state);
  return {
    npcId: d.npcId,
    dialogueId: d.id,
    version: d.version,
    nodeId,
    text: node.text,
    terminal: !node.choices.length,
    choices: node.choices.map((c) => {
      const choice = c.effect?.kind === "CHOICE" ? c.effect : undefined;
      const prior = choice ? context.choices[choice.groupId] : undefined;
      const available =
        requirementsMet(node.requirements ?? [], context) &&
        requirementsMet(c.requirements ?? [], context) &&
        (!prior || prior === choice?.value);
      return {
        id: c.id,
        text: c.text,
        available,
        ...(!available
          ? {
              unavailableReason:
                "Etapa ou personagem indisponível; uma prioridade já escolhida não pode ser substituída.",
            }
          : {}),
      };
    }),
  };
}
type Mutation =
  z.infer<typeof questCommandSchema> | z.infer<typeof dialogueCommandSchema>;
async function mutate(
  userId: string,
  value: Mutation,
): Promise<QuestMutationResult> {
  requireRpgQuestsEnabled();
  const operation = `quest:${value.kind}`,
    payloadHash = rewardHash(value);
  return rpgTransaction(async (tx) => {
    requireRpgQuestsEnabled();
    const save = await lockRpgAccount(tx, userId);
    const prior = await tx.rpgMutationReceipt.findUnique({
      where: { userId_requestId: { userId, requestId: value.requestId } },
    });
    if (prior) {
      if (prior.operation !== operation || prior.payloadHash !== payloadHash)
        throw new UserError("requestId já utilizado por outra intenção.");
      return prior.result as unknown as QuestMutationResult;
    }
    await ensureRpgProfile(tx, userId, save);
    let state = await readQuestState(tx, userId);
    if (state.profile.revision !== value.expectedRevision)
      throw new UserError(
        "Seu perfil mudou em outra aba ou atividade. Atualize o diário e tente novamente.",
      );
    const revision = state.profile.revision + 1;
    await reconcileQuestState(tx, userId, state);
    let view: DialogueView | undefined;
    let message = "Registro confirmado.";
    if ("questId" in value) {
      let definition;
      try {
        definition = getQuestDefinition(value.questId);
      } catch {
        throw new UserError("Missão indisponível.");
      }
      const active = state.profile.activeCharacter!.characterId,
        scopeKey = questScopeKey(definition.scope, active);
      const progress = state.quests.find(
        (q) => q.questId === value.questId && q.scopeKey === scopeKey,
      );
      if (value.kind === "ACCEPT") {
        if (!progress) {
          if (!requirementsMet(definition.requirements, questContext(state)))
            throw new UserError("Conclua os requisitos desta missão primeiro.");
          await tx.rpgQuestProgress.create({
            data: {
              userId,
              questId: definition.id,
              questVersion: definition.version,
              scope: definition.scope,
              scopeKey,
              characterId: active,
              acceptedRevision: revision,
            },
          });
        }
        message = progress
          ? "Missão já aceita."
          : "Missão aceita. O personagem beneficiário foi registrado.";
      } else {
        if (!progress) throw new UserError("Aceite a missão primeiro.");
        definition = getQuestDefinition(
          progress.questId,
          progress.questVersion,
        );
        if (progress.rewardReceipt)
          message = "Esta recompensa já foi entregue.";
        else {
          if (
            progress.status !== "COMPLETED" ||
            !definition.objectives.every((o) => count(progress!, o) >= o.target)
          )
            throw new UserError(
              "Conclua todos os objetivos e confirme o relato com o NPC.",
            );
          if (!canAccessRpgCharacter(progress.characterId, save.unlocked))
            throw new UserError("Personagem beneficiário indisponível.");
          const receipt = await rewardQuest(
            tx,
            userId,
            progress.characterId,
            definition.reward,
          );
          await tx.rpgQuestProgress.update({
            where: { id: progress.id },
            data: {
              status: "REWARDED",
              rewardedAt: new Date(
                Math.max(Date.now(), progress.completedAt!.getTime()),
              ),
            },
          });
          await tx.rpgQuestRewardReceipt.create({
            data: {
              questProgressId: progress.id,
              userId,
              revision,
              result: economyJson(receipt),
            },
          });
          for (const flagId of definition.reward.flags)
            await tx.rpgStoryFlag.create({
              data: { userId, flagId, sourceProgressId: progress.id },
            });
          message = "Recompensa confirmada e salva na sua conta.";
        }
      }
    } else {
      const known = DIALOGUE_DEFINITIONS.find((d) => d.npcId === value.npcId);
      if (!known) throw new UserError("NPC indisponível.");
      const previous = await tx.rpgDialogueState.findUnique({
        where: { userId_npcId: { userId, npcId: value.npcId } },
      });
      const d = previous
        ? getDialogueDefinition(previous.dialogueId, previous.dialogueVersion)
        : known;
      let nodeId = d.entryNodeId;
      if (value.kind === "CHOOSE") {
        if (!previous) throw new UserError("Abra a conversa primeiro.");
        const node = d.nodes.find((n) => n.id === previous.nodeId)!;
        const choice = node.choices.find((c) => c.id === value.choiceId);
        if (
          !choice ||
          !dialogueView(d, node.id, state).choices.find(
            (c) => c.id === choice.id,
          )?.available
        )
          throw new UserError(
            "Resposta indisponível nesta etapa. Atualize a conversa.",
          );
        if (choice.effect?.kind === "CHOICE") {
          const effect = choice.effect;
          if (!state.choices.some((c) => c.groupId === effect.groupId))
            await tx.rpgNarrativeChoice.create({
              data: {
                userId,
                groupId: effect.groupId,
                value: effect.value,
                dialogueId: d.id,
                dialogueVersion: d.version,
                nodeId: node.id,
              },
            });
        }
        if (choice.effect?.kind === "TALK")
          for (const q of state.quests.filter((q) => q.status === "ACTIVE")) {
            for (const o of getQuestDefinition(q.questId, q.questVersion)
              .objectives) {
              if (
                o.kind === "TALK_TO_NPC" &&
                o.npcId === d.npcId &&
                o.nodeId === node.id &&
                count(q, o) < o.target
              )
                await tx.rpgQuestObjectiveProof.create({
                  data: {
                    userId,
                    questProgressId: q.id,
                    objectiveId: o.id,
                    sourceKind: o.kind,
                    sourceId: `${d.id}:${d.version}:${node.id}`,
                    quantity: 1,
                  },
                });
            }
          }
        nodeId = choice.nextNodeId;
        state = await readQuestState(tx, userId);
        const destination = d.nodes.find((n) => n.id === nodeId)!;
        if (
          !requirementsMet(destination.requirements ?? [], questContext(state))
        )
          throw new UserError("Destino da conversa indisponível.");
      }
      await tx.rpgDialogueState.upsert({
        where: { userId_npcId: { userId, npcId: d.npcId } },
        create: {
          userId,
          npcId: d.npcId,
          dialogueId: d.id,
          dialogueVersion: d.version,
          nodeId,
        },
        update: { nodeId },
      });
      await reconcileQuestState(tx, userId, await readQuestState(tx, userId));
      view = dialogueView(d, nodeId, await readQuestState(tx, userId));
    }
    // New accepts may already satisfy retroactive discoveries.
    await reconcileQuestState(tx, userId, await readQuestState(tx, userId));
    await tx.rpgProfile.update({ where: { userId }, data: { revision } });
    const result: QuestMutationResult = {
      journal: projectJournal(await readQuestState(tx, userId)),
      message,
      ...(view ? { dialogue: view } : {}),
    };
    await tx.rpgMutationReceipt.create({
      data: {
        userId,
        requestId: value.requestId,
        operation,
        payloadHash,
        revision,
        result: economyJson(result),
      },
    });
    return result;
  });
}
async function rewardQuest(
  tx: Prisma.TransactionClient,
  userId: string,
  characterId: string,
  reward: ReturnType<typeof getQuestDefinition>["reward"],
): Promise<QuestRewardResult> {
  for (const cost of reward.costs) {
    const changed = await tx.rpgMaterialBalance.updateMany({
      where: {
        userId,
        materialId: cost.materialId,
        amount: { gte: cost.quantity },
      },
      data: { amount: { decrement: cost.quantity } },
    });
    if (changed.count !== 1)
      throw new UserError(
        "Materiais insuficientes para a entrega. Nenhum custo foi consumido.",
      );
  }
  const character = await tx.rpgCharacter.findUniqueOrThrow({
    where: { userId_characterId: { userId, characterId } },
  });
  const next = applyRpgProgressionXp(
    {
      ...character,
      attributes: rpgAttributesSchema.parse(character.attributes),
    },
    reward.xp,
    100,
  );
  await tx.rpgCharacter.update({
    where: { id: character.id },
    data: {
      xp: next.xp,
      level: next.level,
      attributePoints: next.attributePoints,
    },
  });
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
    await tx.rpgMaterialBalance.upsert({
      where,
      create: { userId, materialId: grant.materialId, amount },
      update: { amount },
    });
    materials.push({
      materialId: grant.materialId,
      quantity,
      capped: quantity < grant.quantity,
    });
  }
  return {
    characterId,
    xpGranted: next.xpGranted,
    previousLevel: character.level,
    newLevel: next.level,
    pointsGranted: next.attributePoints - character.attributePoints,
    materials,
    costs: reward.costs.map((c) => ({ ...c })),
  };
}
export async function mutateQuest(userId: string, input: unknown) {
  return mutate(userId, questCommandSchema.parse(input));
}
export async function mutateDialogue(userId: string, input: unknown) {
  return mutate(userId, dialogueCommandSchema.parse(input));
}
