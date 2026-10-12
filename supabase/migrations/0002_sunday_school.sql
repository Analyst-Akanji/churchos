-- =====================================================================
-- 0002 Sunday school: quarters, classes, enrolment, sessions, scoring,
-- visitors, class offerings, quarterly results.
-- Mirrors the paper quarterly register (Att. / On Time / M. Verse / Cl. Work).
-- Ranking NEVER uses money. Offerings are recorded separately.
-- =====================================================================

create type quarter_status    as enum ('draft','active','closed');
create type class_staff_role  as enum ('teacher','secretary','assistant');
create type enrollment_status as enum ('enrolled','withdrawn');
create type session_status    as enum ('open','submitted','locked');
create type attendance_status as enum ('present','absent','excused');
create type criterion_source  as enum ('attendance','on_time','manual');
create type money_status      as enum ('recorded','verified','voided');

create table ss_quarters (
  id          uuid primary key default gen_random_uuid(),
  assembly_id uuid not null references assemblies(id) on delete cascade,
  year        smallint not null,
  quarter_no  smallint not null check (quarter_no between 1 and 4),
  title       text,
  start_date  date not null,
  end_date    date not null,
  status      quarter_status not null default 'draft',
  closed_at   timestamptz,
  closed_by   uuid references auth.users(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (end_date >= start_date),
  unique (assembly_id, id),
  unique (assembly_id, year, quarter_no)
);
create unique index ss_quarters_one_active on ss_quarters (assembly_id) where status = 'active';

create table ss_classes (
  id          uuid primary key default gen_random_uuid(),
  assembly_id uuid not null references assemblies(id) on delete cascade,
  name        text not null,
  description text,
  min_age     smallint,
  max_age     smallint,
  sort_order  smallint not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (assembly_id, id),
  unique (assembly_id, name)
);

create table ss_class_staff (
  id          uuid primary key default gen_random_uuid(),
  assembly_id uuid not null,
  class_id    uuid not null,
  member_id   uuid not null,
  staff_role  class_staff_role not null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  foreign key (assembly_id, class_id)  references ss_classes (assembly_id, id) on delete cascade,
  foreign key (assembly_id, member_id) references members (assembly_id, id) on delete cascade,
  unique (class_id, member_id, staff_role)
);
create index ss_class_staff_member_idx on ss_class_staff (member_id) where is_active;

create table ss_enrollments (
  id          uuid primary key default gen_random_uuid(),
  assembly_id uuid not null,
  quarter_id  uuid not null,
  class_id    uuid not null,
  member_id   uuid not null,
  status      enrollment_status not null default 'enrolled',
  enrolled_on date not null default current_date,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  foreign key (assembly_id, quarter_id) references ss_quarters (assembly_id, id) on delete cascade,
  foreign key (assembly_id, class_id)   references ss_classes  (assembly_id, id) on delete cascade,
  foreign key (assembly_id, member_id)  references members     (assembly_id, id) on delete cascade,
  unique (quarter_id, member_id),          -- one class per student per quarter
  unique (id, class_id),
  unique (assembly_id, id)
);
create index ss_enrollments_class_idx on ss_enrollments (class_id, quarter_id);
create index ss_enrollments_member_idx on ss_enrollments (member_id);

create table ss_sessions (
  id                uuid primary key default gen_random_uuid(),
  assembly_id       uuid not null,
  quarter_id        uuid not null,
  class_id          uuid not null,
  session_date      date not null,
  week_no           smallint check (week_no between 1 and 14),
  starts_at         timestamptz,                -- used to judge punctuality
  lesson_title      text,
  memory_verse_ref  text,
  status            session_status not null default 'open',
  submitted_at      timestamptz,
  submitted_by      uuid references auth.users(id),
  locked_at         timestamptz,
  locked_by         uuid references auth.users(id),
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  foreign key (assembly_id, quarter_id) references ss_quarters (assembly_id, id) on delete cascade,
  foreign key (assembly_id, class_id)   references ss_classes  (assembly_id, id) on delete cascade,
  unique (class_id, session_date),
  unique (id, class_id),
  unique (assembly_id, id)
);
create index ss_sessions_quarter_idx on ss_sessions (quarter_id, class_id, session_date);

-- Configurable scoring criteria (defaults seeded per assembly in 0006)
create table ss_scoring_criteria (
  id          uuid primary key default gen_random_uuid(),
  assembly_id uuid not null references assemblies(id) on delete cascade,
  code        text not null,
  label       text not null,
  source      criterion_source not null default 'manual',
  max_points  numeric(5,2) not null check (max_points > 0),
  sort_order  smallint not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (assembly_id, code),
  unique (assembly_id, id)
);

create table ss_grade_bands (
  id          uuid primary key default gen_random_uuid(),
  assembly_id uuid not null references assemblies(id) on delete cascade,
  grade       text not null,
  min_percent numeric(5,2) not null check (min_percent between 0 and 100),
  unique (assembly_id, grade),
  unique (assembly_id, min_percent)
);

-- Per-student attendance (source of truth for Att. and On Time)
create table ss_attendance (
  id            uuid primary key default gen_random_uuid(),
  assembly_id   uuid not null,
  session_id    uuid not null,
  class_id      uuid not null,
  enrollment_id uuid not null,
  status        attendance_status not null default 'present',
  arrived_at    timestamptz,
  is_on_time    boolean not null default false,
  recorded_by   uuid default auth.uid() references auth.users(id),
  client_id     uuid,                       -- idempotency key for offline sync
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  foreign key (session_id, class_id)    references ss_sessions    (id, class_id) on delete cascade,
  foreign key (enrollment_id, class_id) references ss_enrollments (id, class_id) on delete cascade,
  foreign key (assembly_id, session_id) references ss_sessions    (assembly_id, id) on delete cascade,
  unique (session_id, enrollment_id)
);
create unique index ss_attendance_client_uq on ss_attendance (assembly_id, client_id) where client_id is not null;
create index ss_attendance_enrollment_idx on ss_attendance (enrollment_id);

-- Teacher-judged criteria (memory verse, Bible reading, participation, ...)
create table ss_scores (
  id            uuid primary key default gen_random_uuid(),
  assembly_id   uuid not null,
  session_id    uuid not null,
  class_id      uuid not null,
  enrollment_id uuid not null,
  criterion_id  uuid not null,
  points        numeric(5,2) not null check (points >= 0),
  recorded_by   uuid default auth.uid() references auth.users(id),
  client_id     uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  foreign key (session_id, class_id)    references ss_sessions    (id, class_id) on delete cascade,
  foreign key (enrollment_id, class_id) references ss_enrollments (id, class_id) on delete cascade,
  foreign key (assembly_id, criterion_id) references ss_scoring_criteria (assembly_id, id),
  unique (session_id, enrollment_id, criterion_id)
);
create unique index ss_scores_client_uq on ss_scores (assembly_id, client_id) where client_id is not null;
create index ss_scores_enrollment_idx on ss_scores (enrollment_id);

create table ss_visitors (
  id           uuid primary key default gen_random_uuid(),
  assembly_id  uuid not null,
  session_id   uuid not null,
  class_id     uuid not null,
  full_name    text not null,
  phone        text,
  is_returning boolean not null default false,   -- "previous visitor" on the paper register
  notes        text,
  recorded_by  uuid default auth.uid() references auth.users(id),
  client_id    uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  foreign key (session_id, class_id) references ss_sessions (id, class_id) on delete cascade
);
create unique index ss_visitors_client_uq on ss_visitors (assembly_id, client_id) where client_id is not null;

-- Class offering: one live record per class per session. Never deleted, only voided.
create table ss_offerings (
  id          uuid primary key default gen_random_uuid(),
  assembly_id uuid not null,
  session_id  uuid not null,
  class_id    uuid not null,
  amount_kobo bigint not null check (amount_kobo >= 0),
  status      money_status not null default 'recorded',
  note        text,
  recorded_by uuid not null default auth.uid() references auth.users(id),
  verified_by uuid references auth.users(id),
  verified_at timestamptz,
  voided_by   uuid references auth.users(id),
  voided_at   timestamptz,
  void_reason text,
  client_id   uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  foreign key (session_id, class_id) references ss_sessions (id, class_id) on delete cascade,
  check (verified_by is null or verified_by <> recorded_by)   -- separation of duties
);
create unique index ss_offerings_one_live on ss_offerings (session_id) where status <> 'voided';
create unique index ss_offerings_client_uq on ss_offerings (assembly_id, client_id) where client_id is not null;

-- Frozen results written when a quarter is closed
create table ss_quarter_results (
  id            uuid primary key default gen_random_uuid(),
  assembly_id   uuid not null,
  quarter_id    uuid not null,
  class_id      uuid not null,
  enrollment_id uuid not null unique,
  member_id     uuid not null,
  sessions_held smallint not null,
  sessions_present smallint not null,
  total_points  numeric(8,2) not null,
  max_points    numeric(8,2) not null,
  percent       numeric(5,2) not null,
  grade         text,
  rank_in_class integer not null,
  created_at    timestamptz not null default now(),
  foreign key (assembly_id, quarter_id) references ss_quarters (assembly_id, id) on delete cascade,
  foreign key (assembly_id, class_id)   references ss_classes  (assembly_id, id) on delete cascade,
  foreign key (assembly_id, member_id)  references members     (assembly_id, id) on delete cascade
);
create index ss_quarter_results_lookup on ss_quarter_results (quarter_id, class_id, rank_in_class);

-- ---------- triggers: fill tenant/class from the session, validate points ----------
create function ss_fill_from_session() returns trigger
language plpgsql as $$
declare s record;
begin
  select assembly_id, class_id into s from ss_sessions where id = new.session_id;
  if not found then raise exception 'Unknown session'; end if;
  new.assembly_id := s.assembly_id;
  new.class_id    := s.class_id;
  return new;
end $$;

create trigger ss_attendance_fill before insert on ss_attendance for each row execute function ss_fill_from_session();
create trigger ss_scores_fill     before insert on ss_scores     for each row execute function ss_fill_from_session();
create trigger ss_visitors_fill   before insert on ss_visitors   for each row execute function ss_fill_from_session();
create trigger ss_offerings_fill  before insert on ss_offerings  for each row execute function ss_fill_from_session();

create function ss_scores_check() returns trigger
language plpgsql as $$
declare c record;
begin
  select max_points, source, is_active into c from ss_scoring_criteria where id = new.criterion_id;
  if c.source <> 'manual' then
    raise exception 'Criterion is computed automatically from attendance and cannot be scored by hand';
  end if;
  if new.points > c.max_points then
    raise exception 'Points % exceed the maximum of % for this criterion', new.points, c.max_points;
  end if;
  return new;
end $$;
create trigger ss_scores_validate before insert or update on ss_scores
  for each row execute function ss_scores_check();

-- Shared guard for any table that stores money with the money_status lifecycle
create function money_guard() returns trigger
language plpgsql as $$
begin
  if auth.uid() is null then return new; end if;   -- trusted server-side jobs (service role)
  if tg_op = 'UPDATE' then
    if old.status = 'voided' then
      raise exception 'Voided records cannot be changed';
    end if;
    if old.status = 'verified' and new.amount_kobo is distinct from old.amount_kobo then
      raise exception 'Verified amounts cannot be edited. Void the record and enter a new one.';
    end if;
    if new.status = 'verified' and old.status <> 'verified' then
      if not has_assembly_role(new.assembly_id, array['assembly_admin','finance_officer','superintendent']::user_role[]) then
        raise exception 'Not allowed to verify';
      end if;
      new.verified_by := auth.uid();
      new.verified_at := now();
    end if;
    if new.status = 'voided' and old.status <> 'voided' then
      if coalesce(btrim(new.void_reason), '') = '' then
        raise exception 'A reason is required to void a record';
      end if;
      new.voided_by := auth.uid();
      new.voided_at := now();
    end if;
  end if;
  return new;
end $$;
create trigger ss_offerings_guard before update on ss_offerings
  for each row execute function money_guard();
