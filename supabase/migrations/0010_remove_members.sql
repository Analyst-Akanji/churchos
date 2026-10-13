-- =====================================================================
-- 0010 Removing a member who should no longer be part of the church.
--   remove_member       : archives the record, ends every kind of access, blocks the login
--   restore_member      : reverses a removal
--   delete_member_permanently : only for records with no history (duplicates, mistakes)
-- Only an assembly administrator can do any of these, and never to themselves.
-- History (attendance, points, offerings) is kept for removed members so past records stay correct.
-- =====================================================================

alter table members
  add column removed_at timestamptz,
  add column removed_by uuid references auth.users(id),
  add column removal_reason text;

-- A removed person is no longer an assembly user, staff member or parent.
create or replace function is_assembly_user(p_assembly uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_platform_admin()
      or exists (select 1 from user_roles where assembly_id = p_assembly and user_id = auth.uid())
      or exists (select 1 from members where assembly_id = p_assembly and user_id = auth.uid() and status <> 'archived')
$$;

create or replace function my_own_member_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select id from members where user_id = auth.uid() and status <> 'archived'
$$;

create or replace function my_member_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select id from members where user_id = auth.uid() and status <> 'archived'
  union
  select g.child_member_id from member_guardians g
    join members gm on gm.id = g.guardian_member_id
   where gm.user_id = auth.uid() and gm.status <> 'archived'
$$;

create or replace function is_any_class_staff(p_assembly uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from ss_class_staff cs join members m on m.id = cs.member_id
     where cs.assembly_id = p_assembly and cs.is_active and m.user_id = auth.uid() and m.status <> 'archived')
$$;

create or replace function is_ss_class_staff(p_class uuid, p_roles text[] default null) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from ss_class_staff cs join members m on m.id = cs.member_id
     where cs.class_id = p_class and cs.is_active and m.user_id = auth.uid() and m.status <> 'archived'
       and (p_roles is null or cs.staff_role::text = any (p_roles)))
$$;

-- A signed-in person can always read their own record, so the app can tell them their access was removed.
create policy members_select_self on members for select to authenticated using (user_id = auth.uid());

create function remove_member(p_member uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare m members%rowtype;
begin
  select * into m from members where id = p_member for update;
  if not found then raise exception 'Member not found'; end if;
  if not is_admin(m.assembly_id) then raise exception 'Only an assembly administrator can remove a member'; end if;
  if m.user_id is not null and m.user_id = auth.uid() then raise exception 'You cannot remove your own record'; end if;
  if m.status = 'archived' then raise exception 'This member has already been removed'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'Please give a reason for the removal'; end if;

  update members set status = 'archived', removed_at = now(), removed_by = auth.uid(), removal_reason = btrim(p_reason) where id = p_member;

  if m.user_id is not null then
    delete from user_roles where assembly_id = m.assembly_id and user_id = m.user_id;
    begin   -- block sign-in (GoTrue honours banned_until)
      update auth.users set banned_until = now() + interval '100 years' where id = m.user_id;
    exception when undefined_column then null; end;
  end if;
  update ss_class_staff set is_active = false where member_id = p_member;
  update ss_enrollments e set status = 'withdrawn' from ss_quarters q
   where e.quarter_id = q.id and q.status <> 'closed' and e.member_id = p_member and e.status = 'enrolled';
  delete from member_positions where member_id = p_member;
  delete from department_members where member_id = p_member;
  update departments set head_member_id = null where head_member_id = p_member;
  update member_invites set expires_at = now() where member_id = p_member and claimed_at is null;
end $$;

create function restore_member(p_member uuid) returns void
language plpgsql security definer set search_path = public as $$
declare m members%rowtype;
begin
  select * into m from members where id = p_member for update;
  if not found or not is_admin(m.assembly_id) then raise exception 'Not authorised'; end if;
  if m.status <> 'archived' then raise exception 'This member is not removed'; end if;
  update members set status = 'active', removed_at = null, removed_by = null, removal_reason = null where id = p_member;
  if m.user_id is not null then
    insert into user_roles (assembly_id, user_id, role) values (m.assembly_id, m.user_id, 'member') on conflict do nothing;
    begin update auth.users set banned_until = null where id = m.user_id; exception when undefined_column then null; end;
  end if;
end $$;

-- Permanent deletion is only for records that never took part in anything.
create function delete_member_permanently(p_member uuid) returns void
language plpgsql security definer set search_path = public as $$
declare m members%rowtype;
begin
  select * into m from members where id = p_member for update;
  if not found or not is_admin(m.assembly_id) then raise exception 'Not authorised'; end if;
  if m.user_id is not null and m.user_id = auth.uid() then raise exception 'You cannot delete your own record'; end if;
  if m.status <> 'archived' then raise exception 'Remove the member first, then delete permanently'; end if;
  if exists (select 1 from ss_enrollments where member_id = p_member)
     or exists (select 1 from member_checkins where member_id = p_member)
     or exists (select 1 from ss_quarter_results where member_id = p_member)
     or exists (select 1 from gifts where member_id = p_member)
     or exists (select 1 from service_income_entries where collector_member_id = p_member or witness_member_id = p_member)
     or exists (select 1 from child_checkins where child_member_id = p_member)
     or exists (select 1 from event_registrations where member_id = p_member)
     or exists (select 1 from prayer_requests where member_id = p_member) then
    raise exception 'This person has attendance, Sunday school or giving history. Keep them as removed so past records stay accurate.';
  end if;
  delete from registration_requests where member_id = p_member;
  delete from members where id = p_member;
  if m.user_id is not null then delete from auth.users where id = m.user_id; end if;
end $$;

revoke all on function remove_member(uuid, text), restore_member(uuid), delete_member_permanently(uuid) from public, anon;
grant execute on function remove_member(uuid, text), restore_member(uuid), delete_member_permanently(uuid) to authenticated;
