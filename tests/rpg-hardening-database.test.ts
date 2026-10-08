import "dotenv/config";
import { createHash, randomUUID } from "node:crypto";
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
import { freshSave } from "../src/game/core/save";
import { initialRpgAttributes } from "../src/game/core/rpg";
import { importLocal, json, syncSolo } from "../src/server/progress";
import {
  economyTransaction,
  grantCurrency,
  lockProgress,
  persistSave,
} from "../src/server/economy";
import { rpgProfileData } from "../src/server/rpg/profile";
import {
  allocateRpgAttributes,
  selectRpgCharacter,
} from "../src/server/rpg/mutations";
import { rpgTransaction } from "../src/server/rpg/transaction";

const enabled = process.env.RUN_DATABASE_TESTS === "1";
const users: string[] = [];
function gate() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
async function fixture(unlocked = ["nara", "ivo"], withProgress = true) {
  const id = "rh_" + randomUUID();
  await db().user.create({
    data: { id, name: id, email: `${id}@example.test` },
  });
  users.push(id);
  if (withProgress)
    await db().userProgress.create({
      data: { userId: id, data: json({ ...freshSave(), unlocked }) },
    });
  return id;
}
function command(expectedRevision = 1, characterId = "nara") {
  return { requestId: randomUUID(), expectedRevision, characterId };
}
async function levelFixture(userId: string, level = 2) {
  await rpgProfileData(userId);
  await db().rpgCharacter.update({
    where: { userId_characterId: { userId, characterId: "nara" } },
    data: { ...initialRpgAttributes(level), xp: 100 * (level - 1) ** 2 },
  });
}
async function snapshot(userId: string) {
  return {
    progress: await db().userProgress.findUnique({ where: { userId } }),
    profile: await db().rpgProfile.findUnique({
      where: { userId },
      include: { characters: true, mutationReceipts: true },
    }),
  };
}

