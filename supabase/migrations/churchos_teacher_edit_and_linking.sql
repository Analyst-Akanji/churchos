-- ChurchOS: gender at signup, teachers editing their students, smarter linking of registrations
-- Run the whole file once in the Supabase SQL Editor.

-- 1. GENDER ON REGISTRATIONS ------------------------------------------------
alter table public.registration_requests add column if not exists gender gender_type;

-- The signup page sends gender in the user metadata; copy it into the request.
create or replace function public.handle_new_registration()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  aid uuid; fn text; ln text; dob date; g gender_type;
begin
  begin
    select id into aid from assemblies where slug = meta->>'assembly_slug' and is_active;
    fn := btrim(coalesce(meta->>'first_name', ''));
    ln := btrim(coalesce(meta->>'last_name', ''));
    if aid is null or fn = '' or ln = '' then return new; end if;
    begin dob := nullif(meta->>'date_of_birth', '')::date; exception when others then dob := null; end;
    begin g := nullif(btrim(coalesce(meta->>'gender', '')), '')::gender_type; exception when others then g := null; end;
    insert into registration_requests (assembly_id, user_id, email, first_name, last_name, whatsapp, date_of_birth, gender)
    values (aid, new.id, new.email, fn, ln, nullif(btrim(meta->>'whatsapp'), ''), dob, g)
    on conflict (user_id) do nothing;
  exception when others then
    raise warning 'registration request not created: %', sqlerrm;
  end;
  return new;
end $function$;

-- Approving now uses the gender chosen at signup unless the office overrides it.
create or replace function public.approve_registration(p_request uuid, p_code text, p_member uuid DEFAULT NULL::uuid, p_age_group age_group_type DEFAULT 'adult'::age_group_type, p_gender gender_type DEFAULT NULL::gender_type, p_whatsapp text DEFAULT NULL::text)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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
           gender = coalesce(gender, p_gender, r.gender) where id = mid;
  else
    insert into members (assembly_id, first_name, last_name, date_of_birth, phone, whatsapp, email, gender, age_group, join_date, status)
    values (r.assembly_id, r.first_name, r.last_name, r.date_of_birth, r.whatsapp, r.whatsapp, r.email, coalesce(p_gender, r.gender), p_age_group, current_date, 'active')
    returning id into mid;
  end if;

  update member_invites set expires_at = now() where member_id = mid and claimed_at is null;
  insert into member_invites (assembly_id, member_id, code, created_by, for_user_id)
  values (r.assembly_id, mid, upper(btrim(p_code)), auth.uid(), r.user_id);

  update registration_requests set status = 'approved', member_id = mid, whatsapp = r.whatsapp,
         reviewed_by = auth.uid(), reviewed_at = now() where id = r.id;
  return mid;
end $function$;


-- 2. GUARDIAN COLUMNS (so a teacher can edit them) ---------------------------
alter table public.members add column if not exists guardian_name text;
alter table public.members add column if not exists guardian_phone text;

-- Move guardians already saved in notes ("Guardian: name, phone") into the new columns.
update public.members m set
  guardian_name  = case when g.parts[2] is not null then g.parts[1]
                        when g.parts[1] ~ '^[0-9+ ()-]+$' then null else g.parts[1] end,
  guardian_phone = case when g.parts[2] is not null then g.parts[2]
                        when g.parts[1] ~ '^[0-9+ ()-]+$' then g.parts[1] else null end
from (select id, string_to_array(substr(notes, 11), ', ') as parts
        from public.members where notes like 'Guardian: %') g
where m.id = g.id and m.guardian_name is null and m.guardian_phone is null;

-- Adding a student now fills the guardian columns instead of notes.
create or replace function public.ss_add_student(p_class uuid, p_first text, p_last text, p_gender text, p_dob date, p_age_group text, p_guardian_name text, p_guardian_phone text)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_assembly uuid;
  v_min      smallint;
  v_max      smallint;
  v_active   boolean;
  v_quarter  uuid;
  v_age      integer;
  v_member   uuid;
