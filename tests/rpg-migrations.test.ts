import "dotenv/config";
import { randomUUID, createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { Client } from "pg";
import { describe, expect, it } from "vitest";
import { freshSave } from "../src/game/core/save";

// Requires CREATE DATABASE privileges; never resets the configured database.
const enabled =
  process.env.RUN_DATABASE_TESTS === "1" &&
  process.env.RUN_MIGRATION_TESTS === "1";
const migration = "20261008180000_rpg_foundation_hardening";
async function isolated(run: (client: Client) => Promise<void>) {
  const configured = new URL(process.env.DATABASE_URL!);
  const name = "rpg_migration_" + randomUUID().replaceAll("-", "");
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
async function phase1(client: Client) {
  const dirs = (await readdir("prisma/migrations", { withFileTypes: true }))
    .filter((d) => d.isDirectory() && d.name < migration)
    .map((d) => d.name)
    .sort();
  for (const dir of dirs)
    await client.query(
      await readFile(`prisma/migrations/${dir}/migration.sql`, "utf8"),
    );
}
const harden = async (client: Client) =>
  client.query(
    await readFile(`prisma/migrations/${migration}/migration.sql`, "utf8"),
  );

describe.skipIf(!enabled)(
  "RPG migration on disposable PostgreSQL databases",
  () => {
    it("applies the complete history to an empty database with valid zero-point defaults", async () => {
      await isolated(async (client) => {
        await phase1(client);
        await harden(client);
        await client.query(
          `INSERT INTO limiar."User" (id,name,email,"updatedAt") VALUES ('u','U','u@example.test',now())`,
        );
        await client.query(
          `INSERT INTO limiar."RpgProfile" ("userId","updatedAt") VALUES ('u',now())`,
        );
        await client.query(
          `INSERT INTO limiar."RpgCharacter" (id,"userId","characterId","updatedAt") VALUES ('c','u','nara',now())`,
        );
        const row = (
          await client.query(
            `SELECT "attributePoints",attributes FROM limiar."RpgCharacter"`,
          )
        ).rows[0];
        expect(row).toEqual({
          attributePoints: 0,
          attributes: { vitality: 0, power: 0, agility: 0, focus: 0, will: 0 },
        });
        await expect(
          client.query(`UPDATE limiar."RpgCharacter" SET "attributePoints"=1`),
        ).rejects.toMatchObject({
          code: "23514",
          constraint: "RpgCharacter_attribute_budget",
        });
      });
    });

    it("upgrades populated Phase 1 data without changing saves, currency, XP, unlocks or receipts", async () => {
      await isolated(async (client) => {
        await phase1(client);
        await client.query(
          `INSERT INTO limiar."User" (id,name,email,"updatedAt") VALUES ('u','U','u@example.test',now())`,
        );
        const save = {
          ...freshSave(),
          gold: 345,
          gems: 234,
          unlocked: ["nara", "ivo"],
        };
        await client.query(
          `INSERT INTO limiar."UserProgress" ("userId",version,data,"localArchive","updatedAt") VALUES ('u',17,$1,$2,now())`,
          [JSON.stringify(save), JSON.stringify({ local: "preserve" })],
        );
        await client.query(
          `INSERT INTO limiar."RpgProfile" ("userId",revision,"updatedAt") VALUES ('u',5,now())`,
        );
        await client.query(
          `INSERT INTO limiar."RpgCharacter" (id,"userId","characterId",level,xp,"updatedAt") VALUES ('n','u','nara',3,450,now()),('i','u','ivo',1,0,now())`,
        );
        await client.query(
          `UPDATE limiar."RpgProfile" SET "activeCharacterId"='n'`,
        );
        await client.query(`INSERT INTO limiar."RpgItemInstance" (id,"userId","itemId",rarity,quantity,"equippedCharacterId","equippedSlot","updatedAt") VALUES
        ('stack','u','blade-weathered','COMMON',3,'n','WEAPON',now()),
        ('armor','u','mantle-ash','COMMON',1,'n','ARMOR',now()),
        ('inventory','u','charm-obelisk','RARE',2,NULL,NULL,now())`);
        await client.query(
          `INSERT INTO limiar."RpgMaterialBalance" ("userId","materialId",amount,"updatedAt") VALUES ('u','obelisk-dust',13,now())`,
        );
        const requestId = randomUUID();
        const payload = { requestId, expectedRevision: 4, characterId: "nara" };
        await client.query(
          `INSERT INTO limiar."RpgMutationReceipt" (id,"userId","requestId",operation,"payloadHash",revision,result) VALUES ('r','u',$1,'select-character',$2,5,$3)`,
          [
            requestId,
            createHash("sha256").update(JSON.stringify(payload)).digest("hex"),
            JSON.stringify({ revision: 5, characterId: "nara" }),
          ],
        );
        const before = new Map<string, unknown[]>();
        for (const table of [
          "UserProgress",
          "RpgProfile",
          "RpgCharacter",
          "RpgItemInstance",
          "RpgMaterialBalance",
          "RpgMutationReceipt",
        ])
          before.set(
            table,
            (await client.query(`SELECT * FROM limiar."${table}" ORDER BY 1`))
              .rows,
          );
        await harden(client);
        for (const table of [
          "UserProgress",
          "RpgProfile",
          "RpgMaterialBalance",
          "RpgMutationReceipt",
        ])
          expect(
            (await client.query(`SELECT * FROM limiar."${table}" ORDER BY 1`))
              .rows,
          ).toEqual(before.get(table));
        const chars = (
          await client.query(`SELECT * FROM limiar."RpgCharacter" ORDER BY 1`)
        ).rows;
        expect(
          chars.map(({ attributePoints, attributes, ...c }) => {
            expect(attributePoints).toBe(5 * (c.level - 1));
            expect(Object.values(attributes)).toEqual([0, 0, 0, 0, 0]);
            return c;
          }),
        ).toEqual(before.get("RpgCharacter"));
        const items = (
          await client.query(
            `SELECT * FROM limiar."RpgItemInstance" ORDER BY 1`,
          )
        ).rows;
        expect(items).toEqual(
          (before.get("RpgItemInstance") as typeof items).map((item) =>
            item.id === "stack"
              ? { ...item, equippedCharacterId: null, equippedSlot: null }
              : item,
          ),
        );
        await expect(
          client.query(
            `UPDATE limiar."RpgItemInstance" SET "equippedCharacterId"='n',"equippedSlot"='WEAPON' WHERE id='stack'`,
          ),
        ).rejects.toMatchObject({
          code: "23514",
          constraint: "RpgItemInstance_single_equipped",
        });
        // Full deletion works with the unchanged composite RESTRICT FKs.
        await client.query(`DELETE FROM limiar."User" WHERE id='u'`);
        for (const table of [
          "RpgProfile",
          "RpgCharacter",
          "RpgItemInstance",
          "RpgMaterialBalance",
          "RpgMutationReceipt",
        ])
          expect(
            (
              await client.query(
                `SELECT count(*)::int AS count FROM limiar."${table}"`,
              )
            ).rows[0].count,
          ).toBe(0);
      });
    });
  },
);
