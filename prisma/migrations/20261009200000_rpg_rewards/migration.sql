-- Additive Phase 3 tables; existing games remain SURVIVOR.
BEGIN;
SET LOCAL search_path TO limiar;

-- DropForeignKey
ALTER TABLE "GameSessionMember" DROP CONSTRAINT "GameSessionMember_userId_fkey";

-- AlterTable
ALTER TABLE "GameSession" ADD COLUMN     "expeditionKind" TEXT NOT NULL DEFAULT 'SURVIVOR';

-- AlterTable
ALTER TABLE "Team" ADD COLUMN     "expeditionKind" TEXT NOT NULL DEFAULT 'SURVIVOR';

-- CreateTable
CREATE TABLE "RpgExpeditionSession" (
    "sessionId" TEXT NOT NULL,
    "expeditionKind" TEXT NOT NULL DEFAULT 'RPG_EXPEDITION',
    "rewardVersion" INTEGER NOT NULL DEFAULT 1,
    "profileId" TEXT NOT NULL DEFAULT 'ruins-v1',
    "rewardSeed" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "terminal" JSONB,
    "terminalHash" TEXT,
    "terminalAt" TIMESTAMP(3),
    "settledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RpgExpeditionSession_pkey" PRIMARY KEY ("sessionId")
);

-- CreateTable
CREATE TABLE "RpgExpeditionParticipant" (
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "entryRevision" INTEGER NOT NULL,
    "entryLevel" INTEGER NOT NULL,
    "loadout" JSONB NOT NULL,
    "loadoutHash" TEXT NOT NULL,
    "eligibility" TEXT NOT NULL DEFAULT 'PENDING',
    "activeUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RpgExpeditionParticipant_pkey" PRIMARY KEY ("sessionId","userId")
);

-- CreateTable
CREATE TABLE "RpgRewardReceipt" (
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "xpGranted" INTEGER NOT NULL,
    "previousLevel" INTEGER NOT NULL,
    "newLevel" INTEGER NOT NULL,
    "pointsGranted" INTEGER NOT NULL,
    "result" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RpgRewardReceipt_pkey" PRIMARY KEY ("sessionId","userId")
);

-- CreateIndex
CREATE INDEX "RpgExpeditionSession_status_createdAt_idx" ON "RpgExpeditionSession"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RpgExpeditionSession_sessionId_expeditionKind_key" ON "RpgExpeditionSession"("sessionId", "expeditionKind");

-- CreateIndex
CREATE UNIQUE INDEX "RpgExpeditionParticipant_activeUserId_key" ON "RpgExpeditionParticipant"("activeUserId");

