BEGIN;

-- Timing is mutable. Preserve source identity so a revision replaces its row.
ALTER TABLE public.strikes
  ADD COLUMN IF NOT EXISTS source_key text,
  ADD COLUMN IF NOT EXISTS source_url text,
  ADD COLUMN IF NOT EXISTS raw_payload jsonb,
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;

-- The legacy date/provider constraint merges different modes and cities.
ALTER TABLE public.strikes DROP CONSTRAINT IF EXISTS strikes_date_provider_key;
DROP INDEX IF EXISTS public.strikes_date_provider_key;
DROP INDEX IF EXISTS public.strikes_date_region_category_provider_display_time_key;
CREATE UNIQUE INDEX IF NOT EXISTS strikes_source_date_region_category_key
  ON public.strikes (source_key, date, region, category);
CREATE INDEX IF NOT EXISTS strikes_date_region_idx ON public.strikes (date, region);

CREATE TABLE IF NOT EXISTS public.strike_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  status text NOT NULL CHECK (status IN ('running', 'success', 'failed')),
  fetched integer,
  upserted integer,
  unknown_timing integer,
  error text
);
ALTER TABLE public.strike_sync_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.strike_sync_runs FROM anon, authenticated;
GRANT ALL ON public.strike_sync_runs TO service_role;
CREATE INDEX IF NOT EXISTS strike_sync_runs_started_idx ON public.strike_sync_runs (started_at DESC);

COMMIT;
