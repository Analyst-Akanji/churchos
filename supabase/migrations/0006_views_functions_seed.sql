-- =====================================================================
-- 0006 Views, functions, defaults seeding, audit + updated_at triggers,
-- public (anon) read-only views for the website.
-- =====================================================================

-- ---------- Sunday school scoring ----------
-- Points per student per session: auto criteria (attendance, on time) + hand-scored criteria
create view v_ss_session_points with (security_invoker = true) as
select a.assembly_id, a.session_id, a.class_id, a.enrollment_id,
  coalesce((
    select sum(case
             when c.source = 'attendance' and a.status = 'present'                    then c.max_points
             when c.source = 'on_time'    and a.status = 'present' and a.is_on_time    then c.max_points
             else 0 end)
      from ss_scoring_criteria c
     where c.assembly_id = a.assembly_id and c.is_active and c.source in ('attendance','on_time')
  ), 0)
  + coalesce((
    select sum(s.points)
      from ss_scores s join ss_scoring_criteria c on c.id = s.criterion_id and c.is_active
     where s.session_id = a.session_id and s.enrollment_id = a.enrollment_id
  ), 0) as points
from ss_attendance a;

-- Live leaderboard for staff. Ties share a rank; tie-break is sessions attended.
create view ss_leaderboard_live with (security_invoker = true) as
with pts as (
  select e.assembly_id, e.quarter_id, e.class_id, e.id as enrollment_id, e.member_id,
         coalesce(sum(p.points), 0)                     as total_points,
         count(*) filter (where a.status = 'present')   as sessions_present
    from ss_enrollments e
    left join ss_attendance a on a.enrollment_id = e.id
    left join v_ss_session_points p on p.session_id = a.session_id and p.enrollment_id = e.id
   where e.status = 'enrolled'
   group by e.assembly_id, e.quarter_id, e.class_id, e.id, e.member_id
)
select pts.*, m.first_name, m.last_name,
       dense_rank() over (partition by pts.quarter_id, pts.class_id
                          order by pts.total_points desc, pts.sessions_present desc) as rank
  from pts join members m on m.id = pts.member_id;

-- What students, parents and the congregation may see: top three only, first name + initial
create function ss_top_three(p_quarter_id uuid, p_class_id uuid)
returns table (rank bigint, display_name text, points numeric)
language plpgsql stable security definer set search_path = public as $$
declare q record;
begin
  select assembly_id, status into q from ss_quarters where id = p_quarter_id;
  if not found or not is_assembly_user(q.assembly_id) then return; end if;
  if q.status = 'closed' then
    return query
      select r.rank_in_class::bigint, m.first_name || ' ' || left(m.last_name, 1) || '.', r.total_points
        from ss_quarter_results r join members m on m.id = r.member_id
       where r.quarter_id = p_quarter_id and r.class_id = p_class_id and r.rank_in_class <= 3
       order by r.rank_in_class, m.first_name;
  else
    return query
      select l.rank, l.first_name || ' ' || left(l.last_name, 1) || '.', l.total_points
        from ss_leaderboard_live l
       where l.quarter_id = p_quarter_id and l.class_id = p_class_id and l.rank <= 3
       order by l.rank, l.first_name;
  end if;
end $$;

-- Superintendent dashboard
create view v_ss_session_summary with (security_invoker = true) as
select s.assembly_id, s.id as session_id, s.quarter_id, s.class_id, c.name as class_name,
       s.session_date, s.status,
       (select count(*) from ss_attendance a where a.session_id = s.id and a.status = 'present') as present_count,
       (select count(*) from ss_attendance a where a.session_id = s.id and a.status = 'absent')  as absent_count,
       (select count(*) from ss_visitors v where v.session_id = s.id and not v.is_returning)     as new_visitors,
       (select count(*) from ss_visitors v where v.session_id = s.id and v.is_returning)         as returning_visitors,
       coalesce((select sum(o.amount_kobo) from ss_offerings o where o.session_id = s.id and o.status <> 'voided'), 0) as offering_kobo
  from ss_sessions s join ss_classes c on c.id = s.class_id;

