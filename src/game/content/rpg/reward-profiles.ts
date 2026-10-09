/** Immutable reward v1. Difficulty remains a separate Survivor concept. */
export const RPG_REWARD_RULESET_VERSION = 1;
export const RPG_EXPEDITION_V1 = Object.freeze({
  id: "ruins-v1",
  version: 1,
  mapId: "ruins",
  mode: "normal",
  duration: 600,
  startCooldownSeconds: 60,
  minimumConnectedSeconds: 360,
  minimumActiveSeconds: 30,
  reconnectGraceSeconds: 60,
  maxBosses: 3,
  maxElites: 6,
  maxChestsPerUser: 3,
  maxEvents: 24,
  maxXp: 200,
  maxEquipment: 4,
  maxRolls: 4,
  maxDust: 40,
  maxShards: 12,
} as const);
export const RPG_REWARD_SOURCES = [
  "EXPEDITION_COMPLETION",
  "BOSS_DEFEAT",
  "ELITE_DEFEAT",
  "CHEST_OPENED",
] as const;
export const RPG_REWARD_PROFILES_V1 = Object.freeze({
  EXPEDITION_COMPLETION: Object.freeze({
    xp: 100,
    dust: 4,
    shards: 1,
    table: "completion-v1",
  }),
  BOSS_DEFEAT: Object.freeze({ xp: 20, dust: 2, shards: 1, table: "boss-v1" }),
  ELITE_DEFEAT: Object.freeze({ xp: 2, dust: 1, shards: 0, table: null }),
  CHEST_OPENED: Object.freeze({ xp: 3, dust: 2, shards: 0, table: null }),
});
