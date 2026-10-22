-- 004_service_order.sql
--
-- The order of service for a Sunday: moderator, theme line, and the timed items,
-- each taken by a member or a group (Choir, Pastor). It hangs off your existing
-- services table. weekly_programme is not touched.
--
-- Run after 003. Needs these existing tables: services, members, assemblies,
-- user_roles, and curriculum_lessons from 001/002.

-- ---------------------------------------------------------------------------
-- 1. New columns on services (all optional, so nothing existing is affected)
-- ---------------------------------------------------------------------------

alter table public.services
  add column if not exists moderator_member_id uuid references public.members(id) on delete set null,
  add column if not exists moderator_label     text,
  add column if not exists theme_line          text,
  add column if not exists order_starts_at     time not null default '08:00',
  add column if not exists order_published     boolean not null default false;

-- ---------------------------------------------------------------------------
-- 2. Who may edit an order of service.
--    If your church office uses a role name other than 'admin' or 'office' in
--    user_roles, change it in this one function and nothing else.
-- ---------------------------------------------------------------------------

create or replace function public.can_edit_service_order(p_assembly uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
begin
  return exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.assembly_id = p_assembly
      and ur.role::text in ('admin', 'office')
  );
end $$;

-- ---------------------------------------------------------------------------
-- 3. The items
--    kind 'item'    : a timed part of the service. Its start is when the previous
--                     item ended; its end is start plus minutes.
--    kind 'heading' : a section such as Sunday Worship that contains the items
--                     after it. It does not move the clock; end_time is only shown.
-- ---------------------------------------------------------------------------

create table if not exists public.service_order_items (
  id                 uuid primary key default gen_random_uuid(),
  assembly_id        uuid not null references public.assemblies(id) on delete cascade,
  service_id         uuid not null references public.services(id) on delete cascade,
  sort_order         smallint not null,
  kind               text not null default 'item' check (kind in ('item', 'heading')),
  title              text not null,
  minutes            smallint check (minutes is null or minutes > 0),
  start_time         time,
  end_time           time,
  assignee_member_id uuid references public.members(id) on delete set null,
  assignee_label     text,
  note               text,
  created_at         timestamptz not null default now(),
  constraint service_order_items_sort_key unique (service_id, sort_order)
);

create index if not exists service_order_items_service_idx on public.service_order_items (service_id);

alter table public.service_order_items enable row level security;

drop policy if exists "order items read" on public.service_order_items;
create policy "order items read" on public.service_order_items
  for select to authenticated
  using (
    public.can_edit_service_order(assembly_id)
    or exists (select 1 from public.services s where s.id = service_id and s.order_published)
  );

drop policy if exists "order items insert" on public.service_order_items;
create policy "order items insert" on public.service_order_items
  for insert to authenticated with check (public.can_edit_service_order(assembly_id));

drop policy if exists "order items update" on public.service_order_items;
create policy "order items update" on public.service_order_items
  for update to authenticated
  using (public.can_edit_service_order(assembly_id))
  with check (public.can_edit_service_order(assembly_id));

drop policy if exists "order items delete" on public.service_order_items;
create policy "order items delete" on public.service_order_items
  for delete to authenticated using (public.can_edit_service_order(assembly_id));

-- ---------------------------------------------------------------------------
-- 4. Save a whole order of service in one step, working out every start and end time.
--    Payload: { "moderator_member_id": uuid|"", "moderator_label": "", "theme_line": "",
--               "order_starts_at": "08:00", "order_published": true,
--               "items": [ { "kind": "item"|"heading", "title": "", "minutes": 10,
--                            "end_time": "12:00", "assignee_member_id": uuid|"",
--                            "assignee_label": "", "note": "" } ] }
-- ---------------------------------------------------------------------------

drop function if exists public.save_service_order(uuid, jsonb);
create function public.save_service_order(p_service uuid, p jsonb) returns integer
language plpgsql security invoker set search_path = public as $$
declare
  v_assembly uuid;
  v_rows     integer;
  v_start    time := coalesce(nullif(p->>'order_starts_at', '')::time, time '08:00');
  v_clock    time := coalesce(nullif(p->>'order_starts_at', '')::time, time '08:00');
  v_item     jsonb;
  v_kind     text;
  v_min      integer;
  v_from     time;
  v_to       time;
  v_pos      integer := 0;
begin
  select assembly_id into v_assembly from public.services where id = p_service;
  if v_assembly is null then
    raise exception 'Service not found';
  end if;

  update public.services
     set moderator_member_id = nullif(p->>'moderator_member_id', '')::uuid,
         moderator_label     = nullif(trim(coalesce(p->>'moderator_label', '')), ''),
         theme_line          = nullif(trim(coalesce(p->>'theme_line', '')), ''),
         order_starts_at     = v_start,
         order_published     = coalesce((p->>'order_published')::boolean, false)
   where id = p_service;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    raise exception 'Nothing was saved. You may not have permission to change this service.';
  end if;

  delete from public.service_order_items where service_id = p_service;

  for v_item in
    select t.v from jsonb_array_elements(coalesce(p->'items', '[]'::jsonb)) with ordinality as t(v, n) order by t.n
  loop
    if trim(coalesce(v_item->>'title', '')) = '' then
      continue;
    end if;
    v_pos  := v_pos + 1;
    v_kind := case when v_item->>'kind' = 'heading' then 'heading' else 'item' end;
    v_min  := nullif(v_item->>'minutes', '')::integer;
    v_from := v_clock;

    if v_kind = 'heading' then
      v_min := null;
      v_to  := nullif(v_item->>'end_time', '')::time;
    elsif v_min is not null then
      v_to    := v_clock + make_interval(mins => v_min);
      v_clock := v_to;
    else
      v_to := null;
    end if;

    insert into public.service_order_items
      (assembly_id, service_id, sort_order, kind, title, minutes, start_time, end_time,
       assignee_member_id, assignee_label, note)
    values
      (v_assembly, p_service, v_pos, v_kind, trim(v_item->>'title'), v_min, v_from, v_to,
       nullif(v_item->>'assignee_member_id', '')::uuid,
       nullif(trim(coalesce(v_item->>'assignee_label', '')), ''),
       nullif(trim(coalesce(v_item->>'note', '')), ''));
  end loop;

  return v_pos;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Start a new service's order from the last one of the same type, or from the
