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
import { freshSave } from "../src/game/core/save";
import {
  economyJson,
  economyTransaction,
  grantCurrency,
  lockProgress,
  persistSave,
} from "../src/server/economy";
import { initializeRpgExpedition } from "../src/server/rpg/expedition-entry";
import { persistRpgTerminal } from "../src/server/rpg/expedition-terminal";
import { settleRpgExpedition } from "../src/server/rpg/rewards";
import { rpgTransaction } from "../src/server/rpg/transaction";
import { rpgProfileData } from "../src/server/rpg/profile";
import { rewardHash } from "../src/server/rpg/reward-integrity";
import {
  rpgRewardDetail,
  rpgRewardHistory,
} from "../src/server/rpg/reward-history";
import { rpgPresentation } from "../src/server/rpg/presentation";
import {
  interruptLostRpgExpeditions,
  recoverRpgRewards,
} from "../src/server/rpg/expedition-recovery";

const users: string[] = [],
  teams: string[] = [],
  sessions: string[] = [];
async function fixture(size = 1, character = "nara", kind = "RPG_EXPEDITION") {
  const ids = Array.from(
    { length: size },
    () => `reward_${randomUUID()}`,
  ).sort();
  for (const id of ids) {
    await db().user.create({
      data: {
        id,
        name: id,
        email: `${id}@example.test`,
        progress: { create: { data: economyJson(freshSave()) } },
      },
    });
    users.push(id);
  }
  const team = await db().team.create({
    data: {
      code: randomUUID(),
      leaderId: ids[0],
      status: "RUNNING",
      expeditionKind: kind,
      expiresAt: new Date(Date.now() + 3600000),
    },
  });
  teams.push(team.id);
  const game = await db().gameSession.create({
    data: {
      teamId: team.id,
      expeditionKind: kind,
      seed: randomUUID(),
      mapId: "ruins",
      mode: "normal",
      duration: 600,
      partySize: size,
      members: { create: ids.map((userId) => ({ userId, character })) },
    },
  });
  sessions.push(game.id);
  return { ids, sessionId: game.id, teamId: team.id };
}
async function authorized(size = 1) {
  const f = await fixture(size);
  await rpgTransaction((tx) => initializeRpgExpedition(tx, f.sessionId));
  return f;
}
function terminal(ids: string[], outcome: "VICTORY" | "DEFEAT" = "VICTORY") {
  return {
    version: 1,
    outcome,
    ticks: 15000,
    participants: ids.map((userId) => ({
      userId,
      characterId: "nara",
      entryLevel: 1,
      connectedTicks: 15000,
      activeTicks: 1000,
      absentTicks: 0,
    })),
    events: [
      {
        eventId: "boss-0",
        source: "BOSS_DEFEAT",
        definitionId: "boss:0",
        tick: 4000,
        userId: null,
      },
    ],
  };
}
async function state(userId: string) {
  return {
    progress: await db().userProgress.findUniqueOrThrow({ where: { userId } }),
    profile: await db().rpgProfile.findUnique({
      where: { userId },
      include: { characters: true, items: true, materials: true },
    }),
  };
}

