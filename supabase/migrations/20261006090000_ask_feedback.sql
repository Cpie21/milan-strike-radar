-- Ask answer ratings (good/bad) kept as an evaluation set.
-- Written only by the server with the service role; no public access.
-- Proposed by Claude (lab v12); Codex to review and apply.
create table if not exists public.ask_feedback (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  rating text not null check (rating in ('good', 'bad')),
  reason text check (reason in ('misread', 'wrong', 'missing', 'irrelevant', 'other')),
  query text not null check (char_length(query) <= 200),
  city text,
  answer jsonb not null default '{}'::jsonb,
  trace jsonb not null default '[]'::jsonb,
  client text not null default 'lab',
  constraint ask_feedback_answer_size check (pg_column_size(answer) < 32000),
  constraint ask_feedback_trace_size check (pg_column_size(trace) < 16000)
);
alter table public.ask_feedback enable row level security;
revoke all on public.ask_feedback from anon, authenticated;
grant insert, select on public.ask_feedback to service_role;
create index if not exists ask_feedback_created_at on public.ask_feedback (created_at desc);
