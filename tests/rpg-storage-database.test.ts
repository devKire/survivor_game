import "dotenv/config";
import { randomUUID } from "node:crypto";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { db } from "../src/server/db";
import { rpgProfileData } from "../src/server/rpg/profile";
import { transferRpgItem } from "../src/server/rpg/storage";
import { mutateRpgEquipment } from "../src/server/rpg/mutations";
import { buildRpgCombatLoadout } from "../src/server/rpg/loadout";
import { RPG_STASH_CAPACITY } from "../src/game/core/rpg/storage";
import {
  equipmentDefinition,
  rollEquipmentAffixes,
} from "../src/game/core/rpg";
import { json } from "../src/server/progress";
import {
  economyTransaction,
  lockProgress,
  grantCurrency,
  persistSave,
} from "../src/server/economy";
const users: string[] = [];
async function fixture() {
  const userId = "stash_" + randomUUID();
  users.push(userId);
  await db().user.create({
    data: { id: userId, name: userId, email: userId + "@example.test" },
  });
  await rpgProfileData(userId);
  return userId;
}
async function item(userId: string) {
  return db().rpgItemInstance.create({
    data: {
      userId,
      itemId: "blade-weathered",
      rarity: "RARE",
      quantity: 7,
      rollSeed: "storage-seed",
      affixes: json(
        rollEquipmentAffixes(
          equipmentDefinition("blade-weathered"),
          "RARE",
          1,
          "storage-seed",
        ),
      ),
    },
  });
}
function intent(
  instanceId: string,
  expectedRevision = 1,
  operation = "DEPOSIT_ITEM",
) {
  return { instanceId, expectedRevision, operation, requestId: randomUUID() };
}
describe.skipIf(process.env.RUN_DATABASE_TESTS !== "1")(
  "Storage on real PostgreSQL",
  () => {
    beforeEach(() => {
      vi.stubEnv("RPG_ENABLED", "true");
      vi.stubEnv("RPG_REFUGE_ENABLED", "true");
    });
    afterEach(() => vi.unstubAllEnvs());
    afterAll(async () => {
      await db().user.deleteMany({ where: { id: { in: users } } });
      await db().$disconnect();
    });
    it("moves the same instance and stack, preserves metadata/economy and replays receipts after withdrawal", async () => {
      const u = await fixture(),
        i = await item(u),
        cmd = intent(i.id),
        progress = await db().userProgress.findUnique({ where: { userId: u } });
      const result = await transferRpgItem(u, cmd);
      expect(result.location).toBe("STASH");
      const saved = await db().rpgItemInstance.findUniqueOrThrow({
        where: { id: i.id },
      });
      expect({
        ...saved,
        location: i.location,
        updatedAt: i.updatedAt,
      }).toEqual(i);
      expect((await buildRpgCombatLoadout(u, "nara")).equipment).toHaveLength(
        0,
      );
      await expect(
        mutateRpgEquipment(u, {
          ...intent(i.id, 2, "EQUIP_ITEM"),
          characterId: "nara",
          slot: "WEAPON",
        }),
      ).rejects.toThrow("Retire");
      await transferRpgItem(u, intent(i.id, 2, "WITHDRAW_ITEM"));
      expect(await transferRpgItem(u, cmd)).toEqual(result);
      expect((await rpgProfileData(u)).items[0].location).toBe("INVENTORY");
      expect(await db().rpgItemInstance.count({ where: { userId: u } })).toBe(
        1,
      );
      expect(
        await db().userProgress.findUnique({ where: { userId: u } }),
      ).toEqual(progress);
    });
    it("rejects foreign/missing IDs, wrong location, stale revision and changed payload", async () => {
      const u = await fixture(),
        v = await fixture(),
        i = await item(u),
        cmd = intent(i.id);
      await expect(transferRpgItem(v, cmd)).rejects.toThrow("indisponível");
      await expect(transferRpgItem(u, intent("missing"))).rejects.toThrow(
        "indisponível",
      );
      await expect(
        transferRpgItem(u, intent(i.id, 1, "WITHDRAW_ITEM")),
      ).rejects.toThrow("localização");
      await transferRpgItem(u, cmd);
      await expect(
        transferRpgItem(u, { ...cmd, operation: "WITHDRAW_ITEM" }),
      ).rejects.toThrow("requestId");
      await expect(transferRpgItem(u, intent(i.id))).rejects.toThrow(
        "outra aba",
      );
      await expect(transferRpgItem(u, intent(i.id, 2))).rejects.toThrow(
        "localização",
      );
      await expect(
        transferRpgItem(u, { ...intent(i.id, 2), userId: v }),
      ).rejects.toThrow();
    });
    it("serializes same-request and same-revision races without duplication", async () => {
      const u = await fixture(),
        i = await item(u),
        cmd = intent(i.id);
      const results = await Promise.all([
        transferRpgItem(u, cmd),
        transferRpgItem(u, cmd),
      ]);
      expect(results[0]).toEqual(results[1]);
      const outcomes = await Promise.allSettled([
        transferRpgItem(u, intent(i.id, 2, "WITHDRAW_ITEM")),
        transferRpgItem(u, intent(i.id, 2, "WITHDRAW_ITEM")),
      ]);
      expect(outcomes.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(
        await db().rpgMutationReceipt.count({ where: { userId: u } }),
      ).toBe(2);
      expect(await db().rpgItemInstance.count({ where: { userId: u } })).toBe(
        1,
      );
    });
    it("rejects equipped deposit and SQL corruption; full account cascade works", async () => {
      const u = await fixture(),
        i = await item(u);
      await db().rpgItemInstance.update({
        where: { id: i.id },
        data: { quantity: 1 },
      });
      await mutateRpgEquipment(u, {
        ...intent(i.id, 1, "EQUIP_ITEM"),
        characterId: "nara",
        slot: "WEAPON",
      });
      await expect(transferRpgItem(u, intent(i.id, 2))).rejects.toThrow(
        "Desequipe",
      );
      await expect(
        db().rpgItemInstance.update({
          where: { id: i.id },
          data: { location: "STASH" },
        }),
      ).rejects.toThrow();
      await expect(
        db().rpgItemInstance.update({
          where: { id: i.id },
          data: { location: "forged" },
        }),
      ).rejects.toThrow();
      await mutateRpgEquipment(u, {
        ...intent(i.id, 2, "UNEQUIP_ITEM"),
        characterId: "nara",
        slot: "WEAPON",
      });
      await transferRpgItem(u, intent(i.id, 3));
      await db().user.delete({ where: { id: u } });
      expect(await db().rpgItemInstance.count({ where: { userId: u } })).toBe(
        0,
      );
      expect(
        await db().rpgMutationReceipt.count({ where: { userId: u } }),
      ).toBe(0);
    });
    it("enforces capacity under concurrent deposits and rejects disabled flags", async () => {
      const u = await fixture();
      await db().rpgItemInstance.createMany({
        data: Array.from({ length: RPG_STASH_CAPACITY - 1 }, () => ({
          userId: u,
          itemId: "blade-weathered",
          rarity: "COMMON",
          location: "STASH",
        })),
      });
      const a = await item(u),
        b = await item(u);
      const results = await Promise.allSettled([
        transferRpgItem(u, intent(a.id)),
        transferRpgItem(u, intent(b.id)),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const remaining = await db().rpgItemInstance.findFirstOrThrow({
        where: { userId: u, location: "INVENTORY" },
      });
      await expect(transferRpgItem(u, intent(remaining.id, 2))).rejects.toThrow(
        "cheio",
      );
      vi.stubEnv("RPG_REFUGE_ENABLED", "false");
      await expect(transferRpgItem(u, intent(remaining.id, 2))).rejects.toThrow(
        "indisponível",
      );
      vi.stubEnv("RPG_REFUGE_ENABLED", "true");
      vi.stubEnv("RPG_ENABLED", "false");
      await expect(transferRpgItem(u, intent(remaining.id, 2))).rejects.toThrow(
        "indisponível",
      );
    });
    it("serializes with economic writes without touching their version or currency", async () => {
      const u = await fixture(),
        i = await item(u);
      await Promise.all([
        transferRpgItem(u, intent(i.id)),
        economyTransaction(async (tx) => {
          const { save } = await lockProgress(tx, u);
          await grantCurrency(tx, save, {
            userId: u,
            currency: "GOLD",
            amount: 7,
            source: "storage-test",
            referenceId: "gold",
          });
          await persistSave(tx, u, save);
        }),
      ]);
      const progress = await db().userProgress.findUniqueOrThrow({
        where: { userId: u },
      });
      expect(progress.version).toBe(2);
      expect(progress.data).toMatchObject({ gold: 7 });
      expect((await rpgProfileData(u)).revision).toBe(2);
    });
    it("rolls back item and revision if receipt insertion fails, then safely retries", async () => {
      const u = await fixture(),
        i = await item(u),
        cmd = intent(i.id),
        before = await rpgProfileData(u);
      await db().$executeRawUnsafe(
        `CREATE FUNCTION limiar.rpg_storage_test_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.operation='DEPOSIT_ITEM' THEN RAISE EXCEPTION 'injected before receipt'; END IF; RETURN NEW; END $$`,
      );
      await db().$executeRawUnsafe(
        `CREATE TRIGGER rpg_storage_test_fail BEFORE INSERT ON limiar."RpgMutationReceipt" FOR EACH ROW EXECUTE FUNCTION limiar.rpg_storage_test_fail()`,
      );
      try {
        await expect(transferRpgItem(u, cmd)).rejects.toThrow();
        expect(await rpgProfileData(u)).toEqual(before);
        expect(
          await db().rpgMutationReceipt.count({ where: { userId: u } }),
        ).toBe(0);
      } finally {
        await db().$executeRawUnsafe(
          `DROP TRIGGER rpg_storage_test_fail ON limiar."RpgMutationReceipt"`,
        );
        await db().$executeRawUnsafe(
          `DROP FUNCTION limiar.rpg_storage_test_fail()`,
        );
      }
      expect((await transferRpgItem(u, cmd)).revision).toBe(2);
    });
  },
);
