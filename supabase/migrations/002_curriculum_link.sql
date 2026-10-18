-- 002_curriculum_link.sql
--
-- Run AFTER 001_quarters_and_lessons.sql, which you have already run.
-- It touches only the three curriculum tables from 001 and adds one trigger on
-- ss_sessions. It does not change ss_quarters, ss_attendance, ss_scores,
-- ss_offerings, user_roles or weekly_programme.

-- ---------------------------------------------------------------------------
-- 1. Rename the curriculum tables so they cannot be mistaken for ss_quarters.
--    Each rename runs only if the table still has the shape created by 001.
-- ---------------------------------------------------------------------------

do $$
begin
  if to_regclass('public.curriculum_quarters') is null
     and exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'quarters' and column_name = 'theme') then
    alter table public.quarters rename to curriculum_quarters;
  end if;

  if to_regclass('public.curriculum_units') is null
     and exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'units' and column_name = 'unit_number') then
    alter table public.units rename to curriculum_units;
  end if;

  if to_regclass('public.curriculum_lessons') is null
     and exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'lessons' and column_name = 'lesson_date') then
    alter table public.lessons rename to curriculum_lessons;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Who may edit the curriculum. It is shared by every assembly, so for now only
--    a user with the 'admin' role in user_roles can change it. Everyone can read it.
-- ---------------------------------------------------------------------------

create or replace function public.is_curriculum_admin() returns boolean
language plpgsql stable security definer set search_path = public as $$
begin
  return exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid() and ur.role::text = 'admin'
  );
end $$;

drop policy if exists "curriculum quarters admin insert" on public.curriculum_quarters;
create policy "curriculum quarters admin insert" on public.curriculum_quarters
  for insert to authenticated with check (public.is_curriculum_admin());
drop policy if exists "curriculum quarters admin update" on public.curriculum_quarters;
create policy "curriculum quarters admin update" on public.curriculum_quarters
  for update to authenticated using (public.is_curriculum_admin()) with check (public.is_curriculum_admin());
drop policy if exists "curriculum quarters admin delete" on public.curriculum_quarters;
create policy "curriculum quarters admin delete" on public.curriculum_quarters
  for delete to authenticated using (public.is_curriculum_admin());

drop policy if exists "curriculum units admin insert" on public.curriculum_units;
create policy "curriculum units admin insert" on public.curriculum_units
  for insert to authenticated with check (public.is_curriculum_admin());
drop policy if exists "curriculum units admin update" on public.curriculum_units;
create policy "curriculum units admin update" on public.curriculum_units
  for update to authenticated using (public.is_curriculum_admin()) with check (public.is_curriculum_admin());
drop policy if exists "curriculum units admin delete" on public.curriculum_units;
create policy "curriculum units admin delete" on public.curriculum_units
  for delete to authenticated using (public.is_curriculum_admin());

drop policy if exists "curriculum lessons admin insert" on public.curriculum_lessons;
create policy "curriculum lessons admin insert" on public.curriculum_lessons
  for insert to authenticated with check (public.is_curriculum_admin());
drop policy if exists "curriculum lessons admin update" on public.curriculum_lessons;
create policy "curriculum lessons admin update" on public.curriculum_lessons
  for update to authenticated using (public.is_curriculum_admin()) with check (public.is_curriculum_admin());
drop policy if exists "curriculum lessons admin delete" on public.curriculum_lessons;
create policy "curriculum lessons admin delete" on public.curriculum_lessons
  for delete to authenticated using (public.is_curriculum_admin());

-- ---------------------------------------------------------------------------
-- 3. Build a whole quarter in one step.
--    Payload: { "quarter_number": 2, "title": "2nd Quarter", "theme": "...",
--               "starts_on": "2026-12-06", "sharing_day": true,
--               "units": [ { "unit_number": 1, "title": "...", "lessons": [ { "title": "..." } ] } ] }
--    Lessons are dated one Sunday apart from starts_on, in the order given. With
--    sharing_day true, the Sunday after the last lesson is Sharing & Admonition.
-- ---------------------------------------------------------------------------

