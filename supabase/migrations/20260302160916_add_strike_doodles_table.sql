-- Create the strike_doodles table
CREATE TABLE public.strike_doodles (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    strike_id UUID NOT NULL REFERENCES public.strikes(id) ON DELETE CASCADE,
    client_uuid UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Add a unique constraint to ensure one doodle per device per strike
ALTER TABLE public.strike_doodles
    ADD CONSTRAINT unique_doodle_per_client_per_strike UNIQUE (strike_id, client_uuid);

-- Enable RLS
ALTER TABLE public.strike_doodles ENABLE ROW LEVEL SECURITY;

-- Create policies for anonymous access
-- 1. Allow anyone to read all doodles
CREATE POLICY "Enable read access for all users" ON public.strike_doodles
    FOR SELECT
    USING (true);

-- 2. Allow anyone to insert a doodle (the unique constraint prevents duplicates from the same client)
CREATE POLICY "Enable insert access for all users" ON public.strike_doodles
    FOR INSERT
    WITH CHECK (true);

-- Adding an index on strike_id to optimize counting
CREATE INDEX idx_strike_doodles_strike_id ON public.strike_doodles(strike_id);
