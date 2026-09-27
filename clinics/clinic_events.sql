-- PBTRKR Clinics event storage.
-- Run this in the Supabase SQL editor for project qyhzxfserrvsgutfhyel.
-- Public visitors can read published events. Only users whose trusted
-- app_metadata.role is "clinic_admin" can view drafts or create/update events.

create table if not exists public.clinic_events (
  id uuid primary key default gen_random_uuid(),
  event_name text not null check (char_length(btrim(event_name)) between 1 and 120),
  event_date date not null,
  start_time time not null,
  end_time time not null,
  description text not null default '' check (char_length(description) <= 5000),
  player_capacity integer not null check (player_capacity between 1 and 500),
  location text not null check (char_length(btrim(location)) between 1 and 160),
  address text,
  is_full boolean not null default true,
  status text not null default 'draft' check (status in ('draft', 'published')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  constraint clinic_events_time_order check (end_time > start_time),
  constraint clinic_events_published_at check (status <> 'published' or published_at is not null)
);

create index if not exists clinic_events_published_date_idx
  on public.clinic_events (event_date, start_time)
  where status = 'published';

create index if not exists clinic_events_created_at_idx
  on public.clinic_events (created_at desc);

create or replace function public.set_clinic_event_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists clinic_events_set_updated_at on public.clinic_events;
create trigger clinic_events_set_updated_at
  before update on public.clinic_events
  for each row execute function public.set_clinic_event_updated_at();

alter table public.clinic_events enable row level security;

drop policy if exists "Anyone can read published clinic events" on public.clinic_events;
create policy "Anyone can read published clinic events"
  on public.clinic_events
  for select
  to anon, authenticated
  using (status = 'published');

drop policy if exists "Clinic admins can read all clinic events" on public.clinic_events;
create policy "Clinic admins can read all clinic events"
  on public.clinic_events
  for select
  to authenticated
  using ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'clinic_admin');

drop policy if exists "Clinic admins can create clinic events" on public.clinic_events;
create policy "Clinic admins can create clinic events"
  on public.clinic_events
  for insert
  to authenticated
  with check ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'clinic_admin');

drop policy if exists "Clinic admins can update clinic events" on public.clinic_events;
create policy "Clinic admins can update clinic events"
  on public.clinic_events
  for update
  to authenticated
  using ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'clinic_admin')
  with check ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'clinic_admin');

grant select on public.clinic_events to anon, authenticated;
grant insert, update on public.clinic_events to authenticated;

comment on table public.clinic_events is
  'Standalone PBTRKR Clinics event records. Set app_metadata.role=clinic_admin through a trusted Supabase admin path to allow event management.';
