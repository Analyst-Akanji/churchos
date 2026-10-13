-- =====================================================================
-- 0008 Weekly programme: what is happening this week.
-- Admins (and the church secretary) enter the week's programmes in the app;
-- the public website shows the next 7 days automatically.
-- =====================================================================

create table weekly_programme (
  id             uuid primary key default gen_random_uuid(),
  assembly_id    uuid not null references assemblies(id) on delete cascade,
  programme_date date not null,
  start_time     time not null,
  end_time       time,
  title          text not null,
  details        text,
  venue          text,
  is_public      boolean not null default true,
  created_by     uuid default auth.uid() references auth.users(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (assembly_id, programme_date, start_time, title)
);
create index weekly_programme_date_idx on weekly_programme (assembly_id, programme_date);
create trigger trg_weekly_programme_updated_at before update on weekly_programme
  for each row execute function set_updated_at();

alter table weekly_programme enable row level security;
create policy wp_select on weekly_programme for select to authenticated using (is_assembly_user(assembly_id));
create policy wp_insert on weekly_programme for insert to authenticated with check (is_office(assembly_id));
create policy wp_update on weekly_programme for update to authenticated using (is_office(assembly_id)) with check (is_office(assembly_id));
create policy wp_delete on weekly_programme for delete to authenticated using (is_office(assembly_id));  -- plain content, safe to remove

-- Public website: today and the next 6 days, in the assembly's own time zone.
create view v_public_programme as
select p.assembly_id, p.id, p.programme_date, p.start_time, p.end_time, p.title, p.details, p.venue
  from weekly_programme p
  join assemblies a on a.id = p.assembly_id
 where a.is_active and p.is_public
   and p.programme_date >= (now() at time zone a.timezone)::date
   and p.programme_date <  (now() at time zone a.timezone)::date + 7;
grant select on v_public_programme to anon, authenticated;
