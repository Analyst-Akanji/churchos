-- 003_edit_curriculum_quarter.sql
-- Run after 002_curriculum_link.sql.
--
-- Lets an admin change a curriculum quarter after it is created: title, theme,
-- start date, units, lessons, adding or removing lessons, and the closing Sharing
-- & Admonition Sunday. Nothing in your register points at these rows (sessions are
-- matched to lessons by date), so changing them is safe.
--
-- Sessions keep the lesson title they already have. Only sessions with a blank
-- title pick up a curriculum title.

drop function if exists public.save_curriculum_quarter(uuid, jsonb);
create function public.save_curriculum_quarter(p_quarter uuid, p jsonb) returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  v_start  date := (p->>'starts_on')::date;
  v_end    date;
  v_q      uuid := p_quarter;
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
  if trim(coalesce(p->>'title', '')) = '' then
    raise exception 'The quarter needs a title';
  end if;

  if v_q is null then
    insert into public.curriculum_quarters (quarter_number, title, theme, starts_on, ends_on)
    values ((p->>'quarter_number')::smallint, trim(p->>'title'), trim(p->>'theme'), v_start, v_start)
    returning id into v_q;
  else
    if not exists (select 1 from public.curriculum_quarters where id = v_q) then
      raise exception 'That quarter could not be found, or you do not have permission to change it';
    end if;
    -- Clear the old structure; it is rebuilt from the payload below.
    delete from public.curriculum_lessons where quarter_id = v_q;
    delete from public.curriculum_units   where quarter_id = v_q;
    update public.curriculum_quarters
       set quarter_number = (p->>'quarter_number')::smallint,
           title = trim(p->>'title'), theme = trim(p->>'theme'), starts_on = v_start, ends_on = v_start
     where id = v_q;
  end if;

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

-- Creating a quarter now goes through the same function.
create or replace function public.create_curriculum_quarter(p jsonb) returns uuid
language sql security invoker set search_path = public as $$
  select public.save_curriculum_quarter(null, p)
$$;
