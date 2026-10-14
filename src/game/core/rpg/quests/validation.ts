import type {
  QuestDefinition,
  DialogueDefinition,
  QuestRequirement,
} from "./types";
import { RPG_MATERIALS } from "../../../content/rpg";
const npcs = [
  "refuge:guardian",
  "refuge:guide",
  "refuge:keeper",
  "refuge:armorer",
];
const identifier = /^[a-z0-9][a-z0-9:_-]{0,119}$/;
export function validateQuestCatalog(
  quests: readonly QuestDefinition[],
  dialogues: readonly DialogueDefinition[],
) {
  const unique = (ids: readonly string[]) => {
    if (new Set(ids).size !== ids.length)
      throw new RangeError("Identidade duplicada.");
  };
  unique(quests.map((q) => `${q.id}@${q.version}`));
  unique(dialogues.map((d) => `${d.id}@${d.version}`));
  const declaredFlags = new Set(quests.flatMap((q) => q.reward.flags));
  const requirements = (rs: readonly QuestRequirement[]) => {
    if (rs.length > 20) throw new RangeError("Requisitos excessivos.");
    for (const r of rs) {
      if (
        ![
          "QUEST_REWARDED",
          "QUEST_ACTIVE",
          "QUEST_COMPLETED",
          "OBJECTIVE_COMPLETE",
          "STORY_FLAG",
          "CHOICE",
          "CHOICE_MADE",
          "ACTIVE_CHARACTER",
        ].includes(r.kind)
      )
        throw new RangeError("Requisito desconhecido.");
      if (r.kind === "STORY_FLAG" && !declaredFlags.has(r.flagId))
        throw new RangeError("Flag desconhecida.");
      if (
        (r.kind === "CHOICE" || r.kind === "CHOICE_MADE") &&
        (r.groupId !== "investigation-priority" ||
          (r.kind === "CHOICE" && !["REMNANTS", "ECHOES"].includes(r.value)))
      )
        throw new RangeError("Escolha desconhecida.");
      if ("questId" in r && !quests.some((q) => q.id === r.questId))
        throw new RangeError("Missão referenciada desconhecida.");
      if (
        r.kind === "OBJECTIVE_COMPLETE" &&
        !quests.some(
          (q) =>
            q.id === r.questId &&
            q.objectives.some((o) => o.id === r.objectiveId),
        )
      )
        throw new RangeError("Objetivo desconhecido.");
      if (
        r.kind === "ACTIVE_CHARACTER" &&
        !["nara", "orin", "ivo", "sena"].includes(r.characterId)
      )
        throw new RangeError("Personagem desconhecido.");
    }
  };
  for (const q of quests) {
    if (
      !identifier.test(q.id) ||
      !Number.isInteger(q.version) ||
      q.version < 1 ||
      !npcs.includes(q.npcId) ||
      !["ACCOUNT", "CHARACTER"].includes(q.scope) ||
      q.objectives.length < 1 ||
      q.objectives.length > 10
    )
      throw new RangeError("Missão inválida.");
    unique(q.objectives.map((o) => o.id));
    unique(q.reward.flags);
    if (
      q.reward.flags.length > 5 ||
      q.reward.flags.some((flag) => !identifier.test(flag))
    )
      throw new RangeError("Flag inválida.");
    requirements(q.requirements);
    if (!Number.isInteger(q.reward.xp) || q.reward.xp < 0 || q.reward.xp > 100)
      throw new RangeError("XP de missão inválido.");
    for (const group of [q.reward.materials, q.reward.costs]) {
      unique(group.map((m) => m.materialId));
      for (const m of group)
        if (
          !Object.hasOwn(RPG_MATERIALS, m.materialId) ||
          !Number.isInteger(m.quantity) ||
          m.quantity < 1 ||
          m.quantity > 20
        )
          throw new RangeError("Material de missão inválido.");
    }
    for (const o of q.objectives) {
      if (
        !identifier.test(o.id) ||
        !Number.isInteger(o.target) ||
        o.target < 1 ||
        o.target > 100
      )
        throw new RangeError("Objetivo inválido.");
      switch (o.kind) {
        case "TALK_TO_NPC":
          if (
            o.target !== 1 ||
            !dialogues.some(
              (d) =>
                d.npcId === o.npcId &&
                d.nodes.some(
                  (n) =>
                    n.id === o.nodeId &&
                    n.choices.some((c) => c.effect?.kind === "TALK"),
                ),
            )
          )
            throw new RangeError("Conversa sem autoridade.");
          break;
        case "DISCOVER_POI":
          if (
            q.scope !== "ACCOUNT" ||
            o.policy !== "ALREADY_DISCOVERED_ALLOWED" ||
            o.regionId !== "ruins-outskirts" ||
            o.regionVersion !== 1 ||
            (o.definitionId !== undefined && o.definitionId !== "ruins-remnant")
          )
            throw new RangeError("Política de descoberta incompatível.");
          break;
        case "GATHER_RESOURCE":
          if (
            o.policy !== "AFTER_ACCEPTANCE_ONLY" ||
            o.regionId !== "ruins-outskirts" ||
            o.regionVersion !== 1 ||
            !["weathered-ore", "ruins-fiber", "obelisk-dust"].includes(
              o.materialId,
            )
          )
            throw new RangeError("Coleta inválida.");
          break;
        case "COMPLETE_RPG_EXPEDITION":
        case "DEFEAT_BOSS":
          if (
            o.profileId !== "ruins-v1" ||
            o.policy !== "AFTER_ACCEPTANCE_ONLY" ||
            (o.kind === "DEFEAT_BOSS" && !/^boss:[0-9]$/.test(o.bossId))
          )
            throw new RangeError("Expedição inválida.");
          break;
        default:
          throw new RangeError("Tipo de objetivo desconhecido.");
      }
    }
  }
  const walk = (id: string, path: Set<string>) => {
    if (path.has(id)) throw new RangeError("Ciclo de dependências.");
    const next = new Set(path).add(id);
    for (const q of quests.filter((q) => q.id === id))
      for (const r of q.requirements) if ("questId" in r) walk(r.questId, next);
  };
  for (const q of quests) walk(q.id, new Set());
  for (const d of dialogues) {
    if (
      !npcs.includes(d.npcId) ||
      !identifier.test(d.id) ||
      d.version < 1 ||
      !Number.isInteger(d.version) ||
      !d.nodes.some((n) => n.id === d.entryNodeId)
    )
      throw new RangeError("Diálogo inválido.");
    unique(d.nodes.map((n) => n.id));
    for (const n of d.nodes) {
      if (
        !identifier.test(n.id) ||
        !n.text.trim() ||
        n.text.length > 2000 ||
        n.choices.length > 12
      )
        throw new RangeError("Nó de diálogo inválido.");
      requirements(n.requirements ?? []);
      unique(n.choices.map((c) => c.id));
      for (const c of n.choices) {
        if (
          !identifier.test(c.id) ||
          !c.text.trim() ||
          c.text.length > 200 ||
          (c.effect && !["CHOICE", "TALK"].includes(c.effect.kind))
        )
          throw new RangeError("Resposta de diálogo inválida.");
        requirements(c.requirements ?? []);
        if (!d.nodes.some((t) => t.id === c.nextNodeId))
          throw new RangeError("Destino de diálogo inexistente.");
        if (
          c.effect?.kind === "CHOICE" &&
          (c.effect.groupId !== "investigation-priority" ||
            !["REMNANTS", "ECHOES"].includes(c.effect.value))
        )
          throw new RangeError("Escolha desconhecida.");
      }
    }
    // Back links may form cycles. Every node must be reachable from the entry.
    const visited = new Set<string>(),
      pending = [d.entryNodeId];
    while (pending.length) {
      const id = pending.pop()!;
      if (visited.has(id)) continue;
      visited.add(id);
      pending.push(
        ...d.nodes.find((n) => n.id === id)!.choices.map((c) => c.nextNodeId),
      );
    }
    if (visited.size !== d.nodes.length)
      throw new RangeError("Nó de diálogo inacessível.");
  }
}
