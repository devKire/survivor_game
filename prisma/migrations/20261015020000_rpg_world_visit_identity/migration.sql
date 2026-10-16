BEGIN;
-- A character switch opens another visit. Existing claim provenance must remain immutable.
CREATE OR REPLACE FUNCTION limiar.rpg_world_visit_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (to_jsonb(NEW)-'activeUserId'-'epoch'-'checkpointZone'-'updatedAt'-'endedAt')
 IS DISTINCT FROM (to_jsonb(OLD)-'activeUserId'-'epoch'-'checkpointZone'-'updatedAt'-'endedAt')
 OR (OLD."endedAt" IS NOT NULL AND NEW IS DISTINCT FROM OLD)
 THEN RAISE EXCEPTION 'Immutable world visit identity' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
COMMIT;
