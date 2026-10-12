-- =====================================================================
-- 0004 Community: events, rota, announcements, prayer, sermons,
-- follow-ups, children's check-in.
-- =====================================================================

create type registration_status  as enum ('registered','waitlisted','cancelled','attended');
create type rota_status          as enum ('pending','confirmed','declined','served');
create type announcement_audience as enum ('all','class','department','role');
create type message_status       as enum ('queued','sent','delivered','failed');
create type prayer_visibility    as enum ('private','leaders','congregation_anonymous');
create type prayer_status        as enum ('open','praying','answered','archived');
create type followup_reason      as enum ('absent_streak','first_time_visitor','new_convert','other');
create type followup_status      as enum ('open','contacted','resolved','closed');

-- ---------- Events ----------
create table events (
  id                    uuid primary key default gen_random_uuid(),
  assembly_id           uuid not null references assemblies(id) on delete cascade,
  title                 text not null,
  description           text,
  starts_at             timestamptz not null,
  ends_at               timestamptz,
  venue                 text,
  capacity              integer check (capacity is null or capacity > 0),
  registration_required boolean not null default false,
  is_public             boolean not null default true,
  created_by            uuid default auth.uid() references auth.users(id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (assembly_id, id)
);
create index events_start_idx on events (assembly_id, starts_at);

create table event_registrations (
  id          uuid primary key default gen_random_uuid(),
  assembly_id uuid not null,
  event_id    uuid not null,
  member_id   uuid,
  guest_name  text,
  guest_phone text,
  status      registration_status not null default 'registered',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  foreign key (assembly_id, event_id)  references events  (assembly_id, id) on delete cascade,
  foreign key (assembly_id, member_id) references members (assembly_id, id) on delete cascade,
  check (member_id is not null or guest_name is not null)
);
create unique index event_registrations_member_uq on event_registrations (event_id, member_id) where member_id is not null;

-- ---------- Departments & volunteer rota ----------
create table departments (
  id             uuid primary key default gen_random_uuid(),
  assembly_id    uuid not null references assemblies(id) on delete cascade,
  name           text not null,
  description    text,
  head_member_id uuid,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  foreign key (assembly_id, head_member_id) references members (assembly_id, id),
  unique (assembly_id, id),
  unique (assembly_id, name)
);

create table department_members (
  id            uuid primary key default gen_random_uuid(),
  assembly_id   uuid not null,
  department_id uuid not null,
  member_id     uuid not null,
  role_label    text,
  created_at    timestamptz not null default now(),
  foreign key (assembly_id, department_id) references departments (assembly_id, id) on delete cascade,
  foreign key (assembly_id, member_id)     references members     (assembly_id, id) on delete cascade,
  unique (department_id, member_id)
);

create table rota_duties (
  id            uuid primary key default gen_random_uuid(),
  assembly_id   uuid not null,
  service_id    uuid not null,
  department_id uuid not null,
  member_id     uuid not null,
  duty          text not null default 'on duty',
  status        rota_status not null default 'pending',
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  foreign key (assembly_id, service_id)    references services    (assembly_id, id) on delete cascade,
  foreign key (assembly_id, department_id) references departments (assembly_id, id) on delete cascade,
  foreign key (assembly_id, member_id)     references members     (assembly_id, id) on delete cascade,
  unique (service_id, department_id, member_id, duty)
);
create index rota_member_idx on rota_duties (member_id, service_id);

-- ---------- Announcements & delivery log ----------
create table announcements (
  id           uuid primary key default gen_random_uuid(),
  assembly_id  uuid not null references assemblies(id) on delete cascade,
  title        text not null,
  body         text not null,
  audience     announcement_audience not null default 'all',
  audience_ref uuid,                        -- class / department id, or null for 'all'
  audience_role user_role,                  -- when audience = 'role'
  channels     text[] not null default array['app'] check (channels <@ array['app','email','sms','whatsapp']),
  is_public    boolean not null default false,
  publish_at   timestamptz not null default now(),
  expires_at   timestamptz,
  sent_at      timestamptz,
  created_by   uuid default auth.uid() references auth.users(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (assembly_id, id)
);

create table message_log (
  id              uuid primary key default gen_random_uuid(),
  assembly_id     uuid not null,
  announcement_id uuid,
  member_id       uuid,
  channel         text not null check (channel in ('app','email','sms','whatsapp')),
  status          message_status not null default 'queued',
  provider_ref    text,
  error           text,
  created_at      timestamptz not null default now(),
  foreign key (assembly_id, announcement_id) references announcements (assembly_id, id) on delete cascade,
  foreign key (assembly_id, member_id)       references members       (assembly_id, id) on delete cascade
);
create index message_log_announcement_idx on message_log (announcement_id);

-- ---------- Prayer requests ----------
create table prayer_requests (
  id            uuid primary key default gen_random_uuid(),
  assembly_id   uuid not null,
  member_id     uuid,
  display_name  text,
  body          text not null,
  visibility    prayer_visibility not null default 'leaders',
  status        prayer_status not null default 'open',
  answered_note text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  foreign key (assembly_id, member_id) references members (assembly_id, id) on delete cascade
);

-- ---------- Sermon archive ----------
create table sermons (
  id            uuid primary key default gen_random_uuid(),
  assembly_id   uuid not null,
  service_id    uuid,
  title         text not null,
  preacher_name text,
  text_used     text,
  summary       text,
  preached_on   date,
  audio_url     text,
  video_url     text,
  notes_url     text,
  is_public     boolean not null default true,
  created_by    uuid default auth.uid() references auth.users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  foreign key (assembly_id, service_id) references services (assembly_id, id) on delete set null (service_id)
);
create index sermons_date_idx on sermons (assembly_id, preached_on desc);

-- ---------- Follow-ups (absentees, first-time visitors) ----------
create table follow_ups (
  id               uuid primary key default gen_random_uuid(),
  assembly_id      uuid not null,
  member_id        uuid,
  visitor_name     text,
  visitor_phone    text,
  reason           followup_reason not null default 'other',
  status           followup_status not null default 'open',
  assigned_to      uuid,
  due_date         date,
  last_contact_at  timestamptz,
  notes            text,
  created_by       uuid default auth.uid() references auth.users(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  foreign key (assembly_id, member_id)   references members (assembly_id, id) on delete cascade,
  foreign key (assembly_id, assigned_to) references members (assembly_id, id),
  check (member_id is not null or visitor_name is not null)
);
create index follow_ups_open_idx on follow_ups (assembly_id, status, due_date);

-- ---------- Children's check-in / check-out ----------
create table child_checkins (
  id                 uuid primary key default gen_random_uuid(),
  assembly_id        uuid not null,
  service_id         uuid not null,
  child_member_id    uuid not null,
  dropped_off_by     uuid,
  picked_up_by       uuid,
  security_code      text not null default lpad((floor(random() * 10000))::int::text, 4, '0'),
  checked_in_at      timestamptz not null default now(),
  checked_in_by      uuid default auth.uid() references auth.users(id),
  checked_out_at     timestamptz,
  checked_out_by     uuid references auth.users(id),
  notes              text,
  foreign key (assembly_id, service_id)      references services (assembly_id, id) on delete cascade,
  foreign key (assembly_id, child_member_id) references members  (assembly_id, id) on delete cascade,
  foreign key (assembly_id, dropped_off_by)  references members  (assembly_id, id),
  foreign key (assembly_id, picked_up_by)    references members  (assembly_id, id),
  unique (service_id, child_member_id)
);
