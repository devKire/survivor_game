-- Additive shared-world provenance. Existing claims and daily rights are preserved.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL search_path TO limiar;

-- AlterTable
ALTER TABLE "RpgResourceClaim" ADD COLUMN     "worldVisitId" TEXT,
ALTER COLUMN "sessionId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "RpgWorldVisit" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "activeUserId" TEXT,
    "authorityId" TEXT NOT NULL,
    "epoch" TEXT NOT NULL,
    "checkpointZone" TEXT NOT NULL DEFAULT 'obelisk-refuge',
    "zoneVersion" INTEGER NOT NULL DEFAULT 1,
    "entryRevision" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "RpgWorldVisit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RpgWorldRewardEvent" (
    "id" TEXT NOT NULL,
    "authorityId" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "zoneVersion" INTEGER NOT NULL DEFAULT 1,
    "privateSeed" TEXT NOT NULL,
    "proof" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settledAt" TIMESTAMP(3),

    CONSTRAINT "RpgWorldRewardEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RpgWorldRewardReceipt" (
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "cycle" INTEGER NOT NULL,
    "xpGranted" INTEGER NOT NULL,
    "revision" INTEGER NOT NULL,
    "result" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RpgWorldRewardReceipt_pkey" PRIMARY KEY ("eventId","userId")
);

-- CreateIndex
CREATE UNIQUE INDEX "RpgWorldVisit_activeUserId_key" ON "RpgWorldVisit"("activeUserId");

-- CreateIndex
CREATE INDEX "RpgWorldVisit_userId_createdAt_id_idx" ON "RpgWorldVisit"("userId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "RpgWorldVisit_id_userId_key" ON "RpgWorldVisit"("id", "userId");

-- CreateIndex
CREATE INDEX "RpgWorldRewardEvent_status_createdAt_id_idx" ON "RpgWorldRewardEvent"("status", "createdAt", "id");

-- CreateIndex
CREATE INDEX "RpgWorldRewardReceipt_userId_cycle_createdAt_idx" ON "RpgWorldRewardReceipt"("userId", "cycle", "createdAt");

-- AddForeignKey
ALTER TABLE "RpgResourceClaim" ADD CONSTRAINT "RpgResourceClaim_worldVisitId_userId_fkey" FOREIGN KEY ("worldVisitId", "userId") REFERENCES "RpgWorldVisit"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RpgWorldVisit" ADD CONSTRAINT "RpgWorldVisit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "RpgProfile"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RpgWorldVisit" ADD CONSTRAINT "RpgWorldVisit_userId_characterId_fkey" FOREIGN KEY ("userId", "characterId") REFERENCES "RpgCharacter"("userId", "characterId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RpgWorldRewardReceipt" ADD CONSTRAINT "RpgWorldRewardReceipt_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "RpgWorldRewardEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RpgWorldRewardReceipt" ADD CONSTRAINT "RpgWorldRewardReceipt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "RpgProfile"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RpgWorldRewardReceipt" ADD CONSTRAINT "RpgWorldRewardReceipt_userId_characterId_fkey" FOREIGN KEY ("userId", "characterId") REFERENCES "RpgCharacter"("userId", "characterId") ON DELETE CASCADE ON UPDATE CASCADE;


ALTER TABLE "RpgResourceClaim" ADD CONSTRAINT "RpgResourceClaim_source" CHECK (
 ("sessionId" IS NOT NULL)::int + ("worldVisitId" IS NOT NULL)::int = 1
);
ALTER TABLE "RpgWorldVisit" ADD CONSTRAINT "RpgWorldVisit_valid" CHECK (
 length("id") BETWEEN 1 AND 100 AND length("authorityId")=36 AND length("epoch")=36
 AND "characterId" IN ('nara','orin','ivo','sena') AND "entryRevision">0
 AND "checkpointZone" IN ('obelisk-refuge','ruins-outskirts') AND "zoneVersion"=1
 AND ("activeUserId" IS NULL OR "activeUserId"="userId")
 AND (("activeUserId" IS NULL)=("endedAt" IS NOT NULL))
);
ALTER TABLE "RpgWorldRewardEvent" ADD CONSTRAINT "RpgWorldRewardEvent_valid" CHECK (
 length("id") BETWEEN 1 AND 160 AND length("authorityId")=36
 AND "zoneId"='ruins-outskirts' AND "zoneVersion"=1
 AND "privateSeed" ~ '^[0-9a-f]{64}$' AND jsonb_typeof(proof)='object'
 AND octet_length(proof::text)<=16384 AND status IN ('PENDING','SETTLED')
 AND ((status='SETTLED')=("settledAt" IS NOT NULL))
);
ALTER TABLE "RpgWorldRewardReceipt" ADD CONSTRAINT "RpgWorldRewardReceipt_valid" CHECK (
 "characterId" IN ('nara','orin','ivo','sena') AND "cycle" BETWEEN 0 AND 1000000
 AND "xpGranted" BETWEEN 0 AND 3 AND revision>0
 AND jsonb_typeof(result)='object' AND octet_length(result::text)<=16384
);
CREATE FUNCTION limiar.rpg_world_visit_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (to_jsonb(NEW)-'activeUserId'-'epoch'-'checkpointZone'-'updatedAt'-'endedAt'-'characterId')
 IS DISTINCT FROM (to_jsonb(OLD)-'activeUserId'-'epoch'-'checkpointZone'-'updatedAt'-'endedAt'-'characterId')
 OR (OLD."endedAt" IS NOT NULL AND NEW IS DISTINCT FROM OLD)
 THEN RAISE EXCEPTION 'Immutable world visit identity' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "RpgWorldVisit_identity" BEFORE UPDATE ON "RpgWorldVisit" FOR EACH ROW EXECUTE FUNCTION limiar.rpg_world_visit_identity();
CREATE FUNCTION limiar.rpg_world_event_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (to_jsonb(NEW)-'status'-'settledAt') IS DISTINCT FROM (to_jsonb(OLD)-'status'-'settledAt')
 OR (OLD.status='SETTLED' AND NEW IS DISTINCT FROM OLD)
 THEN RAISE EXCEPTION 'Immutable world reward event' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "RpgWorldRewardEvent_identity" BEFORE UPDATE ON "RpgWorldRewardEvent" FOR EACH ROW EXECUTE FUNCTION limiar.rpg_world_event_identity();
CREATE TRIGGER "RpgWorldRewardReceipt_immutable" BEFORE UPDATE ON "RpgWorldRewardReceipt" FOR EACH ROW EXECUTE FUNCTION limiar.rpg_receipt_immutable();
COMMIT;
