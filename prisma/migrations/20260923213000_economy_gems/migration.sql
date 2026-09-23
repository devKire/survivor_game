BEGIN;
-- Deploy with web/realtime stopped. Old binaries write legacy gold semantics.
-- UserProgress remains the single source of balance truth, not a second wallet.
CREATE TABLE "limiar"."CurrencyTransaction" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "limiar"."User"("id") ON DELETE CASCADE,
  "currency" TEXT NOT NULL CHECK ("currency" IN ('GEMS','GOLD')),
  "amount" INTEGER NOT NULL,
  "type" TEXT NOT NULL CHECK ("type" IN ('MIGRATION','GRANT','SPEND')),
  "source" TEXT NOT NULL,
  "referenceId" TEXT NOT NULL,
  "balanceAfter" INTEGER NOT NULL CHECK ("balanceAfter" BETWEEN 0 AND 1000000000),
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (("type" = 'SPEND' AND "amount" < 0) OR
         ("type" = 'GRANT' AND "amount" > 0) OR
         ("type" = 'MIGRATION' AND "amount" >= 0))
);
CREATE UNIQUE INDEX "CurrencyTransaction_userId_currency_referenceId_key"
  ON "limiar"."CurrencyTransaction"("userId", "currency", "referenceId");
CREATE INDEX "CurrencyTransaction_userId_createdAt_idx" ON "limiar"."CurrencyTransaction"("userId", "createdAt");
CREATE INDEX "CurrencyTransaction_source_createdAt_idx" ON "limiar"."CurrencyTransaction"("source", "createdAt");

-- Atomic conversion; archive deliberately untouched (migrated when opened locally).
INSERT INTO "limiar"."CurrencyTransaction"
  ("id", "userId", "currency", "amount", "type", "source", "referenceId", "balanceAfter", "metadata")
SELECT 'economy-v2:' || p."userId" || ':' || c.currency, p."userId", c.currency,
  CASE WHEN c.currency = 'GEMS' THEN COALESCE((p.data->>'gold')::integer,0) ELSE 0 END,
  'MIGRATION', 'legacy-economy', 'economy-v2',
  CASE WHEN c.currency = 'GEMS' THEN COALESCE((p.data->>'gold')::integer,0) ELSE 0 END,
  jsonb_build_object('legacyGold', COALESCE((p.data->>'gold')::integer,0), 'rule', '1 legacy gold = 1 gem; upgrades retained')
FROM "limiar"."UserProgress" p CROSS JOIN (VALUES ('GEMS'),('GOLD')) c(currency)
WHERE COALESCE((p.data->>'economyVersion')::integer,1) = 1;

UPDATE "limiar"."UserProgress" SET
  data = data || jsonb_build_object('economyVersion',2,'gems',COALESCE((data->>'gold')::integer,0),
    'gold',0,'legacyGoldConverted',COALESCE((data->>'gold')::integer,0)),
  version = version + 1, "updatedAt" = CURRENT_TIMESTAMP
WHERE COALESCE((data->>'economyVersion')::integer,1) = 1;

ALTER TABLE "limiar"."UserProgress" ADD CONSTRAINT "UserProgress_currency_bounds" CHECK (
  data ?& ARRAY['economyVersion','gems','gold'] AND data->>'economyVersion' = '2'
  AND jsonb_typeof(data->'gems') = 'number' AND jsonb_typeof(data->'gold') = 'number'
  AND (data->>'gems')::numeric BETWEEN 0 AND 1000000000
  AND (data->>'gold')::numeric BETWEEN 0 AND 1000000000
  AND (data->>'gems')::numeric = trunc((data->>'gems')::numeric)
  AND (data->>'gold')::numeric = trunc((data->>'gold')::numeric)
);

COMMIT;
