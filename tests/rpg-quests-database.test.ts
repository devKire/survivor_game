import "dotenv/config";
import { randomUUID } from "node:crypto";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import { db } from "../src/server/db";
import { mutateQuest, mutateDialogue } from "../src/server/rpg/quests/service";
import { rpgQuestJournal } from "../src/server/rpg/quests/journal";
import { rpgTransaction } from "../src/server/rpg/transaction";
import { initializeExploration } from "../src/server/rpg/exploration/entry";
import {
  persistGathering,
  persistDiscovery,
} from "../src/server/rpg/exploration/persistence";
import { EXPLORATION_RUINS as region } from "../src/game/content/rpg/exploration-regions";
import { generateExploration } from "../src/game/core/rpg/exploration/generation";
import { gatheringCycle } from "../src/game/core/rpg/exploration/gathering";
import { CoopSimulation } from "../src/game/core/coop";
import { freshSave } from "../src/game/core/save";
import { QUEST_DEFINITIONS } from "../src/game/content/rpg/quests";
const users: string[] = [],
  teams: string[] = [];
const nodes = generateExploration(
  region,
  new CoopSimulation(
    [{ id: "p", name: "p", character: "nara", progress: freshSave() }],
    "normal",
    "ruins",
    region.seed,
  ).world,
);
const intro = QUEST_DEFINITIONS[0].id,
  ruins = QUEST_DEFINITIONS[1].id,
  matter = QUEST_DEFINITIONS[2].id;
