BEGIN;

CREATE TABLE "limiar"."RpgProfile" (
  "userId" TEXT NOT NULL PRIMARY KEY REFERENCES "limiar"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "revision" INTEGER NOT NULL DEFAULT 1 CHECK ("revision" > 0),
  "activeCharacterId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  UNIQUE ("activeCharacterId", "userId")
);

CREATE TABLE "limiar"."RpgCharacter" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "limiar"."RpgProfile"("userId") ON DELETE CASCADE ON UPDATE CASCADE,
  "characterId" TEXT NOT NULL CHECK ("characterId" IN ('nara','orin','ivo','sena')),
  "level" INTEGER NOT NULL DEFAULT 1 CHECK ("level" BETWEEN 1 AND 100),
  "xp" INTEGER NOT NULL DEFAULT 0 CHECK ("xp" BETWEEN 0 AND 1000000000),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  UNIQUE ("userId", "characterId"),
  UNIQUE ("id", "userId")
);
CREATE INDEX "RpgCharacter_userId_level_idx" ON "limiar"."RpgCharacter"("userId", "level");

ALTER TABLE "limiar"."RpgProfile" ADD CONSTRAINT "RpgProfile_activeCharacterId_userId_fkey"
  FOREIGN KEY ("activeCharacterId", "userId") REFERENCES "limiar"."RpgCharacter"("id", "userId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "limiar"."RpgItemInstance" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "limiar"."RpgProfile"("userId") ON DELETE CASCADE ON UPDATE CASCADE,
  "itemId" TEXT NOT NULL CHECK (char_length("itemId") BETWEEN 1 AND 80),
  "rarity" TEXT NOT NULL CHECK ("rarity" IN ('COMMON','RARE','EPIC','LEGENDARY')),
  "level" INTEGER NOT NULL DEFAULT 1 CHECK ("level" BETWEEN 1 AND 100),
  "quantity" INTEGER NOT NULL DEFAULT 1 CHECK ("quantity" BETWEEN 1 AND 9999),
  "equippedCharacterId" TEXT,
  "equippedSlot" TEXT CHECK ("equippedSlot" IN ('WEAPON','ARMOR','CHARM')),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RpgItemInstance_equipped_pair" CHECK (
    ("equippedCharacterId" IS NULL AND "equippedSlot" IS NULL) OR
    ("equippedCharacterId" IS NOT NULL AND "equippedSlot" IS NOT NULL)
  ),
  FOREIGN KEY ("equippedCharacterId", "userId") REFERENCES "limiar"."RpgCharacter"("id", "userId")
    ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "RpgItemInstance_equippedCharacterId_equippedSlot_key"
  ON "limiar"."RpgItemInstance"("equippedCharacterId", "equippedSlot");
CREATE INDEX "RpgItemInstance_userId_itemId_idx" ON "limiar"."RpgItemInstance"("userId", "itemId");

CREATE TABLE "limiar"."RpgMaterialBalance" (
  "userId" TEXT NOT NULL REFERENCES "limiar"."RpgProfile"("userId") ON DELETE CASCADE ON UPDATE CASCADE,
  "materialId" TEXT NOT NULL CHECK (char_length("materialId") BETWEEN 1 AND 80),
  "amount" INTEGER NOT NULL DEFAULT 0 CHECK ("amount" BETWEEN 0 AND 1000000000),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  PRIMARY KEY ("userId", "materialId")
);

CREATE TABLE "limiar"."RpgMutationReceipt" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "limiar"."RpgProfile"("userId") ON DELETE CASCADE ON UPDATE CASCADE,
  "requestId" TEXT NOT NULL,
  "operation" TEXT NOT NULL CHECK (char_length("operation") BETWEEN 1 AND 60),
  "payloadHash" TEXT NOT NULL CHECK (char_length("payloadHash") = 64),
  "revision" INTEGER NOT NULL CHECK ("revision" > 0),
  "result" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("userId", "requestId")
);
CREATE INDEX "RpgMutationReceipt_userId_createdAt_idx" ON "limiar"."RpgMutationReceipt"("userId", "createdAt");

COMMIT;
