import { requirementsMet } from "./requirements";
import type {
  QuestDefinition,
  QuestRequirementContext,
  QuestStatus,
} from "./types";

const NEXT: Readonly<Record<QuestStatus, QuestStatus | null>> = {
  LOCKED: "AVAILABLE",
  AVAILABLE: "ACTIVE",
  ACTIVE: "COMPLETED",
  COMPLETED: "REWARDED",
  REWARDED: null,
};
export function assertQuestTransition(
  from: QuestStatus,
  to: QuestStatus,
): void {
  if (!Object.hasOwn(NEXT, from) || NEXT[from] !== to)
    throw new Error("Transição de missão inválida.");
}
export function derivedQuestStatus(
  definition: QuestDefinition,
  context: QuestRequirementContext,
  stored?: "ACTIVE" | "COMPLETED" | "REWARDED",
): QuestStatus {
  return (
    stored ??
    (requirementsMet(definition.requirements, context) ? "AVAILABLE" : "LOCKED")
  );
}
export function questScopeKey(
  scope: "ACCOUNT" | "CHARACTER",
  characterId?: string,
): string {
  if (scope === "ACCOUNT") return "ACCOUNT";
  if (!characterId || !["nara", "orin", "ivo", "sena"].includes(characterId))
    throw new Error("Personagem de missão inválido.");
  return characterId;
}
