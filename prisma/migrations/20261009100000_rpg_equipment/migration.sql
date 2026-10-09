BEGIN;
SET LOCAL lock_timeout = '5s';

-- Existing items retain every field, including rarity, stacks and assignments.
-- A null seed identifies legacy, unrolled equipment; no random retroactive grants.
ALTER TABLE "limiar"."RpgItemInstance"
  ADD COLUMN "contentVersion" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "rollSeed" TEXT,
  ADD COLUMN "affixes" JSONB NOT NULL DEFAULT '[]';

CREATE FUNCTION "limiar"."rpg_affix_shape_v1"(value JSONB)
RETURNS BOOLEAN LANGUAGE plpgsql IMMUTABLE STRICT AS $$
DECLARE entry JSONB; seen TEXT[] := ARRAY[]::TEXT[];
BEGIN
  IF jsonb_typeof(value) <> 'array' THEN RETURN false; END IF;
  IF jsonb_array_length(value) > 3 THEN RETURN false; END IF;
  FOR entry IN SELECT * FROM jsonb_array_elements(value) LOOP
    IF jsonb_typeof(entry) <> 'object'
      OR NOT (entry ?& ARRAY['id','tier','value'])
      OR entry - ARRAY['id','tier','value'] <> '{}'::jsonb
      OR jsonb_typeof(entry->'id') <> 'string'
      OR jsonb_typeof(entry->'tier') <> 'number'
      OR jsonb_typeof(entry->'value') <> 'number'
    THEN RETURN false; END IF;
    IF NOT ((entry->>'id') = ANY(ARRAY['force','precision','haste','life','guard','renewal','reach','fortune']))
      OR (entry->>'id') = ANY(seen)
      OR (entry->>'tier')::numeric NOT IN (1,2,3)
      OR (entry->>'value')::numeric NOT BETWEEN -100 AND 100
    THEN RETURN false; END IF;
    seen := array_append(seen, entry->>'id');
  END LOOP;
  RETURN true;
END;
$$;

ALTER TABLE "limiar"."RpgItemInstance"
  ADD CONSTRAINT "RpgItemInstance_content_version" CHECK ("contentVersion" = 1),
  ADD CONSTRAINT "RpgItemInstance_affix_shape" CHECK ("limiar"."rpg_affix_shape_v1"("affixes") IS TRUE),
  ADD CONSTRAINT "RpgItemInstance_roll_seed" CHECK (
    ("rollSeed" IS NULL AND "affixes" = '[]'::jsonb)
    OR ("rollSeed" IS NOT NULL AND char_length("rollSeed") BETWEEN 1 AND 128)
  ),
  ADD CONSTRAINT "RpgItemInstance_affix_rarity" CHECK (
    jsonb_array_length("affixes") <= CASE "rarity" WHEN 'COMMON' THEN 0 WHEN 'RARE' THEN 1 WHEN 'EPIC' THEN 2 ELSE 3 END
  );
COMMIT;
