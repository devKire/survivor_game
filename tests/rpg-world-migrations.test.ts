import "dotenv/config";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { Client } from "pg";
import { describe, expect, it } from "vitest";
const migration = "20261015010000_rpg_shared_world";
describe.skipIf(
  process.env.RUN_DATABASE_TESTS !== "1" ||
    process.env.RUN_MIGRATION_TESTS !== "1",
)("Shared world upgrade", () => {
  it.each([false, true])(
    "preserves Phase 6 data and historical daily rights (%s)",
    async (populated) => {
      const url = new URL(process.env.DATABASE_URL!),
        name = "world_" + randomUUID().replaceAll("-", "");
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
        INSERT INTO limiar."User" (id,name,email,"updatedAt") VALUES ('u','U','u@example.test',now()),('v','V','v@example.test',now());
        INSERT INTO limiar."RpgProfile" ("userId","updatedAt") VALUES ('u',now()),('v',now());
        INSERT INTO limiar."RpgCharacter" (id,"userId","characterId","updatedAt") VALUES ('c','u','nara',now()),('c2','v','nara',now());
        UPDATE limiar."RpgProfile" SET "activeCharacterId"='c' WHERE "userId"='u';
        INSERT INTO limiar."RpgItemInstance" (id,"userId","itemId",rarity,"equippedCharacterId","equippedSlot","updatedAt") VALUES ('i','u','blade-weathered','COMMON','c','WEAPON',now());
        INSERT INTO limiar."RpgMaterialBalance" ("userId","materialId",amount,"updatedAt") VALUES ('u','obelisk-dust',7,now());
        INSERT INTO limiar."RpgQuestProgress" (id,"userId","questId","questVersion",scope,"scopeKey","characterId","acceptedRevision","updatedAt") VALUES ('q','u','main:refuge-introduction',1,'ACCOUNT','ACCOUNT','nara',1,now());
        INSERT INTO limiar."RpgNarrativeChoice" ("userId","groupId",value,"dialogueId","dialogueVersion","nodeId") VALUES ('u','investigation-priority','REMNANTS','refuge-guardian',1,'priority');
        INSERT INTO limiar."Team" (id,code,"leaderId","expiresAt") VALUES ('t','TEST','u',now());
        INSERT INTO limiar."GameSession" (id,"teamId",seed,"mapId",mode,"partySize","expeditionKind") VALUES ('s','t','seed','ruins','normal',1,'RPG_EXPLORATION');
        INSERT INTO limiar."GameSessionMember" (id,"sessionId","userId",character) VALUES ('m','s','u','nara');
        INSERT INTO limiar."RpgExplorationSession" ("sessionId","regionId","regionVersion") VALUES ('s','ruins-outskirts',1);
        INSERT INTO limiar."RpgExplorationParticipant" ("sessionId","userId","characterId",loadout,"loadoutHash","activeUserId") VALUES ('s','u','nara','{}',repeat('a',64),'u');
        INSERT INTO limiar."RpgResourceClaim" (id,"sessionId","userId","regionId","regionVersion","nodeId",cycle,"requestId","payloadHash","materialId",quantity,revision) VALUES ('claim','s','u','ruins-outskirts',1,'explore:v1:ruins-outskirts:0:0:mineral-vein:0',1,'00000000-0000-4000-8000-000000000001',repeat('b',64),'weathered-ore',2,1);
      `);
        const tables = [
          "RpgItemInstance",
          "RpgMaterialBalance",
          "RpgQuestProgress",
          "RpgNarrativeChoice",
          "RpgResourceClaim",
        ];
        const before = await Promise.all(
          tables.map((t) => c.query(`SELECT * FROM limiar."${t}"`)),
        );
        await c.query(
          await readFile(
            `prisma/migrations/${migration}/migration.sql`,
            "utf8",
          ),
        );
        for (let i = 0; i < tables.length; i++) {
          const rows = (await c.query(`SELECT * FROM limiar."${tables[i]}"`))
            .rows;
          if (tables[i] === "RpgResourceClaim")
            rows.forEach((r) => delete r.worldVisitId);
          expect(rows).toEqual(before[i].rows);
        }
        if (populated) {
          await c.query(
            `INSERT INTO limiar."RpgWorldVisit" (id,"userId","characterId","activeUserId","authorityId",epoch,"entryRevision","updatedAt") VALUES ('visit','u','nara','u','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002',1,now())`,
          );
          await expect(
            c.query(
              `INSERT INTO limiar."RpgResourceClaim" (id,"worldVisitId","userId","regionId","regionVersion","nodeId",cycle,"requestId","payloadHash","materialId",quantity,revision) VALUES ('duplicate','visit','u','ruins-outskirts',1,'explore:v1:ruins-outskirts:0:0:mineral-vein:0',1,'00000000-0000-4000-8000-000000000003',repeat('c',64),'weathered-ore',2,2)`,
            ),
          ).rejects.toThrow();
          await expect(
            c.query(
              `INSERT INTO limiar."RpgResourceClaim" (id,"worldVisitId","userId","regionId","regionVersion","nodeId",cycle,"requestId","payloadHash","materialId",quantity,revision) VALUES ('foreign','visit','v','ruins-outskirts',1,'explore:v1:ruins-outskirts:0:0:mineral-vein:0',1,'00000000-0000-4000-8000-000000000004',repeat('c',64),'weathered-ore',2,2)`,
            ),
          ).rejects.toThrow();
          await expect(
            c.query(
              `UPDATE limiar."RpgResourceClaim" SET quantity=1 WHERE id='claim'`,
            ),
          ).rejects.toThrow();
          await c.query(`DELETE FROM limiar."User" WHERE id='u'`);
          expect(
            (await c.query(`SELECT * FROM limiar."RpgWorldVisit"`)).rowCount,
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
