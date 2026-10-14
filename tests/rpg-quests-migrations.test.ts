import "dotenv/config";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { Client } from "pg";
import { describe, expect, it } from "vitest";
const migration = "20261013120000_rpg_phase_6";
describe.skipIf(
  process.env.RUN_DATABASE_TESTS !== "1" ||
    process.env.RUN_MIGRATION_TESTS !== "1",
)("Narrative migration in disposable databases", () => {
  it.each([false, true])(
    "upgrades empty/populated Phase 5 (%s) without changing existing data",
    async (populated) => {
      const url = new URL(process.env.DATABASE_URL!),
        name = "quests_" + randomUUID().replaceAll("-", "");
      const admin = new Client({ connectionString: url.toString() });
      await admin.connect();
      await admin.query(`CREATE DATABASE "${name}"`);
      url.pathname = "/" + name;
      const client = new Client({ connectionString: url.toString() });
      try {
        await client.connect();
        for (const dir of (await readdir("prisma/migrations"))
          .filter((d) => d < migration && /^\d/.test(d))
          .sort())
          await client.query(
            await readFile(`prisma/migrations/${dir}/migration.sql`, "utf8"),
          );
        if (populated) {
          await client.query(
            `INSERT INTO limiar."User" (id,name,email,"updatedAt") VALUES ('u','U','u@example.test',now()); INSERT INTO limiar."RpgProfile" ("userId","updatedAt") VALUES ('u',now()); INSERT INTO limiar."RpgCharacter" (id,"userId","characterId","updatedAt") VALUES ('c','u','nara',now()); UPDATE limiar."RpgProfile" SET "activeCharacterId"='c'; INSERT INTO limiar."RpgItemInstance" (id,"userId","itemId",rarity,"rollSeed",affixes,"equippedCharacterId","equippedSlot","updatedAt") VALUES ('i','u','blade-weathered','COMMON','seed','[]','c','WEAPON',now())`,
          );
        }
        if (populated) {
          await client.query(`INSERT INTO limiar."Team" (id,code,"leaderId","expiresAt") VALUES ('t','REFUGE','u',now());
            INSERT INTO limiar."GameSession" (id,"teamId",seed,"mapId",mode,"partySize","expeditionKind") VALUES ('g','t','world','ruins','normal',1,'RPG_EXPEDITION');
            INSERT INTO limiar."GameSessionMember" (id,"sessionId","userId",character) VALUES ('m','g','u','nara');
            INSERT INTO limiar."RpgExpeditionSession" ("sessionId","rewardSeed",status,terminal,"terminalHash","terminalAt","settledAt") VALUES ('g',repeat('a',64),'SETTLED','{}',repeat('b',64),now(),now());
            INSERT INTO limiar."RpgExpeditionParticipant" ("sessionId","userId","characterId","entryRevision","entryLevel",loadout,"loadoutHash",eligibility) VALUES ('g','u','nara',1,1,'{}',repeat('c',64),'DEFEAT');
            INSERT INTO limiar."RpgRewardReceipt" ("sessionId","userId","characterId","xpGranted","previousLevel","newLevel","pointsGranted",result) VALUES ('g','u','nara',0,1,1,0,'{}');`);
        }
        if (populated)
          await client.query(
            `INSERT INTO limiar."RpgCharacter" (id,"userId","characterId","updatedAt") VALUES ('c2','u','ivo',now()); INSERT INTO limiar."RpgItemInstance" (id,"userId","itemId",rarity,location,"updatedAt") VALUES ('stored','u','mantle-ash','COMMON','STASH',now()); INSERT INTO limiar."RpgMaterialBalance" ("userId","materialId",amount,"updatedAt") VALUES ('u','obelisk-dust',7,now());`,
          );
        if (populated)
          await client.query(
            `INSERT INTO limiar."RpgDiscoveredPoi" ("userId","regionId","regionVersion","poiId") VALUES ('u','ruins-outskirts',1,'explore:v1:ruins-outskirts:0:0:ruins-remnant:0');`,
          );
        const discoveries = (
          await client.query(`SELECT * FROM limiar."RpgDiscoveredPoi"`)
        ).rows;
        const history = (
          await client.query(`SELECT * FROM limiar."RpgRewardReceipt"`)
        ).rows;
        const before = (
          await client.query(`SELECT * FROM limiar."RpgItemInstance"`)
        ).rows;
        await client.query(
          await readFile(
            `prisma/migrations/${migration}/migration.sql`,
            "utf8",
          ),
        );
        expect(
          (await client.query(`SELECT * FROM limiar."RpgDiscoveredPoi"`)).rows,
        ).toEqual(discoveries);
        expect(
          (await client.query(`SELECT * FROM limiar."RpgItemInstance"`)).rows,
        ).toEqual(before);
        expect(
          (await client.query(`SELECT * FROM limiar."RpgRewardReceipt"`)).rows,
        ).toEqual(history);
        if (populated) {
          await expect(
            client.query(
              `UPDATE limiar."RpgItemInstance" SET location='STASH' WHERE id='i'`,
            ),
          ).rejects.toThrow();
          await client.query(
            `UPDATE limiar."RpgItemInstance" SET "equippedCharacterId"=NULL,"equippedSlot"=NULL,location='STASH' WHERE id='i'`,
          );
          await client.query(`DELETE FROM limiar."User" WHERE id='u'`);
          expect(
            (await client.query(`SELECT * FROM limiar."RpgItemInstance"`))
              .rowCount,
          ).toBe(0);
        }
      } finally {
        await client.end();
        await admin.query(`DROP DATABASE "${name}"`);
        await admin.end();
      }
    },
  );
});
