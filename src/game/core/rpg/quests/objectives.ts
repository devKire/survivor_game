import type { QuestObjective, QuestObjectiveProof } from "./types";
export function objectiveCount(
  objective: QuestObjective,
  proofs: readonly QuestObjectiveProof[],
) {
  const used = new Set<string>();
  let total = 0;
  for (const proof of proofs) {
    if (
      proof.sourceKind !== objective.kind ||
      !proof.sourceId ||
      !Number.isInteger(proof.quantity) ||
      proof.quantity < 1 ||
      proof.quantity > objective.target
    )
      throw new RangeError("Prova de missão inválida.");
    const key = JSON.stringify([proof.sourceKind, proof.sourceId]);
    if (!used.has(key)) {
      total += proof.quantity;
      used.add(key);
    }
  }
  return Math.min(objective.target, total);
}