--    standard Sunday order if there is none. Keeps titles, minutes, group names
--    (Choir, Pastor) and the theme line. Clears the moderator and member names so
--    they are chosen fresh. Does nothing if the service already has an order.
-- ---------------------------------------------------------------------------

drop function if exists public.create_service_order_from_previous(uuid);
create function public.create_service_order_from_previous(p_service uuid) returns integer
language plpgsql security invoker set search_path = public as $$
declare
  v_svc     public.services%rowtype;
  v_prev    uuid;
  v_items   jsonb;
  v_theme   text;
  v_starts  time;
begin
  select * into v_svc from public.services where id = p_service;
  if v_svc.id is null then
    raise exception 'Service not found';
  end if;
  if exists (select 1 from public.service_order_items where service_id = p_service) then
    return 0;
  end if;

  select s.id, s.theme_line, s.order_starts_at into v_prev, v_theme, v_starts
  from public.services s
  where s.assembly_id = v_svc.assembly_id
    and s.service_type = v_svc.service_type
    and s.starts_at < v_svc.starts_at
    and exists (select 1 from public.service_order_items i where i.service_id = s.id)
  order by s.starts_at desc
  limit 1;

  if v_prev is not null then
    select coalesce(jsonb_agg(jsonb_build_object(
             'kind', i.kind, 'title', i.title, 'minutes', i.minutes,
             'end_time', i.end_time, 'assignee_label', i.assignee_label, 'note', i.note
           ) order by i.sort_order), '[]'::jsonb)
      into v_items
      from public.service_order_items i
     where i.service_id = v_prev;
  else
    v_starts := time '08:00';
    v_items := jsonb_build_array(
      jsonb_build_object('title', 'Morning Tonic', 'minutes', 20),
      jsonb_build_object('title', 'Sunday School', 'minutes', 70, 'assignee_label', 'General Superintendent'),
      jsonb_build_object('kind', 'heading', 'title', 'Sunday Worship', 'end_time', '12:00'),
      jsonb_build_object('title', 'Opening Hymns', 'minutes', 10, 'assignee_label', 'Choir'),
      jsonb_build_object('title', 'Praise & Worship', 'minutes', 15, 'assignee_label', 'Choir'),
      jsonb_build_object('title', 'Corporate Prayers', 'minutes', 15),
      jsonb_build_object('title', 'Pastors Welfare Offering', 'minutes', 10),
      jsonb_build_object('title', 'Women Ministry Mobilization'),
      jsonb_build_object('title', 'Announcements', 'minutes', 10),
      jsonb_build_object('title', 'Choir Ministration', 'minutes', 10, 'assignee_label', 'Choir'),
      jsonb_build_object('title', 'Convention Teaching', 'minutes', 40),
      jsonb_build_object('title', 'Closing Prayers and Benediction', 'minutes', 5, 'assignee_label', 'Pastor')
    );
  end if;

  return public.save_service_order(p_service, jsonb_build_object(
    'theme_line', v_theme,
    'order_starts_at', to_char(coalesce(v_starts, time '08:00'), 'HH24:MI'),
    'order_published', false,
    'items', v_items
  ));
end $$;

-- ---------------------------------------------------------------------------
-- 6. The public view: published orders for today and later. Shows names only
--    (Bro./Sis. plus first and last name), never contact details.
--    Matches how your other v_public_* views are used by the website.
-- ---------------------------------------------------------------------------

create or replace function public.church_display_name(p_first text, p_last text, p_gender text) returns text
language sql immutable as $$
  select nullif(trim(concat(
    case lower(coalesce(p_gender, '')) when 'male' then 'Bro. ' when 'female' then 'Sis. ' else '' end,
    p_first, ' ', p_last)), '')
$$;

create or replace view public.v_public_order_of_service with (security_barrier = true) as
select
  i.id,
  s.assembly_id,
  s.id           as service_id,
  s.service_date,
  s.starts_at,
  s.title        as service_title,
  s.theme_line,
  coalesce(
    public.church_display_name(mm.first_name, mm.last_name, mm.gender::text),
    nullif(trim(s.moderator_label), '')
  )              as moderator,
  i.sort_order,
  i.kind,
  i.title,
  i.minutes,
  i.start_time,
  i.end_time,
  i.note,
  coalesce(
    public.church_display_name(am.first_name, am.last_name, am.gender::text),
    nullif(trim(i.assignee_label), '')
  )              as assignee,
  case when i.title ilike 'sunday school%' then
    (select l.title from public.curriculum_lessons l where l.lesson_date = s.service_date limit 1)
  end            as lesson_title
from public.services s
join public.service_order_items i on i.service_id = s.id
left join public.members mm on mm.id = s.moderator_member_id
left join public.members am on am.id = i.assignee_member_id
where s.order_published
  and s.service_date >= (now() at time zone 'Africa/Lagos')::date;

grant select on public.v_public_order_of_service to anon, authenticated;
