-- 002_register_programme_quarter_admin.sql
--
-- Adds: staff roles, the weekly order of service (programmes), the class register,
-- an offering audit trail, and the admin functions that create the next quarter.
--
-- ASSUMES these tables already exist (rename below if yours differ):
--   public.assemblies(id)
--   public.sunday_school_classes(id, assembly_id)
--   public.members(id)
-- Run 001_quarters_and_lessons.sql first.

-- ---------------------------------------------------------------------------
-- 1. Staff roles and the helper functions every policy below uses.
--    If you already have a roles setup, keep your table and rewrite ONLY the
--    bodies of the four functions in this section. Nothing else depends on it.
-- ---------------------------------------------------------------------------

create table if not exists public.staff_roles (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  assembly_id uuid not null references public.assemblies(id) on delete cascade,
  class_id    uuid references public.sunday_school_classes(id) on delete cascade,
  role        text not null check (role in ('admin', 'superintendent', 'teacher', 'secretary')),
  created_at  timestamptz not null default now(),
  constraint staff_roles_class_rule check ((role in ('teacher', 'secretary')) = (class_id is not null)),
  constraint staff_roles_unique unique nulls not distinct (user_id, assembly_id, class_id, role)
);

alter table public.staff_roles enable row level security;

drop policy if exists "staff read own roles" on public.staff_roles;
create policy "staff read own roles" on public.staff_roles
  for select to authenticated using (user_id = auth.uid());
-- Roles are granted from the SQL editor, for example:
--   insert into public.staff_roles (user_id, assembly_id, role)
--   values ('<auth user id>', '<assembly id>', 'admin');

