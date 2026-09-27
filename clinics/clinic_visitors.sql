-- PBTRKR Clinics event visitor tracking migration.
-- The existing public.visitors table is reused; legacy rows remain unassociated.
-- Run this migration in the Supabase SQL editor for project qyhzxfserrvsgutfhyel.

alter table public.visitors
  add column if not exists clinic_event_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.visitors'::regclass
      and conname = 'visitors_clinic_event_id_fkey'
  ) then
    alter table public.visitors
      add constraint visitors_clinic_event_id_fkey
      foreign key (clinic_event_id)
      references public.clinic_events(id)
      on delete cascade;
  end if;
end;
$$;

create index if not exists visitors_clinic_event_id_time_idx
  on public.visitors (clinic_event_id, "time" desc)
  where clinic_event_id is not null;

alter table public.visitors enable row level security;

-- Public event views may append telemetry, but reads require clinic_admin.
-- clinic_event_id NULL preserves the existing main-app visitor insert shape.
drop policy if exists "PBTRKR visitor tracking inserts" on public.visitors;
create policy "PBTRKR visitor tracking inserts"
  on public.visitors
  for insert
  to anon, authenticated
  with check (
    clinic_event_id is null
    or exists (
      select 1
      from public.clinic_events as clinic_event
      where clinic_event.id = visitors.clinic_event_id
        and clinic_event.status = 'published'
    )
  );

drop policy if exists "PBTRKR visitor reads require clinic admin" on public.visitors;
create policy "PBTRKR visitor reads require clinic admin"
  on public.visitors
  as restrictive
  for select
  to public
  using ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'clinic_admin');

drop policy if exists "Clinic admins can read visitor analytics" on public.visitors;
create policy "Clinic admins can read visitor analytics"
  on public.visitors
  for select
  to authenticated
  using ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'clinic_admin');

grant insert on public.visitors to anon, authenticated;
grant select on public.visitors to authenticated;
