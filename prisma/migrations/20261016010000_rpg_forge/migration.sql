BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL search_path TO limiar;
CREATE TABLE "RpgCommerceRecord" (
  "userId" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "characterId" TEXT NOT NULL,
  operation TEXT NOT NULL,
  "catalogVersion" INTEGER NOT NULL DEFAULT 1,
  cycle INTEGER NOT NULL,
  "instanceId" TEXT,
  "rareCreated" INTEGER NOT NULL DEFAULT 0,
  "goldGranted" INTEGER NOT NULL DEFAULT 0,
  result JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RpgCommerceRecord_pkey" PRIMARY KEY ("userId", "requestId"),
  CONSTRAINT "RpgCommerceRecord_receipt_fkey" FOREIGN KEY ("userId", "requestId") REFERENCES "RpgMutationReceipt"("userId", "requestId") ON DELETE CASCADE,
  CONSTRAINT "RpgCommerceRecord_character_fkey" FOREIGN KEY ("userId", "characterId") REFERENCES "RpgCharacter"("userId", "characterId") ON DELETE CASCADE,
  CONSTRAINT "RpgCommerceRecord_valid" CHECK (
    "requestId" ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND "characterId" IN ('nara','orin','ivo','sena')
    AND operation IN ('CRAFT_ITEM','REFINE_MATERIAL','UPGRADE_ITEM','REFORGE_ITEM','BUY_FROM_VENDOR','SELL_TO_VENDOR')
    AND "catalogVersion"=1 AND cycle BETWEEN 0 AND 1000000
    AND "rareCreated" BETWEEN 0 AND 1 AND "goldGranted" BETWEEN 0 AND 3
    AND ("instanceId" IS NULL OR length("instanceId") BETWEEN 1 AND 100)
    AND jsonb_typeof(result)='object' AND octet_length(result::text)<=16384
    AND result ?& ARRAY['operation','requestId','characterId','version','revision','at','sourceId','costs','gains','before','item']
    AND result->>'operation'=operation AND result->>'requestId'="requestId"
    AND result->>'characterId'="characterId" AND result->>'version'='1'
  )
);
CREATE INDEX "RpgCommerceRecord_userId_cycle_operation_idx" ON "RpgCommerceRecord"("userId",cycle,operation);
CREATE INDEX "RpgCommerceRecord_userId_createdAt_requestId_idx" ON "RpgCommerceRecord"("userId","createdAt","requestId");
CREATE INDEX "RpgCommerceRecord_userId_instanceId_createdAt_idx" ON "RpgCommerceRecord"("userId","instanceId","createdAt");
CREATE FUNCTION limiar.rpg_commerce_receipt_check() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM limiar."RpgMutationReceipt" r WHERE r."userId"=NEW."userId" AND r."requestId"=NEW."requestId" AND r.operation=NEW.operation AND r.result=NEW.result)
 THEN RAISE EXCEPTION 'Commerce receipt mismatch' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "RpgCommerceRecord_receipt" BEFORE INSERT ON "RpgCommerceRecord" FOR EACH ROW EXECUTE FUNCTION limiar.rpg_commerce_receipt_check();
CREATE TRIGGER "RpgCommerceRecord_immutable" BEFORE UPDATE ON "RpgCommerceRecord" FOR EACH ROW EXECUTE FUNCTION limiar.rpg_receipt_immutable();
CREATE TRIGGER "RpgMutationReceipt_immutable" BEFORE UPDATE ON "RpgMutationReceipt" FOR EACH ROW EXECUTE FUNCTION limiar.rpg_receipt_immutable();

-- Widen checkpoint metadata for shared Refuge v2; existing v1 data is untouched.
CREATE OR REPLACE FUNCTION limiar.rpg_world_visit_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (to_jsonb(NEW)-'activeUserId'-'epoch'-'checkpointZone'-'zoneVersion'-'updatedAt'-'endedAt')
 IS DISTINCT FROM (to_jsonb(OLD)-'activeUserId'-'epoch'-'checkpointZone'-'zoneVersion'-'updatedAt'-'endedAt')
 OR (OLD."endedAt" IS NOT NULL AND NEW IS DISTINCT FROM OLD)
 THEN RAISE EXCEPTION 'Immutable world visit identity' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
ALTER TABLE "RpgWorldVisit" DROP CONSTRAINT "RpgWorldVisit_valid";
ALTER TABLE "RpgWorldVisit" ADD CONSTRAINT "RpgWorldVisit_valid" CHECK (
 length(id) BETWEEN 1 AND 100 AND length("authorityId")=36 AND length(epoch)=36
 AND "characterId" IN ('nara','orin','ivo','sena') AND "entryRevision">0
 AND "checkpointZone" IN ('obelisk-refuge','ruins-outskirts') AND "zoneVersion" IN (1,2)
 AND ("checkpointZone"='obelisk-refuge' OR "zoneVersion"=1)
 AND ("activeUserId" IS NULL OR "activeUserId"="userId")
 AND (("activeUserId" IS NULL)=("endedAt" IS NOT NULL))
);
COMMIT;
