-- Create feedback table
create table if not exists public.feedback (
  id uuid default gen_random_uuid() primary key,
  content text not null,
  nickname text,
  contact_info text,
  is_read boolean default false,
  created_at timestamptz default now()
);

-- Enable RLS
alter table public.feedback enable row level security;

-- Create policy to allow anyone to insert feedback
create policy "Enable insert for all users" on public.feedback
  for insert with check (true);

-- Create policy to allow only authenticated users (admins) to select feedback
-- For now, we'll allow public select for debugging if needed, but ideally this should be restricted.
-- Given the current setup, we might want to restrict this later.
-- For simplicity in this dev phase, let's allow public read but maybe warn user.
-- Actually, let's keep it safe: public insert, only service_role (or specific admin) select.
-- But wait, the user asked "how can I see their feedback".
-- The easiest way without building a full admin UI is to look in the Supabase dashboard.
-- Or I can build a simple /admin/feedback page protected by basic auth or just hidden.
-- Let's stick to Supabase Dashboard for now as the primary viewer, as building an admin panel is out of scope unless asked.
