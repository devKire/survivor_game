import { RPG_EXPEDITION_V1 as policy } from "../../content/rpg/reward-profiles";
import {
  terminalResultSchema,
  type RpgRewardParticipant,
  type RpgTerminalResult,
} from "./loot-types";

export function validateTerminalResult(input: unknown): RpgTerminalResult {
  const result = terminalResultSchema.parse(input);
  const users = new Set(result.participants.map((p) => p.userId));
  if (
    users.size !== result.participants.length ||
    new Set(result.events.map((e) => e.eventId)).size !== result.events.length
  )
    throw new RangeError("Participantes ou eventos duplicados.");
  if (result.outcome === "VICTORY" && result.ticks < policy.duration * 25)
    throw new RangeError("Expedição não concluída.");
  for (const p of result.participants) {
    if (
      p.connectedTicks > result.ticks ||
      p.activeTicks > p.connectedTicks ||
      p.absentTicks > result.ticks
    )
      throw new RangeError("Participação inválida.");
  }
  let bosses = 0,
    elites = 0;
  const chests = new Map<string, number>();
  for (const e of result.events) {
    if (e.tick > result.ticks) throw new RangeError("Evento fora da sessão.");
    if (e.source === "BOSS_DEFEAT") {
      if (
        e.userId !== null ||
        !/^boss:[0-9]$/.test(e.definitionId) ||
        ++bosses > policy.maxBosses
      )
        throw new RangeError("Boss inválido.");
    } else if (e.source === "ELITE_DEFEAT") {
      if (
        e.userId !== null ||
        e.definitionId !== "elite" ||
        ++elites > policy.maxElites
      )
        throw new RangeError("Elite inválido.");
    } else {
      if (!e.userId || !users.has(e.userId) || e.definitionId !== "chest")
        throw new RangeError("Baú inválido.");
      const count = (chests.get(e.userId) ?? 0) + 1;
      chests.set(e.userId, count);
      if (count > policy.maxChestsPerUser)
        throw new RangeError("Limite de baús excedido.");
    }
  }
  return result;
}
export function rewardEligibility(
  result: RpgTerminalResult,
  participant: RpgRewardParticipant,
) {
  if (result.outcome !== "VICTORY") return "DEFEAT" as const;
  if (participant.connectedTicks < policy.minimumConnectedSeconds * 25)
    return "INSUFFICIENT_PARTICIPATION" as const;
  if (participant.activeTicks < policy.minimumActiveSeconds * 25)
    return "INACTIVE" as const;
  if (participant.absentTicks > policy.reconnectGraceSeconds * 25)
    return "DISCONNECTED" as const;
  return "ELIGIBLE" as const;
}