describe.skipIf(!enabled)("RPG hardening on PostgreSQL", () => {
  beforeEach(() => vi.stubEnv("RPG_ENABLED", "true"));
  afterEach(() => vi.unstubAllEnvs());
  afterAll(async () => {
    await db().user.deleteMany({ where: { id: { in: users } } });
    await db().$disconnect();
  });

  it("initializes a brand-new account concurrently exactly once", async () => {
    const userId = await fixture(["nara"], false);
    const values = await Promise.all([
      rpgProfileData(userId),
      rpgProfileData(userId),
    ]);
    expect(values[0]).toEqual(values[1]);
    expect(values[0].revision).toBe(1);
    expect(values[0].characters).toHaveLength(1);
    expect(values[0].characters[0].attributePoints).toBe(0);
    expect(
      (await db().userProgress.findUniqueOrThrow({ where: { userId } }))
        .version,
    ).toBe(1);
  });

  it("reads an existing profile while its write locks are held, without writes or revision changes", async () => {
    const userId = await fixture();
    const expected = await rpgProfileData(userId);
    const before = await snapshot(userId);
    const locked = gate(),
      release = gate();
    const writer = db().$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT "userId" FROM limiar."UserProgress" WHERE "userId"=${userId} FOR UPDATE`;
        await tx.$queryRaw`SELECT "userId" FROM limiar."RpgProfile" WHERE "userId"=${userId} FOR UPDATE`;
        locked.resolve();
        await release.promise;
      },
      { timeout: 10000 },
    );
    try {
      await locked.promise;
      const read = await Promise.race([
        rpgProfileData(userId),
        new Promise<never>((_, reject) => {
          const timer = setTimeout(
            () => reject(new Error("Read waited on write lock")),
            2000,
          );
          timer.unref();
        }),
      ]);
      expect(read).toEqual(expected);
    } finally {
      release.resolve();
      await writer;
    }
    expect(await snapshot(userId)).toEqual(before);
  });

  it("reconciles later unlocks once and hides a character whose unlock was removed", async () => {
    const userId = await fixture(["nara"]);
    await rpgProfileData(userId);
    await db().userProgress.update({
      where: { userId },
      data: { data: json({ ...freshSave(), unlocked: ["nara", "ivo"] }) },
    });
    const values = await Promise.all([
      rpgProfileData(userId),
      rpgProfileData(userId),
    ]);
    expect(values[0].revision).toBe(2);
    expect(values[0]).toEqual(values[1]);
    await selectRpgCharacter(userId, command(2, "ivo"));
    await db().userProgress.update({
      where: { userId },
      data: { data: json(freshSave()) },
    });
    const hidden = await rpgProfileData(userId);
    expect(hidden.characters.map((c) => c.characterId)).toEqual(["nara"]);
    expect(hidden.activeCharacterId).toBe(hidden.characters[0].id);
    expect(
      (await db().userProgress.findUniqueOrThrow({ where: { userId } }))
        .version,
    ).toBe(1);
  });

  it("commits identical simultaneous requestIds once and replays after later mutations", async () => {
    const userId = await fixture();
    await rpgProfileData(userId);
    const input = command(1, "ivo");
    const before = await db().userProgress.findUnique({ where: { userId } });
    const results = await Promise.all([
      selectRpgCharacter(userId, input),
      selectRpgCharacter(userId, input),
    ]);
    expect(results).toEqual([
      { revision: 2, characterId: "ivo" },
      { revision: 2, characterId: "ivo" },
    ]);
    await selectRpgCharacter(userId, command(2));
    expect(await selectRpgCharacter(userId, input)).toEqual(results[0]);
    expect((await rpgProfileData(userId)).revision).toBe(3);
    expect(
      await db().rpgMutationReceipt.count({
        where: { userId, requestId: input.requestId },
      }),
    ).toBe(1);
    await expect(
      selectRpgCharacter(userId, { ...input, characterId: "nara" }),
    ).rejects.toThrow("requestId");
    await expect(
      allocateRpgAttributes(userId, {
        ...input,
        attribute: "power",
        amount: 1,
      }),
    ).rejects.toThrow("requestId");
    expect(await db().userProgress.findUnique({ where: { userId } })).toEqual(
      before,
    );
  });

  it("replays a Phase 1 receipt with its original fingerprint without reconciling new unlocks", async () => {
    const userId = await fixture(["nara"]);
    await rpgProfileData(userId);
    const input = command();
    const result = { revision: 2, characterId: "nara" };
    await db().rpgProfile.update({ where: { userId }, data: { revision: 2 } });
    // The field order and numeric revision are the Phase 1 canonical payload.
    await db().rpgMutationReceipt.create({
      data: {
        userId,
        requestId: input.requestId,
        operation: "select-character",
        payloadHash: createHash("sha256")
          .update(JSON.stringify(input))
          .digest("hex"),
        revision: 2,
        result,
      },
    });
    await db().userProgress.update({
      where: { userId },
      data: { data: json({ ...freshSave(), unlocked: ["nara", "ivo"] }) },
    });
    const before = await snapshot(userId);
    expect(await selectRpgCharacter(userId, input)).toEqual(result);
    expect(await snapshot(userId)).toEqual(before);
  });

  it("allows only one of two different requests at the same revision", async () => {
    const userId = await fixture();
    await rpgProfileData(userId);
    const results = await Promise.allSettled([
      selectRpgCharacter(userId, command()),
      selectRpgCharacter(userId, command(1, "ivo")),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const failed = results.find((r) => r.status === "rejected");
    expect(failed?.status === "rejected" && failed.reason.message).toContain(
      "outra aba",
    );
    expect(await db().rpgMutationReceipt.count({ where: { userId } })).toBe(1);
    expect((await rpgProfileData(userId)).revision).toBe(2);
  });

  it("persists attribute allocation exactly once under contention without affecting another character", async () => {
    const userId = await fixture();
    await levelFixture(userId);
    const before = await db().userProgress.findUnique({ where: { userId } });
    const input = { ...command(), attribute: "power", amount: 3 };
    const results = await Promise.all([
      allocateRpgAttributes(userId, input),
      allocateRpgAttributes(userId, input),
    ]);
    expect(results[0]).toEqual(results[1]);
    const profile = await rpgProfileData(userId);
    expect(
      profile.characters.find((c) => c.characterId === "nara"),
    ).toMatchObject({ attributePoints: 2, attributes: { power: 3 }, xp: 100 });
    expect(
      profile.characters.find((c) => c.characterId === "ivo"),
    ).toMatchObject({ attributePoints: 0, attributes: { power: 0 }, xp: 0 });
    await expect(
      allocateRpgAttributes(userId, {
        ...command(2),
        attribute: "power",
        amount: 3,
      }),
    ).rejects.toThrow("insuficientes");
    expect(await db().userProgress.findUnique({ where: { userId } })).toEqual(
      before,
    );
  });

  it("serializes with economy transactions without losing GOLD/GEMS or changing their version itself", async () => {
    const userId = await fixture();
    await rpgProfileData(userId);
    const economy = economyTransaction(async (tx) => {
      const { save } = await lockProgress(tx, userId);
      await grantCurrency(tx, save, {
        userId,
        currency: "GOLD",
        amount: 7,
        source: "rpg-test",
        referenceId: "gold",
      });
      await grantCurrency(tx, save, {
        userId,
        currency: "GEMS",
        amount: 11,
        source: "rpg-test",
        referenceId: "gems",
      });
      await persistSave(tx, userId, save);
    });
    await Promise.all([economy, selectRpgCharacter(userId, command())]);
    const progress = await db().userProgress.findUniqueOrThrow({
      where: { userId },
    });
    expect(progress.version).toBe(2);
    expect(progress.data).toMatchObject({ gold: 7, gems: 11 });
    expect((await rpgProfileData(userId)).revision).toBe(2);
  });

  it("retries an actual Serializable write conflict with a fresh snapshot", async () => {
    const userId = await fixture();
    await rpgProfileData(userId);
    const observed = gate(),
      release = gate();
    let attempts = 0;
    const operation = rpgTransaction(async (tx) => {
      attempts++;
      const prior = await tx.rpgProfile.findUniqueOrThrow({
        where: { userId },
      });
      if (attempts === 1) {
        observed.resolve();
        await release.promise;
      }
      return tx.rpgProfile.update({
        where: { userId },
        data: { revision: prior.revision + 1 },
      });
    });
    await observed.promise;
    try {
      await db().rpgProfile.update({
        where: { userId },
        data: { revision: { increment: 1 } },
      });
    } finally {
      release.resolve();
    }
    expect((await operation).revision).toBe(3);
    expect(attempts).toBe(2);
  });

  for (const point of [
    "character-update",
    "receipt-insert",
    "commit",
  ] as const) {
    it(`rolls back every write on injected PostgreSQL failure at ${point}`, async () => {
      const userId = await fixture();
      await levelFixture(userId);
      const before = await snapshot(userId);
      const name = "rpg_fail_" + randomUUID().replaceAll("-", "");
      const table =
        point === "character-update" ? "RpgCharacter" : "RpgMutationReceipt";
      await db().$executeRawUnsafe(
        `CREATE FUNCTION limiar.${name}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test rollback'; END $$`,
      );
      const trigger =
        point === "commit"
          ? `CREATE CONSTRAINT TRIGGER ${name} AFTER INSERT ON limiar."${table}" DEFERRABLE INITIALLY DEFERRED`
          : `CREATE TRIGGER ${name} AFTER ${point === "character-update" ? "UPDATE" : "INSERT"} ON limiar."${table}"`;
      await db().$executeRawUnsafe(
        `${trigger} FOR EACH ROW WHEN (NEW."userId" = '${userId}') EXECUTE FUNCTION limiar.${name}()`,
      );
      const input = { ...command(), attribute: "vitality", amount: 2 };
      try {
        await expect(allocateRpgAttributes(userId, input)).rejects.toThrow();
        expect(await snapshot(userId)).toEqual(before);
      } finally {
        await db().$executeRawUnsafe(
          `DROP TRIGGER ${name} ON limiar."${table}"`,
        );
        await db().$executeRawUnsafe(`DROP FUNCTION limiar.${name}()`);
      }
      expect(await allocateRpgAttributes(userId, input)).toEqual({
        revision: 2,
        characterId: "nara",
      });
    });
  }

  it("rejects locked/foreign characters and isolates items and requestId namespaces by owner", async () => {
    const a = await fixture(),
      b = await fixture(["nara"]);
    const pa = await rpgProfileData(a),
      pb = await rpgProfileData(b);
    const item = await db().rpgItemInstance.create({
      data: { userId: a, itemId: "blade-weathered", rarity: "COMMON" },
    });
    expect((await rpgProfileData(b)).items).not.toContainEqual(
      expect.objectContaining({ id: item.id }),
    );
    await expect(selectRpgCharacter(b, command(1, "ivo"))).rejects.toThrow(
      "desbloqueado",
    );
    await expect(
      selectRpgCharacter(b, command(1, pa.characters[0].id)),
    ).rejects.toThrow();
    await expect(
      selectRpgCharacter(b, { ...command(), userId: a }),
    ).rejects.toThrow();
    await expect(
      allocateRpgAttributes(b, {
        ...command(1, "ivo"),
        attribute: "power",
        amount: 1,
      }),
    ).rejects.toThrow("desbloqueado");
    await expect(
      db().rpgProfile.update({
        where: { userId: b },
        data: { activeCharacterId: pa.characters[0].id },
      }),
    ).rejects.toThrow();
    await expect(
      db().rpgItemInstance.update({
        where: { id: item.id },
        data: {
          equippedCharacterId: pb.characters[0].id,
          equippedSlot: "WEAPON",
        },
      }),
    ).rejects.toThrow();
    const same = command();
    await selectRpgCharacter(a, same);
    await selectRpgCharacter(b, same);
    expect(
      await db().rpgMutationReceipt.count({
        where: { requestId: same.requestId },
      }),
    ).toBe(2);
  });

  it("does not grant RPG resources or unlocks through local import/CloudSolo", async () => {
    const userId = await fixture(["nara"]);
    const before = await rpgProfileData(userId);
    const forged = {
      ...freshSave(),
      gold: 12345,
      gems: 56789,
      unlocked: ["nara", "ivo"],
      rpg: { xp: 999999, materials: { ore: 10 } },
    };
    await importLocal(userId, forged);
    const progress = await db().userProgress.findUniqueOrThrow({
      where: { userId },
    });
    await syncSolo(userId, { version: progress.version, save: forged });
    expect(await rpgProfileData(userId)).toEqual(before);
  });

  it("blocks direct RPG service calls while disabled without any account writes", async () => {
    const userId = await fixture(["nara"], false);
    vi.stubEnv("RPG_ENABLED", "false");
    await expect(rpgProfileData(userId)).rejects.toThrow("indisponível");
    await expect(selectRpgCharacter(userId, command())).rejects.toThrow(
      "indisponível",
    );
    await expect(
      allocateRpgAttributes(userId, {
        ...command(),
        attribute: "power",
        amount: 1,
      }),
    ).rejects.toThrow("indisponível");
    expect(await db().userProgress.count({ where: { userId } })).toBe(0);
    expect(await db().rpgProfile.count({ where: { userId } })).toBe(0);
  });

  it("enforces item/attribute/material constraints and cascades a fully populated account", async () => {
    const userId = await fixture();
    const profile = await rpgProfileData(userId);
    const character = profile.characters[0];
    const item = {
      userId,
      itemId: "blade-weathered",
      rarity: "COMMON",
      equippedCharacterId: character.id,
      equippedSlot: "WEAPON",
    };
    for (const invalid of [
      { ...item, quantity: 2 },
      { ...item, quantity: 0 },
      { ...item, quantity: 10000 },
      { ...item, rarity: "MYTHIC" },
      { ...item, equippedSlot: "HEAD" },
      { ...item, equippedSlot: null },
      { ...item, equippedCharacterId: null },
    ])
      await expect(
        db().rpgItemInstance.create({ data: invalid }),
      ).rejects.toThrow();
    await db().rpgItemInstance.create({ data: item });
    await expect(db().rpgItemInstance.create({ data: item })).rejects.toThrow();
    await db().rpgItemInstance.create({
      data: { ...item, itemId: "mantle-ash", equippedSlot: "ARMOR" },
    });
    await db().rpgItemInstance.create({
      data: { userId, itemId: "charm-obelisk", rarity: "RARE", quantity: 5 },
    });
    const where = { id: character.id };
    for (const attributes of [
      null,
      {},
      { ...initialRpgAttributes().attributes, vitality: -1 },
      { ...initialRpgAttributes().attributes, vitality: 0.5 },
      { ...initialRpgAttributes().attributes, vitality: "0" },
      { ...initialRpgAttributes().attributes, unknown: 0 },
      { ...initialRpgAttributes().attributes, will: 100 },
    ]) {
      await expect(
        db()
          .$executeRaw`UPDATE limiar."RpgCharacter" SET attributes=${JSON.stringify(attributes)}::jsonb WHERE id=${character.id}`,
      ).rejects.toThrow();
    }
    await expect(
      db().rpgCharacter.update({ where, data: { attributePoints: 1 } }),
    ).rejects.toThrow();
    await expect(
      db().rpgCharacter.update({ where, data: { level: 2 } }),
    ).rejects.toThrow();
    await expect(
      db().rpgMaterialBalance.create({
        data: { userId, materialId: "obelisk-dust", amount: -1 },
      }),
    ).rejects.toThrow();
    await db().rpgMaterialBalance.create({
      data: { userId, materialId: "obelisk-dust", amount: 4 },
    });
    await selectRpgCharacter(userId, command());
    await expect(db().rpgCharacter.delete({ where })).rejects.toThrow();
    await db().user.delete({ where: { id: userId } });
    for (const count of [
      await db().rpgProfile.count({ where: { userId } }),
      await db().rpgCharacter.count({ where: { userId } }),
      await db().rpgItemInstance.count({ where: { userId } }),
      await db().rpgMaterialBalance.count({ where: { userId } }),
      await db().rpgMutationReceipt.count({ where: { userId } }),
    ])
      expect(count).toBe(0);
  });
});
