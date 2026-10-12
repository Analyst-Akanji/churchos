-- =====================================================================
-- 0005 Security: role helpers + Row Level Security on every table.
-- Default is deny: a table with RLS enabled and no policy returns nothing.
-- No DELETE policies exist anywhere. Records are voided/archived, not erased.
-- Privileged server jobs (payments webhook, QR rotation) use the service role.
-- =====================================================================

-- ---------- helpers (SECURITY DEFINER so policies don't recurse) ----------
create function is_platform_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from platform_admins where user_id = auth.uid())
$$;

create function has_assembly_role(p_assembly uuid, p_roles user_role[]) returns boolean
language sql stable security definer set search_path = public as $$
  select is_platform_admin() or exists (
    select 1 from user_roles ur
     where ur.assembly_id = p_assembly and ur.user_id = auth.uid() and ur.role = any (p_roles))
$$;

create function is_admin(p_assembly uuid) returns boolean
language sql stable as $$ select has_assembly_role(p_assembly, array['assembly_admin']::user_role[]) $$;

create function is_office(p_assembly uuid) returns boolean   -- admin or church secretary
language sql stable as $$ select has_assembly_role(p_assembly, array['assembly_admin','church_secretary']::user_role[]) $$;

create function is_finance(p_assembly uuid) returns boolean  -- admin or finance officer
language sql stable as $$ select has_assembly_role(p_assembly, array['assembly_admin','finance_officer']::user_role[]) $$;

create function is_ss_lead(p_assembly uuid) returns boolean  -- admin or Sunday school superintendent
language sql stable as $$ select has_assembly_role(p_assembly, array['assembly_admin','superintendent']::user_role[]) $$;

create function is_ss_class_staff(p_class uuid, p_roles text[] default null) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from ss_class_staff cs join members m on m.id = cs.member_id
     where cs.class_id = p_class and cs.is_active and m.user_id = auth.uid()
       and (p_roles is null or cs.staff_role::text = any (p_roles)))
$$;

create function is_any_class_staff(p_assembly uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from ss_class_staff cs join members m on m.id = cs.member_id
     where cs.assembly_id = p_assembly and cs.is_active and m.user_id = auth.uid())
$$;

