BEGIN;
CREATE TABLE "limiar"."EchoState" (
 "userId" TEXT PRIMARY KEY REFERENCES "limiar"."User"("id") ON DELETE CASCADE,
 "rare" INTEGER NOT NULL DEFAULT 0 CHECK ("rare" BETWEEN 0 AND 9),
 "epic" INTEGER NOT NULL DEFAULT 0 CHECK ("epic" BETWEEN 0 AND 49),
 "legendary" INTEGER NOT NULL DEFAULT 0 CHECK ("legendary" BETWEEN 0 AND 99),
 "fragments" INTEGER NOT NULL DEFAULT 0 CHECK ("fragments" BETWEEN 0 AND 1000000000)
);
CREATE TABLE "limiar"."EchoPurchase" (
 "id" TEXT PRIMARY KEY,"userId" TEXT NOT NULL REFERENCES "limiar"."User"("id") ON DELETE CASCADE,
 "requestId" TEXT NOT NULL,"banner" TEXT NOT NULL,"currency" TEXT NOT NULL CHECK ("currency" IN ('GEMS','GOLD')),
 "cost" INTEGER NOT NULL CHECK ("cost">0),"count" INTEGER NOT NULL CHECK ("count" IN (1,11)),
 "results" JSONB NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "EchoPurchase_userId_requestId_key" ON "limiar"."EchoPurchase"("userId","requestId");
CREATE INDEX "EchoPurchase_userId_createdAt_idx" ON "limiar"."EchoPurchase"("userId","createdAt");
CREATE TABLE "limiar"."EchoFragmentTransaction" (
 "id" TEXT PRIMARY KEY,"userId" TEXT NOT NULL REFERENCES "limiar"."User"("id") ON DELETE CASCADE,
 "amount" INTEGER NOT NULL CHECK("amount"<>0),"referenceId" TEXT NOT NULL,"source" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "EchoFragmentTransaction_userId_referenceId_key" ON "limiar"."EchoFragmentTransaction"("userId","referenceId");
COMMIT;
