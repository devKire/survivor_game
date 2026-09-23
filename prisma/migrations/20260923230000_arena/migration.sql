BEGIN;
CREATE TABLE "limiar"."ArenaMatch" ("id" TEXT PRIMARY KEY,"mode" TEXT NOT NULL,"status" TEXT NOT NULL DEFAULT 'RUNNING',"startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"endedAt" TIMESTAMP(3),"winner" INTEGER CHECK("winner" IN(0,1)),"result" JSONB,"events" JSONB);
CREATE TABLE "limiar"."ArenaParticipant" ("id" TEXT PRIMARY KEY,"matchId" TEXT NOT NULL REFERENCES "limiar"."ArenaMatch"("id") ON DELETE CASCADE,"userId" TEXT NOT NULL REFERENCES "limiar"."User"("id"),"team" INTEGER NOT NULL CHECK("team" IN(0,1)),"character" TEXT NOT NULL,"result" JSONB);
CREATE UNIQUE INDEX "ArenaParticipant_matchId_userId_key" ON "limiar"."ArenaParticipant"("matchId","userId");
CREATE INDEX "ArenaParticipant_userId_idx" ON "limiar"."ArenaParticipant"("userId");
CREATE TABLE "limiar"."ArenaSeat" ("userId" TEXT PRIMARY KEY REFERENCES "limiar"."User"("id") ON DELETE CASCADE,"matchId" TEXT NOT NULL REFERENCES "limiar"."ArenaMatch"("id") ON DELETE CASCADE);
COMMIT;
