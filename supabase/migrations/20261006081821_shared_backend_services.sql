-- Service-only calls: serialize reservations on the same monthly row used by sync.
create table public.ai_budget_reservations (
 call_key text primary key check (char_length(call_key) between 8 and 160),
 purpose text not null check (purpose = 'ask'),
 budget_month date not null references public.ai_monthly_budget(month),
 reserved_micro_usd bigint not null check (reserved_micro_usd between 1 and 2000),
 actual_micro_usd bigint check (actual_micro_usd >= 0),
 created_at timestamptz not null default now(), settled_at timestamptz
);
create index ai_budget_reservations_month on public.ai_budget_reservations(budget_month);
create function public.reserve_ai_budget(purpose text, call_key text, reserve_micro_usd bigint)
returns boolean language plpgsql security invoker set search_path='' as $$
declare m date := date_trunc('month', now() at time zone 'UTC')::date; b public.ai_monthly_budget%rowtype; added int;
begin
 if purpose is distinct from 'ask' or call_key is null or char_length(call_key) not between 8 and 160 or reserve_micro_usd is null or reserve_micro_usd not between 1 and 2000 then return false; end if;
 insert into public.ai_monthly_budget(month) values(m) on conflict do nothing;
 select * into b from public.ai_monthly_budget where month=m for update;
 if b.disabled or b.charged_micro_usd + reserve_micro_usd > 200000 then return false; end if;
 insert into public.ai_budget_reservations(call_key,purpose,budget_month,reserved_micro_usd)
 values(call_key,purpose,m,reserve_micro_usd) on conflict do nothing;
 get diagnostics added = row_count;
 if added=0 then return false; end if; -- Duplicate key never authorizes another call.
 update public.ai_monthly_budget set charged_micro_usd=charged_micro_usd+reserve_micro_usd where month=m;
 return true;
end $$;
create function public.settle_ai_budget(call_key text, actual_micro_usd bigint)
returns boolean language plpgsql security invoker set search_path='' as $$
declare r public.ai_budget_reservations%rowtype;
begin
 -- Same month-then-reservation order as reserve; no duplicate refunds or deadlock.
 select * into r from public.ai_budget_reservations where ai_budget_reservations.call_key=settle_ai_budget.call_key;
 if not found or actual_micro_usd is null or actual_micro_usd < 0 or actual_micro_usd > 1000000000 then return false; end if;
 perform 1 from public.ai_monthly_budget where month=r.budget_month for update;
 select * into r from public.ai_budget_reservations where ai_budget_reservations.call_key=settle_ai_budget.call_key for update;
 if r.settled_at is not null then return false; end if;
 update public.ai_monthly_budget set charged_micro_usd=charged_micro_usd-r.reserved_micro_usd+actual_micro_usd,
 disabled=disabled or actual_micro_usd>r.reserved_micro_usd where month=r.budget_month;
 update public.ai_budget_reservations set actual_micro_usd=settle_ai_budget.actual_micro_usd,settled_at=now()
 where ai_budget_reservations.call_key=settle_ai_budget.call_key;
 return true;
end $$;

