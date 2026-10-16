import { worldFieldResult } from "../../../game/core/rpg/world/rewards";
import "server-only";
import { createHmac } from "node:crypto";
import { z } from "zod";
import { db } from "../../db";
import { economyJson } from "../../economy";
import { requireRpgSharedWorldEnabled } from "../guard";
import { isRpgSharedWorldEnabled } from "../../env";
import { lockRpgAccount, rpgTransaction } from "../transaction";
import { rewardHash } from "../reward-integrity";
import { WORLD_FIELD_V1 as config } from "../../../game/content/rpg/world-combat";
import { rpgAttributesSchema } from "../../../game/core/rpg";
import {
  equipmentDefinition,
  rollEquipmentAffixes,
  validateEquipment,
} from "../../../game/core/rpg/equipment";
import { applyRpgProgressionXp } from "../../../game/core/rpg/xp-progression";
import { gatheringCycle } from "../../../game/core/rpg/exploration/gathering";

const participant = z
  .object({
    userId: z.string().min(1).max(100),
    characterId: z.enum(["nara", "orin", "ivo", "sena"]),
    visitId: z.string().min(1).max(100),
    epoch: z.uuid(),
  })
  .strict();
const proofSchema = z
  .object({
    version: z.literal(1),
    kind: z.literal("FIELD_ENEMY_DEFEAT"),
    spawnId: z.string().refine((id) => config.camps.some((c) => c.id === id)),
    enemyType: z.literal("swarm"),
    participants: z.array(participant).min(1).max(20),
  })
  .strict()
  .refine(
    (p) =>
      new Set(p.participants.map((v) => v.userId)).size ===
      p.participants.length,
  );
export type WorldFieldProof = z.infer<typeof proofSchema>;
const eventSchema = z
  .object({
    id: z.uuid(),
    authorityId: z.uuid(),
    occurredAt: z.date(),
    privateSeed: z.string().regex(/^[a-f0-9]{64}$/),
    proof: proofSchema,
  })
  .strict();
/** Internal discrete evidence writer, called only by the authoritative coordinator.
 * There is intentionally no action/route accepting this payload.
 * Once durable, recovery does not require a living socket or runtime enemy.
 */
