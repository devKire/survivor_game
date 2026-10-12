import "dotenv/config";
import { randomUUID } from "node:crypto";
import { it, expect, vi } from "vitest";
import { db } from "../src/server/db";
import * as teams from "../src/server/teams";
import { createAuthorizedExploration } from "../src/realtime/rpg-exploration";

it.skipIf(process.env.RUN_DATABASE_TESTS !== "1")(
  "releases committed authorization if rollout changes before room hydration",
  async () => {
    vi.stubEnv("RPG_ENABLED", "true");
    vi.stubEnv("RPG_EXPLORATION_ENABLED", "true");
    const id = "explore_recovery_" + randomUUID();
    let teamId: string | undefined;
    try {
      await db().user.create({
        data: { id, name: id, email: id + "@example.test" },
      });
      const team = await teams.createTeam(id);
      teamId = team.id;
      await teams.updateTeam(id, {
        expeditionKind: "RPG_EXPLORATION",
        ready: true,
      });
      const session = await teams.startTeam(id);
      vi.stubEnv("RPG_EXPLORATION_ENABLED", "false");
      await expect(createAuthorizedExploration(session.id)).rejects.toThrow(
        "indisponível",
      );
      expect(
        (
          await db().rpgExplorationSession.findUniqueOrThrow({
            where: { sessionId: session.id },
          })
        ).status,
      ).toBe("INTERRUPTED");
      expect(
        await db().rpgExplorationParticipant.count({
          where: { activeUserId: id },
        }),
      ).toBe(0);
      expect(
        (await db().team.findUniqueOrThrow({ where: { id: team.id } })).status,
      ).toBe("LOBBY");
      expect(await db().rpgResourceClaim.count({ where: { userId: id } })).toBe(
        0,
      );
    } finally {
      await db().user.deleteMany({ where: { id } });
      if (teamId) {
        await db().gameSession.deleteMany({ where: { teamId } });
        await db().team.delete({ where: { id: teamId } });
      }
      vi.unstubAllEnvs();
      await db().$disconnect();
    }
  },
);

it.skipIf(process.env.RUN_DATABASE_TESTS !== "1")(
  "keeps the new cycle available when a previous-cycle gathering commits",
  async () => {
    vi.stubEnv("RPG_ENABLED", "true");
    vi.stubEnv("RPG_EXPLORATION_ENABLED", "true");
    const id = "explore_midnight_" + randomUUID();
    let teamId: string | undefined;
    try {
      await db().user.create({
        data: { id, name: id, email: id + "@example.test" },
      });
      const team = await teams.createTeam(id);
      teamId = team.id;
      await teams.updateTeam(id, {
        expeditionKind: "RPG_EXPLORATION",
        ready: true,
      });
      const session = await teams.startTeam(id);
      const { explorationState, processExploration } =
        await import("../src/realtime/rpg-exploration");
      const g = await createAuthorizedExploration(session.id);
      const node = g.nodes.find((n) => n.kind === "RESOURCE")!;
      // Boundary fixture: WS/browser tests separately prove real movement and duration.
      const p = g.members.get(id)!.player;
      p.x = node.x;
      p.y = node.y;
      g.startGather(
        id,
        { nodeId: node.id, requestId: randomUUID(), expectedRevision: 1 },
        performance.now() - 5000,
        Date.now() - 86400000,
      );
      g.gathering.get(id)!.elapsed = 5000;
      processExploration(g);
      const deadline = Date.now() + 5000;
      while (g.gathering.has(id) && Date.now() < deadline)
        await new Promise((r) => setTimeout(r, 20));
      expect(g.gathering.has(id)).toBe(false);
      const claims = await db().rpgResourceClaim.findMany({
        where: { userId: id },
      });
      expect(claims).toHaveLength(1);
      expect(claims[0].cycle).toBe(explorationState(g, id)!.cycle - 1);
      expect(explorationState(g, id)!.depleted).not.toContain(node.id);
    } finally {
      await db().user.deleteMany({ where: { id } });
      if (teamId) {
        await db().gameSession.deleteMany({ where: { teamId } });
        await db().team.delete({ where: { id: teamId } });
      }
      vi.unstubAllEnvs();
      await db().$disconnect();
    }
  },
);
