-- =====================================================================
-- 0009 Member self-registration queue + church positions
--   * People sign up with email, name, date of birth and WhatsApp number.
--   * The sign-up lands in registration_requests for the church office.
--   * The office approves it: a member record and a one-time activation code are created.
--     The code is tied to the account that registered, so nobody else can use it.
--   * Church positions (Pastor, Elder, Deacon, Worker, ...) can be assigned to members.
-- =====================================================================

alter table members add column whatsapp text;
alter table member_invites add column for_user_id uuid references auth.users(id) on delete cascade;

create type member_registration_status as enum ('pending','approved','rejected');

create table registration_requests (
  id           uuid primary key default gen_random_uuid(),
  assembly_id  uuid not null references assemblies(id) on delete cascade,
  user_id      uuid not null unique references auth.users(id) on delete cascade,
  email        text,
  first_name   text not null,
  last_name    text not null,
  whatsapp     text,
  date_of_birth date,
  status       member_registration_status not null default 'pending',
  member_id    uuid,
  note         text,
  reviewed_by  uuid references auth.users(id),
  reviewed_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  foreign key (assembly_id, member_id) references members (assembly_id, id)
);
create index registration_requests_queue on registration_requests (assembly_id, status, created_at);
create trigger trg_registration_requests_updated_at before update on registration_requests
  for each row execute function set_updated_at();

-- Sign-up form details travel in the auth user's metadata; this turns them into a queue entry.
-- It must never block a sign-up, so every failure is swallowed.
create function handle_new_registration() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  aid uuid; fn text; ln text; dob date;
begin
  begin
    select id into aid from assemblies where slug = meta->>'assembly_slug' and is_active;
    fn := btrim(coalesce(meta->>'first_name', ''));
    ln := btrim(coalesce(meta->>'last_name', ''));
    if aid is null or fn = '' or ln = '' then return new; end if;
    begin dob := nullif(meta->>'date_of_birth', '')::date; exception when others then dob := null; end;
    insert into registration_requests (assembly_id, user_id, email, first_name, last_name, whatsapp, date_of_birth)
    values (aid, new.id, new.email, fn, ln, nullif(btrim(meta->>'whatsapp'), ''), dob)
    on conflict (user_id) do nothing;
  exception when others then
    raise warning 'registration request not created: %', sqlerrm;
  end;
  return new;
end $$;
create trigger on_auth_user_registration after insert on auth.users
  for each row execute function handle_new_registration();

alter table registration_requests enable row level security;
create policy rr_select on registration_requests for select to authenticated
  using (user_id = auth.uid() or is_office(assembly_id));
-- no insert/update/delete policies: changes go through the functions below

