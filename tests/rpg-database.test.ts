import "dotenv/config";
import { randomUUID } from "node:crypto";
import {
  afterAll,
  beforeEach,
  afterEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { freshSave, migrateSave } from "../src/game/core/save";
import { db } from "../src/server/db";
import { json, progress } from "../src/server/progress";
import { rpgProfileData } from "../src/server/rpg";
import { selectRpgCharacter } from "../src/server/rpg/mutations";

const enabled = process.env.RUN_DATABASE_TESTS === "1";
const suffix = randomUUID().slice(0, 8);
const users: string[] = [];

describe.skipIf(!enabled)("RPG database integration", () => {
  beforeEach(() => vi.stubEnv("RPG_ENABLED", "true"));
  afterEach(() => vi.unstubAllEnvs());
  afterAll(async () => {
    await db().user.deleteMany({ where: { id: { in: users } } });
    await db().$disconnect();
  });

  it("initializes lazily, follows unlocks and keeps Survivor version unchanged", async () => {
    const userId = await fixture(1);
    const survivor = await progress(userId);
    const first = await rpgProfileData(userId);
    expect(first.revision).toBe(1);
    expect(first.characters.map((character) => character.characterId)).toEqual([
      "nara",
    ]);
    expect(first.items).toEqual([]);
    expect(first.materials).toEqual([]);

    const save = migrateSave(survivor.data);
    save.unlocked.push("ivo");
    await db().userProgress.update({
      where: { userId },
      data: { data: json(save) },
    });
    const expanded = await rpgProfileData(userId);
    expect(
      expanded.characters.map((character) => character.characterId),
    ).toEqual(["nara", "ivo"]);

    const request = {
      requestId: randomUUID(),
      expectedRevision: expanded.revision,
      characterId: "ivo" as const,
    };
    const selected = await selectRpgCharacter(userId, request);
    expect(selected).toEqual({
      revision: expanded.revision + 1,
      characterId: "ivo",
    });
    expect(await selectRpgCharacter(userId, request)).toEqual(selected);
    expect((await progress(userId)).version).toBe(survivor.version);
    expect(await db().rpgMutationReceipt.count({ where: { userId } })).toBe(1);
    expect(await db().rpgItemInstance.count({ where: { userId } })).toBe(0);
    expect(await db().rpgMaterialBalance.count({ where: { userId } })).toBe(0);

    await expect(
      selectRpgCharacter(userId, { ...request, characterId: "nara" }),
    ).rejects.toThrow("requestId");
    await expect(
      selectRpgCharacter(userId, {
        requestId: randomUUID(),
        expectedRevision: 2,
        characterId: "sena",
      }),
    ).rejects.toThrow("desbloqueado");
  });

  it("enforces ownership in composite equipment relations", async () => {
    const owner = await fixture(2),
      other = await fixture(3);
    const ownerProfile = await rpgProfileData(owner);
    const otherProfile = await rpgProfileData(other);
    await expect(
      db().rpgItemInstance.create({
        data: {
          userId: owner,
          itemId: "blade-weathered",
          rarity: "COMMON",
          equippedCharacterId: otherProfile.characters[0].id,
          equippedSlot: "WEAPON",
        },
      }),
    ).rejects.toThrow();
    expect(await db().rpgItemInstance.count({ where: { userId: owner } })).toBe(
      0,
    );
    expect(ownerProfile.characters[0].userId).toBe(owner);
  });
});

async function fixture(n: number) {
  const id = `rpg_${suffix}_${n}`;
  await db().user.create({
    data: { id, name: id, username: id, email: `${id}@example.test` },
  });
  await db().userProgress.create({
    data: { userId: id, data: json(freshSave()) },
  });
  users.push(id);
  return id;
}
