-- The lab's shared graffiti wall: one piece per person per strike, each in
-- its own panel of the vehicle. Written only by the server (service role);
-- no public access. Proposed by Claude (lab v16); Codex to review and apply.
create table if not exists public.lab_graffiti (
  strike_key text not null check (char_length(strike_key) <= 120),
  holder text not null check (holder ~ '^[a-f0-9]{32}$'), -- HMAC of the device id, never the id itself
  slot int not null check (slot between 0 and 31),
  colour text not null check (colour ~ '^#[0-9A-Fa-f]{6}$'),
  strokes jsonb not null default '[]'::jsonb,
  claimed_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (strike_key, holder),
  constraint lab_graffiti_strokes_size check (pg_column_size(strokes) < 24000)
);
alter table public.lab_graffiti enable row level security;
revoke all on public.lab_graffiti from anon, authenticated;
grant select, insert, update on public.lab_graffiti to service_role;
create index if not exists lab_graffiti_wall on public.lab_graffiti (strike_key, claimed_at);
