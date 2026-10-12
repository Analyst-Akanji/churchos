-- =====================================================================
-- 0007 App support + hardening (written as a new migration so 0001-0006
-- stay untouched once applied).
--   1. Offline-sync idempotency indexes made upsert-compatible
--   2. Remove accidental DELETE permission on records that must never be erased
--   3. Invite claiming (links a login to a member record)
-- =====================================================================

-- 1. PostgREST upserts need a full (non-partial) unique index to name in ON CONFLICT.
--    NULL client_id values never collide with each other, so this is safe.
drop index if exists ss_attendance_client_uq;
drop index if exists ss_scores_client_uq;
drop index if exists ss_visitors_client_uq;
drop index if exists ss_offerings_client_uq;
drop index if exists service_income_client_uq;
drop index if exists member_checkins_client_uq;
alter table ss_attendance          add constraint ss_attendance_client_uq          unique (assembly_id, client_id);
alter table ss_scores              add constraint ss_scores_client_uq              unique (assembly_id, client_id);
alter table ss_visitors            add constraint ss_visitors_client_uq            unique (assembly_id, client_id);
alter table ss_offerings           add constraint ss_offerings_client_uq           unique (assembly_id, client_id);
alter table service_income_entries add constraint service_income_client_uq        unique (assembly_id, client_id);
alter table member_checkins        add constraint member_checkins_client_uq        unique (assembly_id, client_id);

-- 2. "for all" policies also granted DELETE. Quarters, classes, services, funds etc.
--    cascade into attendance, offerings and income, so they must be archived, not deleted.
--    Replace them with explicit insert + update policies.
drop policy ssq_write  on ss_quarters;
drop policy ssc_write  on ss_classes;
drop policy sscr_write on ss_scoring_criteria;
drop policy ssgb_write on ss_grade_bands;
drop policy svc_write  on services;
drop policy sac_write  on service_attendance_counts;
drop policy funds_write on funds;
drop policy dep_write  on departments;

create policy ssq_insert on ss_quarters for insert to authenticated with check (is_ss_lead(assembly_id));
create policy ssq_update on ss_quarters for update to authenticated using (is_ss_lead(assembly_id)) with check (is_ss_lead(assembly_id));
create policy ssc_insert on ss_classes  for insert to authenticated with check (is_ss_lead(assembly_id));
create policy ssc_update on ss_classes  for update to authenticated using (is_ss_lead(assembly_id)) with check (is_ss_lead(assembly_id));
create policy sscr_insert on ss_scoring_criteria for insert to authenticated with check (is_ss_lead(assembly_id));
create policy sscr_update on ss_scoring_criteria for update to authenticated using (is_ss_lead(assembly_id)) with check (is_ss_lead(assembly_id));
create policy ssgb_insert on ss_grade_bands for insert to authenticated with check (is_ss_lead(assembly_id));
create policy ssgb_update on ss_grade_bands for update to authenticated using (is_ss_lead(assembly_id)) with check (is_ss_lead(assembly_id));
create policy svc_insert on services for insert to authenticated with check (is_office(assembly_id));
create policy svc_update on services for update to authenticated using (is_office(assembly_id)) with check (is_office(assembly_id));
create policy sac_insert on service_attendance_counts for insert to authenticated
  with check (has_assembly_role(assembly_id, array['assembly_admin','church_secretary','usher']::user_role[]));
create policy sac_update on service_attendance_counts for update to authenticated
  using (has_assembly_role(assembly_id, array['assembly_admin','church_secretary','usher']::user_role[]))
  with check (has_assembly_role(assembly_id, array['assembly_admin','church_secretary','usher']::user_role[]));
create policy funds_insert on funds for insert to authenticated with check (is_finance(assembly_id));
create policy funds_update on funds for update to authenticated using (is_finance(assembly_id)) with check (is_finance(assembly_id));
create policy dep_insert on departments for insert to authenticated with check (is_office(assembly_id));
create policy dep_update on departments for update to authenticated using (is_office(assembly_id)) with check (is_office(assembly_id));

-- 3. Claim an invite: links the signed-in login to the member record, grants the 'member' role.
create or replace function members_protect() returns trigger
language plpgsql as $$
begin
  if auth.uid() is null or is_admin(old.assembly_id) or is_office(old.assembly_id)
     or current_setting('churchos.allow_member_link', true) = '1' then
    return new;
  end if;
  if new.assembly_id is distinct from old.assembly_id or new.user_id is distinct from old.user_id
     or new.status is distinct from old.status or new.member_no is distinct from old.member_no
     or new.join_date is distinct from old.join_date or new.age_group is distinct from old.age_group then
    raise exception 'You can only edit your contact details';
  end if;
  return new;
end $$;

create function claim_member_invite(p_code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare inv member_invites%rowtype;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select * into inv from member_invites where code = upper(btrim(p_code)) for update;
  if not found or inv.claimed_at is not null or inv.expires_at < now() then
    raise exception 'This invite code is invalid or has expired';
  end if;
  if exists (select 1 from members where id = inv.member_id and user_id is not null and user_id <> auth.uid()) then
    raise exception 'This member record is already linked to another account';
  end if;
  perform set_config('churchos.allow_member_link', '1', true);
  update members set user_id = auth.uid() where id = inv.member_id;
  update member_invites set claimed_at = now() where id = inv.id;
  insert into user_roles (assembly_id, user_id, role) values (inv.assembly_id, auth.uid(), 'member')
    on conflict do nothing;
  return inv.assembly_id;
end $$;
revoke all on function claim_member_invite(text) from public, anon;
grant execute on function claim_member_invite(text) to authenticated;
