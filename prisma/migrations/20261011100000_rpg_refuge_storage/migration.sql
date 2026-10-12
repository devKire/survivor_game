BEGIN;
-- Additive: all Phase 3 instances retain identity, links, affixes and seed.
ALTER TABLE "limiar"."RpgItemInstance"
  ADD COLUMN "location" TEXT NOT NULL DEFAULT 'INVENTORY';
ALTER TABLE "limiar"."RpgItemInstance"
  ADD CONSTRAINT "RpgItemInstance_location_check" CHECK ("location" IN ('INVENTORY', 'STASH')),
  ADD CONSTRAINT "RpgItemInstance_stash_unequipped_check" CHECK (
    "location" = 'INVENTORY' OR ("equippedCharacterId" IS NULL AND "equippedSlot" IS NULL)
  );
CREATE INDEX "RpgItemInstance_userId_location_idx" ON "limiar"."RpgItemInstance" ("userId", "location");

COMMIT;
