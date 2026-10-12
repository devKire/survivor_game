BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL search_path TO limiar;


-- CreateTable
CREATE TABLE "RpgExplorationSession" (
    "sessionId" TEXT NOT NULL,
    "expeditionKind" TEXT NOT NULL DEFAULT 'RPG_EXPLORATION',
    "regionId" TEXT NOT NULL,
    "regionVersion" INTEGER NOT NULL,
    "generationVersion" INTEGER NOT NULL DEFAULT 1,
    "worldVersion" INTEGER NOT NULL DEFAULT 3,
    "rulesVersion" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "RpgExplorationSession_pkey" PRIMARY KEY ("sessionId")
);


-- CreateTable
CREATE TABLE "RpgExplorationParticipant" (
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "loadout" JSONB NOT NULL,
    "loadoutHash" TEXT NOT NULL,
    "activeUserId" TEXT,
    "leftAt" TIMESTAMP(3),

    CONSTRAINT "RpgExplorationParticipant_pkey" PRIMARY KEY ("sessionId","userId")
);


-- CreateTable
CREATE TABLE "RpgResourceClaim" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,
    "regionVersion" INTEGER NOT NULL,
    "nodeId" TEXT NOT NULL,
    "cycle" INTEGER NOT NULL,
    "rulesVersion" INTEGER NOT NULL DEFAULT 1,
    "requestId" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "revision" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RpgResourceClaim_pkey" PRIMARY KEY ("id")
);


-- CreateTable
CREATE TABLE "RpgDiscoveredPoi" (
    "userId" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,
    "regionVersion" INTEGER NOT NULL,
    "poiId" TEXT NOT NULL,
    "discoveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RpgDiscoveredPoi_pkey" PRIMARY KEY ("userId","regionId","regionVersion","poiId")
);


-- CreateIndex
CREATE INDEX "RpgExplorationSession_status_createdAt_idx" ON "RpgExplorationSession"("status", "createdAt");


-- CreateIndex
CREATE UNIQUE INDEX "RpgExplorationSession_sessionId_expeditionKind_key" ON "RpgExplorationSession"("sessionId", "expeditionKind");


-- CreateIndex
CREATE UNIQUE INDEX "RpgExplorationParticipant_activeUserId_key" ON "RpgExplorationParticipant"("activeUserId");


-- CreateIndex
CREATE INDEX "RpgExplorationParticipant_userId_sessionId_idx" ON "RpgExplorationParticipant"("userId", "sessionId");


-- CreateIndex
CREATE UNIQUE INDEX "RpgExplorationParticipant_sessionId_userId_characterId_key" ON "RpgExplorationParticipant"("sessionId", "userId", "characterId");


-- CreateIndex
CREATE INDEX "RpgResourceClaim_userId_cycle_idx" ON "RpgResourceClaim"("userId", "cycle");


-- CreateIndex
CREATE INDEX "RpgResourceClaim_sessionId_userId_idx" ON "RpgResourceClaim"("sessionId", "userId");


-- CreateIndex
CREATE INDEX "RpgResourceClaim_userId_createdAt_id_idx" ON "RpgResourceClaim"("userId", "createdAt", "id");


-- CreateIndex
CREATE UNIQUE INDEX "RpgResourceClaim_userId_regionId_regionVersion_nodeId_cycle_key" ON "RpgResourceClaim"("userId", "regionId", "regionVersion", "nodeId", "cycle");


-- CreateIndex
CREATE UNIQUE INDEX "RpgResourceClaim_userId_requestId_key" ON "RpgResourceClaim"("userId", "requestId");


-- CreateIndex
CREATE INDEX "RpgDiscoveredPoi_userId_discoveredAt_idx" ON "RpgDiscoveredPoi"("userId", "discoveredAt");