-- CreateIndex
CREATE INDEX "RpgExpeditionParticipant_userId_createdAt_sessionId_idx" ON "RpgExpeditionParticipant"("userId", "createdAt", "sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "RpgExpeditionParticipant_sessionId_userId_characterId_key" ON "RpgExpeditionParticipant"("sessionId", "userId", "characterId");

-- CreateIndex
CREATE UNIQUE INDEX "RpgRewardReceipt_sessionId_userId_characterId_key" ON "RpgRewardReceipt"("sessionId", "userId", "characterId");

-- CreateIndex
CREATE UNIQUE INDEX "GameSession_id_expeditionKind_key" ON "GameSession"("id", "expeditionKind");

-- CreateIndex
CREATE UNIQUE INDEX "GameSessionMember_sessionId_userId_character_key" ON "GameSessionMember"("sessionId", "userId", "character");

-- AddForeignKey
ALTER TABLE "GameSessionMember" ADD CONSTRAINT "GameSessionMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RpgExpeditionSession" ADD CONSTRAINT "RpgExpeditionSession_sessionId_expeditionKind_fkey" FOREIGN KEY ("sessionId", "expeditionKind") REFERENCES "GameSession"("id", "expeditionKind") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RpgExpeditionParticipant" ADD CONSTRAINT "RpgExpeditionParticipant_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "RpgExpeditionSession"("sessionId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RpgExpeditionParticipant" ADD CONSTRAINT "RpgExpeditionParticipant_sessionId_userId_characterId_fkey" FOREIGN KEY ("sessionId", "userId", "characterId") REFERENCES "GameSessionMember"("sessionId", "userId", "character") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RpgExpeditionParticipant" ADD CONSTRAINT "RpgExpeditionParticipant_userId_characterId_fkey" FOREIGN KEY ("userId", "characterId") REFERENCES "RpgCharacter"("userId", "characterId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RpgRewardReceipt" ADD CONSTRAINT "RpgRewardReceipt_sessionId_userId_characterId_fkey" FOREIGN KEY ("sessionId", "userId", "characterId") REFERENCES "RpgExpeditionParticipant"("sessionId", "userId", "characterId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Team" ADD CONSTRAINT "Team_expedition_kind" CHECK ("expeditionKind" IN ('SURVIVOR', 'RPG_EXPEDITION'));
ALTER TABLE "GameSession" ADD CONSTRAINT "GameSession_expedition_kind" CHECK ("expeditionKind" IN ('SURVIVOR', 'RPG_EXPEDITION'));
ALTER TABLE "RpgExpeditionSession" ADD CONSTRAINT "RpgExpeditionSession_valid" CHECK (
  "expeditionKind" = 'RPG_EXPEDITION' AND "rewardVersion" = 1 AND "profileId" = 'ruins-v1'
  AND "rewardSeed" ~ '^[0-9a-f]{64}$'
  AND "status" IN ('RUNNING','TERMINAL','SETTLED','INTERRUPTED')
  AND (("status" IN ('RUNNING','INTERRUPTED') AND "terminal" IS NULL AND "terminalHash" IS NULL AND "terminalAt" IS NULL)
    OR ("status" IN ('TERMINAL','SETTLED') AND "terminal" IS NOT NULL AND jsonb_typeof("terminal") = 'object'
      AND "terminalHash" IS NOT NULL AND "terminalHash" ~ '^[0-9a-f]{64}$' AND "terminalAt" IS NOT NULL))
  AND (("status" = 'SETTLED') = ("settledAt" IS NOT NULL))
);
ALTER TABLE "RpgExpeditionParticipant" ADD CONSTRAINT "RpgExpeditionParticipant_valid" CHECK (
  "entryRevision" > 0 AND "entryLevel" BETWEEN 1 AND 100
  AND jsonb_typeof("loadout") = 'object' AND "loadoutHash" ~ '^[0-9a-f]{64}$'
  AND ("activeUserId" IS NULL OR "activeUserId" = "userId")
  AND "eligibility" IN ('PENDING','ELIGIBLE','DEFEAT','INSUFFICIENT_PARTICIPATION','INACTIVE','DISCONNECTED')
);
ALTER TABLE "RpgRewardReceipt" ADD CONSTRAINT "RpgRewardReceipt_valid" CHECK (
  "xpGranted" BETWEEN 0 AND 200 AND "previousLevel" BETWEEN 1 AND 100
  AND "newLevel" BETWEEN "previousLevel" AND 100 AND "pointsGranted" BETWEEN 0 AND 495
  AND jsonb_typeof("result") = 'object'
);

-- Audit identity and terminal results are immutable even when services regress.
CREATE FUNCTION limiar.rpg_expedition_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW."sessionId", NEW."expeditionKind", NEW."rewardVersion", NEW."profileId", NEW."rewardSeed", NEW."createdAt")
    IS DISTINCT FROM (OLD."sessionId", OLD."expeditionKind", OLD."rewardVersion", OLD."profileId", OLD."rewardSeed", OLD."createdAt")
    OR (OLD."terminal" IS NOT NULL AND (NEW."terminal", NEW."terminalHash", NEW."terminalAt") IS DISTINCT FROM (OLD."terminal", OLD."terminalHash", OLD."terminalAt"))
    OR NOT (NEW."status" = OLD."status" OR (OLD."status" = 'RUNNING' AND NEW."status" IN ('TERMINAL','INTERRUPTED')) OR (OLD."status" = 'TERMINAL' AND NEW."status" = 'SETTLED'))
    OR (OLD."settledAt" IS NOT NULL AND NEW."settledAt" IS DISTINCT FROM OLD."settledAt")
  THEN RAISE EXCEPTION 'Immutable RPG expedition' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "RpgExpeditionSession_immutable" BEFORE UPDATE ON "RpgExpeditionSession" FOR EACH ROW EXECUTE FUNCTION limiar.rpg_expedition_immutable();

CREATE FUNCTION limiar.rpg_participant_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW."sessionId", NEW."userId", NEW."characterId", NEW."entryRevision", NEW."entryLevel", NEW."loadout", NEW."loadoutHash", NEW."createdAt")
    IS DISTINCT FROM (OLD."sessionId", OLD."userId", OLD."characterId", OLD."entryRevision", OLD."entryLevel", OLD."loadout", OLD."loadoutHash", OLD."createdAt")
    OR (OLD."activeUserId" IS NULL AND NEW."activeUserId" IS NOT NULL)
    OR (OLD."eligibility" <> 'PENDING' AND NEW."eligibility" <> OLD."eligibility")
  THEN RAISE EXCEPTION 'Immutable RPG participant' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "RpgExpeditionParticipant_immutable" BEFORE UPDATE ON "RpgExpeditionParticipant" FOR EACH ROW EXECUTE FUNCTION limiar.rpg_participant_immutable();
CREATE FUNCTION limiar.rpg_receipt_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Immutable RPG receipt' USING ERRCODE = '23514';
END $$;
CREATE TRIGGER "RpgRewardReceipt_immutable" BEFORE UPDATE ON "RpgRewardReceipt" FOR EACH ROW EXECUTE FUNCTION limiar.rpg_receipt_immutable();
COMMIT;