create or replace function public.is_assembly_admin(p_assembly uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
begin
  return exists (
    select 1 from public.staff_roles s
    where s.user_id = auth.uid() and s.assembly_id = p_assembly and s.role = 'admin'
  );
end $$;

-- Curriculum is shared by every assembly. For now any assembly admin may edit it.
-- Tighten this to a single platform admin when other assemblies are onboarded.
create or replace function public.is_curriculum_editor() returns boolean
language plpgsql stable security definer set search_path = public as $$
begin
  return exists (
    select 1 from public.staff_roles s where s.user_id = auth.uid() and s.role = 'admin'
  );
end $$;

-- Who may record a class's register: admins and the superintendent of that
-- assembly, plus the teacher or secretary assigned to that class.
create or replace function public.can_record_class(p_class uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
begin
  return exists (
    select 1
    from public.sunday_school_classes c
    join public.staff_roles s
      on s.user_id = auth.uid() and s.assembly_id = c.assembly_id
    where c.id = p_class
      and (s.role in ('admin', 'superintendent')
           or (s.role in ('teacher', 'secretary') and s.class_id = c.id))
  );
end $$;

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Weekly order of service
-- ---------------------------------------------------------------------------

create table if not exists public.programmes (
  id           uuid primary key default gen_random_uuid(),
  assembly_id  uuid not null references public.assemblies(id) on delete cascade,
  service_date date not null,
  theme        text,
  preacher     text,
  notes        text,
  is_published boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint programmes_assembly_date_key unique (assembly_id, service_date)
);

create table if not exists public.programme_items (
  id           uuid primary key default gen_random_uuid(),
  programme_id uuid not null references public.programmes(id) on delete cascade,
  position     smallint not null,
  start_time   time,
  title        text not null,
  led_by       text,
  notes        text,
  constraint programme_items_position_key unique (programme_id, position)
);

drop trigger if exists programmes_touch on public.programmes;
create trigger programmes_touch before update on public.programmes
  for each row execute function public.touch_updated_at();

alter table public.programmes      enable row level security;
alter table public.programme_items enable row level security;

drop policy if exists "programmes read" on public.programmes;
create policy "programmes read" on public.programmes
  for select to anon, authenticated
  using (is_published or public.is_assembly_admin(assembly_id));

drop policy if exists "programmes insert" on public.programmes;
create policy "programmes insert" on public.programmes
  for insert to authenticated with check (public.is_assembly_admin(assembly_id));

drop policy if exists "programmes update" on public.programmes;
create policy "programmes update" on public.programmes
  for update to authenticated
  using (public.is_assembly_admin(assembly_id))
  with check (public.is_assembly_admin(assembly_id));

drop policy if exists "programmes delete" on public.programmes;
create policy "programmes delete" on public.programmes
  for delete to authenticated using (public.is_assembly_admin(assembly_id));

drop policy if exists "programme items read" on public.programme_items;
create policy "programme items read" on public.programme_items
  for select to anon, authenticated
  using (exists (
    select 1 from public.programmes p
    where p.id = programme_id and (p.is_published or public.is_assembly_admin(p.assembly_id))
  ));

drop policy if exists "programme items insert" on public.programme_items;
create policy "programme items insert" on public.programme_items
  for insert to authenticated
  with check (exists (
    select 1 from public.programmes p
    where p.id = programme_id and public.is_assembly_admin(p.assembly_id)
  ));

drop policy if exists "programme items update" on public.programme_items;
create policy "programme items update" on public.programme_items
  for update to authenticated
  using (exists (
    select 1 from public.programmes p
    where p.id = programme_id and public.is_assembly_admin(p.assembly_id)
  ));

drop policy if exists "programme items delete" on public.programme_items;
create policy "programme items delete" on public.programme_items
  for delete to authenticated
  using (exists (
    select 1 from public.programmes p
    where p.id = programme_id and public.is_assembly_admin(p.assembly_id)
  ));

-- Saves a whole programme in one step: header fields plus the ordered items.
drop function if exists public.save_programme(uuid, date, jsonb);
create function public.save_programme(p_assembly uuid, p_date date, p jsonb) returns uuid
language plpgsql security invoker set search_path = public as $$
declare v_id uuid;
begin
  insert into public.programmes (assembly_id, service_date, theme, preacher, notes, is_published)
  values (
    p_assembly, p_date,
    nullif(trim(p->>'theme'), ''), nullif(trim(p->>'preacher'), ''), nullif(trim(p->>'notes'), ''),
    coalesce((p->>'is_published')::boolean, false)
  )
  on conflict (assembly_id, service_date) do update
    set theme = excluded.theme, preacher = excluded.preacher,
        notes = excluded.notes, is_published = excluded.is_published
  returning id into v_id;

  delete from public.programme_items where programme_id = v_id;

  insert into public.programme_items (programme_id, position, start_time, title, led_by, notes)
  select v_id, (row_number() over (order by t.ord))::smallint,
         nullif(t.i->>'start_time', '')::time,
         trim(t.i->>'title'),
         nullif(trim(t.i->>'led_by'), ''),
         nullif(trim(t.i->>'notes'), '')
  from jsonb_array_elements(coalesce(p->'items', '[]'::jsonb)) with ordinality as t(i, ord)
  where trim(coalesce(t.i->>'title', '')) <> '';

  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Class register (one session per class per lesson, one row per member)
--    Each criterion is worth 1 point, so a weekly Total runs from 0 to 4.
--    Money is never used for ranking.
-- ---------------------------------------------------------------------------

create table if not exists public.class_sessions (
  id              uuid primary key default gen_random_uuid(),
  assembly_id     uuid not null references public.assemblies(id) on delete cascade,
  class_id        uuid not null references public.sunday_school_classes(id) on delete cascade,
  lesson_id       uuid not null references public.lessons(id) on delete restrict,
  visitors        smallint not null default 0 check (visitors >= 0),
  offering_amount numeric(12, 2) not null default 0 check (offering_amount >= 0),
  recorded_by     uuid references auth.users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint class_sessions_class_lesson_key unique (class_id, lesson_id)
);

create table if not exists public.class_attendance (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.class_sessions(id) on delete cascade,
  assembly_id uuid not null references public.assemblies(id) on delete cascade,
  member_id   uuid not null references public.members(id) on delete cascade,
  present     boolean not null default false,
  on_time     boolean not null default false,
  memory_verse boolean not null default false,
  class_work  boolean not null default false,
  points      smallint generated always as (
    (case when present then 1 else 0 end)
    + (case when present and on_time then 1 else 0 end)
    + (case when present and memory_verse then 1 else 0 end)
    + (case when present and class_work then 1 else 0 end)
  ) stored,
  constraint class_attendance_session_member_key unique (session_id, member_id),
  constraint class_attendance_needs_present check (present or not (on_time or memory_verse or class_work))
);

create index if not exists class_attendance_member_idx on public.class_attendance (member_id);

drop trigger if exists class_sessions_touch on public.class_sessions;
create trigger class_sessions_touch before update on public.class_sessions
  for each row execute function public.touch_updated_at();

-- Append-only record of every change to a class's offering amount.
create table if not exists public.offering_audit (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.class_sessions(id) on delete cascade,
  old_amount numeric(12, 2),
  new_amount numeric(12, 2) not null,
  changed_by uuid,
  changed_at timestamptz not null default now()
);

create or replace function public.log_offering_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.offering_audit (session_id, old_amount, new_amount, changed_by)
    values (new.id, null, new.offering_amount, auth.uid());
  elsif new.offering_amount is distinct from old.offering_amount then
    insert into public.offering_audit (session_id, old_amount, new_amount, changed_by)
    values (new.id, old.offering_amount, new.offering_amount, auth.uid());
  end if;
  return new;
end $$;

drop trigger if exists class_sessions_offering_audit on public.class_sessions;
create trigger class_sessions_offering_audit
  after insert or update of offering_amount on public.class_sessions
  for each row execute function public.log_offering_change();

alter table public.class_sessions   enable row level security;
alter table public.class_attendance enable row level security;
alter table public.offering_audit   enable row level security;

drop policy if exists "sessions read" on public.class_sessions;
create policy "sessions read" on public.class_sessions
  for select to authenticated using (public.can_record_class(class_id));

drop policy if exists "sessions insert" on public.class_sessions;
create policy "sessions insert" on public.class_sessions
  for insert to authenticated with check (public.can_record_class(class_id));

drop policy if exists "sessions update" on public.class_sessions;
create policy "sessions update" on public.class_sessions
  for update to authenticated
  using (public.can_record_class(class_id))
  with check (public.can_record_class(class_id));

drop policy if exists "sessions delete" on public.class_sessions;
create policy "sessions delete" on public.class_sessions
  for delete to authenticated using (public.is_assembly_admin(assembly_id));

drop policy if exists "attendance read" on public.class_attendance;
create policy "attendance read" on public.class_attendance
  for select to authenticated
  using (exists (
    select 1 from public.class_sessions s
    where s.id = session_id and public.can_record_class(s.class_id)
  ));

drop policy if exists "attendance insert" on public.class_attendance;
create policy "attendance insert" on public.class_attendance
  for insert to authenticated
  with check (exists (
    select 1 from public.class_sessions s
    where s.id = session_id and public.can_record_class(s.class_id)
  ));

drop policy if exists "attendance update" on public.class_attendance;
create policy "attendance update" on public.class_attendance
  for update to authenticated
  using (exists (
    select 1 from public.class_sessions s
    where s.id = session_id and public.can_record_class(s.class_id)
  ));

drop policy if exists "attendance delete" on public.class_attendance;
create policy "attendance delete" on public.class_attendance
  for delete to authenticated
  using (exists (
    select 1 from public.class_sessions s
    where s.id = session_id and public.is_assembly_admin(s.assembly_id)
  ));

drop policy if exists "offering audit read" on public.offering_audit;
create policy "offering audit read" on public.offering_audit
  for select to authenticated
  using (exists (
    select 1 from public.class_sessions s
    where s.id = session_id and public.can_record_class(s.class_id)
  ));
-- No insert/update/delete policies on offering_audit: only the trigger writes to it.

-- Saves one Sunday's register for a class in a single step. Safe to call again
-- when an offline save is synced later: it updates what is already there.
drop function if exists public.save_class_register(uuid, uuid, integer, numeric, jsonb);
create function public.save_class_register(
  p_class uuid, p_lesson uuid, p_visitors integer, p_offering numeric, p_rows jsonb
) returns uuid
language plpgsql security invoker set search_path = public as $$
declare v_assembly uuid; v_session uuid;
begin
  select assembly_id into v_assembly from public.sunday_school_classes where id = p_class;
  if v_assembly is null then
    raise exception 'Class not found';
  end if;

  insert into public.class_sessions (assembly_id, class_id, lesson_id, visitors, offering_amount, recorded_by)
  values (v_assembly, p_class, p_lesson, coalesce(p_visitors, 0), coalesce(p_offering, 0), auth.uid())
  on conflict (class_id, lesson_id) do update
    set visitors = excluded.visitors,
        offering_amount = excluded.offering_amount,
        recorded_by = excluded.recorded_by
  returning id into v_session;

  insert into public.class_attendance (session_id, assembly_id, member_id, present, on_time, memory_verse, class_work)
  select v_session, v_assembly, (r->>'member_id')::uuid,
         coalesce((r->>'present')::boolean, false),
         coalesce((r->>'present')::boolean, false) and coalesce((r->>'on_time')::boolean, false),
         coalesce((r->>'present')::boolean, false) and coalesce((r->>'memory_verse')::boolean, false),
         coalesce((r->>'present')::boolean, false) and coalesce((r->>'class_work')::boolean, false)
  from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) as r
  on conflict (session_id, member_id) do update
    set present = excluded.present, on_time = excluded.on_time,
        memory_verse = excluded.memory_verse, class_work = excluded.class_work;

  return v_session;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Quarter admin: write access plus one function that builds a whole quarter
-- ---------------------------------------------------------------------------

drop policy if exists "quarters editors insert" on public.quarters;
create policy "quarters editors insert" on public.quarters
  for insert to authenticated with check (public.is_curriculum_editor());
drop policy if exists "quarters editors update" on public.quarters;
create policy "quarters editors update" on public.quarters
  for update to authenticated using (public.is_curriculum_editor()) with check (public.is_curriculum_editor());
drop policy if exists "quarters editors delete" on public.quarters;
create policy "quarters editors delete" on public.quarters
  for delete to authenticated using (public.is_curriculum_editor());

drop policy if exists "units editors insert" on public.units;
create policy "units editors insert" on public.units
  for insert to authenticated with check (public.is_curriculum_editor());
drop policy if exists "units editors update" on public.units;
create policy "units editors update" on public.units
  for update to authenticated using (public.is_curriculum_editor()) with check (public.is_curriculum_editor());
drop policy if exists "units editors delete" on public.units;
create policy "units editors delete" on public.units
  for delete to authenticated using (public.is_curriculum_editor());

drop policy if exists "lessons editors insert" on public.lessons;
create policy "lessons editors insert" on public.lessons
  for insert to authenticated with check (public.is_curriculum_editor());
drop policy if exists "lessons editors update" on public.lessons;
create policy "lessons editors update" on public.lessons
  for update to authenticated using (public.is_curriculum_editor()) with check (public.is_curriculum_editor());
drop policy if exists "lessons editors delete" on public.lessons;
create policy "lessons editors delete" on public.lessons
  for delete to authenticated using (public.is_curriculum_editor());

-- create_quarter: payload looks like
--   { "quarter_number": 2, "title": "2nd Quarter", "theme": "...", "starts_on": "2026-12-06",
--     "sharing_day": true,
--     "units": [ { "unit_number": 1, "title": "...", "lessons": [ { "title": "..." } ] } ] }
-- Lessons are dated one Sunday apart from starts_on, in the order given. If
-- sharing_day is true, the Sunday after the last lesson becomes Sharing & Admonition.
drop function if exists public.create_quarter(jsonb);
create function public.create_quarter(p jsonb) returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  v_start date := (p->>'starts_on')::date;
  v_end   date;
  v_q     uuid;
  v_unit  jsonb;
  v_uid   uuid;
  v_lesson jsonb;
  v_n     integer := 0;
begin
  if v_start is null or extract(dow from v_start) <> 0 then
    raise exception 'A quarter must start on a Sunday';
  end if;
  if trim(coalesce(p->>'theme', '')) = '' then
    raise exception 'The quarter needs a theme';
  end if;

  insert into public.quarters (quarter_number, title, theme, starts_on, ends_on)
  values ((p->>'quarter_number')::smallint, trim(p->>'title'), trim(p->>'theme'), v_start, v_start)
  returning id into v_q;

  for v_unit in select value from jsonb_array_elements(coalesce(p->'units', '[]'::jsonb)) loop
    if trim(coalesce(v_unit->>'title', '')) = '' then
      raise exception 'Every unit needs a title';
    end if;
    insert into public.units (quarter_id, unit_number, title)
    values (v_q, (v_unit->>'unit_number')::smallint, trim(v_unit->>'title'))
    returning id into v_uid;

    for v_lesson in select value from jsonb_array_elements(coalesce(v_unit->'lessons', '[]'::jsonb)) loop
      if trim(coalesce(v_lesson->>'title', '')) = '' then
        raise exception 'Every lesson needs a title';
      end if;
      v_n := v_n + 1;
      insert into public.lessons (quarter_id, unit_id, lesson_number, lesson_date, title, kind)
      values (v_q, v_uid, v_n, v_start + 7 * (v_n - 1), trim(v_lesson->>'title'), 'lesson');
    end loop;
  end loop;

  if v_n = 0 then
    raise exception 'A quarter needs at least one lesson';
  end if;

  v_end := v_start + 7 * (v_n - 1);

  if coalesce((p->>'sharing_day')::boolean, false) then
    insert into public.lessons (quarter_id, unit_id, lesson_number, lesson_date, title, kind)
    values (v_q, null, null, v_start + 7 * v_n, 'Sharing & Admonition', 'sharing');
    v_end := v_start + 7 * v_n;
  end if;

  if exists (
    select 1 from public.quarters x
    where x.id <> v_q and x.starts_on <= v_end and x.ends_on >= v_start
  ) then
    raise exception 'These dates overlap another quarter';
  end if;

  update public.quarters set ends_on = v_end where id = v_q;
  return v_q;
end $$;
