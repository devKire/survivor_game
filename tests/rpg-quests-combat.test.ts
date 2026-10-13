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
import { introduce, questIntent } from "./helpers/quest-intents";
import { rpgTransaction } from "../src/server/rpg/transaction";
import { initializeRpgExpedition } from "../src/server/rpg/expedition-entry";
import { persistRpgTerminal } from "../src/server/rpg/expedition-terminal";
import { settleRpgExpedition } from "../src/server/rpg/rewards";
import { rpgQuestJournal } from "../src/server/rpg/quests/journal";
import { collectQuestEvidence } from "../src/server/rpg/quests/evidence";
const users: string[] = [],
  teams: string[] = [];
async function fixture(beforeAcceptance = false) {
  const userId = "qcombat_" + randomUUID();
  users.push(userId);
  await db().user.create({
    data: { id: userId, name: userId, email: userId + "@example.test" },
  });
  await introduce(userId);
  if (!beforeAcceptance)
    await questIntent(userId, "ACCEPT", "side:expedition-trial");
  const team = await db().team.create({
    data: {
      code: randomUUID(),
      leaderId: userId,
      status: "RUNNING",
      expeditionKind: "RPG_EXPEDITION",
      expiresAt: new Date(Date.now() + 3600000),
    },
  });
  teams.push(team.id);
  const session = await db().gameSession.create({
    data: {
      teamId: team.id,
      expeditionKind: "RPG_EXPEDITION",
      seed: "public",
      mapId: "ruins",
      mode: "normal",
      duration: 600,
      partySize: 1,
      members: { create: { userId, character: "nara" } },
    },
  });
  await rpgTransaction((tx) => initializeRpgExpedition(tx, session.id));
  if (beforeAcceptance)
    await questIntent(userId, "ACCEPT", "side:expedition-trial");
  return { userId, sessionId: session.id };
}
async function terminal(
  userId: string,
  sessionId: string,
  outcome = "VICTORY",
  activeTicks = 1000,
) {
  await persistRpgTerminal(sessionId, {
    version: 1,
    outcome,
    ticks: 15000,
    participants: [
      {
        userId,
        characterId: "nara",
        entryLevel: 1,
        connectedTicks: 15000,
        activeTicks,
        absentTicks: 0,
      },
    ],
    events: [
      {
        eventId: "boss-0",
        source: "BOSS_DEFEAT",
        definitionId: "boss:0",
        tick: 4000,
        userId: null,
      },
    ],
  });
}
const trial = (j: Awaited<ReturnType<typeof rpgQuestJournal>>) =>
  j.quests.find((q) => q.id === "side:expedition-trial")!.objectives[0].current;
describe.skipIf(process.env.RUN_DATABASE_TESTS !== "1")(
  "narrative confirmed combat evidence",
  () => {
    beforeEach(() => {
      for (const key of [
        "RPG_ENABLED",
        "RPG_QUESTS_ENABLED",
        "RPG_EXPEDITIONS_ENABLED",
      ])
        vi.stubEnv(key, "true");
    });
    afterEach(() => vi.unstubAllEnvs());
    afterAll(async () => {
      await db().user.deleteMany({ where: { id: { in: users } } });
      await db().gameSession.deleteMany({ where: { teamId: { in: teams } } });
      await db().team.deleteMany({ where: { id: { in: teams } } });
      await db().$disconnect();
    });
    it("ignores pending terminals, recovers after settlement races, and counts confirmed bosses only once", async () => {
      const { userId, sessionId } = await fixture();
      const progress = await db().rpgQuestProgress.findFirstOrThrow({
        where: { userId, questId: "side:expedition-trial" },
      });
      await terminal(userId, sessionId);
      expect(trial(await rpgQuestJournal(userId))).toBe(0);
      await Promise.all([
        settleRpgExpedition(sessionId),
        rpgQuestJournal(userId),
      ]);
      expect(trial(await rpgQuestJournal(userId))).toBe(1);
      const before = await db().rpgQuestObjectiveProof.count({
        where: { userId },
      });
      await settleRpgExpedition(sessionId);
      await rpgQuestJournal(userId);
      expect(
        await db().rpgQuestObjectiveProof.count({ where: { userId } }),
      ).toBe(before);
      const objective = {
        id: "boss",
        kind: "DEFEAT_BOSS" as const,
        profileId: "ruins-v1",
        bossId: "boss:0",
        policy: "AFTER_ACCEPTANCE_ONLY" as const,
        target: 1,
      };
      expect(
        await db().$transaction((tx) =>
          collectQuestEvidence(tx, userId, progress, objective, []),
        ),
      ).toEqual([
        { sourceKind: "DEFEAT_BOSS", sourceId: sessionId, quantity: 1 },
      ]);
      expect(
        await db().$transaction((tx) =>
          collectQuestEvidence(
            tx,
            userId,
            progress,
            { ...objective, bossId: "boss:1" },
            [],
          ),
        ),
      ).toEqual([]);
      expect(
        await db().$transaction((tx) =>
          collectQuestEvidence(tx, "foreign", progress, objective, []),
        ),
      ).toEqual([]);
      expect(
        await db().$transaction((tx) =>
          collectQuestEvidence(tx, userId, progress, objective, [sessionId]),
        ),
      ).toEqual([]);
    });
    it.each([
      ["VICTORY", 1000, true],
      ["DEFEAT", 1000, false],
      ["VICTORY", 0, false],
    ] as const)(
      "rejects ineligible history outcome=%s active=%s startedBefore=%s",
      async (outcome, active, before) => {
        const { userId, sessionId } = await fixture(before);
        await terminal(userId, sessionId, outcome, active);
        await settleRpgExpedition(sessionId);
        expect(trial(await rpgQuestJournal(userId))).toBe(0);
      },
    );
  },
);
