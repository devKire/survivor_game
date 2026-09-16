import { z } from "zod";
import * as C from "../content/catalog";
import type { RunSnapshot, SaveData } from "./types";
const ids = (table: object) =>
  z.string().refine((id) => Object.hasOwn(table, id));
const bounded = (max: number) => z.number().finite().min(0).max(max);
const count = bounded(1e9).int();
const weapon = z
  .object({
    id: ids(C.WEAPON_DEFINITIONS),
    level: z.number().int().min(1).max(8),
    evolved: z.boolean().default(false),
    path: z.string().nullable().default(null),
    pathLevel: bounded(10).int().default(0),
    damageDealt: bounded(1e12).default(0),
    kills: count.default(0),
    shots: count.default(0),
    hits: count.default(0),
    timer: bounded(100).default(0.25),
  })
  .refine((w) => !w.path || Object.hasOwn(C.WEAPON_PATHS[w.id] || {}, w.path));
const inventory = z
  .array(
    z
      .object({
        id: ids(C.ITEM_DEFINITIONS),
        qty: z.number().int().min(1).max(3),
      })
      .nullable(),
  )
  .max(4);
const coordinates = {
  x: z.number().finite().min(-1e8).max(1e8),
  y: z.number().finite().min(-1e8).max(1e8),
};
const changes = z
  .record(
    z.string().max(100),
    z
      .object({
        used: z.boolean().optional(),
        opened: z.boolean().optional(),
        destroyed: z.boolean().optional(),
        hp: bounded(1e7).optional(),
      })
      .strict(),
  )
  .refine((v) => Object.keys(v).length <= 12000);
