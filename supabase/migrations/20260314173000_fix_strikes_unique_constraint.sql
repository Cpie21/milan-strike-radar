ALTER TABLE public.strikes
  DROP CONSTRAINT IF EXISTS strikes_date_provider_key;

CREATE UNIQUE INDEX IF NOT EXISTS strikes_date_region_category_provider_display_time_key
  ON public.strikes (date, region, category, provider, display_time);
