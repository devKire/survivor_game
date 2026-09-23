import { arenaCommands,arenaMessages } from "./pvp";
import { z } from "zod";
import { saveSchema } from "../core/save";
const id = z.string().min(1).max(100);
export const clientMessage = z.discriminatedUnion("type", [
  ...arenaCommands,
  z.object({ type: z.literal("HELLO"), ticket: z.string().max(1500) }).strict(),
  z.object({ type: z.literal("SYNC") }).strict(),
  z.object({ type: z.literal("READY"), ready: z.boolean() }).strict(),
  z
    .object({
      type: z.literal("CONFIG"),
      character: z.enum(["nara", "orin", "ivo", "sena"]).optional(),
      mapId: z.enum(["ruins", "gardens"]).optional(),
      mode: z.enum(["normal", "nightmare", "endless"]).optional(),
      duration: z.union([z.literal(600), z.literal(900), z.literal(1800)]).optional(),
    })
    .strict(),
  z.object({ type: z.literal("START") }).strict(),
  z.object({ type: z.literal("KICK"), target: id }).strict(),
  z
    .object({
      type: z.literal("INPUT"),
      sequence: z
        .number()
        .int()
        .min(0)
        .max(2 ** 31 - 1),
      moveX: z.number().min(-1).max(1),
      moveY: z.number().min(-1).max(1),
      interact: z.boolean(),
    })
    .strict(),
  z
    .object({
      type: z.literal("USE_ITEM"),
      slot: z.number().int().min(0).max(3),
    })
    .strict(),
  z
    .object({
      type: z.literal("UPGRADE"),
      choice: z.number().int().min(0).max(3),
      decision: z.number().int().min(1),
      action: z.enum(["pick", "reroll", "banish", "skip"]),
    })
    .strict(),
  z
    .object({ type: z.literal("INTERACT"), structure: id, accept: z.boolean() })
    .strict(),
  z
    .object({
      type: z.literal("CHAT"),
      scope: z.enum(["dm", "team"]),
      target: id,
      text: z.string().trim().min(1).max(500),
    })
    .strict(),
  z
    .object({
      type: z.literal("PING"),
      at: z.number().finite(),
      rtt: z.number().min(0).max(60000).optional(),
    })
    .strict(),
  z.object({ type: z.literal("RESYNC") }).strict(),
]);
export type ClientMessage = z.infer<typeof clientMessage>;
export type EntityPatch = { id: string } & Partial<Omit<NetEntity, "id">>;
export interface NetEntity {
  charge?: number;
  burrow?: number;
  shield?: number;
  lastHitWeapon?: string;
  lastHitOwner?: string;
  name?: string;
  pattern?: string;
  statuses?: string[];
  id: string;
  kind: "enemy" | "bullet" | "area" | "pickup" | "gem";
  x: number;
  y: number;
  r: number;
  type: string;
  hp?: number;
  maxHp?: number;
  phase?: number;
  color?: string;
  enemy?: boolean;
  wind?: number;
  aimX?: number;
  aimY?: number;
  delay?: number;
  armed?: boolean;
  value?: number;
  itemId?: string;
}
export interface NetPlayer {
  cosmetics?: Record<string,string>;
  buff?: number;
  invulnerable?: number;
  orbit?: { area: number; amount: number; evolved: boolean };
  id: string;
  name: string;
  color: string;
  character: string;
  x: number;
  y: number;
  dx: number;
  dy: number;
  hp: number;
  maxHp: number;
  speed: number;
  inWater: boolean;
  state: "alive" | "downed" | "disconnected";
  ack: number;
  revive: number;
}
export interface Snapshot {
  type: "SNAPSHOT";
  room: string;
  tick: number;
  time: number;
  full: boolean;
  base: number;
  players: NetPlayer[];
  upsert: NetEntity[];
  patch: EntityPatch[];
  remove: string[];
  fx: FxEvent[];
  structures: import("../core/types").Structure[];
  own: {
    stats: import("../core/types").Stats;
    kills: number;
    synergies: string[];
    level: number;
    xp: number;
    xpToNextLevel: number;
    weapons: import("../core/types").WeaponSnapshot[];
    passives: Record<string, number>;
    inventory: (import("../core/types").InventorySlot | null)[];
    choices: import("../core/types").Upgrade[];
    decision: number;
    pending: number;
    gems: number;
    rerolls: number;
    banishments: number;
    skips: number;
  };
  seed: string;
  mapId: string;
  mode: string;
  duration: number;
  ended: boolean;
  votes: { id: string; count: number; needed: number }[];
}
export interface FxEvent {
  id: string;
  tick: number;
  ownerId: string | null;
  weapon: string;
  x: number;
  y: number;
  radius: number;
  variant: "normal" | "evolved";
}
export const SNAPSHOT_HZ = 10;
export const TICK_HZ = 25;
const upgrade = z.object({
  kind: z.enum(["weapon", "passive", "path", "bonus"]),
  id: z.string(),
  weaponId: z.string().optional(),
  weight: z.number(),
  name: z.string().optional(),
});
const weapon = z.object({
  id: z.string(),
  level: z.number(),
  evolved: z.boolean(),
  path: z.string().nullable(),
  pathLevel: z.number(),
  damageDealt: z.number(),
  kills: z.number(),
  shots: z.number(),
  hits: z.number(),
  timer: z.number(),
});
const inventory = z
  .array(z.object({ id: z.string(), qty: z.number() }).nullable())
  .max(4);