describe.skipIf(process.env.RUN_DATABASE_TESTS !== "1")(
  "durable RPG rewards on PostgreSQL",
  () => {
    beforeEach(() => {
      vi.stubEnv("RPG_ENABLED", "true");
      vi.stubEnv("RPG_EXPEDITIONS_ENABLED", "true");
    });
    afterEach(() => vi.unstubAllEnvs());
    afterAll(async () => {
      await db().gameSession.deleteMany({ where: { id: { in: sessions } } });
      await db().team.deleteMany({ where: { id: { in: teams } } });
      await db().user.deleteMany({ where: { id: { in: users } } });
      await db().$disconnect();
    });

    it("freezes database loadouts, keeps reward seeds distinct and rejects locked characters/classic sessions", async () => {
      const f = await authorized();
      const row = await db().rpgExpeditionSession.findUniqueOrThrow({
        where: { sessionId: f.sessionId },
        include: { session: true, participants: true },
      });
      expect(row.rewardSeed).not.toBe(row.session.seed);
      expect(row.participants[0].loadoutHash).toBe(
        rewardHash(row.participants[0].loadout),
      );
      expect((await state(f.ids[0])).progress.version).toBe(1);
      await expect(
        db().rpgExpeditionParticipant.update({
          where: {
            sessionId_userId: { sessionId: f.sessionId, userId: f.ids[0] },
          },
          data: { entryLevel: 2 },
        }),
      ).rejects.toThrow();
      await expect(
        db().rpgExpeditionSession.update({
          where: { sessionId: f.sessionId },
          data: { rewardSeed: "f".repeat(64) },
        }),
      ).rejects.toThrow();
      const locked = await fixture(1, "sena");
      await expect(
        rpgTransaction((tx) => initializeRpgExpedition(tx, locked.sessionId)),
      ).rejects.toThrow("desbloqueado");
      const classic = await fixture(1, "nara", "SURVIVOR");
      await expect(
        rpgTransaction((tx) => initializeRpgExpedition(tx, classic.sessionId)),
      ).rejects.toThrow("inválida");
      expect(
        await db().rpgProfile.count({ where: { userId: locked.ids[0] } }),
      ).toBe(0);
    });

    it("persists terminal before payout, serializes simultaneous workers and replays exactly once for all five users", async () => {
      const f = await authorized(5),
        input = terminal(f.ids);
      const before = await Promise.all(f.ids.map(state));
      await expect(settleRpgExpedition(f.sessionId)).rejects.toThrow(
        "unavailable",
      );
      await Promise.all([
        persistRpgTerminal(f.sessionId, input),
        persistRpgTerminal(f.sessionId, input),
      ]);
      expect(
        await db().rpgRewardReceipt.count({
          where: { sessionId: f.sessionId },
        }),
      ).toBe(0);
      const [a, b] = await Promise.all([
        settleRpgExpedition(f.sessionId),
        settleRpgExpedition(f.sessionId),
      ]);
      expect(a).toEqual(b);
      expect(a).toHaveLength(5);
      expect(await settleRpgExpedition(f.sessionId)).toEqual(a);
      for (let i = 0; i < 5; i++) {
        const after = await state(f.ids[i]);
        expect(after.progress).toEqual(before[i].progress);
        expect(after.profile!.characters[0]).toMatchObject({
          xp: 120,
          level: 2,
          attributePoints: 5,
        });
        expect(after.profile!.revision).toBe(before[i].profile!.revision + 1);
        expect(a[i].xpGranted).toBe(120);
        expect(JSON.stringify(a[i])).not.toMatch(/rewardSeed|rollSeed/);
        expect(after.profile!.items.length).toBeGreaterThanOrEqual(1);
        expect(
          after.profile!.items.every(
            (item) => !item.equippedCharacterId && item.quantity === 1,
          ),
        ).toBe(true);
      }
      await expect(
        persistRpgTerminal(f.sessionId, { ...input, outcome: "DEFEAT" }),
      ).rejects.toThrow("Divergent");
      await expect(
        db().rpgRewardReceipt.update({
          where: {
            sessionId_userId: { sessionId: f.sessionId, userId: f.ids[0] },
          },
          data: { xpGranted: 0 },
        }),
      ).rejects.toThrow();
    });

    it("rolls back earlier users and receipts when the second participant fails, then retries the same loot", async () => {
      const f = await authorized(2);
      await persistRpgTerminal(f.sessionId, terminal(f.ids));
      const before = await Promise.all(f.ids.map(state));
      // Real PostgreSQL failure after writes to user 1, not a mocked transaction.
      await db().$executeRawUnsafe(
        `CREATE FUNCTION limiar.reward_test_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."userId" = '${f.ids[1]}' THEN RAISE EXCEPTION 'injected reward failure'; END IF; RETURN NEW; END $$`,
      );
      await db().$executeRawUnsafe(
        'CREATE TRIGGER reward_test_failure BEFORE UPDATE ON limiar."RpgCharacter" FOR EACH ROW EXECUTE FUNCTION limiar.reward_test_failure()',
      );
      try {
        await expect(settleRpgExpedition(f.sessionId)).rejects.toThrow(
          "injected reward failure",
        );
        expect(await Promise.all(f.ids.map(state))).toEqual(before);
        expect(
          await db().rpgRewardReceipt.count({
            where: { sessionId: f.sessionId },
          }),
        ).toBe(0);
        expect(
          (
            await db().rpgExpeditionSession.findUniqueOrThrow({
              where: { sessionId: f.sessionId },
            })
          ).status,
        ).toBe("TERMINAL");
      } finally {
        await db().$executeRawUnsafe(
          'DROP TRIGGER reward_test_failure ON limiar."RpgCharacter"',
        );
        await db().$executeRawUnsafe(
          "DROP FUNCTION limiar.reward_test_failure()",
        );
      }
      expect(await settleRpgExpedition(f.sessionId)).toHaveLength(2);
    });

    it("rejects terminal identity forgery and preserves a pending terminal while either flag is off", async () => {
      const f = await authorized();
      await expect(
        persistRpgTerminal(f.sessionId, terminal(["foreign-user"])),
      ).rejects.toThrow("authority");
      vi.stubEnv("RPG_EXPEDITIONS_ENABLED", "false");
      await persistRpgTerminal(f.sessionId, terminal(f.ids));
      await expect(settleRpgExpedition(f.sessionId)).rejects.toThrow(
        "indisponíveis",
      );
      vi.stubEnv("RPG_EXPEDITIONS_ENABLED", "true");
      vi.stubEnv("RPG_ENABLED", "false");
      await expect(settleRpgExpedition(f.sessionId)).rejects.toThrow(
        "indisponíveis",
      );
      vi.stubEnv("RPG_ENABLED", "true");
      expect(await settleRpgExpedition(f.sessionId)).toHaveLength(1);
    });

    it("issues zero receipts on defeat/inactivity and keeps economic writes independent", async () => {
      const f = await authorized(2),
        input = terminal(f.ids);
      input.participants[1].activeTicks = 0;
      await persistRpgTerminal(f.sessionId, input);
      const economic = economyTransaction(async (tx) => {
        const { save } = await lockProgress(tx, f.ids[0]);
        await grantCurrency(tx, save, {
          userId: f.ids[0],
          currency: "GOLD",
          amount: 7,
          source: "test",
          referenceId: randomUUID(),
        });
        await persistSave(tx, f.ids[0], save);
      });
      const [receipts] = await Promise.all([
        settleRpgExpedition(f.sessionId),
        economic,
      ]);
      expect(receipts[1]).toMatchObject({
        xpGranted: 0,
        newLevel: 1,
        pointsGranted: 0,
      });
      expect((await state(f.ids[1])).profile!.revision).toBe(1);
      expect((await state(f.ids[0])).progress.version).toBe(2);
      const defeat = await authorized();
      await persistRpgTerminal(
        defeat.sessionId,
        terminal(defeat.ids, "DEFEAT"),
      );
      expect((await settleRpgExpedition(defeat.sessionId))[0].xpGranted).toBe(
        0,
      );
    });

    it("saturates XP/material balances explicitly and deletes own audit rows in account cascades", async () => {
      const f = await authorized(),
        userId = f.ids[0];
      await db().rpgMaterialBalance.create({
        data: { userId, materialId: "obelisk-dust", amount: 1_000_000_000 },
      });
      const profile = await rpgProfileData(userId);
      await db().rpgCharacter.update({
        where: { id: profile.characters[0].id },
        data: { xp: 1_000_000_000, level: 100, attributePoints: 495 },
      });
      await persistRpgTerminal(f.sessionId, terminal(f.ids));
      const receipt = (await settleRpgExpedition(f.sessionId))[0];
      expect(receipt).toMatchObject({
        xpGranted: 0,
        previousLevel: 100,
        newLevel: 100,
        pointsGranted: 0,
      });
      expect(JSON.stringify(receipt.result)).toContain('"capped":true');
      await db().user.delete({ where: { id: userId } });
      expect(await db().rpgRewardReceipt.count({ where: { userId } })).toBe(0);
      expect(
        await db().rpgExpeditionParticipant.count({ where: { userId } }),
      ).toBe(0);
    });
    it("projects only owned receipts and public equipment data, and rejects forged query scopes", async () => {
      const owner = await authorized(),
        other = await authorized();
      await persistRpgTerminal(owner.sessionId, terminal(owner.ids));
      await settleRpgExpedition(owner.sessionId);
      expect(
        await rpgRewardDetail(other.ids[0], { sessionId: owner.sessionId }),
      ).toBeNull();
      expect(
        (await rpgRewardHistory(other.ids[0], { cursor: owner.sessionId }))
          .entries,
      ).toEqual([]);
      await expect(
        rpgRewardHistory(other.ids[0], { userId: owner.ids[0] }),
      ).rejects.toThrow();
      const detail = await rpgRewardDetail(owner.ids[0], {
        sessionId: owner.sessionId,
      });
      expect(detail?.receipt?.xpGranted).toBe(120);
      const presentation = rpgPresentation(await rpgProfileData(owner.ids[0]));
      expect(JSON.stringify({ detail, presentation })).not.toMatch(
        /rewardSeed|rollSeed|loadoutHash|userId/,
      );
      expect(presentation.items.length).toBeGreaterThan(0);
      vi.stubEnv("RPG_ENABLED", "false");
      await expect(rpgRewardHistory(owner.ids[0])).rejects.toThrow(
        "indisponível",
      );
    });
    it("rejects disabled entry, corrupt equipped content and concurrent active authorizations", async () => {
      const f = await fixture();
      vi.stubEnv("RPG_EXPEDITIONS_ENABLED", "false");
      await expect(
        rpgTransaction((tx) => initializeRpgExpedition(tx, f.sessionId)),
      ).rejects.toThrow("indisponíveis");
      vi.stubEnv("RPG_EXPEDITIONS_ENABLED", "true");
      const profile = await rpgProfileData(f.ids[0]);
      const item = await db().rpgItemInstance.create({
        data: {
          userId: f.ids[0],
          itemId: "retired-unknown-item",
          rarity: "COMMON",
          equippedCharacterId: profile.characters[0].id,
          equippedSlot: "WEAPON",
        },
      });
      await expect(
        rpgTransaction((tx) => initializeRpgExpedition(tx, f.sessionId)),
      ).rejects.toThrow();
      expect(
        await db().rpgExpeditionSession.count({
          where: { sessionId: f.sessionId },
        }),
      ).toBe(0);
      await db().rpgItemInstance.delete({ where: { id: item.id } });
      await rpgTransaction((tx) => initializeRpgExpedition(tx, f.sessionId));
      const duplicate = await db().gameSession.create({
        data: {
          teamId: f.teamId,
          expeditionKind: "RPG_EXPEDITION",
          seed: randomUUID(),
          mapId: "ruins",
          mode: "normal",
          duration: 600,
          partySize: 1,
          members: { create: { userId: f.ids[0], character: "nara" } },
        },
      });
      sessions.push(duplicate.id);
      await expect(
        rpgTransaction((tx) => initializeRpgExpedition(tx, duplicate.id)),
      ).rejects.toThrow("já está");
    });
    it("paginates tied timestamps without duplicates or missing own entries", async () => {
      const f = await authorized(),
        userId = f.ids[0];
      const original = await db().rpgExpeditionSession.findUniqueOrThrow({
        where: { sessionId: f.sessionId },
        include: { participants: true },
      });
      const participant = original.participants[0],
        createdAt = new Date("2020-01-01T00:00:00Z");
      // Historical interrupted-session fixtures, no grants or receipt fabrication.
      for (let i = 0; i < 20; i++) {
        const session = await db().gameSession.create({
          data: {
            teamId: f.teamId,
            expeditionKind: "RPG_EXPEDITION",
            seed: randomUUID(),
            mapId: "ruins",
            mode: "normal",
            duration: 600,
            partySize: 1,
            status: "INTERRUPTED",
            members: { create: { userId, character: "nara" } },
          },
        });
        sessions.push(session.id);
        await db().rpgExpeditionSession.create({
          data: {
            sessionId: session.id,
            status: "INTERRUPTED",
            rewardSeed: original.rewardSeed,
            participants: {
              create: {
                userId,
                characterId: "nara",
                entryLevel: 1,
                entryRevision: 1,
                loadout: economyJson(participant.loadout),
                loadoutHash: participant.loadoutHash,
                createdAt,
              },
            },
          },
        });
      }
      const first = await rpgRewardHistory(userId);
      expect(first.entries).toHaveLength(20);
      const second = await rpgRewardHistory(userId, {
        cursor: first.nextCursor,
      });
      expect(second.entries).toHaveLength(1);
      expect(second.nextCursor).toBeNull();
      expect(
        new Set([...first.entries, ...second.entries].map((e) => e.sessionId))
          .size,
      ).toBe(21);
    });
    it("interrupts lost running simulations but recovers durable terminals after rollout is reenabled", async () => {
      const lost = await authorized(),
        pending = await authorized();
      await persistRpgTerminal(pending.sessionId, terminal(pending.ids));
      vi.stubEnv("RPG_EXPEDITIONS_ENABLED", "false");
      await interruptLostRpgExpeditions();
      await recoverRpgRewards();
      expect(
        (
          await db().rpgExpeditionSession.findUniqueOrThrow({
            where: { sessionId: lost.sessionId },
          })
        ).status,
      ).toBe("INTERRUPTED");
      expect(
        (
          await db().rpgExpeditionSession.findUniqueOrThrow({
            where: { sessionId: pending.sessionId },
          })
        ).status,
      ).toBe("TERMINAL");
      expect(
        await db().rpgRewardReceipt.count({
          where: { sessionId: { in: [lost.sessionId, pending.sessionId] } },
        }),
      ).toBe(0);
      vi.stubEnv("RPG_EXPEDITIONS_ENABLED", "true");
      await recoverRpgRewards();
      expect(
        await db().rpgRewardReceipt.count({
          where: { sessionId: pending.sessionId },
        }),
      ).toBe(1);
      await expect(settleRpgExpedition(lost.sessionId)).rejects.toThrow(
        "unavailable",
      );
    });
  },
);
