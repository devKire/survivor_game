import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import { db } from "../src/server/db";
import { createTeam, updateTeam, startTeam } from "../src/server/teams";
import {
  openWorldVisit,
  checkpointWorldVisit,
  closeWorldVisit,
} from "../src/server/rpg/world/presence";
import { selectRpgCharacter } from "../src/server/rpg/mutations";
import { withWorldServicePermit } from "../src/server/rpg/world/service-context";
import {
  acquireRealtimeAuthority,
  realtimeAuthorityUrl,
} from "../src/realtime/world/lease";
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
    it("serializes a shared-world entry against a concurrent Survivor team start", async () => {
      vi.stubEnv("RPG_ENABLED", "true");
      vi.stubEnv("RPG_SHARED_WORLD_ENABLED", "true");
      const userId = "activity_" + randomUUID();
      users.push(userId);
      await db().user.create({
        data: { id: userId, name: "Eco", email: userId + "@example.test" },
      });
      const initial = await openWorldVisit(userId, randomUUID(), () => {});
      await closeWorldVisit(userId, initial.visit.id);
      const team = await createTeam(userId);
      try {
        await updateTeam(userId, { ready: true });
        const outcomes = await Promise.allSettled([
          startTeam(userId),
          openWorldVisit(userId, randomUUID(), () => {}),
        ]);
        expect(outcomes.filter((r) => r.status === "fulfilled")).toHaveLength(
          1,
        );
        const active = await db().rpgWorldVisit.count({
          where: { activeUserId: userId },
        });
        const current = await db().team.findUniqueOrThrow({
          where: { id: team.id },
        });
        expect(active + Number(current.status === "RUNNING")).toBe(1);
      } finally {
        await db().gameSession.deleteMany({ where: { teamId: team.id } });
        await db().team.delete({ where: { id: team.id } });
      }
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

it("uses a direct Neon endpoint for authority locks and preserves TLS verification", () => {
  const u = new URL(
    realtimeAuthorityUrl(
      "postgresql://name:development-only@ep-example-pooler.us-east-2.aws.neon.tech/db?sslmode=require",
    ),
  );
  expect(u.hostname).toBe("ep-example.us-east-2.aws.neon.tech");
  expect(u.pathname).toBe("/db");
  expect(u.username).toBe("name");
  expect(u.searchParams.get("sslmode")).toBe("verify-full");
  expect(
    new URL(realtimeAuthorityUrl("postgresql://localhost:5433/test")).hostname,
  ).toBe("localhost");
});
