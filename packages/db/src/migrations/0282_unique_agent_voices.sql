ALTER TABLE agents ADD COLUMN voice_name text;
--> statement-breakpoint
-- Reserve all distinct existing choices before filling unassigned/duplicate
-- slots. Earlier explicit preferences win ties; missing profiles used Kore.
DO $$
DECLARE
  catalog text[] := ARRAY['Zephyr', 'Puck', 'Charon', 'Kore', 'Fenrir', 'Leda', 'Orus', 'Aoede', 'Callirrhoe', 'Autonoe', 'Enceladus', 'Iapetus', 'Umbriel', 'Algieba', 'Despina', 'Erinome', 'Algenib', 'Rasalgethi', 'Laomedeia', 'Achernar', 'Alnilam', 'Schedar', 'Gacrux', 'Pulcherrima', 'Achird', 'Zubenelgenubi', 'Vindemiatrix', 'Sadachbia', 'Sadaltager', 'Sulafat'];
  organization record;
  member record;
  chosen text;
BEGIN
  FOR organization IN SELECT id FROM companies ORDER BY id LOOP
    IF (SELECT count(*) FROM agents WHERE company_id = organization.id AND status <> 'terminated') > array_length(catalog, 1) THEN
      RAISE EXCEPTION 'Organization % exceeds the available unique agent voices; reduce its nonterminated agents before migrating', organization.id;
    END IF;
    FOR member IN
      SELECT id, coalesce(metadata #>> ARRAY['voice', 'profiles', coalesce(metadata->'voice'->>'model', 'gemini-3.8-live-extended-thinking'), 'voice'], 'Kore') AS preferred
      FROM agents WHERE company_id = organization.id AND status <> 'terminated'
      ORDER BY CASE WHEN (metadata #>> ARRAY['voice', 'profiles', coalesce(metadata->'voice'->>'model', 'gemini-3.8-live-extended-thinking'), 'voice']) = ANY(catalog) THEN 0 ELSE 1 END, created_at, id
    LOOP
      chosen := CASE WHEN member.preferred = ANY(catalog) THEN member.preferred ELSE 'Kore' END;
      IF NOT EXISTS (SELECT 1 FROM agents WHERE company_id = organization.id AND voice_name = chosen) THEN
        UPDATE agents SET voice_name = chosen WHERE id = member.id;
      END IF;
    END LOOP;
    FOR member IN SELECT id FROM agents WHERE company_id = organization.id AND status <> 'terminated' AND voice_name IS NULL ORDER BY created_at, id LOOP
      SELECT v.name INTO chosen FROM unnest(catalog) WITH ORDINALITY AS v(name, position)
      WHERE NOT EXISTS (SELECT 1 FROM agents WHERE company_id = organization.id AND voice_name = v.name)
      ORDER BY v.position LIMIT 1;
      UPDATE agents SET voice_name = chosen WHERE id = member.id;
    END LOOP;
  END LOOP;
END $$;
--> statement-breakpoint
ALTER TABLE agents ADD CONSTRAINT agents_company_voice_uq UNIQUE (company_id, voice_name) DEFERRABLE INITIALLY IMMEDIATE;
--> statement-breakpoint
ALTER TABLE agents ADD CONSTRAINT agents_voice_assignment_check CHECK (
  (status = 'terminated' AND voice_name IS NULL) OR
  (status <> 'terminated' AND voice_name IS NOT NULL AND voice_name IN ('Zephyr', 'Puck', 'Charon', 'Kore', 'Fenrir', 'Leda', 'Orus', 'Aoede', 'Callirrhoe', 'Autonoe', 'Enceladus', 'Iapetus', 'Umbriel', 'Algieba', 'Despina', 'Erinome', 'Algenib', 'Rasalgethi', 'Laomedeia', 'Achernar', 'Alnilam', 'Schedar', 'Gacrux', 'Pulcherrima', 'Achird', 'Zubenelgenubi', 'Vindemiatrix', 'Sadachbia', 'Sadaltager', 'Sulafat'))
);
--> statement-breakpoint
CREATE FUNCTION maintain_agent_voice_assignment() RETURNS trigger LANGUAGE plpgsql AS $$
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
  -- the unique/check constraints; a concurrent direct reactivation may retry.
  IF TG_OP = 'INSERT' THEN
    allocating := true;
    PERFORM 1 FROM companies WHERE id = NEW.company_id FOR UPDATE;
  ELSE
    allocating := OLD.status = 'terminated' OR NEW.company_id IS DISTINCT FROM OLD.company_id OR NEW.voice_name IS NULL;
  END IF;
  IF NEW.status = 'terminated' THEN
    NEW.voice_name := NULL;
    RETURN NEW;
  END IF;
  IF allocating THEN
    chosen := coalesce(NEW.voice_name, NEW.metadata #>> ARRAY['voice', 'profiles', coalesce(NEW.metadata->'voice'->>'model', 'gemini-3.8-live-extended-thinking'), 'voice'], 'Kore');
    IF NOT (chosen = ANY(catalog)) OR EXISTS (SELECT 1 FROM agents WHERE company_id = NEW.company_id AND id <> NEW.id AND voice_name = chosen) THEN
      SELECT v.name INTO chosen FROM unnest(catalog) WITH ORDINALITY AS v(name, position)
      WHERE NOT EXISTS (SELECT 1 FROM agents WHERE company_id = NEW.company_id AND id <> NEW.id AND voice_name = v.name)
      ORDER BY v.position LIMIT 1;
    END IF;
    IF chosen IS NULL THEN
      RAISE EXCEPTION 'This organization has reached its limit of % agents, matching the available voices.', array_length(catalog, 1)
        USING ERRCODE = '23514', CONSTRAINT = 'agents_voice_assignment_capacity';
    END IF;
    NEW.voice_name := chosen;
  END IF;
  -- Generic config writes, stale approvals, and imports cannot replace an
  -- existing assignment by changing metadata. Preserve all other preferences.
  metadata_object := CASE WHEN jsonb_typeof(NEW.metadata) = 'object' THEN NEW.metadata ELSE '{}'::jsonb END;
  settings_object := CASE WHEN jsonb_typeof(metadata_object->'voice') = 'object' THEN metadata_object->'voice' ELSE '{}'::jsonb END;
  profiles_object := CASE WHEN jsonb_typeof(settings_object->'profiles') = 'object' THEN settings_object->'profiles' ELSE '{}'::jsonb END;
  FOREACH model_name IN ARRAY ARRAY['gemini-3.8-live-extended-thinking', 'gemini-3.8-live'] LOOP
    profile_object := CASE WHEN jsonb_typeof(profiles_object->model_name) = 'object' THEN profiles_object->model_name ELSE '{}'::jsonb END;
    profile_object := '{"thinking":"high","instructions":""}'::jsonb || profile_object || jsonb_build_object('voice', NEW.voice_name);
    profiles_object := profiles_object || jsonb_build_object(model_name, profile_object);
  END LOOP;
  settings_object := '{"enabled":false,"secretId":null,"model":"gemini-3.8-live-extended-thinking"}'::jsonb || settings_object || jsonb_build_object('profiles', profiles_object);
  NEW.metadata := metadata_object || jsonb_build_object('voice', settings_object);
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER agents_voice_assignment_trigger BEFORE INSERT OR UPDATE ON agents
FOR EACH ROW EXECUTE FUNCTION maintain_agent_voice_assignment();
--> statement-breakpoint
-- Backfill canonical voices into both existing profiles, preserving preferences.
UPDATE agents SET metadata = metadata WHERE status <> 'terminated';
