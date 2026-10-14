export type QuestStatus =
  "LOCKED" | "AVAILABLE" | "ACTIVE" | "COMPLETED" | "REWARDED";
export type QuestScope = "ACCOUNT" | "CHARACTER";
export type QuestRequirement =
  | {
      readonly kind: "QUEST_REWARDED" | "QUEST_ACTIVE" | "QUEST_COMPLETED";
      readonly questId: string;
    }
  | {
      readonly kind: "OBJECTIVE_COMPLETE";
      readonly questId: string;
      readonly objectiveId: string;
    }
  | { readonly kind: "STORY_FLAG"; readonly flagId: string }
  | {
      readonly kind: "CHOICE";
      readonly groupId: string;
      readonly value: string;
    }
  | { readonly kind: "CHOICE_MADE"; readonly groupId: string }
  | { readonly kind: "ACTIVE_CHARACTER"; readonly characterId: string };
export interface QuestRequirementContext {
  readonly rewardedQuestIds: readonly string[];
  readonly activeQuestIds: readonly string[];
  readonly completedQuestIds: readonly string[];
  readonly completedObjectives: readonly string[];
  readonly storyFlags: readonly string[];
  readonly choices: Readonly<Record<string, string>>;
  readonly activeCharacterId: string;
}
type ObjectiveBase = { readonly id: string; readonly target: number };
export type QuestObjective = ObjectiveBase &
  (
    | {
        readonly kind: "TALK_TO_NPC";
        readonly npcId: string;
        readonly nodeId: string;
      }
    | {
        readonly kind: "DISCOVER_POI";
        readonly regionId: string;
        readonly regionVersion: number;
        readonly definitionId?: string;
        readonly policy: "ALREADY_DISCOVERED_ALLOWED" | "AFTER_ACCEPTANCE_ONLY";
      }
    | {
        readonly kind: "GATHER_RESOURCE";
        readonly regionId: string;
        readonly regionVersion: number;
        readonly materialId: string;
        readonly policy: "AFTER_ACCEPTANCE_ONLY";
      }
    | {
        readonly kind: "COMPLETE_RPG_EXPEDITION";
        readonly profileId: string;
        readonly policy: "AFTER_ACCEPTANCE_ONLY";
      }
    | {
        readonly kind: "DEFEAT_BOSS";
        readonly profileId: string;
        readonly bossId: string;
        readonly policy: "AFTER_ACCEPTANCE_ONLY";
      }
  );
export interface QuestMaterial {
  readonly materialId: string;
  readonly quantity: number;
}
export interface QuestReward {
  readonly xp: number;
  readonly materials: readonly QuestMaterial[];
  readonly costs: readonly QuestMaterial[];
  readonly flags: readonly string[];
}
export interface QuestDefinition {
  readonly id: string;
  readonly version: number;
  readonly title: string;
  readonly description: string;
  readonly category: "MAIN" | "SIDE";
  readonly scope: QuestScope;
  readonly npcId: string;
  readonly regionId?: string;
  readonly requirements: readonly QuestRequirement[];
  readonly objectives: readonly QuestObjective[];
  readonly reward: QuestReward;
}
export type DialogueEffect =
  | {
      readonly kind: "CHOICE";
      readonly groupId: string;
      readonly value: string;
    }
  | { readonly kind: "TALK" };
export interface DialogueChoice {
  readonly id: string;
  readonly text: string;
  readonly nextNodeId: string;
  readonly requirements?: readonly QuestRequirement[];
  readonly effect?: DialogueEffect;
}
export interface DialogueNode {
  readonly id: string;
  readonly text: string;
  readonly requirements?: readonly QuestRequirement[];
  readonly choices: readonly DialogueChoice[];
}
export interface DialogueDefinition {
  readonly id: string;
  readonly version: number;
  readonly npcId: string;
  readonly entryNodeId: string;
  readonly nodes: readonly DialogueNode[];
}
export type QuestProofSource = QuestObjective["kind"];
export interface QuestObjectiveProof {
  readonly sourceKind: QuestProofSource;
  readonly sourceId: string;
  readonly quantity: number;
}
