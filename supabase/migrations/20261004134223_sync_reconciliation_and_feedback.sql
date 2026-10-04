BEGIN;

ALTER TABLE public.strike_sync_runs ADD COLUMN IF NOT EXISTS warnings jsonb NOT NULL DEFAULT '[]';
ALTER TABLE public.strike_sync_runs ADD COLUMN IF NOT EXISTS retired integer;

-- A database transaction makes acquiring a lease atomic across function instances.
CREATE OR REPLACE FUNCTION public.begin_strike_sync()
RETURNS TABLE(id uuid, started_at timestamptz)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(107042026);
  UPDATE public.strike_sync_runs r SET status = 'failed', completed_at = now(), error = 'Sync lease expired'
    WHERE r.status = 'running' AND r.started_at < now() - interval '6 minutes';
  IF EXISTS (SELECT 1 FROM public.strike_sync_runs r WHERE r.status = 'running') THEN RETURN; END IF;
  RETURN QUERY INSERT INTO public.strike_sync_runs(status) VALUES ('running')
    RETURNING strike_sync_runs.id, strike_sync_runs.started_at;
END;
$$;

-- Only the owner of a live lease may reconcile a complete authoritative snapshot.
-- Soft retirement preserves history and doodle foreign keys. New sightings revive
-- the row on the next upsert. Cancellations remain in calendar subscriptions.
CREATE OR REPLACE FUNCTION public.finish_strike_sync(
  run_id uuid, window_start date, window_end date, fetched_count integer,
  upserted_count integer, unknown_count integer, run_warnings jsonb
) RETURNS integer
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE run_start timestamptz; retired_count integer;
BEGIN
  PERFORM pg_advisory_xact_lock(107042026);
  SELECT r.started_at INTO run_start FROM public.strike_sync_runs r
    WHERE r.id = run_id AND r.status = 'running' FOR UPDATE;
  IF run_start IS NULL OR run_start < now() - interval '6 minutes' THEN
    RAISE EXCEPTION 'Sync lease expired or superseded';
  END IF;
  IF window_end < window_start OR window_end - window_start > 100 THEN RAISE EXCEPTION 'Invalid reconciliation window'; END IF;
  UPDATE public.strikes SET status = 'STALE', updated_at = now()
    WHERE data_source = 'MIT_PRIMARY' AND date BETWEEN window_start AND window_end
      AND status IN ('CONFIRMED', 'UNCERTAIN', 'REQUIRES_DETAIL')
      AND (last_seen_at IS NULL OR last_seen_at < run_start);
  GET DIAGNOSTICS retired_count = ROW_COUNT;
  UPDATE public.strike_sync_runs SET status = 'success', completed_at = now(),
    fetched = fetched_count, upserted = upserted_count, unknown_timing = unknown_count,
    warnings = run_warnings, retired = retired_count WHERE id = run_id;
  RETURN retired_count;
END;
$$;
REVOKE ALL ON FUNCTION public.begin_strike_sync() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finish_strike_sync(uuid,date,date,integer,integer,integer,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.begin_strike_sync() TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_strike_sync(uuid,date,date,integer,integer,integer,jsonb) TO service_role;

-- Feedback only: the impact counter's schema, permissions and behavior are unchanged.
REVOKE INSERT ON public.feedback FROM anon, authenticated;
DROP POLICY IF EXISTS "Enable insert for all users" ON public.feedback;
CREATE TABLE IF NOT EXISTS public.feedback_rate_limits (
  identity_hash text PRIMARY KEY, window_start timestamptz NOT NULL, attempts integer NOT NULL
);
ALTER TABLE public.feedback_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.feedback_rate_limits FROM anon, authenticated;
GRANT ALL ON public.feedback_rate_limits TO service_role;
CREATE OR REPLACE FUNCTION public.consume_feedback_limit(identity_key text)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE hits integer;
BEGIN
  IF identity_key !~ '^[0-9a-f]{64}$' THEN RETURN false; END IF;
  INSERT INTO public.feedback_rate_limits AS l(identity_hash, window_start, attempts)
    VALUES (identity_key, now(), 1)
    ON CONFLICT (identity_hash) DO UPDATE SET
      attempts = CASE WHEN l.window_start < now() - interval '1 hour' THEN 1 ELSE LEAST(l.attempts + 1, 6) END,
      window_start = CASE WHEN l.window_start < now() - interval '1 hour' THEN now() ELSE l.window_start END
    RETURNING attempts INTO hits;
  DELETE FROM public.feedback_rate_limits WHERE window_start < now() - interval '2 days';
  RETURN hits <= 5;
END;
$$;
REVOKE ALL ON FUNCTION public.consume_feedback_limit(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_feedback_limit(text) TO service_role;
COMMIT;