export const runSchema = z.object({
  telemetry: z
    .object({
      levelUps: z.array(bounded(1e6)).max(999),
      levels: z.record(z.string(), count),
      firstPath: bounded(1e6).nullable(),
      firstEvolution: bounded(1e6).nullable(),
      bossKills: z.array(bounded(1e6)).max(999),
      menuSeconds: bounded(1e9),
      structures: count,
      chests: count,
      partySize: bounded(5),
      revives: count,
      disconnects: count,
      teamWipes: count,
      networkRtt: z.array(bounded(60000)).max(1000),
    })
    .optional(),
  manualDecisions: bounded(999).optional(),
  lastDecisionAt: z.number().finite().optional(),
  restUntil: bounded(1e9).optional(),
  pending: z
    .object({
      state: z.string().max(20),
      choices: z
        .array(
          z.object({
            kind: z.enum(["weapon", "passive", "path", "bonus"]),
            id: z.string().max(30),
            weaponId: z.string().optional(),
            weight: bounded(1000),
            name: z.string().optional(),
          }),
        )
        .max(4),
      pathSelection: z.boolean(),
      chestReward: z
        .discriminatedUnion("kind", [
          z.object({
            kind: z.literal("evolution"),
            id: ids(C.WEAPON_DEFINITIONS),
            gold: count,
          }),
          z.object({
            kind: z.literal("reward"),
            gold: count,
            upgrade: z
              .object({
                kind: z.enum(["weapon", "passive", "path", "bonus"]),
                id: z.string(),
                weight: bounded(1000),
                weaponId: z.string().optional(),
              })
              .nullable(),
          }),
        ])
        .nullable(),
      pendingItem: z
        .object({ id: ids(C.ITEM_DEFINITIONS), qty: bounded(3) })
        .nullable(),
    })
    .optional(),
  schemaVersion: z.number().int(),
  gameVersion: z.string().default("1.3.0"),
  mode: ids(C.MODE_DEFINITIONS).default("normal"),
  mapId: ids(C.MAP_DEFINITIONS),
  character: ids(C.CHARACTER_DEFINITIONS),
  worldSeed: z.string().min(4).max(80),
  worldVersion: z.number().int().min(1).max(3).optional(),
  ...coordinates,
  time: bounded(1e6),
  simTime: bounded(1e6).default(0),
  health: bounded(1e7),
  maxHealth: bounded(1e7).default(110),
  level: z.number().int().min(1).max(999),
  xp: bounded(1e12),
  xpToNextLevel: bounded(1e12).default(0),
  weapons: z.array(weapon).min(1).max(6),
  passives: z
    .record(ids(C.PASSIVE_DEFINITIONS), bounded(5).int())
    .refine((v) => Object.keys(v).length <= 6),
  inventory,
  gold: count.default(0),
  kills: count.default(0),
  totalDamage: bounded(1e12).default(0),
  bossKills: count.default(0),
  evolutions: count.default(0),
  completed: z.boolean().default(false),
  completionGold: count.nullable().default(null),
  worldChanges: changes.default({}),
  rerolls: bounded(999).int().default(2),
  banishments: bounded(999).int().default(2),
  skips: bounded(999).int().default(1),
  banned: z.array(z.string().max(80)).max(20).default([]),
  structuresBroken: count.default(0),
  urnsBroken: count.default(0),
  structuresUsed: count.default(0),
  itemsUsed: count.default(0),
  synergies: z.array(ids(C.SYNERGY_DEFINITIONS)).max(6).default([]),
  usedExchange: z.boolean().default(false),
  phase3BossKills: count.default(0),
  event: z.string().nullable().default(null),
  eventTime: bounded(1000).default(0),
  silenceTime: bounded(1000).default(0),
  surgeTime: bounded(1000).default(0),
  endlessAnnounced: z.boolean().default(false),
  bossHistory: z.array(bounded(20).int()).max(20).default([]),
  nextMapEvent: bounded(1e7).optional(),
  silenceAfter: bounded(1000).optional(),
  riftPending: z
    .object({ id: z.string(), count: bounded(4), ...coordinates })
    .nullable()
    .optional(),
  director: z.object({
    index: bounded(8).int().default(0),
    spawnClock: bounded(1000).default(0),
    eliteClock: z.number().finite().default(80),
    formationClock: z.number().finite().default(24),
    eventIndex: bounded(10).int().default(0),
    nextEndlessBossAt: bounded(1e7).default(1920),
    endlessBossIndex: count.default(0),
  }),
  enemies: z
    .array(
      z.object({
        type: ids(C.ENEMY_DEFINITIONS),
        id: count,
        ...coordinates,
        hp: bounded(1e9),
        maxHp: bounded(1e9),
        speed: bounded(2000).optional(),
        damage: bounded(1e9).optional(),
        name: z.string().max(100).optional(),
        pattern: z.string().max(30).optional(),
        attack: z.number().finite().optional(),
        wind: z.number().finite().optional(),
        charge: z.number().finite().optional(),
        aimX: z.number().finite().optional(),
        aimY: z.number().finite().optional(),
        statuses: z
          .record(
            ids(C.STATUS_DEFINITIONS),
            z.object({
              duration: bounded(120),
              magnitude: bounded(100),
              stacks: bounded(5),
              tick: z.number().finite(),
              sourceId: z.string().nullable().default(null),
            }),
          )
          .optional(),
        bossPhase: bounded(3).int().optional(),
        bossEventIndex: bounded(20).int().nullable().optional(),
      }),
    )
    .max(320)
    .default([]),
  pickups: z
    .array(
      z.object({
        type: z.enum(["chest", "item"]),
        ...coordinates,
        value: bounded(1e6).default(1),
        life: z
          .number()
          .nullable()
          .transform((v) => v ?? Infinity),
        itemId: ids(C.ITEM_DEFINITIONS).optional(),
      }),
    )
    .max(80)
    .default([]),
});
export function freshSave(): SaveData {
  return {
    version: 3,
    gameVersion: "2.0.0",
    gold: 0,
    upgrades: {},
    unlocked: ["nara"],
    achievements: [],
    discovered: {
      items: [],
      enemies: [],
      maps: ["ruins"],
      synergies: [],
      structures: [],
    },
    selected: "nara",
    selectedMap: "ruins",
    tutorial: false,
    highScore: 0,
    bestTime: 0,
    bestKills: 0,
    runs: 0,
    completed: 0,
    activeRun: null,
    settings: {
      volume: 0.35,
      sounds: true,
      mute: false,
      shake: true,
      numbers: true,
      particles: "auto",
    },
  };
}
export const saveSchema = z.object({
  version: z.number().int().min(1).max(3).default(1),
  gold: count.default(0),
  highScore: count.default(0),
  bestTime: count.default(0),
  bestKills: count.default(0),
  runs: count.default(0),
  completed: count.default(0),
  upgrades: z.record(ids(C.META_DEFINITIONS), bounded(5).int()).default({}),
  unlocked: z.array(ids(C.CHARACTER_DEFINITIONS)).max(4).default(["nara"]),
  achievements: z
    .array(z.string().refine((id) => C.ACHIEVEMENTS.some((a) => a.id === id)))
    .max(13)
    .default([]),
  selected: ids(C.CHARACTER_DEFINITIONS).default("nara"),
  selectedMap: ids(C.MAP_DEFINITIONS).default("ruins"),
  tutorial: z.boolean().default(false),
  discovered: z
    .object({
      items: z.array(ids(C.ITEM_DEFINITIONS)).max(8).default([]),
      enemies: z.array(ids(C.ENEMY_DEFINITIONS)).max(15).default([]),
      maps: z.array(ids(C.MAP_DEFINITIONS)).max(2).default(["ruins"]),
      synergies: z.array(ids(C.SYNERGY_DEFINITIONS)).max(6).default([]),
      structures: z.array(ids(C.STRUCTURE_DEFINITIONS)).max(16).default([]),
    })
    .default({
      items: [],
      enemies: [],
      maps: ["ruins"],
      synergies: [],
      structures: [],
    }),
  settings: z
    .object({
      volume: bounded(1).default(0.35),
      sounds: z.boolean().default(true),
      mute: z.boolean().default(false),
      shake: z.boolean().default(true),
      numbers: z.boolean().default(true),
      particles: z.enum(["auto", "low", "high", "off"]).default("auto"),
    })
    .default(freshSave().settings),
  activeRun: runSchema.nullable().optional(),
});
export function migrateSave(raw: unknown): SaveData {
  let parsed = saveSchema.safeParse(raw);
  if (!parsed.success && raw && typeof raw === "object" && "activeRun" in raw)
    parsed = saveSchema.safeParse({ ...raw, activeRun: null });
  if (!parsed.success) return freshSave();
  const v = parsed.data;
  return {
    ...freshSave(),
    ...v,
    version: 3,
    activeRun: v.activeRun ?? null,
    unlocked: [...new Set(["nara", ...v.unlocked])],
    selected: v.unlocked.includes(v.selected) ? v.selected : "nara",
  };
}
export function validateRunSnapshot(
  s: unknown,
  strict = true,
): s is RunSnapshot {
  const r = runSchema.safeParse(s);
  return r.success && (!strict || r.data.schemaVersion === 3);
}
export const importSchema = z.object({
  schemaVersion: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  progress: saveSchema,
  activeRun: runSchema.nullable().optional(),
});
export function validateImportEnvelope(
  s: unknown,
): s is z.infer<typeof importSchema> {
  return importSchema.safeParse(s).success;
}
