import type { QuestRequirement, QuestRequirementContext } from "./types";

export function requirementsMet(
  requirements: readonly QuestRequirement[],
  context: QuestRequirementContext,
): boolean {
  return requirements.every((r) => {
    switch (r.kind) {
      case "QUEST_REWARDED":
        return context.rewardedQuestIds.includes(r.questId);
      case "QUEST_ACTIVE":
        return context.activeQuestIds.includes(r.questId);
      case "QUEST_COMPLETED":
        return context.completedQuestIds.includes(r.questId);
      case "OBJECTIVE_COMPLETE":
        return context.completedObjectives.includes(
          `${r.questId}:${r.objectiveId}`,
        );
      case "STORY_FLAG":
        return context.storyFlags.includes(r.flagId);
      case "CHOICE":
        return (
          Object.hasOwn(context.choices, r.groupId) &&
          context.choices[r.groupId] === r.value
        );
      case "CHOICE_MADE":
        return Object.hasOwn(context.choices, r.groupId);
      case "ACTIVE_CHARACTER":
        return context.activeCharacterId === r.characterId;
    }
  });
}
