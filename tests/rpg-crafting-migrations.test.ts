import "dotenv/config";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { Client } from "pg";
import { describe, it, expect } from "vitest";
const migration = "20261016010000_rpg_forge";
describe.skipIf(
  process.env.RUN_DATABASE_TESTS !== "1" ||
    process.env.RUN_MIGRATION_TESTS !== "1",
)("Forge additive migration", () => {
  it.each([false, true])(
    "upgrades empty and populated Phase 6.5 databases without changing historical records (%s)",
    async (populated) => {
      const url = new URL(process.env.DATABASE_URL!),
        name = "forge_upgrade_" + randomUUID().replaceAll("-", "");
      const admin = new Client({ connectionString: url.toString() });
      await admin.connect();
      await admin.query(`CREATE DATABASE "${name}"`);
      url.pathname = "/" + name;
      const c = new Client({ connectionString: url.toString() });
      try {
        await c.connect();
        for (const d of (await readdir("prisma/migrations"))
          .filter((d) => /^\d/.test(d) && d < migration)
          .sort())
          await c.query(
            await readFile(`prisma/migrations/${d}/migration.sql`, "utf8"),
          );
        if (populated)
          await c.query(`
        INSERT INTO limiar."User" (id,name,email,"updatedAt") VALUES ('u','QA','u@example.test',now());
        INSERT INTO limiar."RpgProfile" ("userId","updatedAt") VALUES ('u',now());
        INSERT INTO limiar."RpgCharacter" (id,"userId","characterId","updatedAt") VALUES ('nara','u','nara',now());
        UPDATE limiar."RpgProfile" SET "activeCharacterId"='nara' WHERE "userId"='u';
        INSERT INTO limiar."RpgItemInstance" (id,"userId","itemId",rarity,location,"updatedAt") VALUES ('historic','u','blade-weathered','COMMON','STASH',now());
        INSERT INTO limiar."RpgMaterialBalance" ("userId","materialId",amount,"updatedAt") VALUES ('u','weathered-ore',7,now());
        INSERT INTO limiar."RpgMutationReceipt" (id,"userId","requestId",operation,"payloadHash",revision,result) VALUES ('receipt','u','00000000-0000-4000-8000-000000000001','select-character',repeat('a',64),1,'{"revision":1,"characterId":"nara"}');
        INSERT INTO limiar."RpgWorldVisit" (id,"userId","characterId","activeUserId","authorityId",epoch,"entryRevision","updatedAt") VALUES ('visit','u','nara','u','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000003',1,now());
      `);
        const tables = [
          "RpgProfile",
          "RpgCharacter",
          "RpgItemInstance",
          "RpgMaterialBalance",
          "RpgMutationReceipt",
          "RpgWorldVisit",
        ];
        const before = [];
        for (const table of tables)
          before.push((await c.query(`SELECT * FROM limiar."${table}"`)).rows);
        await c.query(
          await readFile(
            `prisma/migrations/${migration}/migration.sql`,
            "utf8",
          ),
        );
        for (const [i, table] of tables.entries())
          expect(
            (await c.query(`SELECT * FROM limiar."${table}"`)).rows,
          ).toEqual(before[i]);
        expect(
          (await c.query('SELECT * FROM limiar."RpgCommerceRecord"')).rowCount,
        ).toBe(0);
        if (populated) {
          await c.query(
            `UPDATE limiar."RpgWorldVisit" SET "zoneVersion"=2 WHERE id='visit'`,
          );
          await c.query(
            `UPDATE limiar."RpgWorldVisit" SET "zoneVersion"=1,"checkpointZone"='ruins-outskirts' WHERE id='visit'`,
          );
          await expect(
            c.query(
              `UPDATE limiar."RpgWorldVisit" SET "zoneVersion"=2 WHERE id='visit'`,
            ),
          ).rejects.toThrow();
          await expect(
            c.query(
              `UPDATE limiar."RpgMutationReceipt" SET revision=2 WHERE id='receipt'`,
            ),
          ).rejects.toThrow(/Immutable/);
          await expect(
            c.query(
              `INSERT INTO limiar."RpgCommerceRecord" ("userId","requestId","characterId",operation,cycle,result) VALUES ('u','00000000-0000-4000-8000-000000000001','nara','CRAFT_ITEM',1,'{}')`,
            ),
          ).rejects.toThrow();
          const result = {
            version: 1,
            requestId: "00000000-0000-4000-8000-000000000004",
            operation: "REFINE_MATERIAL",
            revision: 2,
            characterId: "nara",
            at: new Date().toISOString(),
            sourceId: "refine:residual-dust",
            costs: { gold: 0, materials: [] },
            gains: {
              gold: 0,
              materials: [{ materialId: "obelisk-dust", amount: 1 }],
            },
            before: null,
            item: null,
          };
          await c.query(
            `INSERT INTO limiar."RpgMutationReceipt" (id,"userId","requestId",operation,"payloadHash",revision,result) VALUES ('new','u',$1,'REFINE_MATERIAL',repeat('b',64),2,$2)`,
            [result.requestId, result],
          );
          await c.query(
            `INSERT INTO limiar."RpgCommerceRecord" ("userId","requestId","characterId",operation,cycle,result) VALUES ('u',$1,'nara','REFINE_MATERIAL',1,$2)`,
            [result.requestId, result],
          );
          await expect(
            c.query(`UPDATE limiar."RpgCommerceRecord" SET cycle=2`),
          ).rejects.toThrow(/Immutable/);
          await c.query(`DELETE FROM limiar."User" WHERE id='u'`);
          expect(
            (await c.query('SELECT * FROM limiar."RpgCommerceRecord"'))
              .rowCount,
          ).toBe(0);
        }
      } finally {
        await c.end();
        await admin.query(`DROP DATABASE "${name}"`);
        await admin.end();
      }
    },
  );
});
