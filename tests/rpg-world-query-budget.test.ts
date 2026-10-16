import "dotenv/config";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { mkdir, writeFile } from "node:fs/promises";
import { describe, it, expect, vi } from "vitest";
import { db } from "../src/server/db";
import { WorldCoordinator } from "../src/realtime/world/coordinator";
describe.skipIf(process.env.RUN_DATABASE_TESTS !== "1")(
  "World SQL operation budget",
  () => {
    it("issues no SQL for safe movement/snapshots and measures discrete profile/entry operations", async () => {
      vi.stubEnv("RPG_ENABLED", "true");
      vi.stubEnv("RPG_SHARED_WORLD_ENABLED", "true");
      const userId = "sql_world_" + randomUUID(),
        w = new WorldCoordinator();
      await db().user.create({
        data: { id: userId, name: "SQL QA", email: userId + "@example.test" },
      });
      let statements = 0;
      const original = Client.prototype.query;
      const spy = vi
        .spyOn(Client.prototype, "query")
        .mockImplementation(function (
          this: Client,
          ...args: Parameters<Client["query"]>
        ) {
          statements++;
          return Reflect.apply(original, this, args);
        });
      const results: {
        operation: string;
        statements: number;
        durationMs: number;
      }[] = [];
      const measure = async (
        operation: string,
        run: () => unknown | Promise<unknown>,
      ) => {
        statements = 0;
        const start = performance.now();
        await run();
        results.push({
          operation,
          statements,
          durationMs: performance.now() - start,
        });
      };
      const c = {
        userId,
        username: "SQL QA",
        sessionId: "internal-fixture",
        isOpen: () => true,
        send: () => {},
      };
      try {
        await measure("first authenticated world entry", () => w.enter(c));
        const p = w.current(c);
        await measure(
          "50 simulation ticks and 20 snapshot batches in safe Refuge",
          () => {
            for (let i = 0; i < 50; i++) {
              w.input(c, {
                type: "WORLD_INPUT",
                epoch: p.avatar.epoch,
                sequence: i + 1,
                moveX: -1,
                moveY: 0,
              });
              w.step(0.04);
            }
          },
        );
        expect(results.at(-1)?.statements).toBe(0);
        await measure("strict profile refresh RPC", () =>
          w.rpc(c, {
            type: "WORLD_RPC",
            epoch: p.avatar.epoch,
            requestId: randomUUID(),
            operation: "PROFILE",
            args: {},
          }),
        );
        await measure("leave and checkpoint cleanup", () => w.leave(c));
        await measure("existing profile reentry", () => w.enter(c));
        await w.leave(c);
        expect(results[0].statements).toBeGreaterThan(0);
        await mkdir("docs/qa/world", { recursive: true });
        await writeFile(
          "docs/qa/world/sql-budget.json",
          JSON.stringify(
            {
              at: new Date().toISOString(),
              method:
                "Actual pg.Client.query calls including transaction boundaries on isolated PostgreSQL; one account, no concurrency or retries. Simulation movement uses only normal input commands. Counts are observations, not hard-coded allowances.",
              results,
            },
            null,
            2,
          ),
        );
      } finally {
        spy.mockRestore();
        await db().user.delete({ where: { id: userId } });
        await db().$disconnect();
        vi.unstubAllEnvs();
      }
    });
  },
);