-- Approve: create the member (or link an existing record), issue a code tied to the registering account.
create function approve_registration(
  p_request uuid, p_code text, p_member uuid default null,
  p_age_group age_group_type default 'adult', p_gender gender_type default null, p_whatsapp text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare r registration_requests%rowtype; mid uuid;
begin
  select * into r from registration_requests where id = p_request for update;
  if not found then raise exception 'Registration not found'; end if;
  if not is_office(r.assembly_id) then raise exception 'Not authorised'; end if;
  if r.status <> 'pending' then raise exception 'This registration was already %', r.status; end if;
  if p_code is null or length(btrim(p_code)) < 6 then raise exception 'Invalid activation code'; end if;
  if nullif(btrim(coalesce(p_whatsapp, '')), '') is not null then r.whatsapp := btrim(p_whatsapp); end if;

  if p_member is not null then
    select id into mid from members where id = p_member and assembly_id = r.assembly_id and user_id is null;
    if mid is null then raise exception 'That member record is not available to link'; end if;
    update members set whatsapp = coalesce(r.whatsapp, whatsapp), phone = coalesce(phone, r.whatsapp),
           date_of_birth = coalesce(date_of_birth, r.date_of_birth), email = coalesce(email, r.email),
           gender = coalesce(gender, p_gender) where id = mid;
  else
    insert into members (assembly_id, first_name, last_name, date_of_birth, phone, whatsapp, email, gender, age_group, join_date, status)
    values (r.assembly_id, r.first_name, r.last_name, r.date_of_birth, r.whatsapp, r.whatsapp, r.email, p_gender, p_age_group, current_date, 'active')
    returning id into mid;
  end if;

  update member_invites set expires_at = now() where member_id = mid and claimed_at is null;
  insert into member_invites (assembly_id, member_id, code, created_by, for_user_id)
  values (r.assembly_id, mid, upper(btrim(p_code)), auth.uid(), r.user_id);

  update registration_requests set status = 'approved', member_id = mid, whatsapp = r.whatsapp,
         reviewed_by = auth.uid(), reviewed_at = now() where id = r.id;
  return mid;
end $$;

-- Issue a fresh code for an approved registration whose owner has not activated yet.
create function reissue_registration_code(p_request uuid, p_code text) returns void
language plpgsql security definer set search_path = public as $$
declare r registration_requests%rowtype;
begin
  select * into r from registration_requests where id = p_request;
  if not found or not is_office(r.assembly_id) then raise exception 'Not authorised'; end if;
  if r.status <> 'approved' or r.member_id is null then raise exception 'This registration is not approved'; end if;
  if exists (select 1 from members where id = r.member_id and user_id is not null) then raise exception 'This member has already activated their account'; end if;
  if p_code is null or length(btrim(p_code)) < 6 then raise exception 'Invalid activation code'; end if;
  update member_invites set expires_at = now() where member_id = r.member_id and claimed_at is null;
  insert into member_invites (assembly_id, member_id, code, created_by, for_user_id)
  values (r.assembly_id, r.member_id, upper(btrim(p_code)), auth.uid(), r.user_id);
end $$;

create function reject_registration(p_request uuid, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare r registration_requests%rowtype;
begin
  select * into r from registration_requests where id = p_request for update;
  if not found or not is_office(r.assembly_id) then raise exception 'Not authorised'; end if;
  if r.status <> 'pending' then raise exception 'This registration was already %', r.status; end if;
  update registration_requests set status = 'rejected', note = nullif(btrim(coalesce(p_note, '')), ''),
         reviewed_by = auth.uid(), reviewed_at = now() where id = r.id;
end $$;

revoke all on function approve_registration(uuid, text, uuid, age_group_type, gender_type, text) from public, anon;
revoke all on function reissue_registration_code(uuid, text) from public, anon;
revoke all on function reject_registration(uuid, text) from public, anon;
grant execute on function approve_registration(uuid, text, uuid, age_group_type, gender_type, text) to authenticated;
grant execute on function reissue_registration_code(uuid, text) to authenticated;
grant execute on function reject_registration(uuid, text) to authenticated;

-- A code issued to a specific account can only be used by that account.
create or replace function claim_member_invite(p_code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare inv member_invites%rowtype;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select * into inv from member_invites where code = upper(btrim(p_code)) for update;
  if not found or inv.claimed_at is not null or inv.expires_at < now() then
    raise exception 'This code is invalid or has expired. Ask the church office for a new one.';
  end if;
  if inv.for_user_id is not null and inv.for_user_id <> auth.uid() then
    raise exception 'This code was issued to a different account.';
  end if;
  if exists (select 1 from members where id = inv.member_id and user_id is not null and user_id <> auth.uid()) then
    raise exception 'This member record is already linked to another account';
  end if;
  perform set_config('churchos.allow_member_link', '1', true);
  update members set user_id = auth.uid() where id = inv.member_id;
  update member_invites set claimed_at = now() where id = inv.id;
  insert into user_roles (assembly_id, user_id, role) values (inv.assembly_id, auth.uid(), 'member') on conflict do nothing;
  return inv.assembly_id;
end $$;

-- ---------- church positions ----------
create table church_positions (
  id          uuid primary key default gen_random_uuid(),
  assembly_id uuid not null references assemblies(id) on delete cascade,
  name        text not null,
  sort_order  smallint not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (assembly_id, id),
  unique (assembly_id, name)
);
create trigger trg_church_positions_updated_at before update on church_positions for each row execute function set_updated_at();

create table member_positions (
  id          uuid primary key default gen_random_uuid(),
  assembly_id uuid not null,
  member_id   uuid not null,
  position_id uuid not null,
  since       date,
  created_by  uuid default auth.uid() references auth.users(id),
  created_at  timestamptz not null default now(),
  foreign key (assembly_id, member_id)   references members (assembly_id, id) on delete cascade,
  foreign key (assembly_id, position_id) references church_positions (assembly_id, id),
  unique (member_id, position_id)
);
create index member_positions_position_idx on member_positions (position_id);
create trigger audit_member_positions after insert or update or delete on member_positions for each row execute function audit_row();

alter table church_positions enable row level security;
alter table member_positions enable row level security;
create policy cp_select on church_positions for select to authenticated using (is_assembly_user(assembly_id));
create policy cp_insert on church_positions for insert to authenticated with check (is_office(assembly_id));
create policy cp_update on church_positions for update to authenticated using (is_office(assembly_id)) with check (is_office(assembly_id));
create policy mp_select on member_positions for select to authenticated using (is_assembly_user(assembly_id));
create policy mp_insert on member_positions for insert to authenticated with check (is_office(assembly_id));
create policy mp_update on member_positions for update to authenticated using (is_office(assembly_id)) with check (is_office(assembly_id));
create policy mp_delete on member_positions for delete to authenticated using (is_office(assembly_id));

-- defaults for every assembly (existing and new)
insert into church_positions (assembly_id, name, sort_order)
select a.id, p.name, p.ord from assemblies a
cross join (values ('Pastor', 1), ('Elder', 2), ('Deacon', 3), ('Deaconess', 4), ('Worker', 5)) as p(name, ord)
on conflict do nothing;

create or replace function seed_assembly_defaults() returns trigger
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
  insert into church_positions (assembly_id, name, sort_order) values
    (new.id, 'Pastor', 1), (new.id, 'Elder', 2), (new.id, 'Deacon', 3), (new.id, 'Deaconess', 4), (new.id, 'Worker', 5);
  return new;
end $$;
