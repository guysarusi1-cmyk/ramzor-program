-- ================================================================
-- Scheduling, part 78 — run in the SQL Editor after scheduling-v77.sql. Safe to run again. (Guy 2026-11-14: the product's instructor portal)
-- The two-week schedule: swap requests and messages.
--   SWAPS  a person asks to give away one of her shifts of a PUBLISHED schedule; another person on the list says she takes it;
--          the builder of those two weeks (or the admin) approves, and only then the schedule changes.
--          All the steps go through functions, so nobody writes the table directly.
--   MESSAGES  about the schedule, to everybody on the list: written by whoever builds now (until the last day of her schedule has passed)
--          and by the admin; read by everybody on the list.
-- ================================================================

do $$ begin
  if to_regclass('public.tw_other') is null then raise exception 'scheduling-v77.sql first'; end if;
end $$;

-- who builds now: the builder of two weeks that have not ended yet (she is in charge of changes until their last day)
create or replace function public.tw_builder_now() returns boolean language sql stable security definer set search_path = public as $$
  select public.tw_boss() or exists (select 1 from public.tw_period t where t.builder is not null and t.builder = public.tw_me() and t.start + 13 >= current_date)
$$;
revoke all on function public.tw_builder_now() from public, anon;
grant execute on function public.tw_builder_now() to authenticated;

create table if not exists public.tw_swap (
  id uuid primary key default gen_random_uuid(),
  period date not null references public.tw_period(start) on delete cascade,
  assignment uuid references public.tw_assignment(id) on delete set null,
  day date not null, shift text not null check (shift in ('M', 'A', 'N', 'W')),
  from_person uuid not null references public.tw_people(id) on delete cascade,
  taker uuid references public.tw_people(id) on delete set null,
  status text not null default 'open' check (status in ('open', 'taken', 'approved', 'declined', 'cancelled')),
  note text,
  created_at timestamptz not null default now(), taken_at timestamptz, decided_at timestamptz, decided_by uuid
);
create index if not exists tw_swap_period_idx on public.tw_swap (period, status);
create table if not exists public.tw_message (
  id uuid primary key default gen_random_uuid(),
  body text not null check (length(btrim(body)) between 1 and 1000),
  from_staff uuid not null default public.my_staff_id(),
  created_at timestamptz not null default now()
);

alter table public.tw_swap enable row level security;
alter table public.tw_message enable row level security;
revoke all on public.tw_swap, public.tw_message from anon, public;
grant select on public.tw_swap to authenticated;
grant select, insert, delete on public.tw_message to authenticated;

drop policy if exists "tw swap read" on public.tw_swap;
create policy "tw swap read" on public.tw_swap for select to authenticated using ((select public.tw_member()));

drop policy if exists "tw message read" on public.tw_message;
drop policy if exists "tw message write" on public.tw_message;
drop policy if exists "tw message remove" on public.tw_message;
create policy "tw message read" on public.tw_message for select to authenticated using ((select public.tw_member()));
create policy "tw message write" on public.tw_message for insert to authenticated with check (from_staff = (select public.my_staff_id()) and (select public.tw_builder_now()));
create policy "tw message remove" on public.tw_message for delete to authenticated using ((select public.tw_boss()) or from_staff = (select public.my_staff_id()));

-- asking: only one's own shift, of a published schedule, that has not passed, and not twice
create or replace function public.tw_swap_ask(p_assignment uuid, p_note text default null) returns uuid language plpgsql security definer set search_path = public as $$
declare a public.tw_assignment; me uuid := public.tw_me(); new_id uuid;
begin
  if me is null then raise exception 'not on the list'; end if;
  select * into a from public.tw_assignment where id = p_assignment;
  if a.id is null or a.person <> me then raise exception 'not your shift'; end if;
  if not exists (select 1 from public.tw_period t where t.start = a.period and t.status = 'published') then raise exception 'the schedule is not published'; end if;
  if a.day < current_date then raise exception 'the shift has passed'; end if;
  if exists (select 1 from public.tw_swap s where s.assignment = a.id and s.status in ('open', 'taken')) then raise exception 'already asked'; end if;
  insert into public.tw_swap(period, assignment, day, shift, from_person, note) values (a.period, a.id, a.day, a.shift, me, nullif(btrim(coalesce(p_note, '')), '')) returning id into new_id;
  return new_id;
end $$;

-- taking: somebody else on the list, who is not already in that shift
create or replace function public.tw_swap_take(p_swap uuid) returns void language plpgsql security definer set search_path = public as $$
declare s public.tw_swap; me uuid := public.tw_me();
begin
  if me is null then raise exception 'not on the list'; end if;
  select * into s from public.tw_swap where id = p_swap for update;
  if s.id is null or s.status <> 'open' then raise exception 'the request is not open'; end if;
  if s.from_person = me then raise exception 'your own request'; end if;
  if exists (select 1 from public.tw_assignment a where a.period = s.period and a.day = s.day and a.person = me) then raise exception 'you already work that day'; end if;
  update public.tw_swap set status = 'taken', taker = me, taken_at = now() where id = p_swap;
end $$;

-- taking back: the one who asked cancels; the one who took lets go (the request is open again)
create or replace function public.tw_swap_cancel(p_swap uuid) returns void language plpgsql security definer set search_path = public as $$
declare s public.tw_swap; me uuid := public.tw_me();
begin
  select * into s from public.tw_swap where id = p_swap for update;
  if s.id is null or s.status not in ('open', 'taken') then raise exception 'the request is closed'; end if;
  if s.taker is not null and s.taker = me then update public.tw_swap set status = 'open', taker = null, taken_at = null where id = p_swap;
  elsif s.from_person = me or public.tw_builder(s.period) then update public.tw_swap set status = 'cancelled', decided_at = now(), decided_by = public.my_staff_id() where id = p_swap;
  else raise exception 'not yours'; end if;
end $$;

-- the builder's word: approving puts the taker in the shift instead of the one who asked
create or replace function public.tw_swap_decide(p_swap uuid, p_approve boolean) returns void language plpgsql security definer set search_path = public as $$
declare s public.tw_swap;
begin
  select * into s from public.tw_swap where id = p_swap for update;
  if s.id is null or s.status <> 'taken' then raise exception 'nothing to decide'; end if;
  if not public.tw_builder(s.period) then raise exception 'only the builder of these two weeks'; end if;
  if p_approve then
    if not exists (select 1 from public.tw_assignment a where a.id = s.assignment and a.person = s.from_person) then raise exception 'the shift has changed'; end if;
    if exists (select 1 from public.tw_assignment a where a.period = s.period and a.day = s.day and a.person = s.taker) then raise exception 'the taker already works that day'; end if;
    update public.tw_assignment set person = s.taker, by_hand = true, fixed = false where id = s.assignment;
    update public.tw_swap set status = 'approved', decided_at = now(), decided_by = public.my_staff_id() where id = p_swap;
  else
    update public.tw_swap set status = 'declined', decided_at = now(), decided_by = public.my_staff_id() where id = p_swap;
  end if;
end $$;

revoke all on function public.tw_swap_ask(uuid, text), public.tw_swap_take(uuid), public.tw_swap_cancel(uuid), public.tw_swap_decide(uuid, boolean) from public, anon;
grant execute on function public.tw_swap_ask(uuid, text), public.tw_swap_take(uuid), public.tw_swap_cancel(uuid), public.tw_swap_decide(uuid, boolean) to authenticated;

select 'scheduling_v78' as part, 'ok' as result,
       (select count(*) from pg_tables where schemaname = 'public' and tablename in ('tw_swap', 'tw_message')) as tables,
       (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname like 'tw\_swap\_%') as functions;
