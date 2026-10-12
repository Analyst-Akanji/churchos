-- =====================================================================
-- 0003 Services, headcounts, income, member check-in, online giving.
-- Mirrors the paper "Service Record" and "Weekly Income" books.
-- =====================================================================

create type service_type   as enum ('sunday_school','sunday_worship','midweek','prayer','vigil','special','other');
create type service_status as enum ('scheduled','open','closed');
create type fund_kind      as enum ('worship_offering','thanksgiving','tithe','special','building','sunday_school','other');
create type checkin_method as enum ('geofence','qr','usher','manual');
create type checkin_status as enum ('verified','flagged','rejected');
create type gift_channel   as enum ('online','cash','transfer');
create type gift_status    as enum ('pending','succeeded','failed','refunded');

-- ---------- Service Record ----------
create table services (
  id                uuid primary key default gen_random_uuid(),
  assembly_id       uuid not null references assemblies(id) on delete cascade,
  location_id       uuid,
  service_type      service_type not null default 'sunday_worship',
  title             text,
  service_date      date not null,
  starts_at         timestamptz not null,
  ends_at           timestamptz,
  preacher_name     text,
  sermon_topic      text,
  text_used         text,
  status            service_status not null default 'scheduled',
  checkin_opens_at  timestamptz,
  checkin_closes_at timestamptz,
  notes             text,
  created_by        uuid default auth.uid() references auth.users(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  foreign key (assembly_id, location_id) references assembly_locations (assembly_id, id),
  unique (assembly_id, id),
  unique (assembly_id, service_type, starts_at)
);
create index services_date_idx on services (assembly_id, starts_at desc);

-- Manual headcount by category (Men / Women / Youth Male / Youth Female / Children)
create table service_attendance_counts (
  id           uuid primary key default gen_random_uuid(),
  assembly_id  uuid not null,
  service_id   uuid not null unique,
  men          integer not null default 0 check (men >= 0),
  women        integer not null default 0 check (women >= 0),
  youth_male   integer not null default 0 check (youth_male >= 0),
  youth_female integer not null default 0 check (youth_female >= 0),
  children     integer not null default 0 check (children >= 0),
  total        integer generated always as (men + women + youth_male + youth_female + children) stored,
  counted_by   uuid default auth.uid() references auth.users(id),
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  foreign key (assembly_id, service_id) references services (assembly_id, id) on delete cascade
);

-- ---------- Weekly Income ----------
create table funds (
  id          uuid primary key default gen_random_uuid(),
  assembly_id uuid not null references assemblies(id) on delete cascade,
  name        text not null,
  kind        fund_kind not null default 'other',
  is_active   boolean not null default true,
  allow_online_giving boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (assembly_id, id),
  unique (assembly_id, name)
);

create table service_income_entries (
  id                  uuid primary key default gen_random_uuid(),
  assembly_id         uuid not null,
  service_id          uuid not null,
  fund_id             uuid not null,
  amount_kobo         bigint not null check (amount_kobo >= 0),
  collector_member_id uuid,
  collector_name      text,                 -- when the collector is not a registered member
  witness_member_id   uuid,                 -- second counter (replaces the paper signature)
  status              money_status not null default 'recorded',
  note                text,
  recorded_by         uuid not null default auth.uid() references auth.users(id),
  verified_by         uuid references auth.users(id),
  verified_at         timestamptz,
  voided_by           uuid references auth.users(id),
  voided_at           timestamptz,
  void_reason         text,
  client_id           uuid,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  foreign key (assembly_id, service_id)          references services (assembly_id, id),
  foreign key (assembly_id, fund_id)             references funds    (assembly_id, id),
  foreign key (assembly_id, collector_member_id) references members  (assembly_id, id),
  foreign key (assembly_id, witness_member_id)   references members  (assembly_id, id),
  check (verified_by is null or verified_by <> recorded_by)
);
create index service_income_service_idx on service_income_entries (service_id);
create unique index service_income_client_uq on service_income_entries (assembly_id, client_id) where client_id is not null;
create trigger service_income_guard before update on service_income_entries
  for each row execute function money_guard();

-- ---------- Member check-in (geofence / QR / usher) ----------
create table assembly_checkin_tokens (   -- rotating QR payloads; written by an edge function
  id          uuid primary key default gen_random_uuid(),
  assembly_id uuid not null,
  service_id  uuid not null,
  token       text not null unique,
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now(),
  foreign key (assembly_id, service_id) references services (assembly_id, id) on delete cascade
);

create table member_checkins (
  id                  uuid primary key default gen_random_uuid(),
  assembly_id         uuid not null,
  service_id          uuid not null,
  member_id           uuid not null,
  checked_in_at       timestamptz not null default now(),   -- as reported by the device (may be offline)
  received_at         timestamptz not null default now(),   -- when the server got it
  method              checkin_method not null default 'geofence',
  status              checkin_status not null default 'verified',
  flag_reason         text,
  latitude            double precision,
  longitude           double precision,
  accuracy_m          double precision,
  distance_m          double precision,
  location_consent_at timestamptz,
  device_id           text,
  client_id           uuid,
  created_at          timestamptz not null default now(),
  foreign key (assembly_id, service_id) references services (assembly_id, id) on delete cascade,
  foreign key (assembly_id, member_id)  references members  (assembly_id, id) on delete cascade,
  unique (service_id, member_id),
  check (method <> 'geofence' or location_consent_at is not null)
);
create index member_checkins_member_idx on member_checkins (member_id, checked_in_at desc);
create unique index member_checkins_client_uq on member_checkins (assembly_id, client_id) where client_id is not null;

create function haversine_m(lat1 double precision, lon1 double precision, lat2 double precision, lon2 double precision)
returns double precision language sql immutable as $$
  select 2 * 6371000 * asin(least(1, sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lon2 - lon1) / 2), 2))))
