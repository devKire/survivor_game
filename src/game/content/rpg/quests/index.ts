import { freezeNarrative } from "../../../core/rpg/quests/content";
import type { QuestDefinition } from "../../../core/rpg/quests/types";

/** Proposed opening chapter: no new cosmology or protagonist biography. Published versions are immutable. */
export const QUEST_STORY_FLAGS = Object.freeze([
  "refuge-introduction-completed",
  "ruins-remnants-recorded",
  "material-samples-delivered",
  "ruins-reconnaissance-completed",
  "expedition-trial-completed",
] as const);
export const NARRATIVE_CHOICE_GROUPS = Object.freeze({
  "investigation-priority": Object.freeze(["REMNANTS", "ECHOES"] as const),
});
export const QUEST_DEFINITIONS: readonly QuestDefinition[] = [
  {
    id: "main:refuge-introduction",
    version: 1,
    title: "O Chamado do Refúgio",
    description:
      "Conheça a orientação do Refúgio e escolha por onde começar o reconhecimento. Volte ao Guardião para registrar sua decisão.",
    category: "MAIN",
    scope: "ACCOUNT",
    npcId: "refuge:guardian",
    requirements: [],
    objectives: [
      {
        id: "guide-briefing",
        kind: "TALK_TO_NPC",
        npcId: "refuge:guide",
        nodeId: "briefing",
        target: 1,
      },
      {
        id: "guardian-report",
        kind: "TALK_TO_NPC",
        npcId: "refuge:guardian",
        nodeId: "intro-confirm",
        target: 1,
      },
    ],
    reward: {
      xp: 20,
      materials: [{ materialId: "obelisk-dust", quantity: 1 }],
      costs: [],
      flags: ["refuge-introduction-completed"],
    },
  },
  {
    id: "main:ruins-remnants",
    version: 1,
    title: "Vestígios das Ruínas",
    description:
      "Reconheça vestígios nos Arredores das Ruínas. Descobertas anteriores continuam válidas; depois, apresente seu registro ao Guardião.",
    category: "MAIN",
    scope: "ACCOUNT",
    npcId: "refuge:guardian",
    regionId: "ruins-outskirts",
    requirements: [
      { kind: "QUEST_REWARDED", questId: "main:refuge-introduction" },
    ],
    objectives: [
      {
        id: "discover-remnant",
        kind: "DISCOVER_POI",
        regionId: "ruins-outskirts",
        regionVersion: 1,
        definitionId: "ruins-remnant",
        policy: "ALREADY_DISCOVERED_ALLOWED",
        target: 1,
      },
      {
        id: "guardian-report",
        kind: "TALK_TO_NPC",
        npcId: "refuge:guardian",
        nodeId: "ruins-report",
        target: 1,
      },
    ],
    reward: {
      xp: 35,
      materials: [{ materialId: "obelisk-dust", quantity: 2 }],
      costs: [],
      flags: ["ruins-remnants-recorded"],
    },
  },
  {
    id: "main:material-echoes",
    version: 1,
    title: "Os Ecos da Matéria",
    description:
      "Após aceitar, colete 4 Minérios Gastos e 4 Fibras das Ruínas. Leve as amostras ao Depósito: esses materiais serão entregues ao resgatar a recompensa.",
    category: "MAIN",
    scope: "ACCOUNT",
    npcId: "refuge:keeper",
    regionId: "ruins-outskirts",
    requirements: [{ kind: "QUEST_REWARDED", questId: "main:ruins-remnants" }],
    objectives: [
      {
        id: "gather-ore",
        kind: "GATHER_RESOURCE",
        regionId: "ruins-outskirts",
        regionVersion: 1,
        materialId: "weathered-ore",
        policy: "AFTER_ACCEPTANCE_ONLY",
        target: 4,
      },
      {
        id: "gather-fiber",
        kind: "GATHER_RESOURCE",
        regionId: "ruins-outskirts",
        regionVersion: 1,
        materialId: "ruins-fiber",
        policy: "AFTER_ACCEPTANCE_ONLY",
        target: 4,
      },
      {
        id: "keeper-report",
        kind: "TALK_TO_NPC",
        npcId: "refuge:keeper",
        nodeId: "materials-report",
        target: 1,
      },
    ],
    reward: {
      xp: 50,
      materials: [{ materialId: "echo-shard", quantity: 1 }],
      costs: [
        { materialId: "weathered-ore", quantity: 4 },
        { materialId: "ruins-fiber", quantity: 4 },
      ],
      flags: ["material-samples-delivered"],
    },
  },
  {
    id: "side:ruins-reconnaissance",
    version: 1,
    title: "Reconhecimento dos Arredores",
    description:
      "Registre três vestígios distintos nos Arredores das Ruínas e apresente o reconhecimento ao Orientador. Descobertas anteriores também contam.",
    category: "SIDE",
    scope: "ACCOUNT",
    npcId: "refuge:guide",
    regionId: "ruins-outskirts",
    requirements: [
      { kind: "QUEST_REWARDED", questId: "main:refuge-introduction" },
    ],
    objectives: [
      {
        id: "discover-remnants",
        kind: "DISCOVER_POI",
        regionId: "ruins-outskirts",
        regionVersion: 1,
        definitionId: "ruins-remnant",
        policy: "ALREADY_DISCOVERED_ALLOWED",
        target: 3,
      },
      {
        id: "guide-report",
        kind: "TALK_TO_NPC",
        npcId: "refuge:guide",
        nodeId: "recon-report",
        target: 1,
      },
    ],
    reward: {
      xp: 25,
      materials: [{ materialId: "obelisk-dust", quantity: 2 }],
      costs: [],
      flags: ["ruins-reconnaissance-completed"],
    },
  },
  {
    id: "side:expedition-trial",
    version: 1,
    title: "Prova da Travessia",
    description:
      "Após aceitar, conclua uma Expedição RPG nas Ruínas com participação elegível e recompensa confirmada. Relate a travessia ao Orientador.",
    category: "SIDE",
    scope: "ACCOUNT",
    npcId: "refuge:guide",
    requirements: [
      { kind: "QUEST_REWARDED", questId: "main:refuge-introduction" },
    ],
    objectives: [
      {
        id: "complete-expedition",
        kind: "COMPLETE_RPG_EXPEDITION",
        profileId: "ruins-v1",
        policy: "AFTER_ACCEPTANCE_ONLY",
        target: 1,
      },
      {
        id: "guide-report",
        kind: "TALK_TO_NPC",
        npcId: "refuge:guide",
        nodeId: "trial-report",
        target: 1,
      },
    ],
    reward: {
      xp: 60,
      materials: [{ materialId: "echo-shard", quantity: 1 }],
      costs: [],
      flags: ["expedition-trial-completed"],
    },
  },
];
freezeNarrative(QUEST_DEFINITIONS);
export function getQuestDefinition(id: string, version = 1): QuestDefinition {
  const definition = QUEST_DEFINITIONS.find(
    (q) => q.id === id && q.version === version,
  );
  if (!definition) throw new Error("Missão ou versão indisponível.");
  return definition;
}
