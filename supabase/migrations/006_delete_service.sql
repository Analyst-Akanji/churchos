-- 006_delete_service.sql
-- Run after 005.
--
-- A safe way for an admin to delete a service, such as one created for testing.
--   * Only a user with the 'admin' role for that assembly can do it.
--   * It refuses if the service still has income entries that are recorded or verified.
--     Money records are never deleted silently: void them first on the Income tab.
--   * Everything else attached to the service goes with it: check-ins, child check-ins,
--     headcount, check-in tokens, voided income entries and the order of service.
--   * service_delete_preview tells the screen exactly what will be removed, so the
--     confirmation can show it before anything happens.

create or replace function public.service_delete_preview(p_service uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_assembly uuid;
begin
  select assembly_id into v_assembly from public.services where id = p_service;
  if v_assembly is null then
    raise exception 'Service not found';
  end if;
  if not exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid() and ur.assembly_id = v_assembly and ur.role::text = 'admin'
  ) then
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

create or replace function public.delete_service(p_service uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v jsonb;
begin
  v := public.service_delete_preview(p_service); -- also checks the caller is an admin
  if (v->>'income_active')::int > 0 then
    raise exception 'This service has % income entries that are not voided. Void them on the Income tab first.', v->>'income_active';
  end if;

  delete from public.member_checkins          where service_id = p_service;
  delete from public.child_checkins           where service_id = p_service;
  delete from public.service_attendance_counts where service_id = p_service;
  delete from public.assembly_checkin_tokens  where service_id = p_service;
  delete from public.service_income_entries   where service_id = p_service;
  delete from public.services                 where id = p_service;
  return v;
end $$;

revoke all on function public.service_delete_preview(uuid) from public, anon;
revoke all on function public.delete_service(uuid) from public, anon;
grant execute on function public.service_delete_preview(uuid) to authenticated;
grant execute on function public.delete_service(uuid) to authenticated;
