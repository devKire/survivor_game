import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import { db } from "../src/server/db";
import { WorldZone } from "../src/realtime/world/zone";
import {
  openWorldVisit,
  checkpointWorldVisit,
} from "../src/server/rpg/world/presence";
import {
  persistWorldGathering,
  persistWorldDiscovery,
  readWorldResources,
} from "../src/server/rpg/world/resources";
import {
  startGathering,
  type ActiveGathering,
} from "../src/game/core/rpg/exploration/runtime";
import { explorationResource } from "../src/game/content/rpg/exploration-resources";
import type { ExplorationNode } from "../src/game/core/rpg/exploration/types";
import { gatheringCycle } from "../src/game/core/rpg/exploration/gathering";
const users: string[] = [];
const zone = new WorldZone("ruins-outskirts", randomUUID());
const resources = zone.nodes.filter((n) => n.kind === "RESOURCE"),
  poi = zone.nodes.find((n) => n.kind === "POI")!;
async function account() {
  const id = "resource_" + randomUUID();
  users.push(id);
  await db().user.create({
    data: { id, name: id, email: id + "@example.test" },
  });
  const entry = await openWorldVisit(id, randomUUID(), () => {});
  await checkpointWorldVisit(
    id,
    entry.visit.id,
    entry.visit.epoch,
    "ruins-outskirts",
    () => {},
  );
  return { ...entry, userId: id };
}
// Internal-only fixtures model completed timing; browser/WS tests exercise real elapsed time.
function evidence(
  node: ExplorationNode,
  revision: number,
  requestId = randomUUID(),
): ActiveGathering {
  const duration = explorationResource(node.definitionId).durationMs;
  const g = startGathering(
    { ...node, available: true, level: 1 },
    node,
    { nodeId: node.id, expectedRevision: revision, requestId },
    undefined,
    performance.now() - duration - 20,
  );
  g.elapsed = duration;
  return g;
}
describe.skipIf(process.env.RUN_DATABASE_TESTS !== "1")(
  "Shared gathering PostgreSQL",
  () => {
    afterAll(async () => {
      await db().user.deleteMany({ where: { id: { in: users } } });
      await db().$disconnect();
      vi.unstubAllEnvs();
    });
    it("preserves personal daily rights across concurrent requests and visits", async () => {
      vi.stubEnv("RPG_ENABLED", "true");
      vi.stubEnv("RPG_SHARED_WORLD_ENABLED", "true");
      vi.stubEnv("RPG_EXPLORATION_ENABLED", "false");
      const a = await account(),
        g = evidence(resources[0], a.revision);
      const write = () =>
        persistWorldGathering(a.userId, a.visit.id, a.visit.epoch, g, () => {});
      const [r, replay] = await Promise.all([write(), write()]);
      expect(replay).toEqual(r);
      expect(
        await db().rpgResourceClaim.count({ where: { userId: a.userId } }),
      ).toBe(1);
      const prior = await db().rpgMaterialBalance.findMany({
        where: { userId: a.userId },
      });
      await expect(
        persistWorldGathering(
          a.userId,
          a.visit.id,
          a.visit.epoch,
          {
            ...g,
            intent: { ...g.intent, nodeId: resources[1].id },
            node: resources[1],
          },
          () => {},
        ),
      ).rejects.toThrow(/outra intenção/);
      const newVisit = await openWorldVisit(a.userId, randomUUID(), () => {});
      await checkpointWorldVisit(
        a.userId,
        newVisit.visit.id,
        newVisit.visit.epoch,
        "ruins-outskirts",
        () => {},
      );
      const second = await persistWorldGathering(
        a.userId,
        newVisit.visit.id,
        newVisit.visit.epoch,
        evidence(resources[0], newVisit.revision),
        () => {},
      );
      expect(second).toEqual(r);
      expect(
        await db().rpgMaterialBalance.findMany({ where: { userId: a.userId } }),
      ).toEqual(prior);
      expect((await readWorldResources(a.userId)).depleted).toContain(
        resources[0].id,
      );
      expect(
        (
          await db().rpgResourceClaim.findUniqueOrThrow({
            where: { id: r.claimId },
          })
        ).sessionId,
      ).toBeNull();
    });
    it("rolls back lost authority and rejects foreign visits, invented nodes and old epochs", async () => {
      const a = await account(),
        b = await account(),
        g = evidence(resources[0], a.revision);
      const count = await db().rpgMaterialBalance.count({
          where: { userId: a.userId },
        }),
        revision = a.revision;
      let checks = 0;
      await expect(
        persistWorldGathering(a.userId, a.visit.id, a.visit.epoch, g, () => {
          if (++checks >= 4) throw Error("connection lost");
        }),
      ).rejects.toThrow(/lost/);
      expect(
        await db().rpgMaterialBalance.count({ where: { userId: a.userId } }),
      ).toBe(count);
      expect(
        await db().rpgResourceClaim.count({ where: { userId: a.userId } }),
      ).toBe(0);
      expect(
        (
          await db().rpgProfile.findUniqueOrThrow({
            where: { userId: a.userId },
          })
        ).revision,
      ).toBe(revision);
      await expect(
        persistWorldGathering(a.userId, b.visit.id, b.visit.epoch, g, () => {}),
      ).rejects.toThrow(/Presença inválida/);
      await expect(
        persistWorldGathering(a.userId, a.visit.id, randomUUID(), g, () => {}),
      ).rejects.toThrow(/Presença inválida/);
      await expect(
        persistWorldGathering(
          a.userId,
          a.visit.id,
          a.visit.epoch,
          { ...g, node: { ...g.node, x: g.node.x + 1 } },
          () => {},
        ),
      ).rejects.toThrow(/Unknown/);
      await persistWorldDiscovery(
        a.userId,
        a.visit.id,
        a.visit.epoch,
        poi,
        () => {},
      );
      const after = (await readWorldResources(a.userId)).revision;
      await persistWorldDiscovery(
        a.userId,
        a.visit.id,
        a.visit.epoch,
        poi,
        () => {},
      );
      expect((await readWorldResources(a.userId)).revision).toBe(after);
      expect((await readWorldResources(b.userId)).discovered).not.toContain(
        poi.id,
      );
    });
    it("does not renew cycle limits in a new visit or grant while disabled", async () => {
      const a = await account();
      let revision = a.revision;
      for (const node of resources.slice(0, 12)) {
        const r = await persistWorldGathering(
          a.userId,
          a.visit.id,
          a.visit.epoch,
          evidence(node, revision),
          () => {},
        );
        revision = r.revision;
      }
      await expect(
        persistWorldGathering(
          a.userId,
          a.visit.id,
          a.visit.epoch,
          evidence(resources[12], revision),
          () => {},
        ),
      ).rejects.toThrow(/Limite/);
      const b = await openWorldVisit(a.userId, randomUUID(), () => {});
      await checkpointWorldVisit(
        a.userId,
        b.visit.id,
        b.visit.epoch,
        "ruins-outskirts",
        () => {},
      );
      for (const node of resources.slice(12, 18)) {
        const r = await persistWorldGathering(
          a.userId,
          b.visit.id,
          b.visit.epoch,
          evidence(node, revision),
          () => {},
        );
        revision = r.revision;
      }
      expect(
        await db().rpgResourceClaim.count({
          where: { userId: a.userId, cycle: gatheringCycle(Date.now()) },
        }),
      ).toBe(18);
      await expect(
        persistWorldGathering(
          a.userId,
          b.visit.id,
          b.visit.epoch,
          evidence(resources[18], revision),
          () => {},
        ),
      ).rejects.toThrow(/Limite/);
      vi.stubEnv("RPG_SHARED_WORLD_ENABLED", "false");
      await expect(
        persistWorldGathering(
          a.userId,
          b.visit.id,
          b.visit.epoch,
          evidence(resources[18], revision),
          () => {},
        ),
      ).rejects.toThrow(/indisponível/);
    });
  },
);