-- AddForeignKey
ALTER TABLE "RpgExplorationSession" ADD CONSTRAINT "RpgExplorationSession_sessionId_expeditionKind_fkey" FOREIGN KEY ("sessionId", "expeditionKind") REFERENCES "GameSession"("id", "expeditionKind") ON DELETE CASCADE ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "RpgExplorationParticipant" ADD CONSTRAINT "RpgExplorationParticipant_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "RpgExplorationSession"("sessionId") ON DELETE CASCADE ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "RpgExplorationParticipant" ADD CONSTRAINT "RpgExplorationParticipant_sessionId_userId_characterId_fkey" FOREIGN KEY ("sessionId", "userId", "characterId") REFERENCES "GameSessionMember"("sessionId", "userId", "character") ON DELETE CASCADE ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "RpgExplorationParticipant" ADD CONSTRAINT "RpgExplorationParticipant_userId_characterId_fkey" FOREIGN KEY ("userId", "characterId") REFERENCES "RpgCharacter"("userId", "characterId") ON DELETE CASCADE ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "RpgResourceClaim" ADD CONSTRAINT "RpgResourceClaim_sessionId_userId_fkey" FOREIGN KEY ("sessionId", "userId") REFERENCES "RpgExplorationParticipant"("sessionId", "userId") ON DELETE CASCADE ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "RpgDiscoveredPoi" ADD CONSTRAINT "RpgDiscoveredPoi_userId_fkey" FOREIGN KEY ("userId") REFERENCES "RpgProfile"("userId") ON DELETE CASCADE ON UPDATE CASCADE;
-- Extend activity constraints without rewriting historical rows or migrations.
ALTER TABLE limiar."Team" DROP CONSTRAINT "Team_expedition_kind";
ALTER TABLE limiar."Team" ADD CONSTRAINT "Team_expedition_kind" CHECK ("expeditionKind" IN ('SURVIVOR','RPG_EXPEDITION','RPG_EXPLORATION'));
ALTER TABLE limiar."GameSession" DROP CONSTRAINT "GameSession_expedition_kind";
ALTER TABLE limiar."GameSession" ADD CONSTRAINT "GameSession_expedition_kind" CHECK ("expeditionKind" IN ('SURVIVOR','RPG_EXPEDITION','RPG_EXPLORATION'));
ALTER TABLE limiar."RpgExplorationSession" ADD CONSTRAINT "RpgExplorationSession_valid" CHECK (
 "expeditionKind"='RPG_EXPLORATION' AND "regionId"='ruins-outskirts' AND "regionVersion"=1
 AND "generationVersion"=1 AND "worldVersion"=3 AND "rulesVersion"=1
 AND "status" IN ('RUNNING','COMPLETED','INTERRUPTED') AND (("status"='RUNNING')=("endedAt" IS NULL))
);
ALTER TABLE limiar."RpgExplorationParticipant" ADD CONSTRAINT "RpgExplorationParticipant_valid" CHECK (
 jsonb_typeof("loadout")='object' AND "loadoutHash" ~ '^[0-9a-f]{64}$'
 AND ("activeUserId" IS NULL OR "activeUserId"="userId") AND (("activeUserId" IS NULL)=("leftAt" IS NOT NULL))
);
ALTER TABLE limiar."RpgResourceClaim" ADD CONSTRAINT "RpgResourceClaim_valid" CHECK (
 "regionId"='ruins-outskirts' AND "regionVersion"=1 AND "rulesVersion"=1 AND "cycle" BETWEEN 0 AND 1000000
 AND "nodeId" ~ '^explore:v1:ruins-outskirts:-?[0-9]+:-?[0-9]+:[a-z0-9-]+:0$'
 AND "materialId" IN ('weathered-ore','ruins-fiber','obelisk-dust') AND "quantity" BETWEEN 0 AND 2
 AND "revision">0 AND "payloadHash" ~ '^[0-9a-f]{64}$' AND length("requestId")=36
);
ALTER TABLE limiar."RpgDiscoveredPoi" ADD CONSTRAINT "RpgDiscoveredPoi_valid" CHECK (
 "regionId"='ruins-outskirts' AND "regionVersion"=1
 AND "poiId" ~ '^explore:v1:ruins-outskirts:-?[0-9]+:-?[0-9]+:ruins-remnant:0$'
);
CREATE TRIGGER "RpgResourceClaim_immutable" BEFORE UPDATE ON limiar."RpgResourceClaim" FOR EACH ROW EXECUTE FUNCTION limiar.rpg_receipt_immutable();
CREATE TRIGGER "RpgDiscoveredPoi_immutable" BEFORE UPDATE ON limiar."RpgDiscoveredPoi" FOR EACH ROW EXECUTE FUNCTION limiar.rpg_receipt_immutable();
CREATE FUNCTION limiar.rpg_exploration_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (to_jsonb(NEW)-'status'-'endedAt') IS DISTINCT FROM (to_jsonb(OLD)-'status'-'endedAt')
 OR (OLD."status" <> 'RUNNING' AND NEW IS DISTINCT FROM OLD)
 THEN RAISE EXCEPTION 'Immutable exploration identity' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "RpgExplorationSession_immutable" BEFORE UPDATE ON limiar."RpgExplorationSession" FOR EACH ROW EXECUTE FUNCTION limiar.rpg_exploration_identity();
CREATE FUNCTION limiar.rpg_explorer_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (to_jsonb(NEW)-'activeUserId'-'leftAt') IS DISTINCT FROM (to_jsonb(OLD)-'activeUserId'-'leftAt')
 OR (OLD."leftAt" IS NOT NULL AND NEW IS DISTINCT FROM OLD)
 THEN RAISE EXCEPTION 'Immutable explorer identity' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "RpgExplorationParticipant_immutable" BEFORE UPDATE ON limiar."RpgExplorationParticipant" FOR EACH ROW EXECUTE FUNCTION limiar.rpg_explorer_identity();
COMMIT;
