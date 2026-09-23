CREATE TABLE "limiar"."UserCosmetic" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "limiar"."User"("id") ON DELETE CASCADE,
  "cosmeticId" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "UserCosmetic_userId_cosmeticId_key" ON "limiar"."UserCosmetic"("userId","cosmeticId");
