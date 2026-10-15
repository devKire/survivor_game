import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import { db } from "../src/server/db";
import {
  openWorldVisit,
  checkpointWorldVisit,
  closeWorldVisit,
} from "../src/server/rpg/world/presence";
import { selectRpgCharacter } from "../src/server/rpg/mutations";
import { withWorldServicePermit } from "../src/server/rpg/world/service-context";
import { acquireRealtimeAuthority } from "../src/realtime/world/lease";
const users: string[] = [];
describe.skipIf(process.env.RUN_DATABASE_TESTS !== "1")(
  "World presence PostgreSQL",
  () => {
    afterAll(async () => {
      await db().user.deleteMany({ where: { id: { in: users } } });
      await db().$disconnect();
      vi.unstubAllEnvs();
    });
    it("recovers safe checkpoint, serializes account visits and blocks remote build mutations", async () => {
      vi.stubEnv("RPG_ENABLED", "true");
      vi.stubEnv("RPG_SHARED_WORLD_ENABLED", "true");
      const userId = "presence_" + randomUUID(),
        authority = randomUUID();
      users.push(userId);
      await db().user.create({
        data: { id: userId, name: "Eco", email: userId + "@example.test" },
      });
      const entry = await openWorldVisit(userId, authority, () => {}),
        version = (
          await db().userProgress.findUniqueOrThrow({ where: { userId } })
        ).version;
      const input = {
        characterId: "nara",
        expectedRevision: entry.revision,
        requestId: randomUUID(),
      };
      await expect(selectRpgCharacter(userId, input)).rejects.toThrow(
        /dentro do mundo/,
      );
      let checks = 0;
      await expect(
        withWorldServicePermit(
          {
            userId,
            visitId: entry.visit.id,
            assertLive: () => {
              if (++checks >= 3) throw Error("NPC moved out of range");
            },
          },
          () => selectRpgCharacter(userId, input),
        ),
      ).rejects.toThrow(/range/);
      expect(await db().rpgMutationReceipt.count({ where: { userId } })).toBe(
        0,
      );
      const result = await withWorldServicePermit(
        { userId, visitId: entry.visit.id, assertLive: () => {} },
        () => selectRpgCharacter(userId, input),
      );
      expect(result.revision).toBe(entry.revision + 1);
      await checkpointWorldVisit(
        userId,
        entry.visit.id,
        randomUUID(),
        "ruins-outskirts",
        () => {},
      );
      const again = await openWorldVisit(userId, authority, () => {});
      expect(again.zoneId).toBe("ruins-outskirts");
      expect(again.visit.id).not.toBe(entry.visit.id);
      expect(
        await db().rpgWorldVisit.count({ where: { activeUserId: userId } }),
      ).toBe(1);
      expect(
        (
          await db().rpgWorldVisit.findUniqueOrThrow({
            where: { id: entry.visit.id },
          })
        ).endedAt,
      ).not.toBeNull();
      expect(
        (await db().userProgress.findUniqueOrThrow({ where: { userId } }))
          .version,
      ).toBe(version);
      vi.stubEnv("RPG_SHARED_WORLD_ENABLED", "false");
      await expect(openWorldVisit(userId, authority, () => {})).rejects.toThrow(
        /indisponível/,
      );
      await closeWorldVisit(userId, again.visit.id);
      expect(
        await db().rpgWorldVisit.count({ where: { activeUserId: userId } }),
      ).toBe(0);
    });
    it("allows exactly one realtime authority and releases ownership safely", async () => {
      let lost = false;
      const release = await acquireRealtimeAuthority(() => {
        lost = true;
      });
      try {
        await expect(acquireRealtimeAuthority(() => {})).rejects.toThrow(
          /Outra autoridade/,
        );
        expect(lost).toBe(false);
      } finally {
        await release();
      }
      const again = await acquireRealtimeAuthority(() => {});
      await again();
      expect(lost).toBe(false);
    });
  },
);
