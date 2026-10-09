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
import { json } from "../src/server/progress";
import { freshSave } from "../src/game/core/save";
import {
  initialRpgAttributes,
  equipmentDefinition,
  rollEquipmentAffixes,
} from "../src/game/core/rpg";
import { rpgProfileData } from "../src/server/rpg/profile";
import {
  mutateRpgEquipment,
  selectRpgCharacter,
} from "../src/server/rpg/mutations";

const enabled = process.env.RUN_DATABASE_TESTS === "1";
const users: string[] = [];
async function fixture() {
  const id = "equip_" + randomUUID();
  users.push(id);
  await db().user.create({
    data: { id, name: id, email: id + "@example.test" },
  });
  await db().userProgress.create({
    data: {
      userId: id,
      data: json({
        ...freshSave(),
        unlocked: ["nara", "ivo", "orin", "sena"],
        gold: 73,
        gems: 91,
      }),
    },
  });
  await rpgProfileData(id);
  return id;
}
async function item(userId: string, itemId = "blade-weathered", quantity = 1) {
  return db().rpgItemInstance.create({
    data: { userId, itemId, quantity, rarity: "COMMON" },
  });
}
function command(
  instanceId: string,
  expectedRevision = 1,
  operation = "EQUIP_ITEM",
  characterId = "nara",
  slot = "WEAPON",
) {
  return {
    requestId: randomUUID(),
    expectedRevision,
    characterId,
    instanceId,
    slot,
    operation,
  };
}
async function state(userId: string) {
  return {
    profile: await rpgProfileData(userId),
    receipts: await db().rpgMutationReceipt.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
    }),
    progress: await db().userProgress.findUniqueOrThrow({ where: { userId } }),
  };
}
describe.skipIf(!enabled)("Equipment transactions on PostgreSQL", () => {
  beforeEach(() => vi.stubEnv("RPG_ENABLED", "true"));
  afterEach(() => vi.unstubAllEnvs());
  afterAll(async () => {
    await db().user.deleteMany({ where: { id: { in: users } } });
    await db().$disconnect();
  });

  it("equips all slots, persists across reads, unequips and leaves Survivor data/version intact", async () => {
    const userId = await fixture(),
      before = (await state(userId)).progress;
    let revision = 1;
    for (const [id, slot] of [
      ["blade-weathered", "WEAPON"],
      ["mantle-ash", "ARMOR"],
      ["charm-obelisk", "CHARM"],
    ]) {
      const value = await item(userId, id),
        input = command(value.id, revision, "EQUIP_ITEM", "nara", slot);
      const result = await mutateRpgEquipment(userId, input);
      expect(result.revision).toBe(++revision);
      expect(await mutateRpgEquipment(userId, input)).toEqual(result);
    }
    const profile = await rpgProfileData(userId),
      character = profile.characters.find((c) => c.characterId === "nara")!;
    expect(
      profile.items.every(
        (i) => i.equippedCharacterId === character.id && i.quantity === 1,
      ),
    ).toBe(true);
    const weapon = profile.items.find((i) => i.equippedSlot === "WEAPON")!;
    await mutateRpgEquipment(
      userId,
      command(weapon.id, revision, "UNEQUIP_ITEM"),
    );
    expect(
      (await rpgProfileData(userId)).items.find((i) => i.id === weapon.id)
        ?.equippedSlot,
    ).toBeNull();
    expect((await state(userId)).progress).toEqual(before);
    expect(await db().rpgMutationReceipt.count({ where: { userId } })).toBe(4);
  });
  it("atomically replaces occupied slots and transfers one instance between characters", async () => {
    const userId = await fixture(),
      a = await item(userId),
      b = await item(userId);
    await mutateRpgEquipment(userId, command(a.id));
    await mutateRpgEquipment(userId, {
      ...command(b.id, 2, "REPLACE_EQUIPMENT"),
      expectedEquippedItemId: a.id,
    });
    await mutateRpgEquipment(userId, command(b.id, 3, "EQUIP_ITEM", "ivo"));
    const profile = await rpgProfileData(userId),
      ivo = profile.characters.find((c) => c.characterId === "ivo")!;
    expect(
      profile.items.filter((i) => i.equippedCharacterId !== null),
    ).toHaveLength(1);
    expect(profile.items.find((i) => i.id === b.id)?.equippedCharacterId).toBe(
      ivo.id,
    );
    expect(
      profile.items.find((i) => i.id === a.id)?.equippedCharacterId,
    ).toBeNull();
    expect(profile.items).toHaveLength(2);
  });
  it("confirms identical concurrent requests once and rejects divergent payload or operation", async () => {
    const userId = await fixture(),
      a = await item(userId),
      input = command(a.id);
    expect(
      await Promise.all([
        mutateRpgEquipment(userId, input),
        mutateRpgEquipment(userId, input),
      ]),
    ).toEqual([
      { revision: 2, characterId: "nara" },
      { revision: 2, characterId: "nara" },
    ]);
    await expect(
      mutateRpgEquipment(userId, { ...input, characterId: "ivo" }),
    ).rejects.toThrow("requestId");
    await expect(
      mutateRpgEquipment(userId, { ...input, operation: "UNEQUIP_ITEM" }),
    ).rejects.toThrow("requestId");
    await selectRpgCharacter(userId, {
      requestId: randomUUID(),
      expectedRevision: 2,
      characterId: "ivo",
    });
    const before = await state(userId);
    expect(await mutateRpgEquipment(userId, input)).toEqual({
      revision: 2,
      characterId: "nara",
    });
    expect(await state(userId)).toEqual(before);
  });
  it("serializes two replacements at the same revision without losing or duplicating items", async () => {
    const userId = await fixture(),
      a = await item(userId),
      b = await item(userId),
      c = await item(userId);
    await mutateRpgEquipment(userId, command(a.id));
    const results = await Promise.allSettled([
      mutateRpgEquipment(userId, command(b.id, 2)),
      mutateRpgEquipment(userId, command(c.id, 2)),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.find((r) => r.status === "rejected")).toMatchObject({
      reason: { message: expect.stringContaining("outra aba") },
    });
    const profile = await rpgProfileData(userId);
    expect(profile.revision).toBe(3);
    expect(profile.items).toHaveLength(3);
    expect(
      profile.items.filter((i) => i.equippedSlot === "WEAPON"),
    ).toHaveLength(1);
    expect(profile.items.find((i) => i.id === a.id)?.equippedSlot).toBeNull();
  });
  it("rolls back the removed item when the replacement write fails, then safely retries", async () => {
    const userId = await fixture(),
      a = await item(userId),
      b = await item(userId);
    await mutateRpgEquipment(userId, command(a.id));
    const before = await state(userId),
      name = "equip_fail_" + randomUUID().replaceAll("-", "");
    await db().$executeRawUnsafe(
      `CREATE FUNCTION limiar.${name}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected'; END $$`,
    );
    await db().$executeRawUnsafe(
      `CREATE TRIGGER ${name} BEFORE UPDATE ON limiar."RpgItemInstance" FOR EACH ROW WHEN (NEW.id = '${b.id}') EXECUTE FUNCTION limiar.${name}()`,
    );
    const input = command(b.id, 2);
    try {
      await expect(mutateRpgEquipment(userId, input)).rejects.toThrow();
      expect(await state(userId)).toEqual(before);
    } finally {
      await db().$executeRawUnsafe(
        `DROP TRIGGER ${name} ON limiar."RpgItemInstance"`,
      );
      await db().$executeRawUnsafe(`DROP FUNCTION limiar.${name}()`);
    }
    expect((await mutateRpgEquipment(userId, input)).revision).toBe(3);
  });
  it("rejects foreign items/characters, forged stats and incompatible requirements without writes", async () => {
    const userId = await fixture(),
      other = await fixture(),
      foreign = await item(other),
      stack = await item(userId, "blade-weathered", 2),
      restricted = await item(userId, "blade-echo"),
      own = await item(userId);
    const foreignCharacter = (await rpgProfileData(other)).characters[0].id;
    const before = await state(userId);
    for (const input of [
      command(foreign.id),
      command(own.id, 1, "EQUIP_ITEM", foreignCharacter),
      command(stack.id),
      command(restricted.id),
      command(own.id, 1, "EQUIP_ITEM", "nara", "ARMOR"),
      { ...command(own.id), userId: other },
      { ...command(own.id), stats: { damage: 1000 } },
      { ...command(own.id), affixes: [] },
      {
        ...command(own.id, 1, "REPLACE_EQUIPMENT"),
        expectedEquippedItemId: "missing",
      },
    ])
      await expect(mutateRpgEquipment(userId, input)).rejects.toThrow();
    expect(await state(userId)).toEqual(before);
    await db().rpgCharacter.update({
      where: { userId_characterId: { userId, characterId: "sena" } },
      data: initialRpgAttributes(5),
    });
    await expect(
      mutateRpgEquipment(
        userId,
        command(restricted.id, 1, "EQUIP_ITEM", "sena"),
      ),
    ).rejects.toThrow("incompatível");
  });
  it("rejects locked characters and disabled actions and safely permits unequipping outdated gear", async () => {
    const userId = await fixture(),
      a = await item(userId);
    await mutateRpgEquipment(userId, command(a.id));
    await db().rpgItemInstance.update({
      where: { id: a.id },
      data: { level: 100 },
    });
    await mutateRpgEquipment(userId, command(a.id, 2, "UNEQUIP_ITEM"));
    await db().userProgress.update({
      where: { userId },
      data: { data: json(freshSave()) },
    });
    await expect(
      mutateRpgEquipment(userId, command(a.id, 3, "EQUIP_ITEM", "ivo")),
    ).rejects.toThrow("desbloqueado");
    vi.stubEnv("RPG_ENABLED", "false");
    await expect(mutateRpgEquipment(userId, command(a.id, 3))).rejects.toThrow(
      "indisponível",
    );
  });
  it("validates rolled data server-side and rejects corrupt or forged persisted affixes", async () => {
    const userId = await fixture(),
      seed = randomUUID();
    const affixes = rollEquipmentAffixes(
      equipmentDefinition("blade-weathered"),
      "RARE",
      1,
      seed,
    );
    const a = await db().rpgItemInstance.create({
      data: {
        userId,
        itemId: "blade-weathered",
        rarity: "RARE",
        rollSeed: seed,
        affixes,
      },
    });
    await mutateRpgEquipment(userId, command(a.id));
    await db().rpgItemInstance.update({
      where: { id: a.id },
      data: { affixes: [{ ...affixes[0], value: 99 }] },
    });
    await expect(
      mutateRpgEquipment(userId, command(a.id, 2, "EQUIP_ITEM", "ivo")),
    ).rejects.toThrow();
    for (const data of [
      { contentVersion: 2 },
      { affixes: [{ id: "unknown", tier: 1, value: 1 }] },
      { affixes: [{ id: "force", tier: 4, value: 0.01 }] },
      { rollSeed: null },
      {
        affixes: [
          { id: "force", tier: 1, value: 0.01 },
          { id: "force", tier: 1, value: 0.01 },
        ],
      },
    ])
      await expect(
        db().rpgItemInstance.update({ where: { id: a.id }, data }),
      ).rejects.toThrow();
  });
  it("preserves composite ownership FKs and cascades equipped items with rolled metadata", async () => {
    const userId = await fixture(),
      other = await fixture(),
      a = await item(userId);
    await mutateRpgEquipment(userId, command(a.id));
    await expect(
      db().rpgItemInstance.update({
        where: { id: a.id },
        data: {
          equippedCharacterId: (await rpgProfileData(other)).characters[0].id,
        },
      }),
    ).rejects.toThrow();
    await db().user.delete({ where: { id: userId } });
    expect(await db().rpgItemInstance.count({ where: { userId } })).toBe(0);
    expect(await db().rpgMutationReceipt.count({ where: { userId } })).toBe(0);
  });
});
