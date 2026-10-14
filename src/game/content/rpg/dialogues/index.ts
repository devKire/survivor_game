import { freezeNarrative } from "../../../core/rpg/quests/content";
import type {
  DialogueDefinition,
  DialogueNode,
  QuestRequirement,
} from "../../../core/rpg/quests/types";
const active = (questId: string): QuestRequirement => ({
  kind: "QUEST_ACTIVE",
  questId,
});
const done = (questId: string, objectiveId: string): QuestRequirement => ({
  kind: "OBJECTIVE_COMPLETE",
  questId,
  objectiveId,
});
const back = { id: "back", text: "Voltar à conversa", nextNodeId: "welcome" };
const report = (
  id: string,
  text: string,
  requirements: QuestRequirement[],
): DialogueNode => ({
  id,
  text,
  requirements,
  choices: [
    {
      id: "confirm",
      text: "Confirmar relato",
      nextNodeId: "recorded",
      effect: { kind: "TALK" },
    },
  ],
});
const intro = "main:refuge-introduction",
  ruins = "main:ruins-remnants",
  matter = "main:material-echoes",
  recon = "side:ruins-reconnaissance",
  trial = "side:expedition-trial";
/** Proposed narrative, not a revision of existing character biographies. */
export const DIALOGUE_DEFINITIONS: readonly DialogueDefinition[] = [
  {
    id: "refuge-guardian",
    version: 1,
    npcId: "refuge:guardian",
    entryNodeId: "welcome",
    nodes: [
      {
        id: "welcome",
        text: "O Refúgio oferece uma pausa. Consulte seu diário, aceite uma missão e registre o que encontrar.",
        choices: [
          {
            id: "priority",
            text: "Escolher uma prioridade de investigação",
            nextNodeId: "priority",
            requirements: [active(intro)],
          },
          {
            id: "intro-report",
            text: "Relatar a orientação recebida",
            nextNodeId: "intro-confirm",
            requirements: [
              active(intro),
              done(intro, "guide-briefing"),
              { kind: "CHOICE_MADE", groupId: "investigation-priority" },
            ],
          },
          {
            id: "ruins-report",
            text: "Apresentar os vestígios",
            nextNodeId: "ruins-report",
            requirements: [active(ruins), done(ruins, "discover-remnant")],
          },
          {
            id: "remnants-memory",
            text: "Relembrar a prioridade: vestígios",
            nextNodeId: "remnants-memory",
            requirements: [
              {
                kind: "CHOICE",
                groupId: "investigation-priority",
                value: "REMNANTS",
              },
            ],
          },
          {
            id: "echoes-memory",
            text: "Relembrar a prioridade: ecos",
            nextNodeId: "echoes-memory",
            requirements: [
              {
                kind: "CHOICE",
                groupId: "investigation-priority",
                value: "ECHOES",
              },
            ],
          },
          {
            id: "nara",
            text: "Preparação de Vanguarda",
            nextNodeId: "nara",
            requirements: [{ kind: "ACTIVE_CHARACTER", characterId: "nara" }],
          },
        ],
      },
      {
        id: "priority",
        text: "Que orientação você deseja registrar? As duas permitem seguir o reconhecimento.",
        requirements: [active(intro)],
        choices: [
          {
            id: "remnants",
            text: "Começar pelos vestígios visíveis",
            nextNodeId: "remnants-memory",
            effect: {
              kind: "CHOICE",
              groupId: "investigation-priority",
              value: "REMNANTS",
            },
          },
          {
            id: "echoes",
            text: "Começar pelos ecos que percebemos",
            nextNodeId: "echoes-memory",
            effect: {
              kind: "CHOICE",
              groupId: "investigation-priority",
              value: "ECHOES",
            },
          },
          back,
        ],
      },
      {
        id: "remnants-memory",
        text: "Você priorizou os vestígios. Registre formas e caminhos antes de interpretar suas causas.",
        requirements: [
          {
            kind: "CHOICE",
            groupId: "investigation-priority",
            value: "REMNANTS",
          },
        ],
        choices: [back],
      },
      {
        id: "echoes-memory",
        text: "Você priorizou os ecos. Registre suas observações sem tomar uma impressão como explicação.",
        requirements: [
          {
            kind: "CHOICE",
            groupId: "investigation-priority",
            value: "ECHOES",
          },
        ],
        choices: [back],
      },
      {
        id: "nara",
        text: "Como Vanguarda, confira seu equipamento e observe os caminhos antes de partir. O diário guarda o próximo passo.",
        requirements: [{ kind: "ACTIVE_CHARACTER", characterId: "nara" }],
        choices: [back],
      },
      report(
        "intro-confirm",
        "Sua orientação está registrada. Confirme que consultou o diário e ouviu o Orientador.",
        [
          active(intro),
          done(intro, "guide-briefing"),
          { kind: "CHOICE_MADE", groupId: "investigation-priority" },
        ],
      ),
      report(
        "ruins-report",
        "Registremos os vestígios encontrados antes de dar um nome à causa.",
        [active(ruins), done(ruins, "discover-remnant")],
      ),
      {
        id: "recorded",
        text: "Relato registrado. Se todos os objetivos estiverem prontos, resgate a recompensa no diário.",
        choices: [back],
      },
    ],
  },
  {
    id: "refuge-guide",
    version: 1,
    npcId: "refuge:guide",
    entryNodeId: "welcome",
    nodes: [
      {
        id: "welcome",
        text: "O quadro prepara expedições; o portal leva aos arredores. Consulte o diário antes de partir.",
        choices: [
          {
            id: "briefing",
            text: "Ouvir a orientação inicial",
            nextNodeId: "briefing",
            requirements: [active(intro)],
          },
          {
            id: "recon-report",
            text: "Relatar o reconhecimento",
            nextNodeId: "recon-report",
            requirements: [active(recon), done(recon, "discover-remnants")],
          },
          {
            id: "trial-report",
            text: "Relatar a travessia",
            nextNodeId: "trial-report",
            requirements: [active(trial), done(trial, "complete-expedition")],
          },
        ],
      },
      report(
        "briefing",
        "Prepare seu personagem no Arsenal. Explore pelo portal e retorne ao Guardião quando decidir sua prioridade.",
        [active(intro)],
      ),
      report(
        "recon-report",
        "Três vestígios distintos ampliam nosso registro dos arredores.",
        [active(recon), done(recon, "discover-remnants")],
      ),
      report(
        "trial-report",
        "Sua travessia foi confirmada pela expedição. Vamos registrá-la.",
        [active(trial), done(trial, "complete-expedition")],
      ),
      {
        id: "recorded",
        text: "Registro confirmado. Consulte seu diário para o próximo passo.",
        choices: [back],
      },
    ],
  },
  {
    id: "refuge-keeper",
    version: 1,
    npcId: "refuge:keeper",
    entryNodeId: "welcome",
    nodes: [
      {
        id: "welcome",
        text: "Aqui guardamos materiais e equipamentos. As amostras da missão só serão consumidas no resgate confirmado.",
        choices: [
          {
            id: "materials-report",
            text: "Apresentar as amostras",
            nextNodeId: "materials-report",
            requirements: [
              active(matter),
              done(matter, "gather-ore"),
              done(matter, "gather-fiber"),
            ],
          },
        ],
      },
      report(
        "materials-report",
        "Quatro minérios e quatro fibras foram coletados após o pedido. Confirme o relato e entregue as amostras no diário.",
        [
          active(matter),
          done(matter, "gather-ore"),
          done(matter, "gather-fiber"),
        ],
      ),
      {
        id: "recorded",
        text: "As amostras poderão compor nosso registro. Esta etapa termina com a entrega; a forja ainda não está disponível.",
        choices: [back],
      },
    ],
  },
  {
    id: "refuge-armorer",
    version: 1,
    npcId: "refuge:armorer",
    entryNodeId: "welcome",
    nodes: [
      {
        id: "welcome",
        text: "Compare seus equipamentos antes de partir. O Arsenal continua disponível nos serviços do Refúgio.",
        choices: [],
      },
    ],
  },
];
freezeNarrative(DIALOGUE_DEFINITIONS);
export function getDialogueDefinition(id: string, version = 1) {
  const value = DIALOGUE_DEFINITIONS.find(
    (d) => d.id === id && d.version === version,
  );
  if (!value) throw new RangeError("Diálogo ou versão indisponível.");
  return value;
}
