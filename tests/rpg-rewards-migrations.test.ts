import "dotenv/config";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { Client } from "pg";
import { describe, expect, it } from "vitest";
const enabled =
  process.env.RUN_DATABASE_TESTS === "1" &&
  process.env.RUN_MIGRATION_TESTS === "1";
const migration = "20261009200000_rpg_rewards";
async function temporary(run: (client: Client) => Promise<void>) {
  const url = new URL(process.env.DATABASE_URL!),
    name = "rpg_rewards_" + randomUUID().replaceAll("-", "");
  const admin = new Client({ connectionString: url.toString() });
  await admin.connect();
  await admin.query(`CREATE DATABASE "${name}"`);
  url.pathname = "/" + name;
  const client = new Client({ connectionString: url.toString() });
  try {
    await client.connect();
    await run(client);
  } finally {
    await client.end();
    await admin.query(`DROP DATABASE "${name}"`);
    await admin.end();
  }
}
async function baseline(client: Client) {
  for (const dir of (
    await readdir("prisma/migrations", { withFileTypes: true })
  )
    .filter((d) => d.isDirectory() && d.name < migration)
    .map((d) => d.name)
    .sort())
    await client.query(
      await readFile(`prisma/migrations/${dir}/migration.sql`, "utf8"),
    );
}
async function upgrade(client: Client) {
  await client.query(
    await readFile(`prisma/migrations/${migration}/migration.sql`, "utf8"),
  );
}
describe.skipIf(!enabled)(
  "RPG reward migration in disposable PostgreSQL databases",
  () => {
    it("applies all migrations from empty with constraints, indexes and immutable audit triggers", async () => {
      await temporary(async (client) => {
        await baseline(client);
        await upgrade(client);
        const tables = (
          await client.query(
            "SELECT tablename FROM pg_tables WHERE schemaname='limiar' AND tablename LIKE 'Rpg%'",
          )
        ).rows.map((r) => r.tablename);
        expect(tables).toEqual(
          expect.arrayContaining([
            "RpgExpeditionSession",
            "RpgExpeditionParticipant",
            "RpgRewardReceipt",
          ]),
        );
        expect(
          (
            await client.query(
              "SELECT count(*)::int n FROM pg_trigger WHERE tgname IN ('RpgExpeditionSession_immutable','RpgExpeditionParticipant_immutable','RpgRewardReceipt_immutable')",
            )
          ).rows[0].n,
        ).toBe(3);
      });
    });
    it("preserves Phase 2 equipment, progression, Survivor sessions and deferred ownership relations", async () => {
      await temporary(async (client) => {
        await baseline(client);
        await client.query(
          `INSERT INTO limiar."User" (id,name,email,"updatedAt") VALUES ('u','U','u@example.test',now())`,
        );
        await client.query(
          `INSERT INTO limiar."RpgProfile" ("userId",revision,"updatedAt") VALUES ('u',7,now())`,
        );
        await client.query(
          `INSERT INTO limiar."RpgCharacter" (id,"userId","characterId","updatedAt") VALUES ('c','u','nara',now())`,
        );
        await client.query(
          `UPDATE limiar."RpgProfile" SET "activeCharacterId"='c'`,
        );
        await client.query(
          `INSERT INTO limiar."RpgItemInstance" (id,"userId","itemId",rarity,"equippedCharacterId","equippedSlot","updatedAt") VALUES ('i','u','blade-weathered','COMMON','c','WEAPON',now())`,
        );
        await client.query(
          `INSERT INTO limiar."Team" (id,code,"leaderId","expiresAt") VALUES ('t','ABC','u',now())`,
        );
        await client.query(
          `INSERT INTO limiar."GameSession" (id,"teamId",seed,"mapId",mode,"partySize") VALUES ('g','t','world-seed','ruins','normal',1)`,
        );
        await client.query(
          `INSERT INTO limiar."GameSessionMember" (id,"sessionId","userId",character) VALUES ('m','g','u','nara')`,
        );
        const before = (
          await client.query(`SELECT * FROM limiar."RpgItemInstance"`)
        ).rows;
        await upgrade(client);
        expect(
          (await client.query(`SELECT * FROM limiar."RpgItemInstance"`)).rows,
        ).toEqual(before);
        expect(
          (await client.query(`SELECT revision FROM limiar."RpgProfile"`))
            .rows[0].revision,
        ).toBe(7);
        expect(
          (
            await client.query(
              `SELECT "expeditionKind" FROM limiar."GameSession"`,
            )
          ).rows[0].expeditionKind,
        ).toBe("SURVIVOR");
        await expect(
          client.query(
            `INSERT INTO limiar."RpgExpeditionSession" ("sessionId","rewardSeed") VALUES ('g',repeat('a',64))`,
          ),
        ).rejects.toMatchObject({ code: "23503" });
        await client.query(`DELETE FROM limiar."User" WHERE id='u'`);
        expect(
          (
            await client.query(
              `SELECT count(*)::int n FROM limiar."RpgItemInstance"`,
            )
          ).rows[0].n,
        ).toBe(0);
        expect(
          (
            await client.query(
              `SELECT count(*)::int n FROM limiar."GameSessionMember"`,
            )
          ).rows[0].n,
        ).toBe(0);
      });
    });
  },
);
