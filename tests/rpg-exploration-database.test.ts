import "dotenv/config";
import { explorationHistory } from "../src/server/rpg/exploration/history";
import { interruptLostExplorations } from "../src/server/rpg/exploration/persistence";
import { randomUUID } from "node:crypto";
import {
  afterAll,
  beforeEach,
  afterEach,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import { db } from "../src/server/db";
import { rpgProfileData } from "../src/server/rpg/profile";
import { rpgTransaction } from "../src/server/rpg/transaction";
import { initializeExploration } from "../src/server/rpg/exploration/entry";
import {
  persistGathering,
  persistDiscovery,
  closeExploration,
  type GatheringEvidence,
} from "../src/server/rpg/exploration/persistence";
import { EXPLORATION_RUINS as region } from "../src/game/content/rpg/exploration-regions";
import { generateExploration } from "../src/game/core/rpg/exploration/generation";
import { gatheringCycle } from "../src/game/core/rpg/exploration/gathering";
import { CoopSimulation } from "../src/game/core/coop";
import { freshSave } from "../src/game/core/save";
import { transferRpgItem } from "../src/server/rpg/storage";
import {
  economyTransaction,
  lockProgress,
  grantCurrency,
  persistSave,
} from "../src/server/economy";
const users: string[] = [],
  teams: string[] = [];
const nodes = generateExploration(
  region,
  new CoopSimulation(
    [{ id: "p", name: "p", character: "nara", progress: freshSave() }],
    "normal",
    region.mapId,
    region.seed,
  ).world,
);
async function fixture(size = 1) {
  const ids: string[] = [];
  for (let i = 0; i < size; i++) {
    const id = "explore_" + randomUUID();
    users.push(id);
    ids.push(id);
    await db().user.create({
      data: { id, name: id, email: id + "@test.example" },
    });
    await rpgProfileData(id);
  }
  const team = await db().team.create({
    data: {
      code: randomUUID(),
      leaderId: ids[0],
      expiresAt: new Date(Date.now() + 3600000),
      status: "RUNNING",
      expeditionKind: "RPG_EXPLORATION",
    },
  });
  teams.push(team.id);
  const session = await rpgTransaction(async (tx) => {
    const s = await tx.gameSession.create({
      data: {
        teamId: team.id,
        seed: region.seed,
        mapId: "ruins",
        mode: "normal",
        duration: 900,
        partySize: size,
        expeditionKind: "RPG_EXPLORATION",
        members: {
          create: ids.map((userId) => ({ userId, character: "nara" })),
        },
      },
    });
    await initializeExploration(tx, s.id);
    return s;
  });
  return { ids, session };
}
function proof(
  sessionId: string,
  userId: string,
  index = 0,
  expectedRevision = 1,
): GatheringEvidence {
  const node = nodes.filter((n) => n.kind === "RESOURCE")[index];
  return {
    sessionId,
    userId,
    node,
    cycle: gatheringCycle(Date.now()),
    intent: { nodeId: node.id, requestId: randomUUID(), expectedRevision },
    assertLive: () => {},
  };
}
describe.skipIf(process.env.RUN_DATABASE_TESTS !== "1")(
  "exploration PostgreSQL transactions",
  () => {
    beforeEach(() => {
      vi.stubEnv("RPG_ENABLED", "true");
      vi.stubEnv("RPG_EXPLORATION_ENABLED", "true");
      vi.stubEnv("RPG_REFUGE_ENABLED", "true");
    });
    afterEach(() => vi.unstubAllEnvs());
    afterAll(async () => {
      await db().user.deleteMany({ where: { id: { in: users } } });
      await db().gameSession.deleteMany({ where: { teamId: { in: teams } } });
      await db().team.deleteMany({ where: { id: { in: teams } } });
      await db().$disconnect();
    });
    it("persists personal materials once, replays same/different requests and preserves Survivor progress", async () => {
      const { ids, session } = await fixture(5),
        before = await db().userProgress.findMany({
          where: { userId: { in: ids } },
          orderBy: { userId: "asc" },
        });
      const p = proof(session.id, ids[0]);
      const results = await Promise.all([
        persistGathering(p),
        persistGathering(p),
      ]);
      expect(results[0]).toEqual(results[1]);
      expect(
        await persistGathering({
          ...p,
          intent: { ...p.intent, requestId: randomUUID() },
        }),
      ).toEqual(results[0]);
      await expect(
        persistGathering({
          ...p,
          intent: { ...p.intent, expectedRevision: 999 },
        }),
      ).rejects.toThrow("outra intenção");
      for (const id of ids.slice(1))
        await persistGathering(proof(session.id, id));
      expect(
        await db().rpgResourceClaim.count({ where: { sessionId: session.id } }),
      ).toBe(5);
      expect(
        await db().userProgress.findMany({
          where: { userId: { in: ids } },
          orderBy: { userId: "asc" },
        }),
      ).toEqual(before);
      await closeExploration(session.id);
      expect(await persistGathering(p)).toEqual(results[0]); // recovery after commit without live position
      await expect(
        persistGathering(proof(session.id, ids[0], 1, 2)),
      ).rejects.toThrow("encerrada");
    });
    it("rejects stale revision, foreign account, cancelled evidence and disabled flags atomically", async () => {
      const a = await fixture(),
        b = await fixture();
      const p = proof(a.session.id, a.ids[0]);
      await expect(
        persistGathering({
          ...p,
          intent: { ...p.intent, expectedRevision: 5 },
        }),
      ).rejects.toThrow("mudou");
      await expect(
        persistGathering({ ...p, userId: b.ids[0] }),
      ).rejects.toThrow("encerrada");
      let checks = 0;
      await expect(
        persistGathering({
          ...p,
          assertLive: () => {
            if (++checks === 2) throw new Error("failure during update");
          },
        }),
      ).rejects.toThrow("failure during update");
      expect(
        await db().rpgResourceClaim.count({ where: { userId: p.userId } }),
      ).toBe(0);
      expect((await rpgProfileData(p.userId)).materials).toHaveLength(0);
      expect((await rpgProfileData(p.userId)).revision).toBe(1);
      vi.stubEnv("RPG_EXPLORATION_ENABLED", "false");
      await expect(persistGathering(p)).rejects.toThrow("indisponível");
    });
    it("deduplicates discoveries; caps balances and survives next-cycle/reentry without reset", async () => {
      const { ids, session } = await fixture(),
        u = ids[0],
        poi = nodes.find((n) => n.kind === "POI")!;
      await Promise.all([
        persistDiscovery(session.id, u, poi, () => {}),
        persistDiscovery(session.id, u, poi, () => {}),
      ]);
      expect(await db().rpgDiscoveredPoi.count({ where: { userId: u } })).toBe(
        1,
      );
      const p = proof(session.id, u, 0, 2);
      await db().rpgMaterialBalance.create({
        data: { userId: u, materialId: "weathered-ore", amount: 999999999 },
      });
      const first = await persistGathering(p);
      expect(first.quantity).toBe(1);
      const second = await persistGathering({
        ...p,
        cycle: p.cycle + 1,
        intent: { ...p.intent, requestId: randomUUID(), expectedRevision: 3 },
      });
      expect(second.quantity).toBe(0);
      expect(second.revision).toBe(3);
      await expect(
        db().rpgResourceClaim.update({
          where: { id: first.claimId },
          data: { quantity: 2 },
        }),
      ).rejects.toThrow();
      await db().user.delete({ where: { id: u } });
      expect(await db().rpgDiscoveredPoi.count({ where: { userId: u } })).toBe(
        0,
      );
      expect(await db().rpgResourceClaim.count({ where: { userId: u } })).toBe(
        0,
      );
    });
    it("serializes different nodes against the same revision and storage; economy keeps its own version", async () => {
      const { ids, session } = await fixture(),
        u = ids[0];
      const outcomes = await Promise.allSettled([
        persistGathering(proof(session.id, u)),
        persistGathering(proof(session.id, u, 1)),
      ]);
      expect(outcomes.filter((o) => o.status === "fulfilled")).toHaveLength(1);
      const item = await db().rpgItemInstance.create({
        data: { userId: u, itemId: "blade-weathered", rarity: "COMMON" },
      });
      const p = proof(session.id, u, 2, 2);
      const concurrent = await Promise.allSettled([
        persistGathering(p),
        transferRpgItem(u, {
          instanceId: item.id,
          operation: "DEPOSIT_ITEM",
          expectedRevision: 2,
          requestId: randomUUID(),
        }),
        economyTransaction(async (tx) => {
          const { save } = await lockProgress(tx, u);
          await grantCurrency(tx, save, {
            userId: u,
            currency: "GOLD",
            amount: 3,
            source: "test",
            referenceId: randomUUID(),
          });
          await persistSave(tx, u, save);
        }),
      ]);
      expect(concurrent[2].status).toBe("fulfilled");
      expect(
        concurrent.slice(0, 2).filter((o) => o.status === "fulfilled"),
      ).toHaveLength(1);
      const progress = await db().userProgress.findUniqueOrThrow({
        where: { userId: u },
      });
      expect(progress.version).toBe(2);
      expect(await db().rpgItemInstance.count({ where: { userId: u } })).toBe(
        1,
      );
    });
  },
);

describe.skipIf(process.env.RUN_DATABASE_TESTS !== "1")(
  "exploration supply limits and recovery",
  () => {
    beforeEach(() => {
      vi.stubEnv("RPG_ENABLED", "true");
      vi.stubEnv("RPG_EXPLORATION_ENABLED", "true");
    });
    afterEach(() => vi.unstubAllEnvs());
    it("rejects fabricated descriptors; enforces 12 per session, 18 per account/cycle across characters and sessions", async () => {
      const { ids, session } = await fixture(),
        u = ids[0],
        p = proof(session.id, u);
      await expect(
        persistGathering({ ...p, node: { ...p.node, x: p.node.x + 1 } }),
      ).rejects.toThrow("descriptor");
      for (let i = 0; i < 12; i++)
        await persistGathering(proof(session.id, u, i, i + 1));
      await expect(
        persistGathering(proof(session.id, u, 12, 13)),
      ).rejects.toThrow("Limite");
      await closeExploration(session.id);
      const next = await rpgTransaction(async (tx) => {
        const s = await tx.gameSession.create({
          data: {
            teamId: session.teamId,
            seed: region.seed,
            mapId: "ruins",
            mode: "normal",
            duration: 900,
            partySize: 1,
            expeditionKind: "RPG_EXPLORATION",
            members: { create: { userId: u, character: "nara" } },
          },
        });
        await initializeExploration(tx, s.id);
        return s;
      });
      const replay = await persistGathering(proof(next.id, u, 0, 13));
      expect(replay.revision).toBe(2);
      for (let i = 12; i < 18; i++)
        await persistGathering(proof(next.id, u, i, i + 1));
      await expect(persistGathering(proof(next.id, u, 18, 19))).rejects.toThrow(
        "Limite",
      );
      expect(await db().rpgResourceClaim.count({ where: { userId: u } })).toBe(
        18,
      );
    });
  },
);
afterAll(async () => {
  if (process.env.RUN_DATABASE_TESTS !== "1") return;
  await db().user.deleteMany({ where: { id: { in: users } } });
  await db().gameSession.deleteMany({ where: { teamId: { in: teams } } });
  await db().team.deleteMany({ where: { id: { in: teams } } });
  await db().$disconnect();
});

describe.skipIf(process.env.RUN_DATABASE_TESTS !== "1")(
  "exploration history and interrupted authorization",
  () => {
    beforeEach(() => {
      vi.stubEnv("RPG_ENABLED", "true");
      vi.stubEnv("RPG_EXPLORATION_ENABLED", "true");
    });
    afterEach(() => vi.unstubAllEnvs());
    it("isolates journal cursors and interrupts lost sessions without inventing gathering", async () => {
      const a = await fixture(),
        b = await fixture();
      const receipt = await persistGathering(proof(a.session.id, a.ids[0]));
      expect((await explorationHistory(a.ids[0])).claims).toHaveLength(1);
      expect((await explorationHistory(b.ids[0])).claims).toHaveLength(0);
      await expect(
        explorationHistory(b.ids[0], { cursor: receipt.claimId }),
      ).rejects.toThrow();
      await expect(
        explorationHistory(a.ids[0], { userId: b.ids[0] }),
      ).rejects.toThrow();
      vi.stubEnv("RPG_EXPLORATION_ENABLED", "false");
      await interruptLostExplorations();
      expect(
        (
          await db().rpgExplorationSession.findUniqueOrThrow({
            where: { sessionId: b.session.id },
          })
        ).status,
      ).toBe("INTERRUPTED");
      expect(
        await db().rpgResourceClaim.count({
          where: { sessionId: b.session.id },
        }),
      ).toBe(0);
      expect(
        await db().rpgResourceClaim.count({
          where: { sessionId: a.session.id },
        }),
      ).toBe(1);
    });
    it("enforces claim constraints and participant ownership below the service layer", async () => {
      const a = await fixture(),
        b = await fixture();
      const receipt = await persistGathering(proof(a.session.id, a.ids[0]));
      const row = await db().rpgResourceClaim.findUniqueOrThrow({
        where: { id: receipt.claimId },
      });
      for (const change of [
        { quantity: -1 },
        { quantity: 3 },
        { materialId: "GOLD" },
        { regionVersion: 2 },
        { nodeId: "fabricated" },
        { userId: b.ids[0] },
      ]) {
        await expect(
          db().rpgResourceClaim.create({
            data: {
              ...row,
              id: randomUUID(),
              requestId: randomUUID(),
              cycle: row.cycle + 1,
              ...change,
            },
          }),
        ).rejects.toThrow();
      }
      await expect(
        db().rpgResourceClaim.create({
          data: {
            ...row,
            id: randomUUID(),
            requestId: randomUUID(),
          },
        }),
      ).rejects.toThrow();
      await expect(
        db().rpgDiscoveredPoi.create({
          data: {
            userId: a.ids[0],
            regionId: "ruins-outskirts",
            regionVersion: 1,
            poiId: "fabricated",
          },
        }),
      ).rejects.toThrow();
      expect(
        await db().rpgResourceClaim.count({ where: { userId: a.ids[0] } }),
      ).toBe(1);
      expect(
        await db().rpgMaterialBalance.count({ where: { userId: b.ids[0] } }),
      ).toBe(0);
    });
    it("rolls back session authorization for a locked character or corrupt equipped item", async () => {
      const a = await fixture();
      await closeExploration(a.session.id);
      const authorize = (character: string) =>
        rpgTransaction(async (tx) => {
          const s = await tx.gameSession.create({
            data: {
              teamId: a.session.teamId,
              seed: region.seed,
              mapId: "ruins",
              mode: "normal",
              duration: 900,
              partySize: 1,
              expeditionKind: "RPG_EXPLORATION",
              members: { create: { userId: a.ids[0], character } },
            },
          });
          await initializeExploration(tx, s.id);
        });
      await expect(authorize("ivo")).rejects.toThrow("desbloqueado");
      const c = await db().rpgCharacter.findUniqueOrThrow({
        where: {
          userId_characterId: { userId: a.ids[0], characterId: "nara" },
        },
      });
      await db().rpgItemInstance.create({
        data: {
          userId: a.ids[0],
          itemId: "corrupt-definition",
          rarity: "COMMON",
          equippedCharacterId: c.id,
          equippedSlot: "WEAPON",
        },
      });
      await expect(authorize("nara")).rejects.toThrow();
      expect(
        await db().gameSession.count({ where: { teamId: a.session.teamId } }),
      ).toBe(1);
      expect(
        await db().rpgExplorationParticipant.count({
          where: { activeUserId: a.ids[0] },
        }),
      ).toBe(0);
    });
  },
);
