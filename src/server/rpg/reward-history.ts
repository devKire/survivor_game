import "server-only";
import { z } from "zod";
import { db } from "../db";
import { requireRpgEnabled } from "./guard";
import { RPG_RARITIES } from "../../game/core/rpg";
import { RPG_REWARD_SOURCES } from "../../game/content/rpg/reward-profiles";

const id = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-zA-Z0-9_-]+$/);
const receiptResult = z
  .object({
    version: z.literal(1),
    eligibility: z.enum([
      "ELIGIBLE",
      "DEFEAT",
      "INSUFFICIENT_PARTICIPATION",
      "INACTIVE",
      "DISCONNECTED",
    ]),
    outcome: z.enum(["VICTORY", "DEFEAT"]),
    xpOffered: z.number().int().min(0).max(200),
    materials: z
      .array(
        z
          .object({
            materialId: z.string().max(60),
            quantity: z.number().int().min(0).max(40),
            capped: z.boolean(),
          })
          .strict(),
      )
      .max(2),
    equipment: z
      .array(
        z
          .object({
            id,
            itemId: z.string().max(60),
            rarity: z.enum(RPG_RARITIES),
            level: z.number().int().min(1).max(100),
            quantity: z.literal(1),
            contentVersion: z.literal(1),
            affixes: z
              .array(
                z
                  .object({
                    id: z.string().max(60),
                    tier: z.number().int().min(1).max(3),
                    value: z.number().finite(),
                  })
                  .strict(),
              )
              .max(3),
          })
          .strict(),
      )
      .max(4),
    origins: z
      .array(
        z
          .object({
            source: z.enum(RPG_REWARD_SOURCES),
            eventId: z.string().max(160),
            tableId: z.string().max(60).nullable(),
            rolls: z.number().int().min(0).max(1),
          })
          .strict(),
      )
      .max(25),
  })
  .strict();
const selection = {
  sessionId: true,
  characterId: true,
  createdAt: true,
  session: { select: { status: true } },
  receipt: {
    select: {
      xpGranted: true,
      previousLevel: true,
      newLevel: true,
      pointsGranted: true,
      result: true,
      createdAt: true,
    },
  },
} as const;

/** Internal userId always comes from authenticated identity; cursors never change scope. */
export async function rpgRewardHistory(userId: string, input: unknown = {}) {
  requireRpgEnabled();
  const { cursor } = z.object({ cursor: id.optional() }).strict().parse(input);
  const anchor = cursor
    ? await db().rpgExpeditionParticipant.findUnique({
        where: { sessionId_userId: { sessionId: cursor, userId } },
        select: { createdAt: true, sessionId: true },
      })
    : null;
  if (cursor && !anchor) return { entries: [], nextCursor: null };
  const rows = await db().rpgExpeditionParticipant.findMany({
    where: {
      userId,
      ...(anchor
        ? {
            OR: [
              { createdAt: { lt: anchor.createdAt } },
              {
                createdAt: anchor.createdAt,
                sessionId: { lt: anchor.sessionId },
              },
            ],
          }
        : {}),
    },
    orderBy: [{ createdAt: "desc" }, { sessionId: "desc" }],
    take: 21,
    select: selection,
  });
  return {
    entries: rows.slice(0, 20).map(project),
    nextCursor: rows.length > 20 ? rows[19].sessionId : null,
  };
}
export async function rpgRewardDetail(userId: string, input: unknown) {
  requireRpgEnabled();
  const { sessionId } = z.object({ sessionId: id }).strict().parse(input);
  const row = await db().rpgExpeditionParticipant.findUnique({
    where: { sessionId_userId: { sessionId, userId } },
    select: selection,
  });
  return row ? project(row) : null;
}
function project(row: {
  sessionId: string;
  characterId: string;
  createdAt: Date;
  session: { status: string };
  receipt: null | {
    xpGranted: number;
    previousLevel: number;
    newLevel: number;
    pointsGranted: number;
    result: unknown;
    createdAt: Date;
  };
}) {
  return {
    sessionId: row.sessionId,
    characterId: row.characterId,
    startedAt: row.createdAt.toISOString(),
    status: row.session.status,
    receipt: row.receipt
      ? {
          xpGranted: row.receipt.xpGranted,
          previousLevel: row.receipt.previousLevel,
          newLevel: row.receipt.newLevel,
          pointsGranted: row.receipt.pointsGranted,
          confirmedAt: row.receipt.createdAt.toISOString(),
          result: receiptResult.parse(row.receipt.result),
        }
      : null,
  };
}
export type RpgRewardDetail = NonNullable<
  Awaited<ReturnType<typeof rpgRewardDetail>>
>;
