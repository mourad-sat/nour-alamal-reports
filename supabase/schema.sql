-- Nour Al Amal / Second Chance: fresh, independent Supabase project ONLY.
-- Do not apply to an existing portal. Requires a PostgreSQL project with Supabase Auth.
-- Run ONCE on the newly created, EMPTY reporting project after its identity is confirmed.
-- Privacy: learner_code is a pseudonym, not a name or other direct identifier.

begin;

create schema if not exists app_private;
revoke all on schema app_private from public;
grant usage on schema app_private to authenticated;

create type public.staff_role as enum (
  'admin', 'vocational_instructor', 'pedagogical_instructor',
  'activity_facilitator', 'attendance_officer'
);
create type public.report_kind as enum ('vocational', 'pedagogical', 'activity');
create type public.attendance_state as enum ('present', 'absent', 'late', 'excused');

create table public.centers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 150),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.staff_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null check (length(trim(full_name)) between 2 and 150),
  role public.staff_role not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.center_memberships (
  center_id uuid not null references public.centers(id) on delete cascade,
  user_id uuid not null references public.staff_profiles(user_id) on delete cascade,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (center_id, user_id)
);
create index center_memberships_user_idx on public.center_memberships (user_id, center_id)
  where is_active;

create table public.training_groups (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers(id),
  name text not null check (length(trim(name)) between 2 and 150),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (id, center_id),
  unique (center_id, name)
);

create table public.session_reports (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null,
  group_id uuid not null,
  author_id uuid not null references public.staff_profiles(user_id),
  report_kind public.report_kind not null,
  session_date date not null,
  start_time time,
  end_time time,
  title text not null check (length(trim(title)) between 3 and 250),
  objectives text not null default '' check (length(objectives) <= 5000),
  activities text not null default '' check (length(activities) <= 10000),
  observations text not null default '' check (length(observations) <= 5000),
  participants_count integer check (participants_count between 0 and 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint report_group_same_center
    foreign key (group_id, center_id) references public.training_groups(id, center_id),
  constraint report_time_order
    check (start_time is null or end_time is null or end_time > start_time)
);
create index reports_center_date_idx on public.session_reports (center_id, session_date desc);
create index reports_author_idx on public.session_reports (author_id, session_date desc);
create index reports_type_idx on public.session_reports (report_kind, session_date desc);

create table public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null,
  group_id uuid not null,
  recorded_by uuid not null references public.staff_profiles(user_id),
  session_date date not null,
  learner_code text not null check (learner_code ~ '^[A-Za-z0-9_-]{3,32}$'),
  status public.attendance_state not null,
  notes text not null default '' check (length(notes) <= 1500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attendance_group_same_center
    foreign key (group_id, center_id) references public.training_groups(id, center_id),
  unique (group_id, session_date, learner_code)
);
create index attendance_center_date_idx on public.attendance_records (center_id, session_date desc);
create index attendance_author_idx on public.attendance_records (recorded_by, session_date desc);

-- Authorization helpers run with the migration owner, in an UNEXPOSED schema.
-- Return boolean only; they never disclose privileged rows or accept a user id.
create function app_private.is_admin() returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.staff_profiles p
    where p.user_id = (select auth.uid())
      and p.is_active and p.role = 'admin'
  );
$$;

create function app_private.has_center_access(target_center uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.staff_profiles p
    where p.user_id = (select auth.uid()) and p.is_active
      and (
        p.role = 'admin'
        or exists (
          select 1 from public.center_memberships m
          where m.user_id = p.user_id and m.center_id = target_center and m.is_active
        )
      )
  );
$$;

create function app_private.can_write_report(target_center uuid, target_kind public.report_kind)
returns boolean language sql stable security definer set search_path = ''
as $$
  select (select app_private.has_center_access(target_center)) and exists (
    select 1 from public.staff_profiles p
    where p.user_id = (select auth.uid()) and p.is_active
      and (
        p.role = 'admin'
        or (p.role = 'vocational_instructor' and target_kind = 'vocational')
        or (p.role = 'pedagogical_instructor' and target_kind = 'pedagogical')
        or (p.role = 'activity_facilitator' and target_kind = 'activity')
      )
  );
$$;