create view v_ss_daily_totals with (security_invoker = true) as
select assembly_id, quarter_id, session_date,
       sum(present_count) as present_count, sum(new_visitors + returning_visitors) as visitors,
       sum(offering_kobo) as offering_kobo, count(*) as classes_reported
  from v_ss_session_summary
 group by assembly_id, quarter_id, session_date;

-- Close a quarter: lock sessions, freeze results, grade and rank
create function close_ss_quarter(p_quarter_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare q ss_quarters%rowtype; per_session numeric;
begin
  select * into q from ss_quarters where id = p_quarter_id for update;
  if not found then raise exception 'Quarter not found'; end if;
  if not is_ss_lead(q.assembly_id) then raise exception 'Not authorised'; end if;
  if q.status = 'closed' then raise exception 'Quarter is already closed'; end if;

  update ss_sessions set status = 'locked', locked_at = now(), locked_by = auth.uid()
   where quarter_id = p_quarter_id and status <> 'locked';

  select coalesce(sum(max_points), 0) into per_session
    from ss_scoring_criteria where assembly_id = q.assembly_id and is_active;

  insert into ss_quarter_results (assembly_id, quarter_id, class_id, enrollment_id, member_id,
                                  sessions_held, sessions_present, total_points, max_points, percent, grade, rank_in_class)
  select l.assembly_id, l.quarter_id, l.class_id, l.enrollment_id, l.member_id,
         h.held, l.sessions_present, l.total_points,
         h.held * per_session,
         case when h.held * per_session > 0 then round(l.total_points / (h.held * per_session) * 100, 2) else 0 end,
         (select b.grade from ss_grade_bands b
           where b.assembly_id = l.assembly_id
             and b.min_percent <= case when h.held * per_session > 0 then l.total_points / (h.held * per_session) * 100 else 0 end
           order by b.min_percent desc limit 1),
         l.rank
    from ss_leaderboard_live l
    join lateral (select count(*)::int as held from ss_sessions s
                   where s.quarter_id = l.quarter_id and s.class_id = l.class_id) h on true
   where l.quarter_id = p_quarter_id
  on conflict (enrollment_id) do update
    set sessions_held = excluded.sessions_held, sessions_present = excluded.sessions_present,
        total_points = excluded.total_points, max_points = excluded.max_points,
        percent = excluded.percent, grade = excluded.grade, rank_in_class = excluded.rank_in_class;

  update ss_quarters set status = 'closed', closed_at = now(), closed_by = auth.uid() where id = p_quarter_id;
end $$;

-- ---------- Member care ----------
create view v_member_birthdays with (security_invoker = true) as
select m.assembly_id, m.id as member_id, m.first_name, m.last_name, m.date_of_birth,
       case when (date_trunc('year', current_date)::date + (m.date_of_birth - date_trunc('year', m.date_of_birth)::date)) >= current_date
            then  (date_trunc('year', current_date)::date + (m.date_of_birth - date_trunc('year', m.date_of_birth)::date))
            else ((date_trunc('year', current_date) + interval '1 year')::date + (m.date_of_birth - date_trunc('year', m.date_of_birth)::date))
       end as next_birthday
  from members m
 where m.date_of_birth is not null and m.status = 'active';

-- Active adults/youth with no VERIFIED check-in in the last N Sunday worship services
create function absentee_candidates(p_assembly uuid, p_missed integer default 2)
returns table (member_id uuid, last_seen date)
language sql stable as $$
  with recent as (
    select id from services
     where assembly_id = p_assembly and service_type = 'sunday_worship' and starts_at <= now()
     order by starts_at desc limit p_missed)
  select m.id, (select max(s.service_date) from member_checkins c join services s on s.id = c.service_id where c.member_id = m.id)
    from members m
   where m.assembly_id = p_assembly and m.status = 'active' and m.age_group <> 'child'
     and (select count(*) from recent) = p_missed
     and not exists (select 1 from member_checkins c where c.member_id = m.id and c.status = 'verified'
                      and c.service_id in (select id from recent))
$$;

-- Congregation prayer wall: anonymous requests only, no identity
create view v_prayer_wall as
select assembly_id, id, body, status, created_at
  from prayer_requests
 where visibility = 'congregation_anonymous' and status in ('open','praying');
alter view v_prayer_wall set (security_barrier = true);

-- ---------- Public website views (anon read, safe columns only) ----------
-- These intentionally run with owner rights; they expose only fields meant for the public site.
create view v_public_assemblies as
select a.id, a.slug, a.name, a.denomination, a.district, a.address, a.city, a.state, a.country,
       a.logo_url, a.contact_phone, a.contact_email
  from assemblies a where a.is_active;

create view v_public_services as
select s.assembly_id, s.id, s.service_type, s.title, s.starts_at, s.ends_at
  from services s join assemblies a on a.id = s.assembly_id
 where a.is_active and s.starts_at >= now() - interval '1 day' and s.status <> 'closed';

create view v_public_events as
select e.assembly_id, e.id, e.title, e.description, e.starts_at, e.ends_at, e.venue, e.registration_required
  from events e where e.is_public and coalesce(e.ends_at, e.starts_at) >= now();

create view v_public_sermons as
select s.assembly_id, s.id, s.title, s.preacher_name, s.text_used, s.summary, s.preached_on, s.audio_url, s.video_url
  from sermons s where s.is_public;

create view v_public_announcements as
select n.assembly_id, n.id, n.title, n.body, n.publish_at
  from announcements n
 where n.is_public and n.publish_at <= now() and (n.expires_at is null or n.expires_at > now());

grant select on v_public_assemblies, v_public_services, v_public_events, v_public_sermons, v_public_announcements to anon, authenticated;

-- ---------- Defaults for every new assembly ----------
create function seed_assembly_defaults() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into ss_scoring_criteria (assembly_id, code, label, source, max_points, sort_order) values
    (new.id, 'attendance',    'Attendance',          'attendance', 5, 1),
    (new.id, 'punctuality',   'Punctuality',         'on_time',    5, 2),
    (new.id, 'memory_verse',  'Memory verse',        'manual',    10, 3),
    (new.id, 'bible_reading', 'Bible reading',       'manual',     5, 4),
    (new.id, 'participation', 'Class participation', 'manual',     5, 5);
  insert into ss_grade_bands (assembly_id, grade, min_percent) values
    (new.id, 'A', 70), (new.id, 'B', 60), (new.id, 'C', 50), (new.id, 'D', 45), (new.id, 'E', 40), (new.id, 'F', 0);
  insert into funds (assembly_id, name, kind, allow_online_giving) values
    (new.id, 'Worship Offering',        'worship_offering', true),
    (new.id, 'Thanksgiving Offering',   'thanksgiving',     true),
    (new.id, 'Tithe',                   'tithe',            true),
    (new.id, 'Special Offering/Funds',  'special',          true),
    (new.id, 'Sunday School Offering',  'sunday_school',    false);
  return new;
end $$;
create trigger assemblies_seed after insert on assemblies
  for each row execute function seed_assembly_defaults();

-- ---------- audit trail on sensitive tables ----------
create trigger audit_members      after insert or update or delete on members                for each row execute function audit_row();
create trigger audit_user_roles   after insert or update or delete on user_roles             for each row execute function audit_row();
create trigger audit_ss_offerings after insert or update or delete on ss_offerings          for each row execute function audit_row();
create trigger audit_income       after insert or update or delete on service_income_entries for each row execute function audit_row();
create trigger audit_gifts        after insert or update or delete on gifts                  for each row execute function audit_row();
create trigger audit_ss_sessions  after update or delete on ss_sessions                      for each row execute function audit_row();
create trigger audit_criteria     after insert or update or delete on ss_scoring_criteria    for each row execute function audit_row();
create trigger audit_funds        after insert or update or delete on funds                  for each row execute function audit_row();

-- ---------- updated_at on every table that has the column ----------
do $$ declare t text;
begin
  for t in select c.table_name from information_schema.columns c
             join information_schema.tables x on x.table_schema = c.table_schema and x.table_name = c.table_name
            where c.table_schema = 'public' and c.column_name = 'updated_at' and x.table_type = 'BASE TABLE' loop
    execute format('create trigger trg_%1$s_updated_at before update on %1$I for each row execute function set_updated_at()', t);
  end loop;
end $$;

-- ---------- scheduled jobs (enable pg_cron in Supabase, then run once) ----------
-- select cron.schedule('purge-checkin-coordinates', '30 2 * * *', $$select purge_checkin_coordinates(30)$$);
