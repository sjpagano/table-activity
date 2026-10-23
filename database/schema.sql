-- Run once in the project's SQL Editor. No passwords or service keys are used.
begin;
create or replace function public.valid_activity_grid(r jsonb,t jsonb,g jsonb)
returns boolean language plpgsql immutable set search_path=public as $$
declare a jsonb; b jsonb;
begin
  if jsonb_typeof(r)<>'array' or jsonb_typeof(t)<>'array' or jsonb_typeof(g)<>'array' then return false; end if;
  if jsonb_array_length(r) not between 1 and 40 or jsonb_array_length(t) not between 1 and 72 or jsonb_array_length(g)<>jsonb_array_length(r) then return false; end if;
  for a in select value from jsonb_array_elements(r) loop
    if jsonb_typeof(a)<>'string' or length(a#>>'{}') not between 1 and 40 then return false; end if;
  end loop;
  if (select count(distinct value) from jsonb_array_elements(r))<>jsonb_array_length(r) then return false; end if;
  for a in select value from jsonb_array_elements(t) loop
    if jsonb_typeof(a)<>'string' or length(a#>>'{}') not between 1 and 20 then return false; end if;
  end loop;
  if (select count(distinct value) from jsonb_array_elements(t))<>jsonb_array_length(t) then return false; end if;
  for a in select value from jsonb_array_elements(g) loop
    if jsonb_typeof(a)<>'array' or jsonb_array_length(a)<>jsonb_array_length(t) then return false; end if;
    for b in select value from jsonb_array_elements(a) loop
      if jsonb_typeof(b)<>'boolean' then return false; end if;
    end loop;
  end loop;
  return true;
exception when others then return false;
end $$;

create table if not exists public.activity_days (
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null check (date between '1900-01-01' and '2199-12-31'),
  rows jsonb not null,
  times jsonb not null,
  grid jsonb not null,
  source_name text not null default '' check(length(source_name)<=255),
  date_source text not null default 'manual' check(length(date_source)<=40),
  revision integer not null default 1 check(revision>0),
  archived boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key(user_id,date),
  constraint valid_grid check(public.valid_activity_grid(rows,times,grid))
);
alter table public.activity_days enable row level security;

-- Only the project administrator can link a login to another owner's data.
-- This schema is not exposed through the Data API; clients cannot read or edit
-- the membership table. Unlinked logins retain their own isolated records.
create schema if not exists activity_private;
revoke all on schema activity_private from public,anon,authenticated;
create table if not exists activity_private.account_access (
  member_id uuid primary key references auth.users(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  check(member_id<>owner_id)
);
alter table activity_private.account_access enable row level security;
revoke all on activity_private.account_access from public,anon,authenticated;
create or replace function public.activity_owner_id()
returns uuid language sql stable security definer set search_path='' as $$
  select coalesce((select owner_id from activity_private.account_access
    where member_id=auth.uid()),auth.uid());
$$;
revoke all on function public.activity_owner_id() from public,anon,authenticated;
grant execute on function public.activity_owner_id() to authenticated;

drop policy if exists own_days on public.activity_days;
create policy own_days on public.activity_days for select to authenticated using ((select public.activity_owner_id())=user_id);
revoke all on public.activity_days from anon,authenticated;
grant select on public.activity_days to authenticated;

-- Writes are atomic and compare revisions, so a second device cannot quietly
-- overwrite changes saved since the first device opened its review.
create or replace function public.save_activity_batch(p_days jsonb)
returns setof public.activity_days language plpgsql security definer set search_path=public as $$
declare owner_id uuid:=public.activity_owner_id(); item jsonb; target_date date; current_revision integer;
begin
  if owner_id is null then raise exception 'Sign in before saving.'; end if;
  if jsonb_typeof(p_days)<>'array' or jsonb_array_length(p_days) not between 1 and 200 then raise exception 'Save between 1 and 200 days at a time.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text,0));
  if (select count(distinct (value->>'date')::date) from jsonb_array_elements(p_days))<>jsonb_array_length(p_days) then raise exception 'Duplicate activity dates in this batch.'; end if;
  for item in select value from jsonb_array_elements(p_days) loop
    target_date:=(item->>'date')::date;
    select revision into current_revision from public.activity_days where user_id=owner_id and date=target_date for update;
    if coalesce(current_revision,0) is distinct from (item->>'expected_revision')::integer then
      raise exception 'Another device changed %. Refresh and review the replacement before saving.',target_date;
    end if;
    return query insert into public.activity_days(user_id,date,rows,times,grid,source_name,date_source,revision)
    values(owner_id,target_date,item->'rows',item->'times',item->'grid',left(coalesce(item->>'source_name',''),255),left(coalesce(item->>'date_source','manual'),40),coalesce(current_revision,0)+1)
    on conflict(user_id,date) do update set rows=excluded.rows,times=excluded.times,grid=excluded.grid,
      source_name=excluded.source_name,date_source=excluded.date_source,revision=excluded.revision,archived=false,updated_at=now()
    returning *;
  end loop;
end $$;

create or replace function public.archive_activity_day(p_date date,p_revision integer,p_archived boolean)
returns setof public.activity_days language plpgsql security definer set search_path=public as $$
declare owner_id uuid:=public.activity_owner_id();
begin
  if owner_id is null then raise exception 'Sign in first.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text,0));
  return query update public.activity_days set archived=p_archived,revision=revision+1,updated_at=now()
    where user_id=owner_id and date=p_date and revision=p_revision returning *;
  if not found then raise exception 'This day changed on another device. Refresh and try again.'; end if;
end $$;
revoke all on function public.save_activity_batch(jsonb) from public,anon,authenticated;
revoke all on function public.archive_activity_day(date,integer,boolean) from public,anon,authenticated;
grant execute on function public.save_activity_batch(jsonb) to authenticated;
grant execute on function public.archive_activity_day(date,integer,boolean) to authenticated;
commit;