export async function persistWorldFieldEvent(raw: unknown) {
  requireRpgSharedWorldEnabled();
  const event = eventSchema.parse(raw);
  if (event.occurredAt.getTime() > Date.now() + 1000)
    throw Error("Invalid world event time");
  return rpgTransaction(async (tx) => {
    requireRpgSharedWorldEnabled();
    const prior = await tx.rpgWorldRewardEvent.findUnique({
      where: { id: event.id },
    });
    if (prior) {
      if (
        prior.authorityId !== event.authorityId ||
        prior.privateSeed !== event.privateSeed ||
        prior.occurredAt.getTime() !== event.occurredAt.getTime() ||
        rewardHash(prior.proof) !== rewardHash(event.proof)
      )
        throw Error("World event identity mismatch");
      return prior;
    }
    for (const p of [...event.proof.participants].sort((a, b) =>
      a.userId.localeCompare(b.userId),
    )) {
      await lockRpgAccount(tx, p.userId);
      const visit = await tx.rpgWorldVisit.findUnique({
        where: { id: p.visitId },
      });
      if (
        !visit ||
        visit.userId !== p.userId ||
        visit.characterId !== p.characterId ||
        visit.authorityId !== event.authorityId ||
        visit.createdAt > event.occurredAt ||
        (visit.endedAt && visit.endedAt < event.occurredAt)
      )
        throw Error("World event provenance mismatch");
    }
    return tx.rpgWorldRewardEvent.create({
      data: {
        ...event,
        zoneId: "ruins-outskirts",
        zoneVersion: 1,
        proof: economyJson(event.proof),
      },
    });
  });
}
/** Dedicated source and receipts; never invokes expedition or Survivor settlement. */
export async function settleWorldFieldEvent(eventId: string) {
  requireRpgSharedWorldEnabled();
  return rpgTransaction(async (tx) => {
    requireRpgSharedWorldEnabled();
    await tx.$queryRaw`SELECT id FROM limiar."RpgWorldRewardEvent" WHERE id=${eventId} FOR UPDATE`;
    const event = await tx.rpgWorldRewardEvent.findUniqueOrThrow({
      where: { id: eventId },
    });
    if (event.status === "SETTLED")
      return tx.rpgWorldRewardReceipt.findMany({
        where: { eventId },
        orderBy: { userId: "asc" },
      });
    if (
      event.status !== "PENDING" ||
      event.zoneId !== "ruins-outskirts" ||
      event.zoneVersion !== 1
    )
      throw Error("Unsupported field source");
    const proof = proofSchema.parse(event.proof),
      cycle = gatheringCycle(event.occurredAt.getTime()),
      receipts = [];
    for (const p of [...proof.participants].sort((a, b) =>
      a.userId.localeCompare(b.userId),
    )) {
      // Deleting an account must not make an otherwise valid event unrecoverable.
      if (!(await tx.rpgProfile.findUnique({ where: { userId: p.userId } })))
        continue;
      await lockRpgAccount(tx, p.userId);
      const character = await tx.rpgCharacter.findUniqueOrThrow({
        where: {
          userId_characterId: { userId: p.userId, characterId: p.characterId },
        },
      });
      const count = await tx.rpgWorldRewardReceipt.count({
          where: { userId: p.userId, cycle },
        }),
        eligible = count < config.dailyRewards;
      const next = applyRpgProgressionXp(
        {
          ...character,
          attributes: rpgAttributesSchema.parse(character.attributes),
        },
        eligible ? config.xp : 0,
        config.xp,
      );
      const where = {
          userId_materialId: {
            userId: p.userId,
            materialId: config.materialId,
          },
        },
        balance = await tx.rpgMaterialBalance.findUnique({ where });
      const quantity = eligible
        ? Math.min(
            config.materialQuantity,
            1_000_000_000 - (balance?.amount ?? 0),
          )
        : 0;
      if (quantity)
        await tx.rpgMaterialBalance.upsert({
          where,
          create: {
            userId: p.userId,
            materialId: config.materialId,
            amount: quantity,
          },
          update: { amount: { increment: quantity } },
        });
      const equipment = [];
      if (eligible && count < config.dailyEquipment) {
        const seed = createHmac("sha256", Buffer.from(event.privateSeed, "hex"))
          .update(JSON.stringify(["limiar-field-v1", event.id, p.userId, 0]))
          .digest("hex");
        const item = validateEquipment({
          id: "field-" + seed.slice(0, 32),
          itemId: config.equipmentId,
          rarity: "COMMON",
          level: 1,
          quantity: 1,
          contentVersion: 1,
          rollSeed: seed,
          affixes: rollEquipmentAffixes(
            equipmentDefinition(config.equipmentId),
            "COMMON",
            1,
            seed,
          ),
        });
        await tx.rpgItemInstance.create({
          data: {
            ...item,
            userId: p.userId,
            affixes: economyJson(item.affixes),
          },
        });
        equipment.push({
          id: item.id,
          itemId: item.itemId,
          rarity: item.rarity,
          level: item.level,
          affixes: item.affixes,
        });
      }
      const changed =
        next.xpGranted > 0 || quantity > 0 || equipment.length > 0;
      if (changed)
        await tx.rpgCharacter.update({
          where: { id: character.id },
          data: {
            xp: next.xp,
            level: next.level,
            attributePoints: next.attributePoints,
          },
        });
      const profile = changed
        ? await tx.rpgProfile.update({
            where: { userId: p.userId },
            data: { revision: { increment: 1 } },
          })
        : await tx.rpgProfile.findUniqueOrThrow({
            where: { userId: p.userId },
          });
      receipts.push(
        await tx.rpgWorldRewardReceipt.create({
          data: {
            eventId,
            userId: p.userId,
            characterId: p.characterId,
            cycle,
            xpGranted: next.xpGranted,
            revision: profile.revision,
            result: economyJson({
              version: 1,
              source: "FIELD_ENEMY_DEFEAT",
              eligible,
              previousLevel: character.level,
              newLevel: next.level,
              pointsGranted: next.attributePoints - character.attributePoints,
              materials: quantity
                ? [{ materialId: config.materialId, quantity }]
                : [],
              equipment,
            }),
          },
        }),
      );
    }
    await tx.rpgWorldRewardEvent.update({
      where: { id: eventId },
      data: { status: "SETTLED", settledAt: new Date() },
    });
    return receipts;
  });
}
export async function recoverWorldFieldRewards() {
  if (!isRpgSharedWorldEnabled()) return [];
  const pending = await db().rpgWorldRewardEvent.findMany({
    where: { status: "PENDING" },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: 20,
  });
  const receipts = [];
  for (const event of pending) {
    try {
      receipts.push(...(await settleWorldFieldEvent(event.id)));
    } catch {
      console.error("World field event remains pending recovery.");
    }
  }
  return receipts;
}
export async function worldRewardHistory(userId: string, raw: unknown = {}) {
  requireRpgSharedWorldEnabled();
  const { cursor } = z
    .object({ cursor: z.uuid().optional() })
    .strict()
    .parse(raw);
  // Cursor is scoped to the account and does not reveal another participant.
  const marker = cursor
    ? await db().rpgWorldRewardReceipt.findUnique({
        where: { eventId_userId: { eventId: cursor, userId } },
      })
    : null;
  if (cursor && !marker) throw Error("Invalid reward cursor");
  const rows = await db().rpgWorldRewardReceipt.findMany({
    where: {
      userId,
      ...(marker
        ? {
            OR: [
              { createdAt: { lt: marker.createdAt } },
              { createdAt: marker.createdAt, eventId: { lt: marker.eventId } },
            ],
          }
        : {}),
    },
    orderBy: [{ createdAt: "desc" }, { eventId: "desc" }],
    take: 21,
  });
  return {
    rewards: rows.slice(0, 20).map((r) => ({
      id: r.eventId,
      characterId: r.characterId,
      xp: r.xpGranted,
      revision: r.revision,
      result: worldFieldResult.parse(r.result),
      at: r.createdAt.toISOString(),
    })),
    nextCursor: rows.length > 20 ? rows[19].eventId : null,
  };
}
