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
  allocateAttributePoints,
  initialRpgAttributes,
} from "../src/game/core/rpg";
import { rpgProfileData } from "../src/server/rpg/profile";
import { buildRpgCombatLoadout } from "../src/server/rpg/loadout";
import { mutateRpgEquipment } from "../src/server/rpg/mutations";
import { createDevelopmentRpgSession } from "../src/server/rpg/development-session";
import { settle } from "../src/realtime/settlement";

const ids: string[] = [];
describe.skipIf(process.env.RUN_DATABASE_TESTS !== "1")(
  "Authoritative frozen RPG session loadouts",
  () => {
    beforeEach(() => {
      vi.stubEnv("RPG_ENABLED", "true");
      vi.stubEnv("RPG_DEVELOPMENT_HARNESS", "1");
    });
    afterEach(() => vi.unstubAllEnvs());
    afterAll(async () => {
      await db().user.deleteMany({ where: { id: { in: ids } } });
      await db().$disconnect();
    });
    it("loads only owned equipped items, freezes the current revision and grants no rewards", async () => {
      const id = "loadout_" + randomUUID();
      ids.push(id);
      await db().user.create({
        data: { id, name: id, email: id + "@example.test" },
      });
      await db().userProgress.create({
        data: { userId: id, data: json(freshSave()) },
      });
      await rpgProfileData(id);
      await db().rpgCharacter.update({
        where: { userId_characterId: { userId: id, characterId: "nara" } },
        data: allocateAttributePoints(initialRpgAttributes(2), "power", 5),
      });
      const item = await db().rpgItemInstance.create({
        data: { userId: id, itemId: "blade-weathered", rarity: "COMMON" },
      });
      await mutateRpgEquipment(id, {
        requestId: randomUUID(),
        expectedRevision: 1,
        characterId: "nara",
        instanceId: item.id,
        slot: "WEAPON",
        operation: "EQUIP_ITEM",
      });
      const frozen = await buildRpgCombatLoadout(id, "nara");
      const game = await createDevelopmentRpgSession(
        [{ userId: id, characterId: "nara" }],
        "FIXED",
      );
      expect(game.player.stats.damage).toBe(1.05);
      await mutateRpgEquipment(id, {
        requestId: randomUUID(),
        expectedRevision: 2,
        characterId: "nara",
        instanceId: item.id,
        slot: "WEAPON",
        operation: "UNEQUIP_ITEM",
      });
      expect((await buildRpgCombatLoadout(id, "nara")).equipment).toHaveLength(
        0,
      );
      expect(frozen.equipment).toHaveLength(1);
      expect(frozen.profileRevision).toBe(2);
      game.disconnect(id);
      expect(game.reconnect(id)).toBe(true);
      game.player.recalculate();
      expect(game.player.stats.damage).toBe(1.05);
      const before = await db().userProgress.findUnique({
        where: { userId: id },
      });
      await expect(
        settle("not-an-authorized-survivor-session", game),
      ).rejects.toThrow("recompensa");
      expect(
        await db().userProgress.findUnique({ where: { userId: id } }),
      ).toEqual(before);
      expect(
        await db().currencyTransaction.count({ where: { userId: id } }),
      ).toBe(0);
      await expect(buildRpgCombatLoadout(id, "ivo")).rejects.toThrow(
        "indisponível",
      );
      await expect(
        buildRpgCombatLoadout(id, "other-account-character"),
      ).rejects.toThrow();
    });
    it("never exposes the development session path in production or without explicit opt-in", async () => {
      vi.stubEnv("NODE_ENV", "production");
      await expect(createDevelopmentRpgSession([], "seed")).rejects.toThrow(
        "desabilitado",
      );
      vi.stubEnv("NODE_ENV", "test");
      vi.stubEnv("RPG_DEVELOPMENT_HARNESS", "0");
      await expect(createDevelopmentRpgSession([], "seed")).rejects.toThrow(
        "desabilitado",
      );
      vi.stubEnv("RPG_ENABLED", "false");
      await expect(buildRpgCombatLoadout("unused", "nara")).rejects.toThrow(
        "indisponível",
      );
    });
  },
);