begin
  select c.assembly_id, c.min_age, c.max_age, c.is_active into v_assembly, v_min, v_max, v_active
    from public.ss_classes c where c.id = p_class;
  if v_assembly is null then
    raise exception 'Class not found';
  end if;
  if not (public.is_ss_lead(v_assembly) or public.is_ss_class_staff(p_class)) then
    raise exception 'You do not have access to this class';
  end if;
  if not v_active then
    raise exception 'This class is not active';
  end if;
  if p_age_group not in ('child', 'youth') then
    raise exception 'Teachers can add children and youths. Adults register themselves or are added by the church office.';
  end if;
  if trim(coalesce(p_first, '')) = '' or trim(coalesce(p_last, '')) = '' then
    raise exception 'Enter the first name and the last name';
  end if;

  select q.id into v_quarter from public.ss_quarters q
   where q.assembly_id = v_assembly and q.status::text = 'active' limit 1;
  if v_quarter is null then
    raise exception 'There is no active quarter. Ask the Sunday school lead to activate one.';
  end if;

  if p_dob is not null then
    if p_dob > current_date then
      raise exception 'The date of birth is in the future';
    end if;
    v_age := extract(year from age(current_date, p_dob))::int;
    if (v_min is not null and v_age < v_min) or (v_max is not null and v_age > v_max) then
      raise exception 'This class is for ages % to %. This student is %.',
        coalesce(v_min::text, 'any'), coalesce(v_max::text, 'any'), v_age;
    end if;
    if exists (
      select 1 from public.members m
      where m.assembly_id = v_assembly and m.removed_at is null
        and lower(m.first_name) = lower(trim(p_first)) and lower(m.last_name) = lower(trim(p_last))
        and m.date_of_birth = p_dob
    ) then
      raise exception 'A member with this name and date of birth already exists. Search for them and enrol them instead.';
    end if;
  end if;

  insert into public.members (assembly_id, first_name, last_name, gender, age_group, date_of_birth, guardian_name, guardian_phone)
  values (
    v_assembly, trim(p_first), trim(p_last),
    nullif(trim(coalesce(p_gender, '')), '')::gender_type,
    p_age_group::age_group_type, p_dob,
    nullif(trim(coalesce(p_guardian_name, '')), ''), nullif(trim(coalesce(p_guardian_phone, '')), '')
  )
  returning id into v_member;

  insert into public.ss_enrollments (assembly_id, quarter_id, class_id, member_id, status)
  values (v_assembly, v_quarter, p_class, v_member, 'enrolled');

  return v_member;
end $function$;


-- 3. TEACHERS EDITING THEIR STUDENTS ----------------------------------------
create table if not exists public.member_edit_log (
  id          uuid primary key default gen_random_uuid(),
  assembly_id uuid not null,
  member_id   uuid not null,
  edited_by   uuid default auth.uid(),
  changes     jsonb not null,
  created_at  timestamptz not null default now()
);
alter table public.member_edit_log enable row level security;
drop policy if exists member_edit_log_office_read on public.member_edit_log;
create policy member_edit_log_office_read on public.member_edit_log
  for select using (public.is_office(assembly_id));

-- Who may edit: the Sunday school lead, or a teacher/secretary of the class the child or youth is enrolled in this quarter.
create or replace function public.ss_can_edit_student(p_member uuid)
 returns boolean
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  select exists (
    select 1 from public.members m
     where m.id = p_member and m.removed_at is null
       and (
         public.is_ss_lead(m.assembly_id)
         or (m.age_group::text in ('child', 'youth') and exists (
               select 1 from public.ss_enrollments e
                 join public.ss_quarters q on q.id = e.quarter_id
                where e.member_id = m.id and e.status::text = 'enrolled' and q.status::text = 'active'
                  and public.is_ss_class_staff(e.class_id)))
       )
  )
