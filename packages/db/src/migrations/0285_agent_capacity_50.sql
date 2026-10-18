ALTER TABLE "agents" DROP CONSTRAINT "agents_voice_assignment_check";--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_voice_assignment_check" CHECK (("agents"."status" = 'terminated' AND "agents"."voice_name" IS NULL) OR ("agents"."status" <> 'terminated' AND ("agents"."voice_name" IS NULL OR "agents"."voice_name" IN ('Zephyr', 'Puck', 'Charon', 'Kore', 'Fenrir', 'Leda', 'Orus', 'Aoede', 'Callirrhoe', 'Autonoe', 'Enceladus', 'Iapetus', 'Umbriel', 'Algieba', 'Despina', 'Erinome', 'Algenib', 'Rasalgethi', 'Laomedeia', 'Achernar', 'Alnilam', 'Schedar', 'Gacrux', 'Pulcherrima', 'Achird', 'Zubenelgenubi', 'Vindemiatrix', 'Sadachbia', 'Sadaltager', 'Sulafat'))));
--> statement-breakpoint
CREATE OR REPLACE FUNCTION maintain_agent_voice_assignment() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  catalog text[] := ARRAY['Zephyr', 'Puck', 'Charon', 'Kore', 'Fenrir', 'Leda', 'Orus', 'Aoede', 'Callirrhoe', 'Autonoe', 'Enceladus', 'Iapetus', 'Umbriel', 'Algieba', 'Despina', 'Erinome', 'Algenib', 'Rasalgethi', 'Laomedeia', 'Achernar', 'Alnilam', 'Schedar', 'Gacrux', 'Pulcherrima', 'Achird', 'Zubenelgenubi', 'Vindemiatrix', 'Sadachbia', 'Sadaltager', 'Sulafat'];
  chosen text;
  metadata_object jsonb;
  settings_object jsonb;
  profiles_object jsonb;
  profile_object jsonb;
  model_name text;
  allocating boolean;
BEGIN
  -- Inserts reserve under the same organization lock as application swaps.
  -- UPDATE already holds the row lock, so taking the organization lock here
  -- would invert that order and deadlock with a swap. Updates are protected by
  -- the unique/check constraints; admissions also take the advisory lock below.
  IF TG_OP = 'INSERT' THEN
    allocating := true;
    PERFORM 1 FROM companies WHERE id = NEW.company_id FOR UPDATE;
  ELSE
    allocating := OLD.status = 'terminated' OR NEW.company_id IS DISTINCT FROM OLD.company_id;
  END IF;
  IF NEW.status = 'terminated' THEN
    NEW.voice_name := NULL;
    RETURN NEW;
  END IF;
  IF allocating THEN
    -- Serialize all admissions, including direct reactivation/import paths.
    -- Ordinary profile updates do not acquire this lock or invert swap locks.
    PERFORM pg_advisory_xact_lock(hashtextextended(NEW.company_id::text, 50));
    IF (SELECT count(*) FROM agents WHERE company_id = NEW.company_id AND id <> NEW.id AND status <> 'terminated') >= 50 THEN
      RAISE EXCEPTION 'This organization has reached its limit of 50 agents.'
        USING ERRCODE = '23514', CONSTRAINT = 'agents_voice_assignment_capacity';
    END IF;
    chosen := coalesce(NEW.voice_name, NEW.metadata #>> ARRAY['voice', 'profiles', coalesce(NEW.metadata->'voice'->>'model', 'gemini-3.8-live-extended-thinking'), 'voice'], 'Kore');
    IF NOT (chosen = ANY(catalog)) OR EXISTS (SELECT 1 FROM agents WHERE company_id = NEW.company_id AND id <> NEW.id AND voice_name = chosen) THEN
      SELECT v.name INTO chosen FROM unnest(catalog) WITH ORDINALITY AS v(name, position)
      WHERE NOT EXISTS (SELECT 1 FROM agents WHERE company_id = NEW.company_id AND id <> NEW.id AND voice_name = v.name)
      ORDER BY v.position LIMIT 1;
    END IF;
    -- Exhausting unique voices does not exhaust text/runtime agent slots.
    NEW.voice_name := chosen;
  END IF;
  -- Generic config writes, stale approvals, and imports cannot replace an
  -- existing assignment by changing metadata. Preserve all other preferences.
  metadata_object := CASE WHEN jsonb_typeof(NEW.metadata) = 'object' THEN NEW.metadata ELSE '{}'::jsonb END;
  settings_object := CASE WHEN jsonb_typeof(metadata_object->'voice') = 'object' THEN metadata_object->'voice' ELSE '{}'::jsonb END;
  profiles_object := CASE WHEN jsonb_typeof(settings_object->'profiles') = 'object' THEN settings_object->'profiles' ELSE '{}'::jsonb END;
  FOREACH model_name IN ARRAY ARRAY['gemini-3.8-live-extended-thinking', 'gemini-3.8-live'] LOOP
    profile_object := CASE WHEN jsonb_typeof(profiles_object->model_name) = 'object' THEN profiles_object->model_name ELSE '{}'::jsonb END;
    profile_object := '{"thinking":"high","instructions":""}'::jsonb || profile_object || jsonb_build_object('voice', coalesce(NEW.voice_name, 'Kore'));
    profiles_object := profiles_object || jsonb_build_object(model_name, profile_object);
  END LOOP;
  settings_object := '{"enabled":false,"secretId":null,"model":"gemini-3.8-live-extended-thinking"}'::jsonb || settings_object || jsonb_build_object('profiles', profiles_object);
  IF NEW.voice_name IS NULL THEN settings_object := settings_object || '{"enabled":false}'::jsonb; END IF;
  NEW.metadata := metadata_object || jsonb_build_object('voice', settings_object);
  RETURN NEW;
END $$;