create table public.api_rate_limits (
 bucket text not null, subject_hash text not null check (subject_hash ~ '^[a-f0-9]{64}$'),
 window_start timestamptz not null, attempts int not null check(attempts>=0),
 primary key(bucket,subject_hash)
);
create index api_rate_limits_expiry on public.api_rate_limits(window_start);
create function public.consume_api_limit(bucket text, subject_hash text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare n int; cap int; win timestamptz:=date_trunc('minute',now());
begin
 cap := case bucket when 'ask' then 8 when 'ask_feedback' then 20 when 'graffiti_write' then 30 when 'graffiti_read' then 60 else null end;
 if cap is null or subject_hash is null or subject_hash !~ '^[a-f0-9]{64}$' then return false; end if;
 insert into public.api_rate_limits as l values(bucket,subject_hash,win,1)
 on conflict on constraint api_rate_limits_pkey do update set window_start=win,
 attempts=case when l.window_start=win then least(l.attempts+1,1000) else 1 end returning attempts into n;
 delete from public.api_rate_limits where (api_rate_limits.bucket,api_rate_limits.subject_hash) in
 (select l.bucket,l.subject_hash from public.api_rate_limits l where l.window_start<now()-interval '2 days' limit 100);
 return n<=cap;
end $$;

create table public.ask_sessions (
 id uuid primary key, subject_hash text not null check(subject_hash ~ '^[a-f0-9]{64}$'),
 query_hash text not null check(query_hash ~ '^[a-f0-9]{64}$'),
 quota_day date not null, request_id uuid not null,
 state text not null check(state in ('pending','clarify','answered','released')),
 attempts int not null default 1 check(attempts between 1 and 4),
 expires_at timestamptz not null, created_at timestamptz not null default now()
);
create index ask_sessions_daily on public.ask_sessions(subject_hash,quota_day,state,expires_at);
create index ask_sessions_expiry on public.ask_sessions(expires_at);
create function public.acquire_ask_session(subject_hash text, query_hash text, request_id uuid, refine_id uuid default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare d date := (now() at time zone 'Europe/Rome')::date; r public.ask_sessions%rowtype; n int;
begin
 if subject_hash is null or subject_hash !~ '^[a-f0-9]{64}$' or query_hash is null or query_hash !~ '^[a-f0-9]{64}$' or request_id is null then return jsonb_build_object('error','invalid'); end if;
 perform pg_advisory_xact_lock(hashtextextended(subject_hash,71006));
 if refine_id is not null then
  select * into r from public.ask_sessions where id=refine_id for update;
  if not found or r.subject_hash<>subject_hash or r.query_hash<>query_hash or r.quota_day<>d or r.state<>'clarify' or r.expires_at<=now() or r.attempts>=4 then return jsonb_build_object('error','invalid_refinement'); end if;
  update public.ask_sessions set state='pending',attempts=attempts+1,request_id=acquire_ask_session.request_id,expires_at=now()+interval '90 seconds' where id=refine_id;
  return jsonb_build_object('id',refine_id);
 end if;
 select count(*) into n from public.ask_sessions s where s.subject_hash=acquire_ask_session.subject_hash and s.quota_day=d
 and (s.state='answered' or (s.state in ('pending','clarify') and s.expires_at>now()));
 if n>=12 then return jsonb_build_object('error','daily_limit'); end if;
 insert into public.ask_sessions(id,subject_hash,query_hash,quota_day,request_id,state,expires_at)
 values(request_id,subject_hash,query_hash,d,request_id,'pending',now()+interval '90 seconds');
 delete from public.ask_sessions where id in (select s.id from public.ask_sessions s where s.expires_at<now()-interval '7 days' limit 100);
 return jsonb_build_object('id',request_id);
end $$;
create function public.finish_ask_session(session_id uuid, request_id uuid, outcome text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare n int;
begin
 if outcome is null or outcome not in ('clarify','answered','released') then return false; end if;
 update public.ask_sessions set state=outcome,expires_at=case when outcome='clarify' then now()+interval '20 minutes' else now() end
 where id=session_id and ask_sessions.request_id=finish_ask_session.request_id and state='pending' and expires_at>now();
 get diagnostics n=row_count; return n=1;
end $$;

create table public.ask_feedback (
 id bigint generated always as identity primary key, created_at timestamptz not null default now(),
 rating text not null check(rating in ('good','bad')),
 reason text check(reason in ('misread','wrong','missing','irrelevant','other')),
 query text not null check(char_length(query) between 1 and 200), city text,
 answer jsonb not null default '{}' check(jsonb_typeof(answer)='object' and octet_length(answer::text)<=24000),
 trace jsonb not null default '[]' check(jsonb_typeof(trace)='array' and octet_length(trace::text)<=12000),
 client text not null default 'lab' check(client='lab')
);
create index ask_feedback_created on public.ask_feedback(created_at desc);

-- An active panel has one owner; history remembers the one-save entitlement.
create table public.lab_graffiti (
 strike_key text not null check(char_length(strike_key) between 16 and 180),
 holder text not null check(holder ~ '^[a-f0-9]{32}$'), slot int not null check(slot between 0 and 1),
 colour text not null check(colour ~ '^#[0-9A-Fa-f]{6}$'), strokes jsonb not null default '[]',
 claimed_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 saved_at timestamptz, approved boolean not null default false, active boolean not null default true,
 primary key(strike_key,holder),
 check(jsonb_typeof(strokes)='array' and octet_length(strokes::text)<=40000)
);
create unique index lab_graffiti_panel on public.lab_graffiti(strike_key,slot) where active;
create index lab_graffiti_wall on public.lab_graffiti(strike_key,claimed_at desc);
create function public.claim_graffiti_panel(wall_key text, person text, paint_colour text, panel_count int)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.lab_graffiti%rowtype; panel int;
begin
 if wall_key is null or char_length(wall_key) not between 16 and 180 or person is null or person !~ '^[a-f0-9]{32}$' or paint_colour is null or paint_colour !~ '^#[0-9A-Fa-f]{6}$' or panel_count is null or panel_count not between 1 and 2 then return jsonb_build_object('error','invalid'); end if;
 perform pg_advisory_xact_lock(hashtextextended(wall_key,61006));
 select * into r from public.lab_graffiti where strike_key=wall_key and holder=person;
 if found then return jsonb_build_object('slot',r.slot,'colour',r.colour,'done',r.saved_at is not null or not r.active); end if;
 select i into panel from generate_series(0,panel_count-1) i where not exists(select 1 from public.lab_graffiti g where g.strike_key=wall_key and g.slot=i and g.active)
 order by abs(i-(abs(hashtextextended(person,0)::numeric)%panel_count)::int),i limit 1;
 if panel is null then
  -- Do not steal a currently painting panel; claims time out after ten minutes.
  select g.slot into panel from public.lab_graffiti g where g.strike_key=wall_key and g.active and (g.saved_at is not null or g.claimed_at<now()-interval '10 minutes') order by g.claimed_at limit 1;
  if panel is null then return jsonb_build_object('error','wall_busy'); end if;
  update public.lab_graffiti set active=false where strike_key=wall_key and slot=panel and active;
 end if;
 insert into public.lab_graffiti(strike_key,holder,slot,colour) values(wall_key,person,panel,paint_colour);
 return jsonb_build_object('slot',panel,'colour',paint_colour,'done',false);
end $$;
create function public.save_graffiti_piece(wall_key text, person text, drawing jsonb)
returns text language plpgsql security invoker set search_path='' as $$
declare n int;
begin
 if drawing is null or jsonb_typeof(drawing)<>'array' or jsonb_array_length(drawing) not between 1 and 80 or octet_length(drawing::text)>40000 then return 'bad_strokes'; end if;
 perform pg_advisory_xact_lock(hashtextextended(wall_key,61006));
 update public.lab_graffiti set strokes=drawing,saved_at=now(),updated_at=now(),approved=false
 where strike_key=wall_key and holder=person and active and saved_at is null;
 get diagnostics n=row_count;
 if n=1 then return 'saved'; end if;
 return 'already_painted_or_no_claim';
end $$;

alter table public.ai_budget_reservations enable row level security;
alter table public.api_rate_limits enable row level security;
alter table public.ask_sessions enable row level security;
alter table public.ask_feedback enable row level security;
alter table public.lab_graffiti enable row level security;
revoke all on public.ai_budget_reservations,public.api_rate_limits,public.ask_sessions,public.ask_feedback,public.lab_graffiti from public,anon,authenticated;
grant select,insert,update on public.ai_budget_reservations,public.api_rate_limits,public.ask_sessions,public.ask_feedback,public.lab_graffiti to service_role;
grant delete on public.api_rate_limits,public.ask_sessions to service_role;
revoke all on sequence public.ask_feedback_id_seq from public,anon,authenticated;
grant usage,select on sequence public.ask_feedback_id_seq to service_role;
revoke all on function public.reserve_ai_budget(text,text,bigint),public.settle_ai_budget(text,bigint),public.consume_api_limit(text,text),public.acquire_ask_session(text,text,uuid,uuid),public.finish_ask_session(uuid,uuid,text),public.claim_graffiti_panel(text,text,text,int),public.save_graffiti_piece(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.reserve_ai_budget(text,text,bigint),public.settle_ai_budget(text,bigint),public.consume_api_limit(text,text),public.acquire_ask_session(text,text,uuid,uuid),public.finish_ask_session(uuid,uuid,text),public.claim_graffiti_panel(text,text,text,int),public.save_graffiti_piece(text,text,jsonb) to service_role;
