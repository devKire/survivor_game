-- Additive Phase 6 narrative persistence. Historical evidence remains unchanged.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL search_path TO limiar;

-- CreateTable
CREATE TABLE "RpgQuestProgress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "questId" TEXT NOT NULL,
    "questVersion" INTEGER NOT NULL,
    "scope" TEXT NOT NULL,
    "scopeKey" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "acceptedRevision" INTEGER NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "rewardedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RpgQuestProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RpgQuestObjectiveProof" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "questProgressId" TEXT NOT NULL,
    "objectiveId" TEXT NOT NULL,
    "sourceKind" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RpgQuestObjectiveProof_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RpgQuestRewardReceipt" (
    "questProgressId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "result" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RpgQuestRewardReceipt_pkey" PRIMARY KEY ("questProgressId")
);

-- CreateTable
CREATE TABLE "RpgStoryFlag" (
    "userId" TEXT NOT NULL,
    "flagId" TEXT NOT NULL,
    "sourceProgressId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RpgStoryFlag_pkey" PRIMARY KEY ("userId","flagId")
);

-- CreateTable
CREATE TABLE "RpgNarrativeChoice" (
    "userId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "dialogueId" TEXT NOT NULL,
    "dialogueVersion" INTEGER NOT NULL,
    "nodeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RpgNarrativeChoice_pkey" PRIMARY KEY ("userId","groupId")
);

-- CreateTable
CREATE TABLE "RpgDialogueState" (
    "userId" TEXT NOT NULL,
    "npcId" TEXT NOT NULL,
    "dialogueId" TEXT NOT NULL,
    "dialogueVersion" INTEGER NOT NULL,
    "nodeId" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RpgDialogueState_pkey" PRIMARY KEY ("userId","npcId")
);

