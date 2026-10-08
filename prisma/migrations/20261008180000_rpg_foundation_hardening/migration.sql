BEGIN;
SET LOCAL lock_timeout = '5s';

-- Only RPG tables change. Existing levels determine the initial unspent budget.
ALTER TABLE "limiar"."RpgCharacter"
  ADD COLUMN "attributePoints" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "attributes" JSONB NOT NULL DEFAULT '{"vitality":0,"power":0,"agility":0,"focus":0,"will":0}';
UPDATE "limiar"."RpgCharacter" SET "attributePoints" = 5 * ("level" - 1);

-- NULL means invalid, including missing/extra keys, nulls, strings and fractions.
CREATE FUNCTION "limiar"."rpg_attribute_spent_v1"(attributes JSONB)
RETURNS INTEGER LANGUAGE plpgsql IMMUTABLE STRICT AS $$
DECLARE key TEXT; value NUMERIC; total INTEGER := 0;
BEGIN
  IF jsonb_typeof(attributes) <> 'object'
     OR NOT (attributes ?& ARRAY['vitality','power','agility','focus','will'])
     OR attributes - ARRAY['vitality','power','agility','focus','will'] <> '{}'::jsonb
  THEN RETURN NULL; END IF;
  FOREACH key IN ARRAY ARRAY['vitality','power','agility','focus','will'] LOOP
    IF jsonb_typeof(attributes->key) <> 'number' THEN RETURN NULL; END IF;
    value := (attributes->>key)::numeric;
    IF value < 0 OR value > 99 OR value <> trunc(value) THEN RETURN NULL; END IF;
    total := total + value::integer;
  END LOOP;
  RETURN total;
END;
$$;
ALTER TABLE "limiar"."RpgCharacter" ADD CONSTRAINT "RpgCharacter_attribute_budget" CHECK (
  "limiar"."rpg_attribute_spent_v1"("attributes") IS NOT NULL
  AND "attributePoints" >= 0
  AND "attributePoints" + "limiar"."rpg_attribute_spent_v1"("attributes") = 5 * ("level" - 1)
);

-- Phase 1 permitted equipped stacks. Retain every item and quantity, moving only
-- those invalid assignments back to inventory before validating the new rule.
UPDATE "limiar"."RpgItemInstance"
SET "equippedCharacterId" = NULL, "equippedSlot" = NULL
WHERE "equippedCharacterId" IS NOT NULL AND "quantity" <> 1;
ALTER TABLE "limiar"."RpgItemInstance" ADD CONSTRAINT "RpgItemInstance_single_equipped" CHECK (
  "equippedCharacterId" IS NULL OR "quantity" = 1
);
COMMIT;
