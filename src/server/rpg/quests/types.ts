import type { QuestReward, QuestStatus } from "../../../game/core/rpg/quests";
export interface QuestRewardResult {
  characterId: string;
  xpGranted: number;
  previousLevel: number;
  newLevel: number;
  pointsGranted: number;
  materials: { materialId: string; quantity: number; capped?: boolean }[];
  costs: { materialId: string; quantity: number }[];
}
export interface QuestJournalData {
  revision: number;
  activeCharacterId: string;
  quests: {
    id: string;
    version: number;
    title: string;
    description: string;
    category: "MAIN" | "SIDE";
    scope: "ACCOUNT" | "CHARACTER";
    status: QuestStatus;
    npcId: string;
    regionId?: string;
    characterId: string | null;
    objectives: {
      id: string;
      kind: string;
      label: string;
      current: number;
      target: number;
    }[];
    requirements: string[];
    reward: QuestReward;
    receipt: QuestRewardResult | null;
    acceptedAt: string | null;
    rewardedAt: string | null;
  }[];
  choices: { groupId: string; value: string; createdAt: string }[];
  flags: string[];
  history: {
    id: string;
    questId: string;
    title: string;
    status: string;
    at: string;
  }[];
  nextCursor: string | null;
}
export interface DialogueView {
  npcId: string;
  dialogueId: string;
  version: number;
  nodeId: string;
  text: string;
  choices: {
    id: string;
    text: string;
    available: boolean;
    unavailableReason?: string;
  }[];
  terminal: boolean;
}
export interface QuestMutationResult {
  journal: QuestJournalData;
  message: string;
  dialogue?: DialogueView;
}