create function is_assembly_user(p_assembly uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_platform_admin()
      or exists (select 1 from user_roles where assembly_id = p_assembly and user_id = auth.uid())
      or exists (select 1 from members   where assembly_id = p_assembly and user_id = auth.uid())
$$;

create function is_staff(p_assembly uuid) returns boolean   -- anyone with an operational role
language sql stable security definer set search_path = public as $$
  select is_platform_admin()
      or exists (select 1 from user_roles where assembly_id = p_assembly and user_id = auth.uid() and role <> 'member')
      or is_any_class_staff(p_assembly)
$$;

create function my_own_member_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select id from members where user_id = auth.uid()
$$;

create function my_member_ids() returns setof uuid       -- me + my wards (children)
language sql stable security definer set search_path = public as $$
  select id from members where user_id = auth.uid()
  union
  select g.child_member_id from member_guardians g
    join members gm on gm.id = g.guardian_member_id
   where gm.user_id = auth.uid()
$$;

create function ss_session_is_open(p_session uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from ss_sessions where id = p_session and status = 'open')
$$;

create function ss_enrollment_is_mine(p_enrollment uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from ss_enrollments e where e.id = p_enrollment and e.member_id in (select my_member_ids()))
$$;

create function is_department_head(p_department uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from departments d join members m on m.id = d.head_member_id
                  where d.id = p_department and m.user_id = auth.uid())
$$;

-- ---------- protect sensitive member columns from self-edit ----------
create function members_protect() returns trigger
language plpgsql as $$
begin
  if auth.uid() is null or is_admin(old.assembly_id) or is_office(old.assembly_id) then return new; end if;
  if new.assembly_id is distinct from old.assembly_id or new.user_id is distinct from old.user_id
     or new.status is distinct from old.status or new.member_no is distinct from old.member_no
     or new.join_date is distinct from old.join_date or new.age_group is distinct from old.age_group then
    raise exception 'You can only edit your contact details';
  end if;
  return new;
end $$;
create trigger members_protect_trg before update on members
  for each row execute function members_protect();

-- ---------- enable RLS on every table ----------
do $$ declare t text;
begin
  for t in select table_name from information_schema.tables
            where table_schema = 'public' and table_type = 'BASE TABLE' loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

-- ---------- tenants & people ----------
create policy assemblies_select on assemblies for select to authenticated using (is_assembly_user(id));
create policy assemblies_update on assemblies for update to authenticated using (is_admin(id)) with check (is_admin(id));
create policy assemblies_insert on assemblies for insert to authenticated with check (is_platform_admin());

create policy locations_select on assembly_locations for select to authenticated using (is_assembly_user(assembly_id));
create policy locations_write  on assembly_locations for all    to authenticated using (is_admin(assembly_id)) with check (is_admin(assembly_id));

create policy members_select on members for select to authenticated
  using (is_staff(assembly_id) or id in (select my_member_ids()));
create policy members_insert on members for insert to authenticated with check (is_office(assembly_id));
create policy members_update on members for update to authenticated
  using (is_office(assembly_id) or id in (select my_own_member_ids()))
  with check (is_office(assembly_id) or id in (select my_own_member_ids()));

create policy roles_select on user_roles for select to authenticated using (user_id = auth.uid() or is_admin(assembly_id));
create policy roles_write  on user_roles for all    to authenticated using (is_admin(assembly_id)) with check (is_admin(assembly_id));

create policy guardians_select on member_guardians for select to authenticated
  using (is_staff(assembly_id) or child_member_id in (select my_member_ids()) or guardian_member_id in (select my_own_member_ids()));
create policy guardians_write on member_guardians for all to authenticated using (is_office(assembly_id)) with check (is_office(assembly_id));

create policy invites_all on member_invites for all to authenticated using (is_office(assembly_id)) with check (is_office(assembly_id));

create policy audit_select on audit_log for select to authenticated using (is_admin(assembly_id) or is_finance(assembly_id));

-- ---------- Sunday school ----------
create policy ssq_select on ss_quarters for select to authenticated using (is_assembly_user(assembly_id));
create policy ssq_write  on ss_quarters for all    to authenticated using (is_ss_lead(assembly_id)) with check (is_ss_lead(assembly_id));

create policy ssc_select on ss_classes for select to authenticated using (is_assembly_user(assembly_id));
create policy ssc_write  on ss_classes for all    to authenticated using (is_ss_lead(assembly_id)) with check (is_ss_lead(assembly_id));

create policy sscs_select on ss_class_staff for select to authenticated using (is_assembly_user(assembly_id));
create policy sscs_write  on ss_class_staff for all    to authenticated using (is_ss_lead(assembly_id)) with check (is_ss_lead(assembly_id));

create policy sscr_select on ss_scoring_criteria for select to authenticated using (is_assembly_user(assembly_id));
create policy sscr_write  on ss_scoring_criteria for all    to authenticated using (is_ss_lead(assembly_id)) with check (is_ss_lead(assembly_id));

create policy ssgb_select on ss_grade_bands for select to authenticated using (is_assembly_user(assembly_id));
create policy ssgb_write  on ss_grade_bands for all    to authenticated using (is_ss_lead(assembly_id)) with check (is_ss_lead(assembly_id));

create policy sse_select on ss_enrollments for select to authenticated
  using (is_ss_lead(assembly_id) or is_ss_class_staff(class_id) or member_id in (select my_member_ids()));
create policy sse_insert on ss_enrollments for insert to authenticated
  with check (is_ss_lead(assembly_id) or is_ss_class_staff(class_id));
create policy sse_update on ss_enrollments for update to authenticated
  using (is_ss_lead(assembly_id) or is_ss_class_staff(class_id))
  with check (is_ss_lead(assembly_id) or is_ss_class_staff(class_id));

create policy sss_select on ss_sessions for select to authenticated using (is_assembly_user(assembly_id));
create policy sss_insert on ss_sessions for insert to authenticated
  with check (is_ss_lead(assembly_id) or is_ss_class_staff(class_id));
create policy sss_update on ss_sessions for update to authenticated
  using      (is_ss_lead(assembly_id) or (is_ss_class_staff(class_id) and status = 'open'))
  with check (is_ss_lead(assembly_id) or (is_ss_class_staff(class_id) and status in ('open','submitted')));

-- attendance, scores, visitors share one pattern
create policy ssa_select on ss_attendance for select to authenticated
  using (is_ss_lead(assembly_id) or is_ss_class_staff(class_id) or ss_enrollment_is_mine(enrollment_id));
create policy ssa_insert on ss_attendance for insert to authenticated
  with check (is_ss_lead(assembly_id) or (is_ss_class_staff(class_id) and ss_session_is_open(session_id)));
create policy ssa_update on ss_attendance for update to authenticated
  using (is_ss_lead(assembly_id) or (is_ss_class_staff(class_id) and ss_session_is_open(session_id)))
  with check (is_ss_lead(assembly_id) or (is_ss_class_staff(class_id) and ss_session_is_open(session_id)));

create policy ssx_select on ss_scores for select to authenticated
  using (is_ss_lead(assembly_id) or is_ss_class_staff(class_id) or ss_enrollment_is_mine(enrollment_id));
create policy ssx_insert on ss_scores for insert to authenticated
  with check (is_ss_lead(assembly_id) or (is_ss_class_staff(class_id) and ss_session_is_open(session_id)));
create policy ssx_update on ss_scores for update to authenticated
  using (is_ss_lead(assembly_id) or (is_ss_class_staff(class_id) and ss_session_is_open(session_id)))
  with check (is_ss_lead(assembly_id) or (is_ss_class_staff(class_id) and ss_session_is_open(session_id)));

create policy ssv_select on ss_visitors for select to authenticated
  using (is_ss_lead(assembly_id) or is_ss_class_staff(class_id));
create policy ssv_insert on ss_visitors for insert to authenticated
  with check (is_ss_lead(assembly_id) or (is_ss_class_staff(class_id) and ss_session_is_open(session_id)));
create policy ssv_update on ss_visitors for update to authenticated
  using (is_ss_lead(assembly_id) or (is_ss_class_staff(class_id) and ss_session_is_open(session_id)))
  with check (is_ss_lead(assembly_id) or (is_ss_class_staff(class_id) and ss_session_is_open(session_id)));

-- class offerings: only the class secretary, superintendent, finance and admin can see money
create policy sso_select on ss_offerings for select to authenticated
  using (is_ss_lead(assembly_id) or is_finance(assembly_id) or is_ss_class_staff(class_id, array['secretary']));
create policy sso_insert on ss_offerings for insert to authenticated
  with check (is_ss_lead(assembly_id) or (is_ss_class_staff(class_id, array['secretary']) and ss_session_is_open(session_id)));
create policy sso_update on ss_offerings for update to authenticated
  using (is_ss_lead(assembly_id) or is_finance(assembly_id)
         or (is_ss_class_staff(class_id, array['secretary']) and status = 'recorded' and ss_session_is_open(session_id)))
  with check (is_ss_lead(assembly_id) or is_finance(assembly_id)
         or (is_ss_class_staff(class_id, array['secretary']) and status = 'recorded'));

create policy ssqr_select on ss_quarter_results for select to authenticated
  using (is_ss_lead(assembly_id) or is_ss_class_staff(class_id) or member_id in (select my_member_ids()));

-- ---------- services, income, check-in ----------
create policy svc_select on services for select to authenticated using (is_assembly_user(assembly_id));
create policy svc_write  on services for all    to authenticated using (is_office(assembly_id)) with check (is_office(assembly_id));

create policy sac_select on service_attendance_counts for select to authenticated
  using (is_staff(assembly_id));
create policy sac_write on service_attendance_counts for all to authenticated
  using (has_assembly_role(assembly_id, array['assembly_admin','church_secretary','usher']::user_role[]))
  with check (has_assembly_role(assembly_id, array['assembly_admin','church_secretary','usher']::user_role[]));

create policy funds_select on funds for select to authenticated using (is_assembly_user(assembly_id));
create policy funds_write  on funds for all    to authenticated using (is_finance(assembly_id)) with check (is_finance(assembly_id));

create policy sie_select on service_income_entries for select to authenticated
  using (has_assembly_role(assembly_id, array['assembly_admin','church_secretary','finance_officer']::user_role[]));
create policy sie_insert on service_income_entries for insert to authenticated
  with check (has_assembly_role(assembly_id, array['assembly_admin','church_secretary','finance_officer']::user_role[]));
create policy sie_update on service_income_entries for update to authenticated
  using      (is_finance(assembly_id) or (is_office(assembly_id) and status = 'recorded'))
  with check (is_finance(assembly_id) or (is_office(assembly_id) and status = 'recorded'));

create policy tok_select on assembly_checkin_tokens for select to authenticated
  using (has_assembly_role(assembly_id, array['assembly_admin','church_secretary','usher']::user_role[]));

create policy chk_select on member_checkins for select to authenticated
  using (member_id in (select my_own_member_ids())
         or has_assembly_role(assembly_id, array['assembly_admin','church_secretary','usher','superintendent']::user_role[]));
create policy chk_insert on member_checkins for insert to authenticated
  with check ((member_id in (select my_own_member_ids()) and method in ('geofence','qr'))
              or has_assembly_role(assembly_id, array['assembly_admin','church_secretary','usher']::user_role[]));
create policy chk_update on member_checkins for update to authenticated
  using (has_assembly_role(assembly_id, array['assembly_admin','church_secretary','usher']::user_role[]))
  with check (has_assembly_role(assembly_id, array['assembly_admin','church_secretary','usher']::user_role[]));

create policy gifts_select on gifts for select to authenticated
  using (is_finance(assembly_id) or member_id in (select my_own_member_ids()));
create policy gifts_insert on gifts for insert to authenticated
  with check (is_finance(assembly_id) and channel <> 'online');   -- online gifts come from the payments webhook (service role)

-- ---------- community ----------
create policy ev_select on events for select to authenticated using (is_assembly_user(assembly_id));
create policy ev_write  on events for all    to authenticated using (is_office(assembly_id)) with check (is_office(assembly_id));

create policy evr_select on event_registrations for select to authenticated
  using (is_office(assembly_id) or member_id in (select my_own_member_ids()));
create policy evr_insert on event_registrations for insert to authenticated
  with check (is_office(assembly_id) or member_id in (select my_own_member_ids()));
create policy evr_update on event_registrations for update to authenticated
  using (is_office(assembly_id) or member_id in (select my_own_member_ids()))
  with check (is_office(assembly_id) or member_id in (select my_own_member_ids()));

create policy dep_select on departments for select to authenticated using (is_assembly_user(assembly_id));
create policy dep_write  on departments for all    to authenticated using (is_office(assembly_id)) with check (is_office(assembly_id));
create policy depm_select on department_members for select to authenticated using (is_assembly_user(assembly_id));
create policy depm_write  on department_members for all to authenticated
  using (is_office(assembly_id) or is_department_head(department_id))
  with check (is_office(assembly_id) or is_department_head(department_id));

create policy rota_select on rota_duties for select to authenticated using (is_assembly_user(assembly_id));
create policy rota_write  on rota_duties for all to authenticated
  using (is_office(assembly_id) or is_department_head(department_id))
  with check (is_office(assembly_id) or is_department_head(department_id));
create policy rota_respond on rota_duties for update to authenticated   -- a volunteer can confirm/decline their own duty
  using (member_id in (select my_own_member_ids())) with check (member_id in (select my_own_member_ids()));

create policy ann_select on announcements for select to authenticated
  using (is_assembly_user(assembly_id) and publish_at <= now() and (expires_at is null or expires_at > now()) or is_office(assembly_id));
create policy ann_write  on announcements for all to authenticated using (is_office(assembly_id)) with check (is_office(assembly_id));
create policy msg_select on message_log for select to authenticated using (is_office(assembly_id));

create policy pr_insert on prayer_requests for insert to authenticated
  with check (member_id in (select my_own_member_ids()) or member_id is null and is_assembly_user(assembly_id));
create policy pr_select on prayer_requests for select to authenticated
  using (member_id in (select my_own_member_ids()) or (is_admin(assembly_id) and visibility <> 'private'));
create policy pr_update on prayer_requests for update to authenticated
  using (member_id in (select my_own_member_ids()) or is_admin(assembly_id))
  with check (member_id in (select my_own_member_ids()) or is_admin(assembly_id));

create policy ser_select on sermons for select to authenticated using (is_assembly_user(assembly_id));
create policy ser_write  on sermons for all    to authenticated using (is_office(assembly_id)) with check (is_office(assembly_id));

create policy fu_select on follow_ups for select to authenticated
  using (is_office(assembly_id) or is_ss_lead(assembly_id) or assigned_to in (select my_own_member_ids()));
create policy fu_insert on follow_ups for insert to authenticated with check (is_office(assembly_id) or is_ss_lead(assembly_id));
create policy fu_update on follow_ups for update to authenticated
  using (is_office(assembly_id) or is_ss_lead(assembly_id) or assigned_to in (select my_own_member_ids()))
  with check (is_office(assembly_id) or is_ss_lead(assembly_id) or assigned_to in (select my_own_member_ids()));

create policy cc_select on child_checkins for select to authenticated
  using (is_staff(assembly_id) or child_member_id in (select my_member_ids()));
create policy cc_insert on child_checkins for insert to authenticated
  with check (has_assembly_role(assembly_id, array['assembly_admin','church_secretary','usher']::user_role[]) or is_any_class_staff(assembly_id));
create policy cc_update on child_checkins for update to authenticated
  using (has_assembly_role(assembly_id, array['assembly_admin','church_secretary','usher']::user_role[]) or is_any_class_staff(assembly_id))
  with check (has_assembly_role(assembly_id, array['assembly_admin','church_secretary','usher']::user_role[]) or is_any_class_staff(assembly_id));