$function$;

create or replace function public.ss_get_student(p_member uuid)
 returns table(first_name text, last_name text, gender text, date_of_birth date, age_group text, guardian_name text, guardian_phone text, has_login boolean)
 language plpgsql
 stable
 security definer
 set search_path to 'public'
as $function$
begin
  if not public.ss_can_edit_student(p_member) then
    raise exception 'You do not have permission to edit this student';
  end if;
  return query
    select m.first_name, m.last_name, m.gender::text, m.date_of_birth, m.age_group::text,
           m.guardian_name, m.guardian_phone, (m.user_id is not null)
      from public.members m where m.id = p_member;
end $function$;

create or replace function public.ss_update_student(p_member uuid, p_first text, p_last text, p_gender text, p_dob date, p_age_group text, p_guardian_name text, p_guardian_phone text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  m        public.members%rowtype;
  v_lead   boolean;
  v_age    integer;
  v_gender gender_type;
  c        record;
begin
  if not public.ss_can_edit_student(p_member) then
    raise exception 'You do not have permission to edit this student';
  end if;
  select * into m from public.members where id = p_member;
  v_lead := public.is_ss_lead(m.assembly_id);

  if trim(coalesce(p_first, '')) = '' or trim(coalesce(p_last, '')) = '' then
    raise exception 'Enter the first name and the last name';
  end if;
  if p_age_group not in ('child', 'youth') and not (v_lead and p_age_group = 'adult') then
    raise exception 'A student can be set as a child or a youth.';
  end if;

  if p_dob is not null then
    if p_dob > current_date then
      raise exception 'The date of birth is in the future';
    end if;
    v_age := extract(year from age(current_date, p_dob))::int;
    for c in
      select cl.name, cl.min_age, cl.max_age
        from public.ss_enrollments e
        join public.ss_quarters q on q.id = e.quarter_id
        join public.ss_classes cl on cl.id = e.class_id
       where e.member_id = p_member and e.status::text = 'enrolled' and q.status::text = 'active'
    loop
      if (c.min_age is not null and v_age < c.min_age) or (c.max_age is not null and v_age > c.max_age) then
        raise exception 'That date of birth makes the student % years old, which is outside the ages for %.', v_age, c.name;
      end if;
    end loop;
    if exists (
      select 1 from public.members x
       where x.assembly_id = m.assembly_id and x.removed_at is null and x.id <> p_member
         and lower(x.first_name) = lower(trim(p_first)) and lower(x.last_name) = lower(trim(p_last))
         and x.date_of_birth = p_dob
    ) then
      raise exception 'Another member already has this name and date of birth.';
    end if;
  end if;

  v_gender := nullif(trim(coalesce(p_gender, '')), '')::gender_type;

  update public.members set
    first_name     = trim(p_first),
    last_name      = trim(p_last),
    gender         = v_gender,
    date_of_birth  = p_dob,
    age_group      = p_age_group::age_group_type,
    guardian_name  = nullif(trim(coalesce(p_guardian_name, '')), ''),
    guardian_phone = nullif(trim(coalesce(p_guardian_phone, '')), ''),
    updated_at     = now()
  where id = p_member;

  insert into public.member_edit_log (assembly_id, member_id, changes)
  values (m.assembly_id, p_member, jsonb_build_object(
    'before', jsonb_build_object('first_name', m.first_name, 'last_name', m.last_name, 'gender', m.gender, 'date_of_birth', m.date_of_birth, 'age_group', m.age_group, 'guardian_name', m.guardian_name, 'guardian_phone', m.guardian_phone),
    'after',  jsonb_build_object('first_name', trim(p_first), 'last_name', trim(p_last), 'gender', v_gender, 'date_of_birth', p_dob, 'age_group', p_age_group, 'guardian_name', nullif(trim(coalesce(p_guardian_name, '')), ''), 'guardian_phone', nullif(trim(coalesce(p_guardian_phone, '')), ''))
  ));
end $function$;


-- 4. SMARTER MATCHING OF NEW REGISTRATIONS TO EXISTING STUDENTS --------------
create or replace function public._last10(t text)
 returns text
 language sql
 immutable
as $function$
  select case when length(regexp_replace(coalesce(t, ''), '\D', '', 'g')) >= 10
              then right(regexp_replace(t, '\D', '', 'g'), 10) end
$function$;

-- For every waiting registration, list unlinked member records that could be the same person.
create or replace function public.registration_match_suggestions(p_assembly uuid)
 returns table(request_id uuid, member_id uuid, first_name text, last_name text, age_group text, date_of_birth date, phone text, class_name text, score int, reasons text[])
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  with req as (
    select r.id, lower(btrim(r.first_name)) as f, lower(btrim(r.last_name)) as l,
           r.date_of_birth as dob, public._last10(r.whatsapp) as ph
      from public.registration_requests r
     where r.assembly_id = p_assembly and r.status::text = 'pending' and public.is_office(p_assembly)
  ),
  hits as (
    select q.id as rid, m.id as mid, m.first_name as mfirst, m.last_name as mlast, m.age_group::text as mgroup,
           m.date_of_birth as mdob, coalesce(m.phone, m.whatsapp) as mphone,
           (q.ph is not null and q.ph in (coalesce(public._last10(m.whatsapp), ''), coalesce(public._last10(m.phone), ''))) as ph_hit,
           (q.ph is not null and q.ph = public._last10(m.guardian_phone)) as gph_hit,
           (q.dob is not null and q.dob = m.date_of_birth) as dob_hit,
           (q.f = lower(btrim(m.first_name)) and q.l = lower(btrim(m.last_name))) as full_hit,
           (q.f = lower(btrim(m.last_name)) and q.l = lower(btrim(m.first_name))) as swap_hit,
           (q.f = lower(btrim(m.first_name))) as first_hit,
           (length(q.f) >= 3 and length(btrim(m.first_name)) >= 3 and q.f <> lower(btrim(m.first_name))
              and (q.f like lower(btrim(m.first_name)) || '%' or lower(btrim(m.first_name)) like q.f || '%')) as first_pre,
           (q.l = lower(btrim(m.last_name))) as last_hit
      from req q
      join public.members m
        on m.assembly_id = p_assembly and m.user_id is null and m.removed_at is null and m.status::text <> 'archived'
  ),
  scored as (
    select h.*,
           (case when h.ph_hit then 50 else 0 end)
         + (case when h.gph_hit then 35 else 0 end)
         + (case when h.dob_hit then 40 else 0 end)
         + (case when h.full_hit then 40
                 when h.swap_hit then 30
                 else (case when h.first_hit then 20 when h.first_pre then 10 else 0 end)
                    + (case when h.last_hit then 20 else 0 end) end) as sc
      from hits h
  )
  select s.rid, s.mid, s.mfirst, s.mlast, s.mgroup, s.mdob, s.mphone, cls.name, s.sc,
         array_remove(array[
           case when s.ph_hit then 'Same phone number' end,
           case when s.gph_hit then 'Same as the guardian phone' end,
           case when s.dob_hit then 'Same date of birth' end,
           case when s.full_hit then 'Same name'
                when s.swap_hit then 'Same name, first and last swapped'
                when s.first_hit or s.last_hit or s.first_pre then 'Similar name' end
         ], null)
    from scored s
    left join lateral (
      select c.name
        from public.ss_enrollments e
        join public.ss_quarters sq on sq.id = e.quarter_id and sq.status::text = 'active'
        join public.ss_classes c on c.id = e.class_id
       where e.member_id = s.mid and e.status::text = 'enrolled'
       limit 1
    ) cls on true
   where s.sc >= 30
   order by s.rid, s.sc desc, s.mlast
$function$;
