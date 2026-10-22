-- 007_fix_role_checks.sql
-- Run after 006. Safe to run more than once.
--
-- Migrations 002, 004 and 006 checked for a role called 'admin' or 'office', but your
-- database calls them 'assembly_admin' and 'church_secretary' and already has helper
-- functions for them (is_admin, is_office, is_platform_admin). This points my three
-- permission checks at those same helpers, so the database and the app agree.
--
--   Curriculum edits ........ platform admin or any assembly admin
--   Order of service edits .. your is_office rule (assembly admin or church secretary)
--   Deleting a service ...... your is_admin rule (assembly admin or platform admin)

create or replace function public.is_curriculum_admin() returns boolean
language plpgsql stable security definer set search_path = public as $$
begin
  return public.is_platform_admin() or exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid() and ur.role::text = 'assembly_admin'
  );
end $$;

create or replace function public.can_edit_service_order(p_assembly uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
begin
  return public.is_office(p_assembly);
end $$;

create or replace function public.service_delete_preview(p_service uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_assembly uuid;
begin
  select assembly_id into v_assembly from public.services where id = p_service;
  if v_assembly is null then
    raise exception 'Service not found';
  end if;
  if not public.is_admin(v_assembly) then
    raise exception 'Only an admin can delete a service';
  end if;

  return jsonb_build_object(
    'checkins',       (select count(*) from public.member_checkins where service_id = p_service),
    'child_checkins', (select count(*) from public.child_checkins where service_id = p_service),
    'headcount',      (select count(*) from public.service_attendance_counts where service_id = p_service),
    'income_active',  (select count(*) from public.service_income_entries where service_id = p_service and status::text <> 'voided'),
    'income_voided',  (select count(*) from public.service_income_entries where service_id = p_service and status::text = 'voided'),
    'order_items',    (select count(*) from public.service_order_items where service_id = p_service)
  );
end $$;
