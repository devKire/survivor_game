import { z } from "zod";
import { RPG_REWARD_SOURCES } from "../../content/rpg/reward-profiles";
import { rpgCharacterIdSchema } from "./equipment";
import { RPG_RARITIES } from "./types";

const id = z.string().min(1).max(160);
const weight = z.number().int().min(1).max(10000);
const common = { id, definitionId: id, weight };
export const lootEntrySchema = z.discriminatedUnion("type", [
  z
    .object({
      ...common,
      type: z.literal("EQUIPMENT"),
      rarityWeights: z.record(
        z.enum(RPG_RARITIES),
        z.number().int().min(0).max(10000),
      ),
      minimumItemLevel: z.number().int().min(1).max(100),
      maximumItemLevel: z.number().int().min(1).max(100),
    })
    .strict(),
  z
    .object({
      ...common,
      type: z.literal("MATERIAL"),
      minimumQuantity: z.number().int().min(1).max(4),
      maximumQuantity: z.number().int().min(1).max(4),
    })
    .strict(),
]);
export const lootTableSchema = z
  .object({
    id,
    version: z.literal(1),
    rolls: z.literal(1),
    entries: z.array(lootEntrySchema).min(1).max(16),
  })
  .strict();
export type RpgLootTable = z.infer<typeof lootTableSchema>;
export type RpgLootEntry = z.infer<typeof lootEntrySchema>;
export type RpgRewardSource = (typeof RPG_REWARD_SOURCES)[number];
export const rewardEventSchema = z
  .object({
    eventId: id,
    source: z.enum(["BOSS_DEFEAT", "ELITE_DEFEAT", "CHEST_OPENED"]),
    definitionId: id,
    tick: z.number().int().min(0).max(15001),
    userId: id.nullable(),
  })
  .strict();
export type RpgRewardEvent = z.infer<typeof rewardEventSchema>;
export const rewardParticipantSchema = z
  .object({
    userId: id,
    characterId: rpgCharacterIdSchema,
    entryLevel: z.number().int().min(1).max(100),
    connectedTicks: z.number().int().min(0).max(15001),
    activeTicks: z.number().int().min(0).max(15001),
    absentTicks: z.number().int().min(0).max(15001),
  })
  .strict();
export const terminalResultSchema = z
  .object({
    version: z.literal(1),
    outcome: z.enum(["VICTORY", "DEFEAT"]),
    ticks: z.number().int().min(1).max(15001),
    participants: z.array(rewardParticipantSchema).min(1).max(5),
    events: z.array(rewardEventSchema).max(24),
  })
  .strict();
export type RpgTerminalResult = z.infer<typeof terminalResultSchema>;
export type RpgRewardParticipant = z.infer<typeof rewardParticipantSchema>;