-- CreateIndex
CREATE INDEX "RpgQuestProgress_userId_status_acceptedAt_id_idx" ON "RpgQuestProgress"("userId", "status", "acceptedAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "RpgQuestProgress_userId_questId_scopeKey_key" ON "RpgQuestProgress"("userId", "questId", "scopeKey");

-- CreateIndex
CREATE UNIQUE INDEX "RpgQuestProgress_id_userId_key" ON "RpgQuestProgress"("id", "userId");

-- CreateIndex
CREATE INDEX "RpgQuestObjectiveProof_userId_createdAt_id_idx" ON "RpgQuestObjectiveProof"("userId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "RpgQuestObjectiveProof_origin_key" ON "RpgQuestObjectiveProof"("questProgressId", "objectiveId", "sourceKind", "sourceId");

-- CreateIndex
CREATE INDEX "RpgQuestRewardReceipt_userId_createdAt_questProgressId_idx" ON "RpgQuestRewardReceipt"("userId", "createdAt", "questProgressId");

-- CreateIndex
CREATE UNIQUE INDEX "RpgQuestRewardReceipt_questProgressId_userId_key" ON "RpgQuestRewardReceipt"("questProgressId", "userId");

-- CreateIndex
CREATE INDEX "RpgStoryFlag_sourceProgressId_userId_idx" ON "RpgStoryFlag"("sourceProgressId", "userId");

-- CreateIndex
CREATE INDEX "RpgExpeditionParticipant_userId_entryRevision_sessionId_idx" ON "RpgExpeditionParticipant"("userId", "entryRevision", "sessionId");

-- CreateIndex
CREATE INDEX "RpgResourceClaim_userId_revision_id_idx" ON "RpgResourceClaim"("userId", "revision", "id");

-- AddForeignKey
ALTER TABLE "RpgQuestProgress" ADD CONSTRAINT "RpgQuestProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "RpgProfile"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RpgQuestProgress" ADD CONSTRAINT "RpgQuestProgress_userId_characterId_fkey" FOREIGN KEY ("userId", "characterId") REFERENCES "RpgCharacter"("userId", "characterId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RpgQuestObjectiveProof" ADD CONSTRAINT "RpgQuestObjectiveProof_questProgressId_userId_fkey" FOREIGN KEY ("questProgressId", "userId") REFERENCES "RpgQuestProgress"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RpgQuestRewardReceipt" ADD CONSTRAINT "RpgQuestRewardReceipt_questProgressId_userId_fkey" FOREIGN KEY ("questProgressId", "userId") REFERENCES "RpgQuestProgress"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RpgStoryFlag" ADD CONSTRAINT "RpgStoryFlag_sourceProgressId_userId_fkey" FOREIGN KEY ("sourceProgressId", "userId") REFERENCES "RpgQuestProgress"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RpgNarrativeChoice" ADD CONSTRAINT "RpgNarrativeChoice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "RpgProfile"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RpgDialogueState" ADD CONSTRAINT "RpgDialogueState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "RpgProfile"("userId") ON DELETE CASCADE ON UPDATE CASCADE;


-- Ownership is enforced by compound FKs. Catalog identities are resolved in the
-- application; SQL additionally bounds all persisted identity and amount fields.
ALTER TABLE "RpgQuestProgress" ADD CONSTRAINT "RpgQuestProgress_valid" CHECK (
  length("id") BETWEEN 1 AND 100 AND length("userId") BETWEEN 1 AND 160
  AND length("questId") BETWEEN 1 AND 120 AND "questId" ~ '^[a-z0-9][a-z0-9:_-]*$'
  AND "questVersion" BETWEEN 1 AND 1000000
  AND "characterId" IN ('nara','orin','ivo','sena')
  AND (("scope"='ACCOUNT' AND "scopeKey"='ACCOUNT')
    OR ("scope"='CHARACTER' AND "scopeKey"="characterId"))
  AND "acceptedRevision" BETWEEN 1 AND 2147483646
  AND (("status"='ACTIVE' AND "completedAt" IS NULL AND "rewardedAt" IS NULL)
    OR ("status"='COMPLETED' AND "completedAt" IS NOT NULL AND "rewardedAt" IS NULL)
    OR ("status"='REWARDED' AND "completedAt" IS NOT NULL AND "rewardedAt" IS NOT NULL))
  AND ("completedAt" IS NULL OR "completedAt">="acceptedAt")
  AND ("rewardedAt" IS NULL OR "rewardedAt">="completedAt")
);
ALTER TABLE "RpgQuestObjectiveProof" ADD CONSTRAINT "RpgQuestObjectiveProof_valid" CHECK (
  length("id") BETWEEN 1 AND 100 AND length("userId") BETWEEN 1 AND 160
  AND length("questProgressId") BETWEEN 1 AND 100
  AND length("objectiveId") BETWEEN 1 AND 80 AND "objectiveId" ~ '^[a-z0-9][a-z0-9:_-]*$'
  AND "sourceKind" IN ('TALK_TO_NPC','DISCOVER_POI','GATHER_RESOURCE','COMPLETE_RPG_EXPEDITION','DEFEAT_BOSS')
  AND length("sourceId") BETWEEN 1 AND 320 AND "quantity" BETWEEN 1 AND 10000
);
ALTER TABLE "RpgQuestRewardReceipt" ADD CONSTRAINT "RpgQuestRewardReceipt_valid" CHECK (
  length("questProgressId") BETWEEN 1 AND 100 AND length("userId") BETWEEN 1 AND 160
  AND "revision" BETWEEN 1 AND 2147483647
  AND jsonb_typeof("result")='object' AND octet_length("result"::text)<=65536
);
ALTER TABLE "RpgStoryFlag" ADD CONSTRAINT "RpgStoryFlag_valid" CHECK (
  length("userId") BETWEEN 1 AND 160 AND length("sourceProgressId") BETWEEN 1 AND 100
  AND length("flagId") BETWEEN 1 AND 120 AND "flagId" ~ '^[a-z0-9][a-z0-9:_-]*$'
);
ALTER TABLE "RpgNarrativeChoice" ADD CONSTRAINT "RpgNarrativeChoice_valid" CHECK (
  length("userId") BETWEEN 1 AND 160
  AND length("groupId") BETWEEN 1 AND 120 AND "groupId" ~ '^[a-z0-9][a-z0-9:_-]*$'
  AND length("value") BETWEEN 1 AND 80 AND "value" ~ '^[A-Za-z0-9][A-Za-z0-9:_-]*$'
  AND length("dialogueId") BETWEEN 1 AND 120 AND "dialogueId" ~ '^[a-z0-9][a-z0-9:_-]*$'
  AND "dialogueVersion" BETWEEN 1 AND 1000000
  AND length("nodeId") BETWEEN 1 AND 80 AND "nodeId" ~ '^[a-z0-9][a-z0-9:_-]*$'
);
ALTER TABLE "RpgDialogueState" ADD CONSTRAINT "RpgDialogueState_valid" CHECK (
  length("userId") BETWEEN 1 AND 160
  AND length("npcId") BETWEEN 1 AND 120 AND "npcId" ~ '^[a-z0-9][a-z0-9:_-]*$'
  AND length("dialogueId") BETWEEN 1 AND 120 AND "dialogueId" ~ '^[a-z0-9][a-z0-9:_-]*$'
  AND "dialogueVersion" BETWEEN 1 AND 1000000
  AND length("nodeId") BETWEEN 1 AND 80 AND "nodeId" ~ '^[a-z0-9][a-z0-9:_-]*$'
);

-- Non-repeatable progress keeps its accepted version, scope and XP beneficiary.
-- No mutation of a proof, exclusive choice, story flag or grant receipt is allowed.
CREATE FUNCTION limiar.rpg_quest_progress_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW."status"<>'ACTIVE' THEN
      RAISE EXCEPTION 'Quest must begin active' USING ERRCODE='23514';
    END IF;
  ELSIF (to_jsonb(NEW)-'status'-'completedAt'-'rewardedAt'-'updatedAt')
      IS DISTINCT FROM (to_jsonb(OLD)-'status'-'completedAt'-'rewardedAt'-'updatedAt')
    OR NOT (NEW."status"=OLD."status"
      OR (OLD."status"='ACTIVE' AND NEW."status"='COMPLETED')
      OR (OLD."status"='COMPLETED' AND NEW."status"='REWARDED'))
    OR (OLD."completedAt" IS NOT NULL AND NEW."completedAt" IS DISTINCT FROM OLD."completedAt")
    OR (OLD."rewardedAt" IS NOT NULL AND NEW."rewardedAt" IS DISTINCT FROM OLD."rewardedAt")
  THEN RAISE EXCEPTION 'Immutable quest identity or invalid transition' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "RpgQuestProgress_immutable" BEFORE INSERT OR UPDATE ON "RpgQuestProgress"
  FOR EACH ROW EXECUTE FUNCTION limiar.rpg_quest_progress_identity();
CREATE TRIGGER "RpgQuestObjectiveProof_immutable" BEFORE UPDATE ON "RpgQuestObjectiveProof"
  FOR EACH ROW EXECUTE FUNCTION limiar.rpg_receipt_immutable();
CREATE TRIGGER "RpgQuestRewardReceipt_immutable" BEFORE UPDATE ON "RpgQuestRewardReceipt"
  FOR EACH ROW EXECUTE FUNCTION limiar.rpg_receipt_immutable();
CREATE TRIGGER "RpgStoryFlag_immutable" BEFORE UPDATE ON "RpgStoryFlag"
  FOR EACH ROW EXECUTE FUNCTION limiar.rpg_receipt_immutable();
CREATE TRIGGER "RpgNarrativeChoice_immutable" BEFORE UPDATE ON "RpgNarrativeChoice"
  FOR EACH ROW EXECUTE FUNCTION limiar.rpg_receipt_immutable();
CREATE FUNCTION limiar.rpg_dialogue_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW."userId",NEW."npcId") IS DISTINCT FROM (OLD."userId",OLD."npcId")
  THEN RAISE EXCEPTION 'Immutable dialogue owner or NPC' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "RpgDialogueState_immutable" BEFORE UPDATE ON "RpgDialogueState"
  FOR EACH ROW EXECUTE FUNCTION limiar.rpg_dialogue_identity();
COMMIT;
