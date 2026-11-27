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

-- Rebuild the permissive visitor policy set; the safe INSERT and admin-only
-- SELECT policies are created below. No visitor rows are changed.
do $$
declare
  existing_policy record;
begin
  for existing_policy in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'visitors'
      and permissive = 'PERMISSIVE'
  loop
    execute format('drop policy if exists %I on public.visitors', existing_policy.policyname);
  end loop;
end;
$$;

-- Public event views may append telemetry, but cannot read, update, or delete visitor rows.
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
  using (lower(btrim(coalesce((select auth.jwt() -> 'app_metadata' ->> 'role'), ''))) in ('clinic_admin', 'pbtrkr_admin'));

drop policy if exists "Clinic admins can read visitor analytics" on public.visitors;
create policy "Clinic admins can read visitor analytics"
  on public.visitors
  for select
  to authenticated
  using (lower(btrim(coalesce((select auth.jwt() -> 'app_metadata' ->> 'role'), ''))) in ('clinic_admin', 'pbtrkr_admin'));

revoke insert on public.visitors from public;
grant insert on public.visitors to anon, authenticated;
grant select on public.visitors to authenticated;
revoke select on public.visitors from public, anon;
revoke update, delete on public.visitors from public, anon, authenticated;
