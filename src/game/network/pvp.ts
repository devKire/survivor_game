import { z } from "zod";
export const arenaCommands = [
  z
    .object({
      type: z.literal("ARENA_QUEUE"),
      character: z.enum(["nara", "orin", "ivo", "sena"]),
      mode: z.enum(["DUEL_CASUAL", "DUEL_RANKED", "WAR_CASUAL", "WAR_RANKED"]),
      role: z.enum(["SOLDADO", "CONSTRUTOR", "COMANDANTE"]).default("SOLDADO"),
    })
    .strict(),
  z
    .object({
      type: z.literal("ARENA_BUILD"),
      kind: z.enum(["TORRE", "BARRICADA"]),
      x: z.number().min(0).max(2600),
      y: z.number().min(0).max(1400),
    })
    .strict(),
  z
    .object({
      type: z.literal("ARENA_REPAIR"),
      targetId: z.string().min(1).max(100),
    })
    .strict(),
  z
    .object({
      type: z.literal("ARENA_ORDER"),
      lane: z.number().int().min(0).max(2),
      order: z.enum([
        "ATACAR",
        "DEFENDER",
        "RECUAR",
        "FOCAR_TORRE",
        "FOCAR_BASE",
      ]),
    })
    .strict(),
  z
    .object({
      type: z.literal("ARENA_RECRUIT"),
      lane: z.number().int().min(0).max(2),
      kind: z.enum(["SOLDADO", "TANQUE", "SUPORTE"]),
      count: z.number().int().min(1).max(10),
      formation: z.enum(["LINHA", "COLUNA", "DISPERSAR"]),
    })
    .strict(),
  z
    .object({
      type: z.literal("ARENA_UPGRADE"),
      kind: z.enum(["damage", "health", "speed", "troops"]),
    })
    .strict(),
  z
    .object({
      type: z.literal("ARENA_CHAT_SEND"),
      text: z
        .string()
        .trim()
        .min(1)
        .max(500)
        .refine(
          (t) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(t),
        ),
    })
    .strict(),
  z.object({ type: z.literal("ARENA_CANCEL") }).strict(),
  z.object({ type: z.literal("ARENA_FORFEIT") }).strict(),
  z
    .object({
      type: z.literal("ARENA_INPUT"),
      sequence: z.number().int().min(1).max(2147483647),
      moveX: z.number().min(-1).max(1),
      moveY: z.number().min(-1).max(1),
      aimX: z.number().min(-1).max(1),
      aimY: z.number().min(-1).max(1),
      ability: z.enum(["none", "basic", "skill", "pulse", "dash"]),
      seenTick: z.number().int().min(0).max(2147483647),
    })
    .strict(),
] as const;
export const arenaCommand = z.discriminatedUnion("type", arenaCommands);
export type ArenaCommand = z.infer<typeof arenaCommand>;
const war = z.object({
  objective: z.object({
    owner: z.number().nullable(),
    capture: z.number(),
    nextReward: z.number(),
  }),
  cores: z.array(z.number()),
  energy: z.number(),
  role: z.enum(["SOLDADO", "CONSTRUTOR", "COMANDANTE"]),
  minions: z.array(
    z.object({
      id: z.number(),
      team: z.number(),
      kind: z.enum(["SOLDADO", "TANQUE", "SUPORTE"]),
      x: z.number(),
      y: z.number(),
      hp: z.number(),
      maxHp: z.number(),
    }),
  ),
  structures: z.array(
    z.object({
      id: z.string(),
      team: z.number(),
      kind: z.enum(["CORE", "TORRE", "BARRICADA"]),
      x: z.number(),
      y: z.number(),
      r: z.number(),
      hp: z.number(),
      maxHp: z.number(),
      ownerId: z.string().optional(),
      cooldown: z.number(),
    }),
  ),
  orders: z.array(
    z.enum(["ATACAR", "DEFENDER", "RECUAR", "FOCAR_TORRE", "FOCAR_BASE"]),
  ),
  troops: z.array(z.enum(["SOLDADO", "TANQUE", "SUPORTE"])),
  upgrades: z.number(),
  entityCount: z.number(),
});
const cooldown = z.object({
  none: z.number(),
  basic: z.number(),
  skill: z.number(),
  pulse: z.number(),
  dash: z.number(),
});
export const arenaSnapshotSchema = z.object({
  pickups: z.array(
    z.object({ x: z.number(), y: z.number(), value: z.number() }),
  ),
  mapId: z.string(),
  seed: z.string(),
  profile: z.enum(["pvp1v1", "pvp5v5"]),
  humanCount: z.number(),
  botCount: z.number(),
  structures: z.array(
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
  ),
  areas: z.array(
    z.object({
      x: z.number(),
      y: z.number(),
      r: z.number(),
      armed: z.boolean(),
      delay: z.number(),
      color: z.string(),
    }),
  ),
  lines: z.array(
    z.object({
      kind: z.string(),
      x: z.number(),
      y: z.number(),
      r: z.number().optional(),
      tx: z.number().optional(),
      ty: z.number().optional(),
      color: z.string(),
      life: z.number(),
      max: z.number(),
    }),
  ),
  war: war.optional(),
  tick: z.number(),
  time: z.number(),
  round: z.number(),
  score: z.array(z.number()),
  ended: z.boolean(),
  winner: z.number().nullable(),
  reason: z.string(),
  width: z.number(),
  height: z.number(),
  roundRemaining: z.number(),
  intermission: z.number(),
  own: z.object({ ack: z.number(), cooldowns: cooldown }),
  players: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      team: z.number(),
      character: z.string(),
      x: z.number(),
      y: z.number(),
      hp: z.number(),
      maxHp: z.number(),
      speed: z.number(),
      connected: z.boolean(),
      isBot: z.boolean(),
      botControlled: z.boolean(),
      protected: z.boolean(),
      cosmetics: z.record(z.string(), z.string()),
    }),
  ),
  bullets: z.array(
    z.object({
      id: z.number(),
      owner: z.string(),
      vx: z.number(),
      vy: z.number(),
      kind: z.string(),
      age: z.number(),
      color: z.string(),
      x: z.number(),
      y: z.number(),
      team: z.number(),
      r: z.number(),
    }),
  ),
});
export const arenaMessages = [
  z.object({
    type: z.literal("ARENA_CHAT"),
    id: z.string(),
    senderId: z.string(),
    name: z.string(),
    text: z.string(),
  }),
  z.object({
    type: z.literal("ARENA_QUEUE_STATUS"),
    waiting: z.boolean(),
    seconds: z.number(),
    found: z.number().optional(),
    target: z.number().optional(),
    filling: z.boolean().optional(),
  }),
  z.object({
    type: z.literal("ARENA_STARTED"),
    roster: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        team: z.number(),
        isBot: z.boolean().optional(),
      }),
    ),
    matchId: z.string(),
    mode: z.string(),
  }),
  z.object({
    type: z.literal("ARENA_SNAPSHOT"),
    matchId: z.string(),
    snapshot: arenaSnapshotSchema,
  }),
  z.object({
    type: z.literal("ARENA_RESULT"),
    matchId: z.string(),
    winner: z.number().nullable(),
    reason: z.string(),
  }),
] as const;
