export const OBELISK_BRANCHES = [
  "OFENSIVA",
  "SOBREVIVÊNCIA",
  "MOBILIDADE",
  "FORTUNA",
  "ESPECIALIZAÇÃO",
] as const;
export type Branch = (typeof OBELISK_BRANCHES)[number];
export interface ObeliskNode {
  id: string;
  branch: Branch;
  name: string;
  text: string;
  base: number;
  perLevel: number;
  unit: "percent" | "flat" | "perSecond";
  maxRank: number;
  prerequisites: { id: string; rank: number }[];
  excludes?: string;
  character?: string;
  position: { row: number; column: number };
}
function node(
  id: string,
  branch: Branch,
  name: string,
  text: string,
  base: number,
  perLevel: number,
  prerequisites: ObeliskNode["prerequisites"] = [],
  extra: Partial<ObeliskNode> = {},
): ObeliskNode {
  return {
    id,
    branch,
    name,
    text,
    base,
    perLevel,
    unit: "percent",
    maxRank: 5,
    prerequisites,
    position: { row: prerequisites.length ? 1 : 0, column: 0 },
    ...extra,
  };
}
export const OBELISK_NODES: Record<string, ObeliskNode> = Object.fromEntries(
  [
    node("might", "OFENSIVA", "Potência", "Dano PvE", 45, 2),
    node("precision", "OFENSIVA", "Precisão", "Chance crítica", 150, 1, [
      { id: "might", rank: 2 },
    ]),
    node(
      "area",
      "OFENSIVA",
      "Amplitude",
      "Área das armas",
      150,
      2,
      [{ id: "might", rank: 2 }],
      { position: { row: 1, column: 1 } },
    ),
    node(
      "haste",
      "OFENSIVA",
      "Cadência",
      "Redução de recarga",
      300,
      1,
      [{ id: "precision", rank: 2 }],
      { position: { row: 2, column: 0 } },
    ),
    node(
      "duration",
      "OFENSIVA",
      "Persistência",
      "Duração de habilidades",
      300,
      2,
      [{ id: "area", rank: 2 }],
      { position: { row: 2, column: 1 } },
    ),
    node("vitality", "SOBREVIVÊNCIA", "Vitalidade I", "Vida máxima", 40, 2),
    node(
      "vitality2",
      "SOBREVIVÊNCIA",
      "Vitalidade II",
      "Vida máxima adicional",
      200,
      2,
      [{ id: "vitality", rank: 2 }],
    ),
    node(
      "armor",
      "SOBREVIVÊNCIA",
      "Resistência",
      "Armadura",
      65,
      0.3,
      [{ id: "vitality2", rank: 1 }],
      { unit: "flat", excludes: "recovery", position: { row: 2, column: 0 } },
    ),
    node(
      "recovery",
      "SOBREVIVÊNCIA",
      "Regeneração",
      "Recuperação de vida",
      55,
      0.1,
      [{ id: "vitality2", rank: 1 }],
      { unit: "perSecond", excludes: "armor", position: { row: 2, column: 1 } },
    ),
    node("speed", "MOBILIDADE", "Agilidade", "Velocidade de movimento", 40, 2),
    node(
      "stride",
      "MOBILIDADE",
      "Passo leve",
      "Velocidade adicional limitada",
      300,
      1,
      [{ id: "speed", rank: 3 }],
    ),
    node("pickup", "FORTUNA", "Alcance", "Raio de coleta", 35, 4),
    node("growth", "FORTUNA", "Aprendizado", "XP da expedição", 55, 1, [
      { id: "pickup", rank: 2 },
    ]),
    node(
      "luck",
      "FORTUNA",
      "Fortuna",
      "Sorte com limite econômico",
      40,
      2,
      [{ id: "pickup", rank: 2 }],
      { position: { row: 1, column: 1 } },
    ),
    ...(["nara", "orin", "ivo", "sena"] as const).map((character, column) =>
      node(
        character + "_focus",
        "ESPECIALIZAÇÃO",
        {
          nara: "Brasa de Nara",
          orin: "Gravidade de Orin",
          ivo: "Lâmina de Ivo",
          sena: "Céu de Sena",
        }[character],
        "Dano da arma inicial deste personagem",
        450,
        1,
        [],
        { character, position: { row: 0, column } },
      ),
    ),
  ].map((n) => [n.id, n]),
);
export function nodeEffect(id: string, rank: number) {
  const n = OBELISK_NODES[id];
  if (!n) return 0;
  const steps = [1, 0.8, 0.65, 0.5, 0.4];
  return (
    n.perLevel *
    steps
      .slice(0, Math.min(n.maxRank, Math.max(0, Math.floor(rank))))
      .reduce((a, b) => a + b, 0)
  );
}
export function nodeCost(id: string, rank: number) {
  return Math.ceil(OBELISK_NODES[id].base * 1.7 ** rank);
}
export function nodeValue(id: string, rank: number) {
  const n = OBELISK_NODES[id];
  const value = nodeEffect(id, rank).toLocaleString("pt-BR", {
    maximumFractionDigits: 2,
  });
  return `+${value}${n.unit === "percent" ? "%" : n.unit === "perSecond" ? " HP/s" : " armadura"}`;
}
export function nodeBlocked(
  id: string,
  ranks: Record<string, number>,
  unlocked: string[],
) {
  const n = OBELISK_NODES[id];
  if (!n) return "Nó inexistente.";
  if ((ranks[id] || 0) >= n.maxRank) return "Nível máximo.";
  if (n.character && !unlocked.includes(n.character))
    return "Desbloqueie o personagem.";
  // Existing legacy ranks are grandfathered; never delete or invalidate purchased ranks.
  if (!(ranks[id] > 0)) {
    if (n.excludes && ranks[n.excludes] > 0)
      return `Escolha alternativa: ${OBELISK_NODES[n.excludes].name}.`;
    for (const p of n.prerequisites)
      if ((ranks[p.id] || 0) < p.rank)
        return `Requer ${OBELISK_NODES[p.id].name} ${p.rank}.`;
  }
  return null;
}
