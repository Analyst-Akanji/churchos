-- 005_my_assignments.sql
-- Run after 004_service_order.sql.
--
-- Lets a signed-in member see the parts of an upcoming service they are taking:
-- moderating, or any item in the order of service. It returns only the caller's own
-- rows, and only from orders that have been published, so drafts stay private.
-- It runs with elevated rights on purpose, so it works whatever your read rules on
-- services are, but it can never return anyone else's assignments.

create or replace function public.my_service_assignments()
returns table (
  service_id    uuid,
  service_date  date,
  starts_at     timestamptz,
  theme_line    text,
  role_title    text,
  is_moderator  boolean,
  start_time    time,
  end_time      time,
  minutes       smallint,
  sort_order    smallint
)
language sql stable security definer set search_path = public as $$
  with me as (
    select m.id from public.members m
    where m.user_id = auth.uid() and m.removed_at is null
  ),
  upcoming as (
    select s.* from public.services s
    where s.order_published
      and s.service_date >= (now() at time zone 'Africa/Lagos')::date
  )
  select u.id as service_id, u.service_date, u.starts_at, u.theme_line,
         'Moderator'::text as role_title, true as is_moderator,
         null::time as start_time, null::time as end_time,
         null::smallint as minutes, 0::smallint as sort_order
    from upcoming u
   where u.moderator_member_id in (select id from me)
  union all
  select u.id, u.service_date, u.starts_at, u.theme_line,
         i.title, false, i.start_time, i.end_time, i.minutes, i.sort_order
    from upcoming u
    join public.service_order_items i on i.service_id = u.id
   where i.kind = 'item'
     and i.assignee_member_id in (select id from me)
  order by service_date, sort_order
$$;

revoke all on function public.my_service_assignments() from public, anon;
grant execute on function public.my_service_assignments() to authenticated;