async function fixture() {
  const id = "quest_" + randomUUID();
  users.push(id);
  await db().user.create({
    data: { id, name: id, email: id + "@example.test" },
  });
  await rpgQuestJournal(id);
  return id;
}
async function rev(userId: string) {
  return (await db().rpgProfile.findUniqueOrThrow({ where: { userId } }))
    .revision;
}
async function quest(
  userId: string,
  kind: "ACCEPT" | "CLAIM",
  questId: string,
) {
  return mutateQuest(userId, {
    kind,
    questId,
    expectedRevision: await rev(userId),
    requestId: randomUUID(),
  });
}
async function talk(userId: string, npcId: string, choices: string[]) {
  await mutateDialogue(userId, {
    kind: "OPEN",
    npcId,
    expectedRevision: await rev(userId),
    requestId: randomUUID(),
  });
  for (const choiceId of choices)
    await mutateDialogue(userId, {
      kind: "CHOOSE",
      npcId,
      choiceId,
      expectedRevision: await rev(userId),
      requestId: randomUUID(),
    });
}
async function completeIntro(userId: string) {
  await quest(userId, "ACCEPT", intro);
  await talk(userId, "refuge:guardian", ["priority", "remnants"]);
  await talk(userId, "refuge:guide", ["briefing", "confirm"]);
  await talk(userId, "refuge:guardian", ["intro-report", "confirm"]);
}
async function exploration(userId: string) {
  const t = await db().team.create({
    data: {
      code: randomUUID(),
      leaderId: userId,
      expiresAt: new Date(Date.now() + 3600000),
      status: "RUNNING",
      expeditionKind: "RPG_EXPLORATION",
    },
  });
  teams.push(t.id);
  return rpgTransaction(async (tx) => {
    const s = await tx.gameSession.create({
      data: {
        teamId: t.id,
        seed: region.seed,
        mapId: "ruins",
        mode: "normal",
        duration: 900,
        partySize: 1,
        expeditionKind: "RPG_EXPLORATION",
        members: { create: { userId, character: "nara" } },
      },
    });
    await initializeExploration(tx, s.id);
    return s.id;
  });
}
async function gather(
  userId: string,
  sessionId: string,
  node: (typeof nodes)[number],
) {
  return persistGathering({
    userId,
    sessionId,
    node,
    cycle: gatheringCycle(Date.now()),
    intent: {
      nodeId: node.id,
      requestId: randomUUID(),
      expectedRevision: await rev(userId),
    },
    assertLive: () => {},
  });
}
async function discover(
  userId: string,
  sessionId: string,
  node: (typeof nodes)[number],
) {
  return persistDiscovery(sessionId, userId, node, () => {});
}
describe.skipIf(process.env.RUN_DATABASE_TESTS !== "1")(
  "quests PostgreSQL authority and idempotency",
  () => {
    beforeEach(() => {
      for (const flag of [
        "RPG_ENABLED",
        "RPG_QUESTS_ENABLED",
        "RPG_EXPLORATION_ENABLED",
      ])
        vi.stubEnv(flag, "true");
    });
    afterEach(() => vi.unstubAllEnvs());
    afterAll(async () => {
      await db().user.deleteMany({ where: { id: { in: users } } });
      await db().gameSession.deleteMany({ where: { teamId: { in: teams } } });
      await db().team.deleteMany({ where: { id: { in: teams } } });
      await db().$disconnect();
    });
    it("serializes simultaneous acceptance/replay, rejects different payload/stale and locked quests without Survivor mutation", async () => {
      const userId = await fixture(),
        before = await db().userProgress.findUnique({ where: { userId } });
      await expect(quest(userId, "ACCEPT", matter)).rejects.toThrow(
        "requisitos",
      );
      const command = {
        kind: "ACCEPT",
        questId: intro,
        expectedRevision: await rev(userId),
        requestId: randomUUID(),
      };
      const [a, b] = await Promise.all([
        mutateQuest(userId, command),
        mutateQuest(userId, command),
      ]);
      expect(a).toEqual(b);
      expect(await mutateQuest(userId, command)).toEqual(a);
      await expect(
        mutateQuest(userId, { ...command, questId: ruins }),
      ).rejects.toThrow("outra intenção");
      const different = await Promise.allSettled([
        mutateDialogue(userId, {
          kind: "OPEN",
          npcId: "refuge:guide",
          expectedRevision: await rev(userId),
          requestId: randomUUID(),
        }),
        mutateDialogue(userId, {
          kind: "OPEN",
          npcId: "refuge:guardian",
          expectedRevision: await rev(userId),
          requestId: randomUUID(),
        }),
      ]);
      expect(different.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(await db().userProgress.findUnique({ where: { userId } })).toEqual(
        before,
      );
    });
    it("opening/foreign replies give no proof; exclusive choice and quest receipt persist through new requests", async () => {
      const userId = await fixture(),
        other = await fixture();
      await quest(userId, "ACCEPT", intro);
      await talk(userId, "refuge:guide", []);
      expect(
        await db().rpgQuestObjectiveProof.count({ where: { userId } }),
      ).toBe(0);
      await expect(
        talk(userId, "refuge:guide", ["trial-report"]),
      ).rejects.toThrow("indisponível");
      await expect(talk(other, "refuge:guide", ["briefing"])).rejects.toThrow(
        "indisponível",
      );
      await completeIntro(userId);
      await expect(
        talk(userId, "refuge:guardian", ["priority", "echoes"]),
      ).rejects.toThrow("indisponível");
      const command = {
        kind: "CLAIM",
        questId: intro,
        expectedRevision: await rev(userId),
        requestId: randomUUID(),
      };
      const result = await mutateQuest(userId, command);
      expect(result.journal.quests[0].receipt?.xpGranted).toBe(20);
      expect(await mutateQuest(userId, command)).toEqual(result);
      await quest(userId, "CLAIM", intro);
      expect(
        await db().rpgQuestRewardReceipt.count({ where: { userId } }),
      ).toBe(1);
      expect(
        (await db().rpgCharacter.findFirstOrThrow({ where: { userId } })).xp,
      ).toBe(20);
      expect((await rpgQuestJournal(other)).quests[0].status).toBe("AVAILABLE");
    });
    it("rolls back XP, flags, materials and state if receipt insert fails before commit", async () => {
      const userId = await fixture();
      await completeIntro(userId);
      const before = await db().rpgCharacter.findFirstOrThrow({
          where: { userId },
        }),
        revision = await rev(userId);
      await db().$executeRawUnsafe(
        `CREATE FUNCTION limiar.quest_test_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected'; END $$`,
      );
      await db().$executeRawUnsafe(
        `CREATE TRIGGER quest_test_failure BEFORE INSERT ON limiar."RpgQuestRewardReceipt" FOR EACH ROW EXECUTE FUNCTION limiar.quest_test_fail()`,
      );
      const input = {
        kind: "CLAIM",
        questId: intro,
        expectedRevision: revision,
        requestId: randomUUID(),
      };
      try {
        await expect(mutateQuest(userId, input)).rejects.toThrow();
        expect(
          await db().rpgCharacter.findFirstOrThrow({ where: { userId } }),
        ).toEqual(before);
        expect(await rev(userId)).toBe(revision);
        expect(await db().rpgStoryFlag.count({ where: { userId } })).toBe(0);
      } finally {
        await db().$executeRawUnsafe(
          'DROP TRIGGER quest_test_failure ON limiar."RpgQuestRewardReceipt"',
        );
        await db().$executeRawUnsafe("DROP FUNCTION limiar.quest_test_fail()");
      }
      await mutateQuest(userId, input);
      expect(
        await db().rpgQuestRewardReceipt.count({ where: { userId } }),
      ).toBe(1);
    });
    it("reconciles old discoveries, counts only post-acceptance claims, delivers costs atomically and keeps proofs on retry", async () => {
      const userId = await fixture();
      await completeIntro(userId);
      await quest(userId, "CLAIM", intro);
      const sessionId = await exploration(userId);
      await discover(
        userId,
        sessionId,
        nodes.find((n) => n.kind === "POI")!,
      );
      await quest(userId, "ACCEPT", ruins);
      expect(
        (await rpgQuestJournal(userId)).quests[1].objectives[0].current,
      ).toBe(1);
      await talk(userId, "refuge:guardian", ["ruins-report", "confirm"]);
      await quest(userId, "CLAIM", ruins);
      const ore = nodes.filter((n) => n.definitionId === "weathered-vein"),
        fiber = nodes.filter((n) => n.definitionId === "ruins-herb");
      await gather(userId, sessionId, ore[0]);
      await quest(userId, "ACCEPT", matter);
      expect(
        (await rpgQuestJournal(userId)).quests[2].objectives[0].current,
      ).toBe(0);
      for (const node of [ore[1], ore[2], fiber[0], fiber[1]])
        await gather(userId, sessionId, node);
      const first = await rpgQuestJournal(userId),
        revision = first.revision;
      expect(
        first.quests[2].objectives.slice(0, 2).map((o) => o.current),
      ).toEqual([4, 4]);
      expect((await rpgQuestJournal(userId)).revision).toBe(revision);
      await talk(userId, "refuge:keeper", ["materials-report", "confirm"]);
      await db().rpgMaterialBalance.update({
        where: { userId_materialId: { userId, materialId: "ruins-fiber" } },
        data: { amount: 0 },
      });
      const oreBefore = await db().rpgMaterialBalance.findUniqueOrThrow({
        where: { userId_materialId: { userId, materialId: "weathered-ore" } },
      });
      await expect(quest(userId, "CLAIM", matter)).rejects.toThrow(
        "insuficientes",
      );
      expect(
        await db().rpgMaterialBalance.findUniqueOrThrow({
          where: { userId_materialId: { userId, materialId: "weathered-ore" } },
        }),
      ).toEqual(oreBefore);
      await db().rpgMaterialBalance.update({
        where: { userId_materialId: { userId, materialId: "ruins-fiber" } },
        data: { amount: 4 },
      });
      const result = await quest(userId, "CLAIM", matter);
      expect(result.journal.quests[2].receipt?.costs).toHaveLength(2);
      expect(result.journal.quests[2].receipt?.newLevel).toBe(2);
    });
    it("feature flags fail closed while keeping accepted records recoverable", async () => {
      const userId = await fixture();
      await quest(userId, "ACCEPT", intro);
      vi.stubEnv("RPG_QUESTS_ENABLED", "false");
      await expect(rpgQuestJournal(userId)).rejects.toThrow("indisponíveis");
      await expect(quest(userId, "CLAIM", intro)).rejects.toThrow(
        "indisponíveis",
      );
      vi.stubEnv("RPG_QUESTS_ENABLED", "true");
      expect((await rpgQuestJournal(userId)).quests[0].status).toBe("ACTIVE");
    });
    it("enforces cross-user FKs, immutable proofs/choices and cascading account deletion", async () => {
      const userId = await fixture(),
        other = await fixture();
      await completeIntro(userId);
      await quest(userId, "CLAIM", intro);
      const progress = await db().rpgQuestProgress.findFirstOrThrow({
        where: { userId },
      });
      await expect(
        db().rpgQuestObjectiveProof.create({
          data: {
            userId: other,
            questProgressId: progress.id,
            objectiveId: "fake",
            sourceKind: "TALK_TO_NPC",
            sourceId: "fake",
            quantity: 1,
          },
        }),
      ).rejects.toThrow();
      await expect(
        db().rpgNarrativeChoice.update({
          where: {
            userId_groupId: { userId, groupId: "investigation-priority" },
          },
          data: { value: "ECHOES" },
        }),
      ).rejects.toThrow();
      await expect(
        db().rpgQuestProgress.update({
          where: { id: progress.id },
          data: { status: "ACTIVE", completedAt: null, rewardedAt: null },
        }),
      ).rejects.toThrow();
      await db().user.delete({ where: { id: userId } });
      expect(await db().rpgQuestProgress.count({ where: { userId } })).toBe(0);
      expect(
        await db().rpgQuestObjectiveProof.count({ where: { userId } }),
      ).toBe(0);
      expect(
        await db().rpgQuestRewardReceipt.count({ where: { userId } }),
      ).toBe(0);
      expect(await db().rpgNarrativeChoice.count({ where: { userId } })).toBe(
        0,
      );
      expect(await db().rpgDialogueState.count({ where: { userId } })).toBe(0);
    });
  },
);

describe.skipIf(process.env.RUN_DATABASE_TESTS !== "1")(
  "quest shared account lock and caps",
  () => {
    beforeEach(() => {
      for (const flag of [
        "RPG_ENABLED",
        "RPG_QUESTS_ENABLED",
        "RPG_REFUGE_ENABLED",
      ])
        vi.stubEnv(flag, "true");
    });
    afterEach(() => vi.unstubAllEnvs());
    it("coordinates narrative, storage and economy without duplicating items or incrementing Survivor version itself", async () => {
      const { transferRpgItem } = await import("../src/server/rpg/storage");
      const { economyTransaction, lockProgress, grantCurrency, persistSave } =
        await import("../src/server/economy");
      const userId = await fixture();
      const item = await db().rpgItemInstance.create({
        data: { userId, itemId: "blade-weathered", rarity: "COMMON" },
      });
      const expectedRevision = await rev(userId);
      const outcomes = await Promise.allSettled([
        mutateQuest(userId, {
          kind: "ACCEPT",
          questId: intro,
          expectedRevision,
          requestId: randomUUID(),
        }),
        transferRpgItem(userId, {
          operation: "DEPOSIT_ITEM",
          instanceId: item.id,
          expectedRevision,
          requestId: randomUUID(),
        }),
        economyTransaction(async (tx) => {
          const { save } = await lockProgress(tx, userId);
          await grantCurrency(tx, save, {
            userId,
            currency: "GOLD",
            amount: 3,
            source: "test",
            referenceId: randomUUID(),
          });
          await persistSave(tx, userId, save);
        }),
      ]);
      expect(outcomes[2].status).toBe("fulfilled");
      expect(
        outcomes.slice(0, 2).filter((o) => o.status === "fulfilled"),
      ).toHaveLength(1);
      expect(
        (await db().userProgress.findUniqueOrThrow({ where: { userId } }))
          .version,
      ).toBe(2);
      expect(await db().rpgItemInstance.count({ where: { userId } })).toBe(1);
    });
    it("freezes XP recipient when active character changes and reports actual saturated grants", async () => {
      const { economyJson } = await import("../src/server/economy");
      const { selectRpgCharacter } =
        await import("../src/server/rpg/mutations");
      const { attributesAtLevel } =
        await import("../src/game/core/rpg/attributes");
      const userId = await fixture(),
        save = freshSave();
      save.unlocked.push("orin");
      await db().userProgress.update({
        where: { userId },
        data: { data: economyJson(save) },
      });
      await rpgQuestJournal(userId);
      await completeIntro(userId);
      await selectRpgCharacter(userId, {
        characterId: "orin",
        expectedRevision: await rev(userId),
        requestId: randomUUID(),
      });
      const attributes = attributesAtLevel(
        {
          level: 1,
          attributePoints: 0,
          attributes: { vitality: 0, power: 0, agility: 0, focus: 0, will: 0 },
        },
        100,
      );
      await db().rpgCharacter.update({
        where: { userId_characterId: { userId, characterId: "nara" } },
        data: { ...attributes, xp: 1_000_000_000 },
      });
      await db().rpgMaterialBalance.create({
        data: { userId, materialId: "obelisk-dust", amount: 1_000_000_000 },
      });
      const result = await quest(userId, "CLAIM", intro),
        receipt = result.journal.quests[0].receipt!;
      expect(receipt.characterId).toBe("nara");
      expect(receipt.xpGranted).toBe(0);
      expect(receipt.pointsGranted).toBe(0);
      expect(receipt.materials).toEqual([
        { materialId: "obelisk-dust", quantity: 0, capped: true },
      ]);
      expect(
        (
          await db().rpgCharacter.findUniqueOrThrow({
            where: { userId_characterId: { userId, characterId: "orin" } },
          })
        ).xp,
      ).toBe(0);
    });
    afterAll(async () => {
      await db().user.deleteMany({ where: { id: { in: users } } });
      await db().$disconnect();
    });
  },
);
