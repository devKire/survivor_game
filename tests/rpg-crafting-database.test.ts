import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "../src/server/db";
import {
  openWorldVisit,
  checkpointWorldVisit,
} from "../src/server/rpg/world/presence";
import { withWorldServicePermit } from "../src/server/rpg/world/service-context";
import { mutateCrafting } from "../src/server/rpg/crafting/service";
import { rpgEquipmentData } from "../src/server/rpg/equipment";
import { equipmentModifiers } from "../src/game/core/rpg/equipment";
import {
  economyTransaction,
  lockProgress,
  grantCurrency,
  persistSave,
} from "../src/server/economy";
import { transferRpgItem } from "../src/server/rpg/storage";
const users: string[] = [];
/** Isolated integration fixtures, never gameplay evidence or public grants. */
async function account(materials = 100, gold = 100) {
  const userId = "forge_test_" + randomUUID();
  users.push(userId);
  await db().user.create({
    data: { id: userId, name: "QA", email: userId + "@example.test" },
  });
  const entry = await openWorldVisit(userId, randomUUID(), () => {});
  const progress = await db().userProgress.findUniqueOrThrow({
    where: { userId },
  });
  await db().userProgress.update({
    where: { userId },
    data: { data: { ...(progress.data as object), gold } },
  });
  await db().rpgMaterialBalance.createMany({
    data: ["weathered-ore", "ruins-fiber", "obelisk-dust", "echo-shard"].map(
      (materialId) => ({ userId, materialId, amount: materials }),
    ),
  });
  return {
    userId,
    entry,
    run: (input: unknown, assertLive = () => {}) =>
      withWorldServicePermit(
        { userId, visitId: entry.visit.id, assertLive },
        () => mutateCrafting(userId, input),
      ),
  };
}
type Account = Awaited<ReturnType<typeof account>>;
async function command(a: Account, extras: object = {}) {
  const profile = await db().rpgProfile.findUniqueOrThrow({
    where: { userId: a.userId },
  });
  const base = {
    operation: "CRAFT_ITEM",
    recipeId: "recipe:blade-weathered",
    recipeVersion: 1,
    catalogVersion: 1,
    requestId: randomUUID(),
    expectedRevision: profile.revision,
    ...extras,
  };
  return Object.fromEntries(
    Object.entries(base).filter(([, v]) => v !== undefined),
  ) as typeof base;
}
async function state(a: Account) {
  return {
    progress: await db().userProgress.findUniqueOrThrow({
      where: { userId: a.userId },
    }),
    profile: await db().rpgProfile.findUniqueOrThrow({
      where: { userId: a.userId },
    }),
    materials: await db().rpgMaterialBalance.findMany({
      where: { userId: a.userId },
      orderBy: { materialId: "asc" },
    }),
    items: await db().rpgItemInstance.findMany({
      where: { userId: a.userId },
      orderBy: { id: "asc" },
    }),
    receipts: await db().rpgMutationReceipt.count({
      where: { userId: a.userId },
    }),
    records: await db().rpgCommerceRecord.count({
      where: { userId: a.userId },
    }),
    currency: await db().currencyTransaction.count({
      where: { userId: a.userId },
    }),
  };
}
describe.skipIf(process.env.RUN_DATABASE_TESTS !== "1")(
  "Forge PostgreSQL transactions",
  () => {
    beforeAll(() => {
      vi.stubEnv("RPG_ENABLED", "true");
      vi.stubEnv("RPG_SHARED_WORLD_ENABLED", "true");
      vi.stubEnv("RPG_CRAFTING_ENABLED", "true");
    });
    afterAll(async () => {
      await db().user.deleteMany({ where: { id: { in: users } } });
      await db().$disconnect();
      vi.unstubAllEnvs();
    });
    it("crafts atomically, settles simultaneous identical requests once and replays after later revisions", async () => {
      const a = await account(),
        before = await state(a),
        c = await command(a);
      const [one, two] = await Promise.all([a.run(c), a.run(c)]);
      expect(two).toEqual(one);
      const after = await state(a);
      expect(after.items).toHaveLength(1);
      expect(after.items[0].location).toBe("INVENTORY");
      expect(after.items[0].equippedCharacterId).toBeNull();
      expect(
        after.materials.find((m) => m.materialId === "weathered-ore")?.amount,
      ).toBe(94);
      expect(
        after.materials.find((m) => m.materialId === "obelisk-dust")?.amount,
      ).toBe(98);
      expect(after.progress).toEqual(before.progress);
      expect(after.profile.revision).toBe(before.profile.revision + 1);
      expect(after.receipts).toBe(1);
      expect(after.records).toBe(1);
      await a.run(await command(a, { recipeId: "recipe:mantle-ash" }));
      expect(await a.run(c)).toEqual(one);
      await expect(
        a.run({ ...c, recipeId: "recipe:mantle-ash" }),
      ).rejects.toThrow(/requestId/);
      expect(JSON.stringify(one)).not.toMatch(
        /rollSeed|userId|authorityId|visitId/,
      );
    });
    it("allows only one distinct command for the same revision and never spends the last materials twice", async () => {
      const a = await account(6),
        c = await command(a);
      const results = await Promise.allSettled([
        a.run(c),
        a.run({ ...c, requestId: randomUUID() }),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect((await state(a)).items).toHaveLength(1);
      const previous = await state(a);
      await expect(a.run(await command(a))).rejects.toThrow(/Materiais/);
      expect(await state(a)).toEqual(previous);
    });
    it("buys and sells with the existing GOLD ledger/version while material-only refinement preserves version", async () => {
      const a = await account(),
        before = await state(a);
      const buy = await a.run(
        await command(a, {
          operation: "BUY_FROM_VENDOR",
          recipeId: undefined,
          recipeVersion: undefined,
          vendorId: "refuge:trader",
          stockItemId: "stock:blade",
        }),
      );
      const afterBuy = await state(a);
      expect((afterBuy.progress.data as { gold: number }).gold).toBe(88);
      expect(afterBuy.progress.version).toBe(before.progress.version + 1);
      const sell = await command(a, {
        operation: "SELL_TO_VENDOR",
        recipeId: undefined,
        recipeVersion: undefined,
        vendorId: "refuge:trader",
        instanceId: buy.item!.id,
      });
      const result = await a.run(sell);
      expect(result.gains.gold).toBe(1);
      const afterSell = await state(a);
      expect(afterSell.items).toHaveLength(0);
      expect(afterSell.progress.version).toBe(before.progress.version + 2);
      expect(afterSell.currency).toBe(2);
      expect(await a.run(sell)).toEqual(result);
      await a.run(
        await command(a, {
          operation: "REFINE_MATERIAL",
          recipeId: "refine:residual-dust",
        }),
      );
      expect((await state(a)).progress).toEqual(afterSell.progress);
    });
    it("upgrades and reforges the same instance with valid affixes and a stronger actual modifier set", async () => {
      const a = await account(),
        made = await a.run(await command(a));
      const baseline = equipmentModifiers(
        rpgEquipmentData((await state(a)).items[0]),
      );
      const upgraded = await a.run(
        await command(a, {
          operation: "UPGRADE_ITEM",
          recipeId: undefined,
          recipeVersion: undefined,
          instanceId: made.item!.id,
        }),
      );
      expect(upgraded.item?.id).toBe(made.item?.id);
      expect(upgraded.item?.rarity).toBe("RARE");
      expect(upgraded.item?.affixes).toHaveLength(1);
      const rolled = rpgEquipmentData((await state(a)).items[0]);
      expect(equipmentModifiers(rolled).length).toBeGreaterThan(
        baseline.length,
      );
      const reforged = await a.run(
        await command(a, {
          operation: "REFORGE_ITEM",
          recipeId: undefined,
          recipeVersion: undefined,
          instanceId: made.item!.id,
        }),
      );
      expect(reforged.item?.id).toBe(made.item?.id);
      expect(reforged.item?.rarity).toBe("RARE");
      expect(reforged.item?.level).toBe(1);
      expect((await state(a)).items).toHaveLength(1);
      expect(rpgEquipmentData((await state(a)).items[0]).rollSeed).not.toBe(
        rolled.rollSeed,
      );
    });
    it.each(["RpgItemInstance", "RpgMutationReceipt", "RpgCommerceRecord"])(
      "rolls back materials, GOLD, item, revision and ledger on failure inserting %s",
      async (table) => {
        const a = await account(),
          before = await state(a);
        await db().$executeRawUnsafe(
          `CREATE FUNCTION limiar.phase7_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'phase7 fault'; END $$`,
        );
        await db().$executeRawUnsafe(
          `CREATE TRIGGER phase7_fault BEFORE INSERT ON limiar."${table}" FOR EACH ROW EXECUTE FUNCTION limiar.phase7_fault()`,
        );
        try {
          const c =
            table === "RpgItemInstance"
              ? await command(a)
              : await command(a, {
                  operation: "BUY_FROM_VENDOR",
                  recipeId: undefined,
                  recipeVersion: undefined,
                  vendorId: "refuge:trader",
                  stockItemId: "stock:blade",
                });
          await expect(a.run(c)).rejects.toThrow();
          expect(await state(a)).toEqual(before);
        } finally {
          await db().$executeRawUnsafe(
            `DROP TRIGGER phase7_fault ON limiar."${table}"`,
          );
          await db().$executeRawUnsafe("DROP FUNCTION limiar.phase7_fault()");
        }
      },
    );
    it("rejects foreign, equipped, stashed, corrupt or already sold items without changing resources", async () => {
      const a = await account(),
        b = await account(),
        made = await a.run(await command(a));
      const sale = (owner: Account) =>
        command(owner, {
          operation: "SELL_TO_VENDOR",
          recipeId: undefined,
          recipeVersion: undefined,
          vendorId: "refuge:trader",
          instanceId: made.item!.id,
        });
      await expect(b.run(await sale(b))).rejects.toThrow(/próprio/);
      const character = await db().rpgCharacter.findFirstOrThrow({
        where: { userId: a.userId },
      });
      await db().rpgItemInstance.update({
        where: { id: made.item!.id },
        data: { equippedCharacterId: character.id, equippedSlot: "WEAPON" },
      });
      await expect(a.run(await sale(a))).rejects.toThrow(/desequipado/);
      await db().rpgItemInstance.update({
        where: { id: made.item!.id },
        data: {
          equippedCharacterId: null,
          equippedSlot: null,
          location: "STASH",
        },
      });
      await expect(a.run(await sale(a))).rejects.toThrow(/inventário/);
      await db().rpgItemInstance.update({
        where: { id: made.item!.id },
        data: { location: "INVENTORY" },
      });
      await a.run(await sale(a));
      await expect(a.run(await sale(a))).rejects.toThrow(/próprio/);
    });
    it("serializes competing Survivor currency writes with vendor purchases without losing either update", async () => {
      const a = await account(),
        initial = (await state(a)).progress.version;
      const buy = await command(a, {
        operation: "BUY_FROM_VENDOR",
        recipeId: undefined,
        recipeVersion: undefined,
        vendorId: "refuge:trader",
        stockItemId: "stock:blade",
      });
      await Promise.all([
        a.run(buy),
        economyTransaction(async (tx) => {
          const { save } = await lockProgress(tx, a.userId);
          await grantCurrency(tx, save, {
            userId: a.userId,
            currency: "GOLD",
            amount: 2,
            source: "integration-fixture",
            referenceId: randomUUID(),
          });
          await persistSave(tx, a.userId, save);
        }),
      ]);
      const after = await state(a);
      expect((after.progress.data as { gold: number }).gold).toBe(90);
      expect(after.progress.version).toBe(initial + 2);
      expect(after.currency).toBe(2);
    });
    it("uses shared revisions to exclude reforge against deposit and rechecks the spatial permit before commit", async () => {
      const a = await account(),
        made = await a.run(await command(a)),
        c = await command(a);
      const upgrade = await command(a, {
        operation: "UPGRADE_ITEM",
        recipeId: undefined,
        recipeVersion: undefined,
        instanceId: made.item!.id,
      });
      const permit = {
        userId: a.userId,
        visitId: a.entry.visit.id,
        assertLive: () => {},
      };
      const results = await Promise.allSettled([
        a.run(upgrade),
        withWorldServicePermit(permit, () =>
          transferRpgItem(a.userId, {
            operation: "DEPOSIT_ITEM",
            instanceId: made.item!.id,
            requestId: randomUUID(),
            expectedRevision: c.expectedRevision,
          }),
        ),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const before = await state(a);
      let checks = 0;
      await expect(
        a.run(await command(a), () => {
          if (++checks > 2) throw Error("presence lost");
        }),
      ).rejects.toThrow(/presence lost/);
      expect(await state(a)).toEqual(before);
    });
    it("enforces daily account caps, disabled flags, missing permits and Ruins rejection", async () => {
      const a = await account();
      for (let n = 0; n < 3; n++)
        await a.run(
          await command(a, {
            operation: "REFINE_MATERIAL",
            recipeId: "refine:residual-dust",
          }),
        );
      await expect(
        a.run(
          await command(a, {
            operation: "REFINE_MATERIAL",
            recipeId: "refine:residual-dust",
          }),
        ),
      ).rejects.toThrow(/Limite diário/);
      await expect(mutateCrafting(a.userId, await command(a))).rejects.toThrow(
        /estação/,
      );
      vi.stubEnv("RPG_CRAFTING_ENABLED", "false");
      await expect(a.run(await command(a))).rejects.toThrow(/indisponíveis/);
      vi.stubEnv("RPG_CRAFTING_ENABLED", "true");
      await checkpointWorldVisit(
        a.userId,
        a.entry.visit.id,
        a.entry.visit.epoch,
        "ruins-outskirts",
        () => {},
      );
      await expect(a.run(await command(a))).rejects.toThrow(/Refúgio/);
    });
  },
);