create function app_private.can_write_attendance(target_center uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select (select app_private.has_center_access(target_center)) and exists (
    select 1 from public.staff_profiles p
    where p.user_id = (select auth.uid()) and p.is_active
      and p.role in ('admin', 'attendance_officer', 'pedagogical_instructor')
  );
$$;

create function app_private.touch_updated_at() returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
create trigger reports_updated_at before update on public.session_reports
  for each row execute function app_private.touch_updated_at();
create trigger attendance_updated_at before update on public.attendance_records
  for each row execute function app_private.touch_updated_at();

revoke execute on all functions in schema app_private from public, anon;
grant execute on function app_private.is_admin() to authenticated;
grant execute on function app_private.has_center_access(uuid) to authenticated;
grant execute on function app_private.can_write_report(uuid, public.report_kind) to authenticated;
grant execute on function app_private.can_write_attendance(uuid) to authenticated;
-- touch_updated_at is trigger-only: no direct invocation grants.
revoke execute on function app_private.touch_updated_at() from authenticated;

grant usage on type public.staff_role, public.report_kind, public.attendance_state to authenticated;
revoke all on public.centers, public.staff_profiles, public.center_memberships,
  public.training_groups, public.session_reports, public.attendance_records from public, anon;
grant select, insert, update, delete on public.centers, public.staff_profiles,
  public.center_memberships, public.training_groups, public.session_reports,
  public.attendance_records to authenticated;

alter table public.centers enable row level security;
alter table public.staff_profiles enable row level security;
alter table public.center_memberships enable row level security;
alter table public.training_groups enable row level security;
alter table public.session_reports enable row level security;
alter table public.attendance_records enable row level security;

-- Staff can view their own profile. Only existing active admins can manage profiles.
create policy staff_read on public.staff_profiles for select to authenticated
  using (user_id = (select auth.uid()) or (select app_private.is_admin()));
create policy staff_insert on public.staff_profiles for insert to authenticated
  with check ((select app_private.is_admin()));
create policy staff_update on public.staff_profiles for update to authenticated
  using ((select app_private.is_admin())) with check ((select app_private.is_admin()));
create policy staff_delete on public.staff_profiles for delete to authenticated
  using ((select app_private.is_admin()) and user_id <> (select auth.uid()));

create policy centers_read on public.centers for select to authenticated
  using (app_private.has_center_access(id));
create policy centers_insert on public.centers for insert to authenticated
  with check ((select app_private.is_admin()));
create policy centers_update on public.centers for update to authenticated
  using ((select app_private.is_admin())) with check ((select app_private.is_admin()));
create policy centers_delete on public.centers for delete to authenticated
  using ((select app_private.is_admin()));

create policy memberships_read on public.center_memberships for select to authenticated
  using (user_id = (select auth.uid()) or (select app_private.is_admin()));
create policy memberships_insert on public.center_memberships for insert to authenticated
  with check ((select app_private.is_admin()));
create policy memberships_update on public.center_memberships for update to authenticated
  using ((select app_private.is_admin())) with check ((select app_private.is_admin()));
create policy memberships_delete on public.center_memberships for delete to authenticated
  using ((select app_private.is_admin()));

create policy groups_read on public.training_groups for select to authenticated
  using (app_private.has_center_access(center_id));
create policy groups_insert on public.training_groups for insert to authenticated
  with check ((select app_private.is_admin()));
create policy groups_update on public.training_groups for update to authenticated
  using ((select app_private.is_admin())) with check ((select app_private.is_admin()));
create policy groups_delete on public.training_groups for delete to authenticated
  using ((select app_private.is_admin()));

create policy reports_read on public.session_reports for select to authenticated
  using (app_private.has_center_access(center_id));
create policy reports_insert on public.session_reports for insert to authenticated
  with check (author_id = (select auth.uid()) and app_private.can_write_report(center_id, report_kind));
create policy reports_update on public.session_reports for update to authenticated
  using ((select app_private.is_admin()) or
    (author_id = (select auth.uid()) and app_private.can_write_report(center_id, report_kind)))
  with check ((select app_private.is_admin()) or
    (author_id = (select auth.uid()) and app_private.can_write_report(center_id, report_kind)));
create policy reports_delete on public.session_reports for delete to authenticated
  using ((select app_private.is_admin()));

create policy attendance_read on public.attendance_records for select to authenticated
  using (app_private.has_center_access(center_id));
create policy attendance_insert on public.attendance_records for insert to authenticated
  with check (recorded_by = (select auth.uid()) and app_private.can_write_attendance(center_id));
create policy attendance_update on public.attendance_records for update to authenticated
  using ((select app_private.is_admin()) or
    (recorded_by = (select auth.uid()) and app_private.can_write_attendance(center_id)))
  with check ((select app_private.is_admin()) or
    (recorded_by = (select auth.uid()) and app_private.can_write_attendance(center_id)));
create policy attendance_delete on public.attendance_records for delete to authenticated
  using ((select app_private.is_admin()));

commit;