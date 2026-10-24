-- A shared, server-only budget. Reserve before the paid call; uncertain failures
-- keep their reservation charged because the provider might already have billed.
create table public.ai_monthly_budget (
  month date primary key,
  charged_micro_usd bigint not null default 0 check (charged_micro_usd >= 0),
  disabled boolean not null default false
);
create table public.strike_semantic_reviews (
  input_hash text primary key check (input_hash ~ '^[a-f0-9]{64}$'),
  result jsonb,
  checked_at timestamptz,
  lease_id uuid,
  claimed_at timestamptz,
  reserved_micro_usd bigint,
  budget_month date,
  state text not null default 'new' check (state in ('new','pending','success','failed'))
);
alter table public.ai_monthly_budget enable row level security;
alter table public.strike_semantic_reviews enable row level security;
revoke all on public.ai_monthly_budget, public.strike_semantic_reviews from public, anon, authenticated;
grant select, insert, update on public.ai_monthly_budget, public.strike_semantic_reviews to service_role;

create function public.reserve_strike_semantic_review(review_hash text, reserve_micro_usd bigint)
returns table (decision text, lease uuid, cached_result jsonb)
language plpgsql security invoker set search_path = '' as $$
declare
  r public.strike_semantic_reviews%rowtype;
  b public.ai_monthly_budget%rowtype;
  m date := date_trunc('month', now() at time zone 'UTC')::date;
  token uuid := gen_random_uuid();
begin
  if review_hash !~ '^[a-f0-9]{64}$' or reserve_micro_usd not between 1 and 1000 then
    raise exception 'Invalid semantic review reservation';
  end if;
  insert into public.strike_semantic_reviews(input_hash) values(review_hash) on conflict do nothing;
  select * into r from public.strike_semantic_reviews where input_hash=review_hash for update;
  if r.checked_at > now()-interval '24 hours' then
    return query select case when r.state='success' then 'cached' else 'backoff' end, null::uuid, r.result;
    return;
  end if;
  if r.state='pending' and r.claimed_at > now()-interval '10 minutes' then
    return query select 'busy', null::uuid, null::jsonb; return;
  end if;
  insert into public.ai_monthly_budget(month) values(m) on conflict do nothing;
  select * into b from public.ai_monthly_budget where month=m for update;
  -- $0.20/month, server-enforced and not overridable by an environment variable.
  -- Leaves currency/fee headroom below CNY 3. Also caps each individual request.
  if b.disabled or b.charged_micro_usd + reserve_micro_usd > 200000 then
    return query select 'budget', null::uuid, null::jsonb; return;
  end if;
  update public.ai_monthly_budget set charged_micro_usd=charged_micro_usd+reserve_micro_usd where month=m;
  update public.strike_semantic_reviews set lease_id=token, claimed_at=now(),
    reserved_micro_usd=reserve_micro_usd,budget_month=m,state='pending' where input_hash=review_hash;
  return query select 'call',token,null::jsonb;
end $$;

create function public.finish_strike_semantic_review(review_hash text, review_lease uuid, review_result jsonb, actual_micro_usd bigint default null)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare r public.strike_semantic_reviews%rowtype;
begin
  select * into r from public.strike_semantic_reviews where input_hash=review_hash for update;
  if r.lease_id is distinct from review_lease or r.state <> 'pending' then return false; end if;
  if review_result is not null and jsonb_typeof(review_result)<>'object' then raise exception 'Review must be an object'; end if;
  if actual_micro_usd is not null and actual_micro_usd<0 then raise exception 'Invalid usage cost'; end if;
  if actual_micro_usd > r.reserved_micro_usd then
    -- Unexpected billing: preserve the actual spend and stop further calls.
    update public.ai_monthly_budget set charged_micro_usd=charged_micro_usd+actual_micro_usd-r.reserved_micro_usd, disabled=true where month=r.budget_month;
  elsif actual_micro_usd is not null then
    update public.ai_monthly_budget set charged_micro_usd=charged_micro_usd-r.reserved_micro_usd+actual_micro_usd where month=r.budget_month;
  end if;
  update public.strike_semantic_reviews set result=review_result,checked_at=now(),
    state=case when review_result is null then 'failed' else 'success' end,
    lease_id=null where input_hash=review_hash;
  return true;
end $$;
revoke all on function public.reserve_strike_semantic_review(text,bigint), public.finish_strike_semantic_review(text,uuid,jsonb,bigint) from public, anon, authenticated;
grant execute on function public.reserve_strike_semantic_review(text,bigint), public.finish_strike_semantic_review(text,uuid,jsonb,bigint) to service_role;
