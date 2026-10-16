import { worldFieldResult } from "../core/rpg/world/rewards";
import { z } from "zod";
import { WORLD_PROTOCOL } from "../core/rpg/world/types";
import { explorationNodeId } from "../core/rpg/exploration/gathering";

const epoch = z.uuid(),
  id = z.string().min(1).max(160),
  number = z.number().finite();
export const worldZoneId = z.enum(["obelisk-refuge", "ruins-outskirts"]);
export const worldOperation = z.enum([
  "PROFILE",
  "REWARDS",
  "CHARACTER",
  "ATTRIBUTES",
  "EQUIPMENT",
  "STORAGE",
  "JOURNAL",
  "QUEST",
  "DIALOGUE",
]);
export const worldCommands = [
  z
    .object({
      type: z.literal("WORLD_ENTER"),
      protocol: z.literal(WORLD_PROTOCOL),
    })
    .strict(),
  z
    .object({
      type: z.literal("WORLD_INPUT"),
      epoch,
      sequence: z.number().int().min(0).max(2147483647),
      moveX: number.min(-1).max(1),
      moveY: number.min(-1).max(1),
    })
    .strict(),
  z
    .object({
      type: z.literal("WORLD_TRANSITION"),
      epoch,
      portalId: id,
      requestId: z.uuid(),
    })
    .strict(),
  z.object({ type: z.literal("WORLD_INTERACT"), epoch, targetId: id }).strict(),
  z
    .object({
      type: z.literal("WORLD_GATHER"),
      epoch,
      nodeId: explorationNodeId,
      requestId: z.uuid(),
      expectedRevision: z.number().int().min(1).max(2147483646),
    })
    .strict(),
  z.object({ type: z.literal("WORLD_CANCEL"), epoch }).strict(),
  z.object({ type: z.literal("WORLD_REFRESH"), epoch }).strict(),
  z.object({ type: z.literal("WORLD_LEAVE"), epoch }).strict(),
  // The service validates the exact operation payload; outer envelope grants no authority.
  z
    .object({
      type: z.literal("WORLD_RPC"),
      epoch,
      requestId: z.uuid(),
      operation: worldOperation,
      args: z.unknown(),
    })
    .strict(),
  z
    .object({
      type: z.literal("WORLD_CHAT"),
      epoch,
      scope: z.enum(["LOCAL", "GROUP", "DM"]),
      target: id.optional(),
      text: z.string().trim().min(1).max(500),
    })
    .strict(),
  z
    .object({
      type: z.literal("WORLD_GROUP"),
      epoch,
      action: z.enum(["INVITE", "ACCEPT", "DECLINE", "LEAVE", "KICK"]),
      target: id.optional(),
      inviteId: z.uuid().optional(),
    })
    .strict(),
] as const;
export const worldCommand = z.discriminatedUnion("type", worldCommands);
const player = z.object({
  id,
  name: z.string().max(100),
  character: z.enum(["nara", "orin", "ivo", "sena"]),
  level: z.number().int().min(1).max(100),
  x: number,
  y: number,
  dx: number,
  dy: number,
  moving: z.boolean(),
  health: number,
  maxHealth: number,
  connected: z.boolean(),
});
const entity = z.object({
  id,
  kind: z.enum(["enemy", "bullet", "area"]),
  x: number,
  y: number,
  r: number,
  type: z.string().max(80),
  health: number.optional(),
  maxHealth: number.optional(),
  color: z.string().max(30).optional(),
  dx: number.optional(),
  dy: number.optional(),
});
export const worldSnapshot = z.object({
  type: z.literal("WORLD_SNAPSHOT"),
  protocol: z.literal(WORLD_PROTOCOL),
  worldId: z.literal("limiar-open-world-v1"),
  instanceId: id,
  epoch,
  zoneId: worldZoneId,
  zoneVersion: z.literal(1),
  tick: z.number().int().min(0),
  selfId: id,
  ack: z.number().int(),
  players: z.array(player).max(50),
  entities: z.array(entity).max(500),
  self: z.object({
    level: z.number().int(),
    xp: z.number().int(),
    revision: z.number().int(),
    speed: number,
  }),
});
export const worldMessages = [
  z.object({
    type: z.literal("WORLD_REWARDS"),
    rewards: z
      .array(
        z.object({
          id: z.uuid(),
          xp: z.number().int().min(0).max(3),
          revision: z.number().int(),
          result: worldFieldResult,
        }),
      )
      .max(160),
  }),
  worldSnapshot,
  z.object({
    type: z.literal("WORLD_RESULT"),
    requestId: z.uuid(),
    ok: z.boolean(),
    message: z.string().max(500),
    data: z.unknown().optional(),
  }),
  z.object({
    type: z.literal("WORLD_INTERACTION"),
    epoch,
    targetId: id,
    service: z.string().max(30),
  }),
  z.object({
    type: z.literal("WORLD_STATE"),
    epoch,
    revision: z.number().int(),
    cycle: z.number().int(),
    depleted: z.array(id).max(100),
    discovered: z.array(id).max(100),
    gathering: z
      .object({ nodeId: id, elapsed: number, duration: number })
      .nullable(),
    message: z.string().max(500).optional(),
  }),
  z.object({
    type: z.literal("WORLD_CHAT"),
    id,
    scope: z.enum(["LOCAL", "GROUP", "DM"]),
    sender: id,
    name: z.string().max(100),
    text: z.string().max(500),
    at: number,
  }),
  z.object({
    type: z.literal("WORLD_GROUP"),
    leader: id.nullable(),
    members: z
      .array(z.object({ id, name: z.string().max(100), online: z.boolean() }))
      .max(5),
    invites: z
      .array(z.object({ id: z.uuid(), sender: id, name: z.string().max(100) }))
      .max(10),
  }),
  z.object({ type: z.literal("WORLD_LEFT"), message: z.string().max(500) }),
] as const;
export type WorldCommand = z.infer<typeof worldCommand>;
export type WorldSnapshot = z.infer<typeof worldSnapshot>;
export type WorldOperation = z.infer<typeof worldOperation>;
