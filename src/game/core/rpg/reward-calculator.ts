import { RPG_LOOT_TABLES_V1 } from "../../content/rpg/loot-tables";
import {
  RPG_EXPEDITION_V1,
  RPG_REWARD_PROFILES_V1,
} from "../../content/rpg/reward-profiles";
import type { RpgEquipment } from "./combat-types";
import type { RpgRewardSource } from "./loot-types";
import { validateTerminalResult, rewardEligibility } from "./reward-policy";
import { rollRpgLoot } from "./loot-rolls";

export type RewardSeedProvider = (
  source: RpgRewardSource,
  eventId: string,
  index: number,
  tableVersion: number,
) => string;
/** No IO or ambient RNG: the same durable result and seed provider replay exactly. */
export function calculateRpgReward(
  input: unknown,
  userId: string,
  seedFor: RewardSeedProvider,
) {
  const result = validateTerminalResult(input);
  const participant = result.participants.find((p) => p.userId === userId);
  if (!participant) throw new RangeError("Participante indisponível.");
  const eligibility = rewardEligibility(result, participant);
  const equipment: RpgEquipment[] = [];
  const materials: Record<string, number> = {
    "obelisk-dust": 0,
    "echo-shard": 0,
  };
  const origins: {
    source: RpgRewardSource;
    eventId: string;
    tableId: string | null;
    rolls: number;
  }[] = [];
  let xp = 0;
  if (eligibility === "ELIGIBLE") {
    const events = [
      { source: "EXPEDITION_COMPLETION" as const, eventId: "completion" },
      ...result.events
        .filter((e) => !e.userId || e.userId === userId)
        .sort((a, b) =>
          a.eventId < b.eventId ? -1 : a.eventId > b.eventId ? 1 : 0,
        ),
    ];
    for (const event of events) {
      const profile = RPG_REWARD_PROFILES_V1[event.source];
      xp += profile.xp;
      materials["obelisk-dust"] += profile.dust;
      materials["echo-shard"] += profile.shards;
      origins.push({
        source: event.source,
        eventId: event.eventId,
        tableId: profile.table,
        rolls: profile.table ? 1 : 0,
      });
      if (profile.table) {
        const roll = rollRpgLoot(
          RPG_LOOT_TABLES_V1[profile.table],
          participant.entryLevel,
          seedFor(event.source, event.eventId, 0, 1),
        );
        if (roll.type === "EQUIPMENT") equipment.push(roll.item);
        else materials[roll.materialId] += roll.quantity;
      }
    }
  }
  if (
    xp > RPG_EXPEDITION_V1.maxXp ||
    equipment.length > RPG_EXPEDITION_V1.maxEquipment ||
    materials["obelisk-dust"] > RPG_EXPEDITION_V1.maxDust ||
    materials["echo-shard"] > RPG_EXPEDITION_V1.maxShards ||
    origins.reduce((n, o) => n + o.rolls, 0) > RPG_EXPEDITION_V1.maxRolls
  )
    throw new RangeError("Limite de recompensa excedido.");
  return {
    eligibility,
    xp,
    materials: Object.entries(materials)
      .filter(([, quantity]) => quantity > 0)
      .map(([materialId, quantity]) => ({ materialId, quantity })),
    equipment,
    origins,
  };
}
