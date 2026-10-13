import { describe, it, expect } from "vitest";
import {
  QUEST_DEFINITIONS,
  getQuestDefinition,
} from "../src/game/content/rpg/quests";
import {
  DIALOGUE_DEFINITIONS,
  getDialogueDefinition,
} from "../src/game/content/rpg/dialogues";
import {
  validateQuestCatalog,
  objectiveCount,
  requirementsMet,
  assertQuestTransition,
  questScopeKey,
  type QuestDefinition,
} from "../src/game/core/rpg/quests";
import {
  applyRpgProgressionXp,
  applyRpgRewardXp,
} from "../src/game/core/rpg/xp-progression";
const empty = {
  rewardedQuestIds: [],
  activeQuestIds: [],
  completedQuestIds: [],
  completedObjectives: [],
  storyFlags: [],
  choices: {},
  activeCharacterId: "nara",
};
describe("versioned narrative domain", () => {
  it("resolves the complete five-quest arc and rejects unknown versions", () => {
    expect(() =>
      validateQuestCatalog(QUEST_DEFINITIONS, DIALOGUE_DEFINITIONS),
    ).not.toThrow();
    expect(QUEST_DEFINITIONS.filter((q) => q.category === "MAIN")).toHaveLength(
      3,
    );
    expect(QUEST_DEFINITIONS.filter((q) => q.category === "SIDE")).toHaveLength(
      2,
    );
    expect(() => getQuestDefinition("main:refuge-introduction", 2)).toThrow();
    expect(() => getDialogueDefinition("foreign")).toThrow();
  });
  it("rejects cycles, duplicate identities, unknown references and unsafe discovery policy", () => {
    const q = structuredClone(QUEST_DEFINITIONS) as QuestDefinition[];
    expect(() =>
      validateQuestCatalog([...q, q[0]], DIALOGUE_DEFINITIONS),
    ).toThrow();
    expect(() =>
      validateQuestCatalog(
        [
          {
            ...q[0],
            requirements: [{ kind: "QUEST_REWARDED", questId: q[2].id }],
          },
          ...q.slice(1),
        ],
        DIALOGUE_DEFINITIONS,
      ),
    ).toThrow("Ciclo");
    for (const objective of [
      { ...q[1].objectives[0], policy: "AFTER_ACCEPTANCE_ONLY" },
      { ...q[0].objectives[0], npcId: "foreign" },
      { kind: "CLIENT_XP", id: "fake", target: 1 },
    ])
      expect(() =>
        validateQuestCatalog(
          [{ ...q[0], objectives: [objective] } as QuestDefinition],
          DIALOGUE_DEFINITIONS,
        ),
      ).toThrow();
  });
  it("deduplicates one origin per objective, rejects forged source kinds and saturates targets", () => {
    const o = QUEST_DEFINITIONS[2].objectives[0];
    const p = {
      sourceKind: "GATHER_RESOURCE" as const,
      sourceId: "claim1",
      quantity: 2,
    };
    expect(objectiveCount(o, [p, p])).toBe(2);
    expect(
      objectiveCount(o, [
        p,
        { ...p, sourceId: "claim2" },
        { ...p, sourceId: "claim3" },
      ]),
    ).toBe(4);
    expect(() =>
      objectiveCount(o, [{ ...p, sourceKind: "DISCOVER_POI" }]),
    ).toThrow();
    expect(() => objectiveCount(o, [{ ...p, quantity: NaN }])).toThrow();
  });
  it("requires actual quest steps, character and immutable choice branches", () => {
    expect(
      requirementsMet(
        [{ kind: "ACTIVE_CHARACTER", characterId: "nara" }],
        empty,
      ),
    ).toBe(true);
    expect(
      requirementsMet([{ kind: "QUEST_ACTIVE", questId: "x" }], empty),
    ).toBe(false);
    expect(
      requirementsMet(
        [
          {
            kind: "CHOICE",
            groupId: "investigation-priority",
            value: "ECHOES",
          },
        ],
        { ...empty, choices: { "investigation-priority": "REMNANTS" } },
      ),
    ).toBe(false);
    expect(
      requirementsMet(
        [{ kind: "OBJECTIVE_COMPLETE", questId: "q", objectiveId: "o" }],
        { ...empty, completedObjectives: ["q:o"] },
      ),
    ).toBe(true);
    expect(() => assertQuestTransition("ACTIVE", "REWARDED")).toThrow();
    expect(() => assertQuestTransition("REWARDED", "ACTIVE")).toThrow();
    expect(questScopeKey("ACCOUNT", "orin")).toBe("ACCOUNT");
    expect(questScopeKey("CHARACTER", "orin")).toBe("orin");
  });
  it("preserves expedition XP cap and allocated attribute budgets at quest level-up", () => {
    const state = {
      level: 1,
      xp: 90,
      attributePoints: 0,
      attributes: { vitality: 0, power: 0, agility: 0, focus: 0, will: 0 },
    };
    const next = applyRpgProgressionXp(state, 20, 100);
    expect(next.level).toBe(2);
    expect(next.xpGranted).toBe(20);
    expect(next.attributePoints).toBeGreaterThan(0);
    expect(() => applyRpgRewardXp(state, 201)).toThrow();
    expect(() => applyRpgProgressionXp(state, 101, 100)).toThrow();
  });
  it("rejects missing dialogue destinations and excessive rewards", () => {
    const d = [...structuredClone(DIALOGUE_DEFINITIONS)];
    d[0] = { ...d[0], entryNodeId: "missing" };
    expect(() => validateQuestCatalog(QUEST_DEFINITIONS, d)).toThrow();
    expect(() =>
      validateQuestCatalog(
        [
          {
            ...QUEST_DEFINITIONS[0],
            reward: { ...QUEST_DEFINITIONS[0].reward, xp: 1001 },
          },
          ...QUEST_DEFINITIONS.slice(1),
        ],
        DIALOGUE_DEFINITIONS,
      ),
    ).toThrow();
  });
});