$$;

-- Server-side verification: never trust the client's claim that it was "in church"
create function checkin_validate() returns trigger
language plpgsql as $$
declare
  svc  record;
  loc  record;
  dist double precision;
  allowance double precision;
begin
  select * into svc from services where id = new.service_id;
  if not found then raise exception 'Unknown service'; end if;

  new.received_at := now();
  new.status := 'verified';
  new.flag_reason := null;

  if new.method in ('usher','manual') and auth.uid() is not null
     and not has_assembly_role(new.assembly_id, array['assembly_admin','church_secretary','usher']::user_role[]) then
    raise exception 'Only ushers and administrators can record manual check-ins';
  end if;

  if new.checked_in_at > now() + interval '5 minutes' then
    new.status := 'flagged'; new.flag_reason := 'device_time_in_future';
  elsif svc.checkin_opens_at is not null and new.checked_in_at < svc.checkin_opens_at then
    new.status := 'flagged'; new.flag_reason := 'before_window';
  elsif svc.checkin_closes_at is not null and new.checked_in_at > svc.checkin_closes_at then
    new.status := 'flagged'; new.flag_reason := 'after_window';
  end if;

  if new.method = 'geofence' then
    select l.* into loc from assembly_locations l
     where l.assembly_id = new.assembly_id
       and (l.id = svc.location_id or (svc.location_id is null and l.is_primary))
     limit 1;
    if not found then
      new.status := 'flagged'; new.flag_reason := coalesce(new.flag_reason, 'no_church_location_configured');
    elsif new.latitude is null or new.longitude is null then
      new.status := 'flagged'; new.flag_reason := coalesce(new.flag_reason, 'no_location');
    else
      dist := haversine_m(new.latitude, new.longitude, loc.latitude, loc.longitude);
      new.distance_m := round(dist::numeric, 1);
      allowance := least(coalesce(new.accuracy_m, 0), 100);   -- tolerate poor GPS, but only up to 100 m
      if dist > loc.radius_m + allowance then
        new.status := 'flagged'; new.flag_reason := coalesce(new.flag_reason, 'outside_geofence');
      end if;
    end if;
  end if;
  return new;
end $$;
create trigger member_checkins_validate before insert on member_checkins
  for each row execute function checkin_validate();

-- Privacy: drop raw coordinates after N days (schedule with pg_cron, see 0006)
create function purge_checkin_coordinates(p_days integer default 30) returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  update member_checkins set latitude = null, longitude = null
   where received_at < now() - make_interval(days => p_days)
     and (latitude is not null or longitude is not null);
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function purge_checkin_coordinates(integer) from public, anon, authenticated;

-- ---------- Online giving & receipts ----------
create table gifts (
  id            uuid primary key default gen_random_uuid(),
  assembly_id   uuid not null,
  member_id     uuid,
  fund_id       uuid not null,
  amount_kobo   bigint not null check (amount_kobo > 0),
  currency      char(3) not null default 'NGN',
  channel       gift_channel not null default 'online',
  provider      text check (provider in ('paystack','flutterwave')),
  provider_ref  text,
  status        gift_status not null default 'pending',
  paid_at       timestamptz,
  receipt_no    text,
  payer_name    text,
  payer_email   text,
  recorded_by   uuid references auth.users(id),
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  foreign key (assembly_id, member_id) references members (assembly_id, id),
  foreign key (assembly_id, fund_id)   references funds   (assembly_id, id),
  check (channel <> 'online' or (provider is not null and provider_ref is not null)),
  unique (provider, provider_ref),
  unique (assembly_id, receipt_no)
);
create index gifts_member_idx on gifts (member_id, created_at desc);

create function gifts_receipt() returns trigger
language plpgsql as $$
declare slug text;
begin
  if new.status = 'succeeded' and new.receipt_no is null then
    select upper(a.slug) into slug from assemblies a where a.id = new.assembly_id;
    new.receipt_no := slug || '-' || to_char(now(), 'YYYY') || '-' ||
                      lpad(next_counter(new.assembly_id, 'receipt_' || to_char(now(), 'YYYY'))::text, 6, '0');
    new.paid_at := coalesce(new.paid_at, now());
  end if;
  return new;
end $$;
create trigger gifts_receipt_trg before insert or update on gifts
  for each row execute function gifts_receipt();