const entity = z.object({
  charge: z.number().optional(),
  burrow: z.number().optional(),
  shield: z.number().optional(),
  lastHitWeapon: z.string().optional(),
  lastHitOwner: z.string().optional(),
  name: z.string().optional(),
  pattern: z.string().optional(),
  statuses: z.array(z.string()).optional(),
  id: z.string(),
  kind: z.enum(["enemy", "bullet", "area", "pickup", "gem"]),
  x: z.number(),
  y: z.number(),
  r: z.number(),
  type: z.string(),
  hp: z.number().optional(),
  maxHp: z.number().optional(),
  phase: z.number().optional(),
  color: z.string().optional(),
  enemy: z.boolean().optional(),
  wind: z.number().optional(),
  aimX: z.number().optional(),
  aimY: z.number().optional(),
  delay: z.number().optional(),
  armed: z.boolean().optional(),
  value: z.number().optional(),
  itemId: z.string().optional(),
});
const player: z.ZodType<NetPlayer> = z.object({
  cosmetics: z.record(z.string(),z.string()).optional(),
  buff: z.number().optional(),
  invulnerable: z.number().optional(),
  orbit: z
    .object({ area: z.number(), amount: z.number(), evolved: z.boolean() })
    .optional(),
  id: z.string(),
  name: z.string(),
  color: z.string(),
  character: z.string(),
  x: z.number(),
  y: z.number(),
  dx: z.number(),
  dy: z.number(),
  hp: z.number(),
  maxHp: z.number(),
  speed: z.number(),
  inWater: z.boolean(),
  state: z.enum(["alive", "downed", "disconnected"]),
  ack: z.number(),
  revive: z.number(),
});
export const snapshotSchema: z.ZodType<Snapshot> = z.object({
  type: z.literal("SNAPSHOT"),
  room: z.string(),
  tick: z.number(),
  time: z.number(),
  full: z.boolean(),
  base: z.number(),
  players: z.array(player).max(5),
  upsert: z.array(entity).max(5000),
  patch: z.array(entity.partial().required({ id: true })).max(5000),
  remove: z.array(z.string()).max(5000),
  fx: z.array(z.object({ id: z.string(), tick: z.number(), ownerId: z.string().nullable(), weapon: z.string(), x: z.number(), y: z.number(), radius: z.number(), variant: z.enum(["normal", "evolved"]) })).max(100),
  structures: z
    .array(
      z.object({
        id: z.string(),
        type: z.string(),
        x: z.number(),
        y: z.number(),
        r: z.number(),
        hp: z.number(),
        maxHp: z.number(),
        used: z.boolean(),
        destroyed: z.boolean(),
        opened: z.boolean(),
        angle: z.number(),
        variant: z.number(),
      }),
    )
    .max(500),
  own: z.object({
    stats: z.object({
      damage: z.number(),
      area: z.number(),
      cooldown: z.number(),
      duration: z.number(),
      amount: z.number(),
      pickupRange: z.number(),
      growth: z.number(),
      luck: z.number(),
      critChance: z.number(),
      recovery: z.number(),
    }),
    kills: z.number(),
    synergies: z.array(z.string()),
    level: z.number(),
    xp: z.number(),
    xpToNextLevel: z.number(),
    weapons: z.array(weapon).max(6),
    passives: z.record(z.string(), z.number()),
    inventory,
    choices: z.array(upgrade).max(4),
    decision: z.number(),
    pending: z.number(),
    gems: z.number(),
    rerolls: z.number(),
    banishments: z.number(),
    skips: z.number(),
  }),
  seed: z.string(),
  mapId: z.string(),
  mode: z.string(),
  duration: z.number(),
  ended: z.boolean(),
  votes: z
    .array(z.object({ id: z.string(), count: z.number(), needed: z.number() }))
    .max(100),
});
const user = z.object({
  id: z.string(),
  username: z.string().nullable(),
  displayUsername: z.string().nullable(),
});
export const chatSchema = z.object({
  id: z.string(),
  senderId: z.string(),
  recipientId: z.string().nullable(),
  teamId: z.string().nullable(),
  text: z.string().max(500),
  createdAt: z.string(),
  sender: user,
});
export const teamSchema = z.object({
  id: z.string(),
  code: z.string(),
  leaderId: z.string(),
  status: z.string(),
  mapId: z.string(),
  mode: z.string(),
  duration: z.number(),
  members: z
    .array(
      z.object({
        userId: z.string(),
        slot: z.number(),
        character: z.string(),
        ready: z.boolean(),
        user,
      }),
    )
    .max(5),
});
export const friendSchema = z.object({
  id: z.string(),
  fromId: z.string(),
  toId: z.string(),
  status: z.string(),
  from: user,
  to: user,
  presence: z.string(),
});
export const serverMessage = z.union([
  ...arenaMessages,
  snapshotSchema,
  z.object({
    type: z.literal("ACCOUNT"),
    userId: z.string(),
    team: teamSchema.nullable(),
    friends: z.array(friendSchema).max(100),
    progress: z.object({
      data: saveSchema,
      localArchive: saveSchema.nullable(),
      importResolved: z.boolean(),
    }),
  }),
  z.object({ type: z.literal("CHAT"), message: chatSchema }),
  z.object({ type: z.literal("PRESENCE"), id: z.string(), state: z.string() }),
  z.object({ type: z.literal("ERROR"), message: z.string() }),
  z.object({ type: z.literal("PONG"), at: z.number() }),
  z.object({ type: z.literal("STARTED"), room: z.string() }),
  z.object({
    type: z.literal("RESULT"),
    completed: z.boolean(),
    kills: z.number(),
    time: z.number(),
  }),
]);
export type Team = z.infer<typeof teamSchema>;
export type Friend = z.infer<typeof friendSchema>;
export type ChatMessage = z.infer<typeof chatSchema>;
export type ServerMessage = z.infer<typeof serverMessage>;
