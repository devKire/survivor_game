import "dotenv/config";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { Client } from "pg";
import { describe, expect, it } from "vitest";

const enabled =
  process.env.RUN_DATABASE_TESTS === "1" &&
  process.env.RUN_MIGRATION_TESTS === "1";
const migration = "20261009100000_rpg_equipment";
async function temporaryDatabase(run: (client: Client) => Promise<void>) {
  const configured = new URL(process.env.DATABASE_URL!);
  const name = "rpg_equipment_migration_" + randomUUID().replaceAll("-", "");
  const admin = new Client({ connectionString: configured.toString() });
  await admin.connect();
  await admin.query(`CREATE DATABASE "${name}"`);
  configured.pathname = "/" + name;
  const client = new Client({ connectionString: configured.toString() });
  try {
    await client.connect();
    await run(client);
  } finally {
    await client.end();
    await admin.query(`DROP DATABASE "${name}"`);
    await admin.end();
  }
}
async function beforeEquipment(client: Client) {
  const dirs = (await readdir("prisma/migrations", { withFileTypes: true }))
    .filter((d) => d.isDirectory() && d.name < migration)
    .map((d) => d.name)
    .sort();
  for (const dir of dirs)
    await client.query(
      await readFile(`prisma/migrations/${dir}/migration.sql`, "utf8"),
    );
}
async function upgrade(client: Client) {
  await client.query(
    await readFile(`prisma/migrations/${migration}/migration.sql`, "utf8"),
  );
}
describe.skipIf(!enabled)("Equipment migration on disposable databases", () => {
  it("applies the full history to an empty database", async () => {
    await temporaryDatabase(async (client) => {
      await beforeEquipment(client);
      await upgrade(client);
      const columns = (
        await client.query(
          `SELECT column_name FROM information_schema.columns WHERE table_schema='limiar' AND table_name='RpgItemInstance'`,
        )
      ).rows.map((r) => r.column_name);
      expect(columns).toEqual(
        expect.arrayContaining(["contentVersion", "rollSeed", "affixes"]),
      );
    });
  });
  it("preserves Phase 1.5 inventory, rolls no free affixes and retains FKs and cascades", async () => {
    await temporaryDatabase(async (client) => {
      await beforeEquipment(client);
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
      await client.query(`INSERT INTO limiar."RpgItemInstance" (id,"userId","itemId",rarity,level,quantity,"equippedCharacterId","equippedSlot","updatedAt") VALUES
        ('a','u','blade-weathered','LEGENDARY',1,1,'c','WEAPON',now()),
        ('b','u','charm-obelisk','COMMON',9,8,NULL,NULL,now())`);
      const before = (
        await client.query(`SELECT * FROM limiar."RpgItemInstance" ORDER BY id`)
      ).rows;
      await upgrade(client);
      const after = (
        await client.query(`SELECT * FROM limiar."RpgItemInstance" ORDER BY id`)
      ).rows;
      expect(after).toEqual(
        before.map((row) => ({
          ...row,
          contentVersion: 1,
          rollSeed: null,
          affixes: [],
        })),
      );
      expect(
        (await client.query(`SELECT revision FROM limiar."RpgProfile"`)).rows[0]
          .revision,
      ).toBe(7);
      for (const invalid of [
        "null",
        "{}",
        '[{"id":"force","tier":1,"value":"bad"}]',
        '[{"id":"unknown","tier":1,"value":1}]',
      ])
        await expect(
          client.query(
            `UPDATE limiar."RpgItemInstance" SET "rollSeed"='test',affixes=$1::jsonb WHERE id='a'`,
            [invalid],
          ),
        ).rejects.toMatchObject({ code: expect.stringMatching(/^(23514|22023)$/) });
      await expect(
        client.query(
          `UPDATE limiar."RpgItemInstance" SET quantity=2 WHERE id='a'`,
        ),
      ).rejects.toMatchObject({ code: "23514" });
      await client.query(`DELETE FROM limiar."User" WHERE id='u'`);
      expect(
        (
          await client.query(
            `SELECT count(*)::int AS count FROM limiar."RpgItemInstance"`,
          )
        ).rows[0].count,
      ).toBe(0);
    });
  });
});
