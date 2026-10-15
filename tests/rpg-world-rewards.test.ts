import "dotenv/config";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "../src/server/db";
import {
  openWorldVisit,
  closeWorldVisit,
  checkpointWorldVisit,
} from "../src/server/rpg/world/presence";
import {
  persistWorldFieldEvent,
  settleWorldFieldEvent,
  recoverWorldFieldRewards,
  worldRewardHistory,
} from "../src/server/rpg/world/rewards";
import type { FieldEvent } from "../src/realtime/world/combat";
const users: string[] = [],
  events: string[] = [];
async function account() {
  const userId = "field_" + randomUUID(),
    authorityId = randomUUID();
  users.push(userId);
  await db().user.create({
    data: { id: userId, name: userId, email: userId + "@example.test" },
  });
  const entry = await openWorldVisit(userId, authorityId, () => {});
  await checkpointWorldVisit(
    userId,
    entry.visit.id,
    entry.visit.epoch,
    "ruins-outskirts",
    () => {},
  );
  return { ...entry, userId, authorityId };
}
function event(a: Awaited<ReturnType<typeof account>>): FieldEvent {
  const id = randomUUID();
  events.push(id);
  return {
    id,
    authorityId: a.authorityId,
    occurredAt: new Date(),
    privateSeed: randomBytes(32).toString("hex"),
    proof: {
      version: 1,
      kind: "FIELD_ENEMY_DEFEAT",
      spawnId: "ruins:field:1",
      enemyType: "swarm",
      participants: [
        {
          userId: a.userId,
          visitId: a.visit.id,
          epoch: a.visit.epoch,
          characterId: "nara",
        },
      ],
    },
  };
}
describe.skipIf(process.env.RUN_DATABASE_TESTS !== "1")(
  "Field rewards PostgreSQL",
  () => {
    beforeAll(() => {
      vi.stubEnv("RPG_ENABLED", "true");
      vi.stubEnv("RPG_SHARED_WORLD_ENABLED", "true");
    });
    afterAll(async () => {
      await db().user.deleteMany({ where: { id: { in: users } } });
      await db().rpgWorldRewardEvent.deleteMany({
        where: { id: { in: events } },
      });
      await db().$disconnect();
      vi.unstubAllEnvs();
    });
    it("settles concurrent retries once, advances permanent level and preserves Survivor version", async () => {
      const a = await account(),
        e = event(a),
        version = (
          await db().userProgress.findUniqueOrThrow({
            where: { userId: a.userId },
          })
        ).version;
      await db().rpgCharacter.update({
        where: {
          userId_characterId: { userId: a.userId, characterId: "nara" },
        },
        data: { xp: 98 },
      });
      await Promise.all([persistWorldFieldEvent(e), persistWorldFieldEvent(e)]);
      const [one, two] = await Promise.all([
        settleWorldFieldEvent(e.id),
        settleWorldFieldEvent(e.id),
      ]);
      expect(two).toEqual(one);
      expect(one[0].xpGranted).toBe(3);
      const character = await db().rpgCharacter.findUniqueOrThrow({
        where: {
          userId_characterId: { userId: a.userId, characterId: "nara" },
        },
      });
      expect(character.xp).toBe(101);
      expect(character.level).toBe(2);
      expect(character.attributePoints).toBeGreaterThan(0);
      const items = await db().rpgItemInstance.findMany({
        where: { userId: a.userId },
      });
      expect(items).toHaveLength(1);
      expect(items[0].equippedCharacterId).toBeNull();
      expect(await settleWorldFieldEvent(e.id)).toEqual(one);
      expect(
        (
          await db().userProgress.findUniqueOrThrow({
            where: { userId: a.userId },
          })
        ).version,
      ).toBe(version);
      expect(JSON.stringify(await worldRewardHistory(a.userId))).not.toMatch(
        /privateSeed|rollSeed|visitId|authorityId/,
      );
      await expect(
        persistWorldFieldEvent({
          ...e,
          privateSeed: randomBytes(32).toString("hex"),
        }),
      ).rejects.toThrow(/identity/);
    });
    it("rolls back material writes on an item conflict and recovers a durable event after disconnect", async () => {
      const a = await account(),
        b = await account(),
        e = event(a);
      await persistWorldFieldEvent(e);
      const seed = createHmac("sha256", Buffer.from(e.privateSeed, "hex"))
          .update(JSON.stringify(["limiar-field-v1", e.id, a.userId, 0]))
          .digest("hex"),
        id = "field-" + seed.slice(0, 32);
      // Deliberate database fixture collision happens after the material write.
      await db().rpgItemInstance.create({
        data: {
          id,
          userId: b.userId,
          itemId: "blade-weathered",
          rarity: "COMMON",
          level: 1,
          quantity: 1,
          contentVersion: 1,
          rollSeed: seed,
          affixes: [],
        },
      });
      const profile = await db().rpgProfile.findUniqueOrThrow({
        where: { userId: a.userId },
      });
      await expect(settleWorldFieldEvent(e.id)).rejects.toThrow();
      expect(
        await db().rpgMaterialBalance.count({ where: { userId: a.userId } }),
      ).toBe(0);
      expect(
        await db().rpgWorldRewardReceipt.count({ where: { eventId: e.id } }),
      ).toBe(0);
      expect(
        (
          await db().rpgProfile.findUniqueOrThrow({
            where: { userId: a.userId },
          })
        ).revision,
      ).toBe(profile.revision);
      expect(
        (
          await db().rpgWorldRewardEvent.findUniqueOrThrow({
            where: { id: e.id },
          })
        ).status,
      ).toBe("PENDING");
      await db().rpgItemInstance.delete({ where: { id } });
      await closeWorldVisit(a.userId, a.visit.id);
      await recoverWorldFieldRewards();
      expect((await settleWorldFieldEvent(e.id))[0].xpGranted).toBe(3);
      expect(
        await db().rpgItemInstance.count({ where: { userId: a.userId } }),
      ).toBe(1);
    });
    it("caps grants across visits, rejects foreign evidence and honors rollout", async () => {
      const a = await account(),
        b = await account(),
        bad = event(a);
      bad.proof.participants[0].visitId = b.visit.id;
      await expect(persistWorldFieldEvent(bad)).rejects.toThrow(/provenance/);
      expect(
        await db().rpgWorldRewardEvent.count({ where: { id: bad.id } }),
      ).toBe(0);
      for (let i = 0; i < 21; i++) {
        const e = event(a);
        await persistWorldFieldEvent(e);
        await settleWorldFieldEvent(e.id);
      }
      expect(
        (
          await db().rpgCharacter.findUniqueOrThrow({
            where: {
              userId_characterId: { userId: a.userId, characterId: "nara" },
            },
          })
        ).xp,
      ).toBe(60);
      expect(
        (
          await db().rpgMaterialBalance.findUniqueOrThrow({
            where: {
              userId_materialId: {
                userId: a.userId,
                materialId: "obelisk-dust",
              },
            },
          })
        ).amount,
      ).toBe(20);
      expect(
        await db().rpgItemInstance.count({ where: { userId: a.userId } }),
      ).toBe(1);
      const page = await worldRewardHistory(a.userId);
      expect(page.rewards).toHaveLength(20);
      expect(page.nextCursor).toBeTruthy();
      expect(
        (await worldRewardHistory(a.userId, { cursor: page.nextCursor }))
          .rewards,
      ).toHaveLength(1);
      await expect(
        worldRewardHistory(b.userId, { cursor: page.nextCursor }),
      ).rejects.toThrow();
      await expect(
        persistWorldFieldEvent({
          ...event(a),
          proof: { ...event(a).proof, kind: "EXPEDITION_COMPLETION" },
        }),
      ).rejects.toThrow();
      vi.stubEnv("RPG_SHARED_WORLD_ENABLED", "false");
      await expect(persistWorldFieldEvent(event(a))).rejects.toThrow();
      expect(await recoverWorldFieldRewards()).toEqual([]);
    });
  },
);
