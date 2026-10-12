import type { RefugeDialogue, RefugeTarget } from "../../core/rpg/refuge/types";
// Functional titles, not new canonical names or narrative quest flags.
export const REFUGE_DIALOGUES = {
  welcome: {
    id: "welcome",
    lines: [
      "Este fragmento estabilizado nos oferece um breve abrigo.",
      "A praça reúne os serviços. Prepare-se antes de atravessar o portal.",
    ],
    services: ["CHARACTER", "REWARDS"],
  },
  arsenal: {
    id: "arsenal",
    lines: ["Examine seus equipamentos e compare a build antes de partir."],
    services: ["EQUIPMENT"],
  },
  storage: {
    id: "storage",
    lines: [
      "Guardamos até 100 instâncias da sua conta. Desequipe antes de guardar.",
      "Materiais continuam no saldo da conta. Guardar um item não cria uma cópia.",
    ],
    services: ["STORAGE"],
  },
  expeditions: {
    id: "expeditions",
    lines: [
      "O quadro apresenta as expedições disponíveis.",
      "No lobby, confirme o personagem e aguarde todos ficarem prontos.",
    ],
    services: ["EXPEDITIONS"],
  },
} as const satisfies Record<string, RefugeDialogue>;
export const REFUGE_NPCS: readonly RefugeTarget[] = [
  {
    id: "refuge:guardian",
    name: "Guardião do Refúgio",
    x: 670,
    y: 620,
    radius: 90,
    collisionRadius: 14,
    visual: "npc",
    dialogueId: "welcome",
  },
  {
    id: "refuge:armorer",
    name: "Responsável pelo Arsenal",
    x: 325,
    y: 395,
    radius: 85,
    collisionRadius: 14,
    visual: "npc",
    dialogueId: "arsenal",
  },
  {
    id: "refuge:keeper",
    name: "Responsável pelo Depósito",
    x: 905,
    y: 395,
    radius: 85,
    collisionRadius: 14,
    visual: "npc",
    dialogueId: "storage",
  },
  {
    id: "refuge:guide",
    name: "Orientador de Expedições",
    x: 950,
    y: 655,
    radius: 85,
    collisionRadius: 14,
    visual: "npc",
    dialogueId: "expeditions",
  },
];
