ALTER TABLE public.strike_doodles
  ADD COLUMN IF NOT EXISTS group_key TEXT;

UPDATE public.strike_doodles AS d
SET group_key = CONCAT_WS(
  '|',
  s.date::text,
  COALESCE(s.region, 'MILANO'),
  s.category,
  CASE WHEN s.category = 'AIRPORT' THEN COALESCE(s.display_time, '') ELSE '' END
)
FROM public.strikes AS s
WHERE d.strike_id = s.id
  AND (d.group_key IS NULL OR d.group_key = '');

ALTER TABLE public.strike_doodles
  DROP CONSTRAINT IF EXISTS strike_doodles_strike_id_fkey;

ALTER TABLE public.strike_doodles
  ALTER COLUMN strike_id DROP NOT NULL;

ALTER TABLE public.strike_doodles
  DROP CONSTRAINT IF EXISTS unique_doodle_per_client_per_strike;

CREATE UNIQUE INDEX IF NOT EXISTS strike_doodles_group_key_client_uuid_key
  ON public.strike_doodles (group_key, client_uuid)
  WHERE group_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_strike_doodles_group_key
  ON public.strike_doodles (group_key);
