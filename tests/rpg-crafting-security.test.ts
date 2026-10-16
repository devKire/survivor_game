import "dotenv/config";
import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { db } from "../src/server/db";
import { openWorldVisit } from "../src/server/rpg/world/presence";
import { withWorldServicePermit } from "../src/server/rpg/world/service-context";
import { mutateCrafting } from "../src/server/rpg/crafting/service";
import {
  craftingCatalog,
  craftingHistory,
} from "../src/server/rpg/crafting/catalog";
import { mutateQuest } from "../src/server/rpg/quests/service";
import { craftingResultSchema } from "../src/game/core/rpg/crafting/types";
import { Player } from "../src/game/core/entities";
import { createRpgCombatLoadout } from "../src/game/core/rpg/loadout";
import { rpgEquipmentData } from "../src/server/rpg/equipment";
import { getQuestDefinition } from "../src/game/content/rpg/quests";
const users: string[] = [];
/** Explicit database fixtures only; the primary browser scenario acquires every ingredient in gameplay. */
async function account() {
  const userId = "forge_security_" + randomUUID();
  users.push(userId);
  await db().user.create({
    data: { id: userId, name: "QA", email: userId + "@example.test" },
  });
  const entry = await openWorldVisit(userId, randomUUID(), () => {}),
    permit = { userId, visitId: entry.visit.id, assertLive: () => {} };
  await db().rpgMaterialBalance.createMany({
    data: ["weathered-ore", "ruins-fiber", "obelisk-dust", "echo-shard"].map(
      (materialId) => ({ userId, materialId, amount: 100 }),
    ),
  });
  return {
    userId,
    permit,
    run: (args: unknown) =>
      withWorldServicePermit(permit, () => mutateCrafting(userId, args)),
    read: <T>(f: () => Promise<T>) => withWorldServicePermit(permit, f),
  };
}
type Account = Awaited<ReturnType<typeof account>>;
async function command(a: Account, fields: object) {
  return {
    catalogVersion: 1,
    expectedRevision: (
      await db().rpgProfile.findUniqueOrThrow({ where: { userId: a.userId } })
    ).revision,
    requestId: randomUUID(),
    ...fields,
  };
}
async function story(a: Account, questId = "main:material-echoes") {
  const date = new Date();
  const progress = await db().rpgQuestProgress.create({
    data: {
      userId: a.userId,
      characterId: "nara",
      questId,
      questVersion: 1,
      scope: "ACCOUNT",
      scopeKey: "ACCOUNT",
      acceptedRevision: 1,
      acceptedAt: date,
    },
  });
  await db().rpgQuestProgress.update({
    where: { id: progress.id },
    data: { status: "COMPLETED", completedAt: date },
  });
  await db().rpgQuestProgress.update({
    where: { id: progress.id },
    data: { status: "REWARDED", rewardedAt: date },
  });
  await db().rpgStoryFlag.create({
    data: {
      userId: a.userId,
      flagId: "material-samples-delivered",
      sourceProgressId: progress.id,
    },
  });
  return progress;
}
describe.skipIf(process.env.RUN_DATABASE_TESTS !== "1")(
  "Forge narrative and security invariants",
  () => {
    beforeAll(() => {
      for (const key of [
        "RPG_ENABLED",
        "RPG_SHARED_WORLD_ENABLED",
        "RPG_CRAFTING_ENABLED",
        "RPG_QUESTS_ENABLED",
      ])
        vi.stubEnv(key, "true");
    });
    afterAll(async () => {
      await db().user.deleteMany({ where: { id: { in: users } } });
      await db().$disconnect();
      vi.unstubAllEnvs();
    });
    it("requires a canonical narrative flag backed by a durable rewarded quest and applies the rare craft cap", async () => {
      const a = await account();
      await db().rpgCharacter.updateMany({
        where: { userId: a.userId },
        data: { level: 5, xp: 1600, attributePoints: 20 },
      });
      const fields = {
        operation: "CRAFT_ITEM",
        recipeId: "recipe:blade-echo",
        recipeVersion: 1,
      };
      await expect(a.run(await command(a, fields))).rejects.toThrow(/Matéria/);
      const q = await story(a);
      await expect(a.run(await command(a, fields))).rejects.toThrow(/Matéria/);
      await db().rpgQuestRewardReceipt.create({
        data: {
          questProgressId: q.id,
          userId: a.userId,
          revision: 1,
          result: {},
        },
      });
      const one = await a.run(await command(a, fields));
      expect(one.item?.rarity).toBe("RARE");
      await expect(
        a.run(await command(a, { ...fields, recipeId: "recipe:mantle-still" })),
      ).rejects.toThrow(/personagem/);
      await a.run(await command(a, fields));
      await expect(a.run(await command(a, fields))).rejects.toThrow(/rara/);
      expect(
        await db().rpgItemInstance.count({ where: { userId: a.userId } }),
      ).toBe(2);
      const b = await account();
      await db().rpgCharacter.updateMany({
        where: { userId: b.userId },
        data: { level: 5, xp: 1600, attributePoints: 20 },
      });
      const wrong = await story(b, "main:refuge-introduction");
      await db().rpgQuestRewardReceipt.create({
        data: {
          questProgressId: wrong.id,
          userId: b.userId,
          revision: 1,
          result: {},
        },
      });
      await expect(b.run(await command(b, fields))).rejects.toThrow(/Matéria/);
    });
    it("limits GOLD creation, blocks repeat sale and preserves historical inventory beyond the creation cap", async () => {
      const a = await account();
      await db().rpgItemInstance.createMany({
        data: Array.from({ length: 201 }, (_, i) => ({
          id: "old-" + randomUUID(),
          userId: a.userId,
          itemId: "blade-weathered",
          rarity: i === 0 ? "EPIC" : i === 1 ? "RARE" : "COMMON",
        })),
      });
      await expect(
        a.run(
          await command(a, {
            operation: "CRAFT_ITEM",
            recipeId: "recipe:mantle-ash",
            recipeVersion: 1,
          }),
        ),
      ).rejects.toThrow(/Limite de criação/);
      expect(
        await db().rpgItemInstance.count({ where: { userId: a.userId } }),
      ).toBe(201);
      const sale = async (rarity: string) => {
        const row = await db().rpgItemInstance.findFirstOrThrow({
          where: { userId: a.userId, rarity },
        });
        return a.run(
          await command(a, {
            operation: "SELL_TO_VENDOR",
            vendorId: "refuge:trader",
            instanceId: row.id,
          }),
        );
      };
      expect((await sale("EPIC")).gains.gold).toBe(3);
      expect((await sale("RARE")).gains.gold).toBe(2);
      await expect(sale("COMMON")).rejects.toThrow(/GOLD/);
      expect(
        await db().currencyTransaction.count({ where: { userId: a.userId } }),
      ).toBe(2);
      const progress = await db().userProgress.findUniqueOrThrow({
        where: { userId: a.userId },
      });
      expect((progress.data as { gold: number }).gold).toBe(5);
      expect(
        await db().rpgItemInstance.count({ where: { userId: a.userId } }),
      ).toBe(199);
    });
    it("paginates immutable owned history and ignores unknown or mismatched proof content", async () => {
      const a = await account(),
        other = await account();
      const time = new Date();
      for (let n = 0; n < 25; n++) {
        // Historical integration records across different days, not economic grants.
        const requestId = randomUUID(),
          result = craftingResultSchema.parse({
            version: 1,
            requestId,
            operation: "REFINE_MATERIAL",
            revision: 1,
            characterId: "nara",
            at: time.toISOString(),
            sourceId: "refine:residual-dust",
            costs: { gold: 0, materials: [] },
            gains: { gold: 0, materials: [] },
            before: null,
            item: null,
          });
        await db().rpgMutationReceipt.create({
          data: {
            userId: a.userId,
            requestId,
            operation: result.operation,
            payloadHash: "a".repeat(64),
            revision: 1,
            result,
          },
        });
        await db().rpgCommerceRecord.create({
          data: {
            userId: a.userId,
            requestId,
            characterId: "nara",
            operation: result.operation,
            cycle: n,
            result,
          },
        });
      }
      const first = await a.read(() =>
        craftingHistory(a.userId, { stationId: "refuge:forge" }),
      );
      const second = await a.read(() =>
        craftingHistory(a.userId, {
          stationId: "refuge:forge",
          cursor: first.next,
        }),
      );
      expect(first.records).toHaveLength(20);
      expect(second.records).toHaveLength(5);
      expect(second.next).toBeNull();
      expect(
        new Set([...first.records, ...second.records].map((r) => r.requestId))
          .size,
      ).toBe(25);
      await expect(
        other.read(() =>
          craftingHistory(other.userId, {
            stationId: "refuge:forge",
            cursor: first.next,
          }),
        ),
      ).rejects.toThrow(/Histórico/);
      await expect(
        db().rpgCommerceRecord.update({
          where: {
            userId_requestId: {
              userId: a.userId,
              requestId: first.records[0].requestId,
            },
          },
          data: { goldGranted: 3 },
        }),
      ).rejects.toThrow();
    });
    it("serializes crafting against quest delivery costs and keeps forged equipment isolated from Survivor and PvP", async () => {
      const a = await account();
      await db().rpgMaterialBalance.update({
        where: {
          userId_materialId: { userId: a.userId, materialId: "weathered-ore" },
        },
        data: { amount: 6 },
      });
      await db().rpgMaterialBalance.update({
        where: {
          userId_materialId: { userId: a.userId, materialId: "ruins-fiber" },
        },
        data: { amount: 4 },
      });
      const date = new Date(),
        definition = getQuestDefinition("main:material-echoes");
      const q = await db().rpgQuestProgress.create({
        data: {
          userId: a.userId,
          characterId: "nara",
          questId: definition.id,
          questVersion: 1,
          scope: "ACCOUNT",
          scopeKey: "ACCOUNT",
          acceptedRevision: 1,
          acceptedAt: date,
        },
      });
      await db().rpgQuestObjectiveProof.createMany({
        data: definition.objectives.map((o) => ({
          userId: a.userId,
          questProgressId: q.id,
          objectiveId: o.id,
          sourceKind: o.kind,
          sourceId: "integration-fixture:" + o.id,
          quantity: o.target,
        })),
      });
      await db().rpgQuestProgress.update({
        where: { id: q.id },
        data: { status: "COMPLETED", completedAt: date },
      });
      const craft = await command(a, {
        operation: "CRAFT_ITEM",
        recipeId: "recipe:blade-weathered",
        recipeVersion: 1,
      });
      const outcomes = await Promise.allSettled([
        a.run(craft),
        a.read(() =>
          mutateQuest(a.userId, {
            kind: "CLAIM",
            questId: definition.id,
            requestId: randomUUID(),
            expectedRevision: craft.expectedRevision,
          }),
        ),
      ]);
      expect(outcomes.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const materials = await db().rpgMaterialBalance.findMany({
        where: { userId: a.userId },
      });
      expect([0, 2]).toContain(
        materials.find((m) => m.materialId === "weathered-ore")!.amount,
      );
      expect([0, 4]).toContain(
        materials.find((m) => m.materialId === "ruins-fiber")!.amount,
      );
      const b = await account();
      await b.run(
        await command(b, {
          operation: "CRAFT_ITEM",
          recipeId: "recipe:blade-weathered",
          recipeVersion: 1,
        }),
      );
      const row = await db().rpgItemInstance.findFirstOrThrow({
        where: { userId: b.userId },
      });
      await b.run(
        await command(b, { operation: "UPGRADE_ITEM", instanceId: row.id }),
      );
      const equipment = rpgEquipmentData(
        await db().rpgItemInstance.findUniqueOrThrow({ where: { id: row.id } }),
      );
      const loadout = createRpgCombatLoadout({
        characterId: "nara",
        level: 1,
        attributes: { vitality: 0, power: 0, agility: 0, focus: 0, will: 0 },
        equipment: [equipment],
        profileRevision: 1,
      });
      const classic = new Player("nara", {}, "PVE");
      const rpg = new Player("nara", {}, "PVE", {
        kind: "RPG_EXPEDITION",
        loadout,
      });
      const pvp = new Player("nara", {}, "PVP");
      expect(rpg.stats).not.toEqual(classic.stats);
      expect(new Player("nara", {}, "PVE").stats).toEqual(classic.stats);
      expect(new Player("nara", {}, "PVP").stats).toEqual(pvp.stats);
      const catalog = await b.read(() =>
        craftingCatalog(b.userId, { stationId: "refuge:forge" }),
      );
      expect(catalog.items[0].rarity).toBe("RARE");
    });
  },
);
