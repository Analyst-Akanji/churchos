-- =====================================================================
-- ChurchOS (working title) — 0001 core: tenants, people, roles, audit
-- Multi-tenant by design: every business table carries assembly_id.
-- Money is stored as integer kobo (₦1 = 100 kobo). Never floats.
-- =====================================================================

create extension if not exists pg_trgm;

-- ---------- enums ----------
create type user_role as enum (
  'assembly_admin',    -- pastor / assembly administrator
  'church_secretary',  -- service records, headcounts, announcements
  'finance_officer',   -- income entries, verification, receipts
  'superintendent',    -- Sunday school superintendent (all classes)
  'usher',             -- manual check-in, children's check-in
  'department_head',   -- rota for their department
  'member'
);
create type gender_type    as enum ('male','female');
create type age_group_type as enum ('child','youth','adult');
create type member_status  as enum ('active','inactive','visitor','transferred','archived');

-- ---------- generic trigger functions ----------
create function set_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

create function prevent_mutation() returns trigger
language plpgsql as $$
begin raise exception '% is append-only', tg_table_name; end $$;

-- ---------- tenants ----------
create table assemblies (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name          text not null,
  denomination  text not null default 'GOFAMINT',
  district      text,
  address       text,
  city          text,
  state         text,
  country       text not null default 'Nigeria',
  timezone      text not null default 'Africa/Lagos',
  currency      char(3) not null default 'NGN',
  logo_url      text,
  contact_phone text,
  contact_email text,
  settings      jsonb not null default '{}'::jsonb,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table assembly_locations (
  id          uuid primary key default gen_random_uuid(),
  assembly_id uuid not null references assemblies(id) on delete cascade,
  name        text not null,
  latitude    double precision not null check (latitude between -90 and 90),
  longitude   double precision not null check (longitude between -180 and 180),
  radius_m    integer not null default 150 check (radius_m between 30 and 1000),
  is_primary  boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (assembly_id, id)
);
create unique index assembly_locations_one_primary
  on assembly_locations (assembly_id) where is_primary;

create table platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- ---------- people ----------
create table members (
  id            uuid primary key default gen_random_uuid(),
  assembly_id   uuid not null references assemblies(id) on delete cascade,
  user_id       uuid references auth.users(id) on delete set null,  -- null until the person claims an account
  member_no     text,
  first_name    text not null,
  last_name     text not null,
  other_names   text,
  gender        gender_type,
  date_of_birth date,
  wedding_anniversary date,
  age_group     age_group_type not null default 'adult',
  phone         text,
  email         text,
  address       text,
  photo_url     text,
  join_date     date,
  status        member_status not null default 'active',
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (assembly_id, id),
  unique (assembly_id, member_no)
);
create unique index members_one_account_per_assembly on members (assembly_id, user_id) where user_id is not null;
create index members_name_idx on members (assembly_id, last_name, first_name);
create index members_search_idx on members using gin ((first_name || ' ' || last_name) gin_trgm_ops);
create index members_user_idx on members (user_id) where user_id is not null;

create table user_roles (
  id          uuid primary key default gen_random_uuid(),
  assembly_id uuid not null references assemblies(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        user_role not null,
  granted_by  uuid references auth.users(id),
  created_at  timestamptz not null default now(),
  unique (assembly_id, user_id, role)
);
create index user_roles_user_idx on user_roles (user_id);

create table member_guardians (
  id                 uuid primary key default gen_random_uuid(),
  assembly_id        uuid not null,
  child_member_id    uuid not null,
  guardian_member_id uuid not null,
  relationship       text,
  is_primary         boolean not null default false,
  can_pickup         boolean not null default true,
  created_at         timestamptz not null default now(),
  foreign key (assembly_id, child_member_id)    references members (assembly_id, id) on delete cascade,
  foreign key (assembly_id, guardian_member_id) references members (assembly_id, id) on delete cascade,
  check (child_member_id <> guardian_member_id),
  unique (child_member_id, guardian_member_id)
);

-- One-time codes so a member can link their login to their member record
create table member_invites (
  id          uuid primary key default gen_random_uuid(),
  assembly_id uuid not null,
  member_id   uuid not null,
  code        text not null unique,
  expires_at  timestamptz not null default now() + interval '14 days',
  claimed_at  timestamptz,
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now(),
  foreign key (assembly_id, member_id) references members (assembly_id, id) on delete cascade
);

-- Per-assembly counters (receipt numbers etc.)
create table assembly_counters (
  assembly_id uuid not null references assemblies(id) on delete cascade,
  name        text not null,
  value       bigint not null default 0,
  primary key (assembly_id, name)
);

create function next_counter(p_assembly uuid, p_name text) returns bigint
language sql as $$
  insert into assembly_counters (assembly_id, name, value) values (p_assembly, p_name, 1)
  on conflict (assembly_id, name) do update set value = assembly_counters.value + 1
  returning value;
$$;

-- ---------- audit trail (append-only) ----------
create table audit_log (
  id          bigint generated always as identity primary key,
  assembly_id uuid,
  table_name  text not null,
  record_id   uuid,
  action      text not null check (action in ('INSERT','UPDATE','DELETE')),
  old_data    jsonb,
  new_data    jsonb,
  actor_id    uuid,
  occurred_at timestamptz not null default now()
);
create index audit_log_lookup on audit_log (assembly_id, table_name, record_id, occurred_at desc);
create trigger audit_log_no_update before update or delete on audit_log
  for each row execute function prevent_mutation();

create function audit_row() returns trigger
language plpgsql security definer set search_path = public as $$
declare rec jsonb;
begin
  rec := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  insert into audit_log (assembly_id, table_name, record_id, action, old_data, new_data, actor_id)
  values ((rec->>'assembly_id')::uuid, tg_table_name, (rec->>'id')::uuid, tg_op,
          case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
          case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end,
          auth.uid());
  return null;
end $$;