drop function if exists public.create_curriculum_quarter(jsonb);
create function public.create_curriculum_quarter(p jsonb) returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  v_start  date := (p->>'starts_on')::date;
  v_end    date;
  v_q      uuid;
  v_unit   jsonb;
  v_uid    uuid;
  v_lesson jsonb;
  v_n      integer := 0;
begin
  if v_start is null or extract(dow from v_start) <> 0 then
    raise exception 'A quarter must start on a Sunday';
  end if;
  if trim(coalesce(p->>'theme', '')) = '' then
    raise exception 'The quarter needs a theme';
  end if;

  insert into public.curriculum_quarters (quarter_number, title, theme, starts_on, ends_on)
  values ((p->>'quarter_number')::smallint, trim(p->>'title'), trim(p->>'theme'), v_start, v_start)
  returning id into v_q;

  for v_unit in select value from jsonb_array_elements(coalesce(p->'units', '[]'::jsonb)) loop
    if trim(coalesce(v_unit->>'title', '')) = '' then
      raise exception 'Every unit needs a title';
    end if;
    insert into public.curriculum_units (quarter_id, unit_number, title)
    values (v_q, (v_unit->>'unit_number')::smallint, trim(v_unit->>'title'))
    returning id into v_uid;

    for v_lesson in select value from jsonb_array_elements(coalesce(v_unit->'lessons', '[]'::jsonb)) loop
      if trim(coalesce(v_lesson->>'title', '')) = '' then
        raise exception 'Every lesson needs a title';
      end if;
      v_n := v_n + 1;
      insert into public.curriculum_lessons (quarter_id, unit_id, lesson_number, lesson_date, title, kind)
      values (v_q, v_uid, v_n, v_start + 7 * (v_n - 1), trim(v_lesson->>'title'), 'lesson');
    end loop;
  end loop;

  if v_n = 0 then
    raise exception 'A quarter needs at least one lesson';
  end if;

  v_end := v_start + 7 * (v_n - 1);

  if coalesce((p->>'sharing_day')::boolean, false) then
    insert into public.curriculum_lessons (quarter_id, unit_id, lesson_number, lesson_date, title, kind)
    values (v_q, null, null, v_start + 7 * v_n, 'Sharing & Admonition', 'sharing');
    v_end := v_start + 7 * v_n;
  end if;

  if exists (
    select 1 from public.curriculum_quarters x
    where x.id <> v_q and x.starts_on <= v_end and x.ends_on >= v_start
  ) then
    raise exception 'These dates overlap another quarter';
  end if;

  update public.curriculum_quarters set ends_on = v_end where id = v_q;
  return v_q;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Lesson headings on your existing register.
--    When a Sunday school session is created with no lesson title, fill it from
--    the curriculum using the session date. A title typed by hand is never replaced.
-- ---------------------------------------------------------------------------

create or replace function public.ss_sessions_fill_lesson_title() returns trigger
language plpgsql set search_path = public as $$
declare v_title text;
begin
  if new.lesson_title is null or trim(new.lesson_title) = '' then
    select l.title into v_title
    from public.curriculum_lessons l
    where l.lesson_date = new.session_date
    limit 1;
    if v_title is not null then
      new.lesson_title := v_title;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists ss_sessions_fill_lesson_title on public.ss_sessions;
create trigger ss_sessions_fill_lesson_title
  before insert on public.ss_sessions
  for each row execute function public.ss_sessions_fill_lesson_title();

-- OPTIONAL, run by hand if you want sessions that already exist to pick up titles.
-- It only fills blanks and never overwrites a title:
--
-- update public.ss_sessions s
--    set lesson_title = l.title
--   from public.curriculum_lessons l
--  where l.lesson_date = s.session_date
--    and (s.lesson_title is null or trim(s.lesson_title) = '');
