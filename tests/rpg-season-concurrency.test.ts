import "dotenv/config";
import { describe, expect, it, vi } from "vitest";
import { db } from "../src/server/db";
import { currentSeason } from "../src/server/ranked";
describe.skipIf(process.env.RUN_DATABASE_TESTS !== "1")(
  "Existing Arena season compatibility",
  () => {
    it("initializes a season once under simultaneous first queue requests", async () => {
      const id = "2222-07";
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2222-07-15T12:00:00Z"));
      try {
        const results = await Promise.allSettled(
          Array.from({ length: 12 }, () => currentSeason()),
        );
        expect(
          results
            .filter((r) => r.status === "rejected")
            .map(
              (r) =>
                r.status === "rejected" && (r.reason as { code?: string }).code,
            ),
        ).toEqual([]);
        expect(await db().season.count({ where: { id } })).toBe(1);
        await db().season.update({
          where: { id },
          data: { name: "QA existing season" },
        });
        expect((await currentSeason()).name).toBe("QA existing season");
      } finally {
        vi.useRealTimers();
        await db().season.deleteMany({ where: { id } });
        await db().$disconnect();
      }
    });
  },
);
