-- 005_visit_messages.sql
--
-- Messages sent from the public "Plan a visit" form.
-- Visitors cannot read or write this table directly. They call submit_visit_message(),
-- which validates the input and saves it. Only office users can read and manage messages.
--
-- Needs: assemblies, and the is_office(uuid) function your other policies already use.

-- ---------------------------------------------------------------------------
-- 1. The table
-- ---------------------------------------------------------------------------

create table if not exists public.visit_messages (
  id            uuid primary key default gen_random_uuid(),
  assembly_id   uuid not null references public.assemblies(id) on delete cascade,
  name          text not null check (char_length(name) between 1 and 120),
  phone         text check (phone is null or char_length(phone) <= 40),
  email         text check (email is null or char_length(email) <= 200),
  message       text not null check (char_length(message) between 1 and 2000),
  planned_visit date,
  people_count  smallint check (people_count is null or people_count between 1 and 100),
  status        text not null default 'new' check (status in ('new', 'read', 'replied', 'archived')),
  handled_by    uuid,
  handled_at    timestamptz,
  created_at    timestamptz not null default now()
);

create index if not exists visit_messages_inbox_idx
  on public.visit_messages (assembly_id, status, created_at desc);

-- ---------------------------------------------------------------------------
-- 2. Row level security: office only. No policy lets the public touch the table.
-- ---------------------------------------------------------------------------

alter table public.visit_messages enable row level security;

drop policy if exists "visit messages read" on public.visit_messages;
create policy "visit messages read" on public.visit_messages
  for select to authenticated
  using (public.is_office(assembly_id));

drop policy if exists "visit messages update" on public.visit_messages;
create policy "visit messages update" on public.visit_messages
  for update to authenticated
  using (public.is_office(assembly_id))
  with check (public.is_office(assembly_id));

drop policy if exists "visit messages delete" on public.visit_messages;
create policy "visit messages delete" on public.visit_messages
  for delete to authenticated
  using (public.is_office(assembly_id));

-- ---------------------------------------------------------------------------
-- 3. The public entry point.
--    Trims and limits every field, needs a name, a message and a way to reply, and
--    refuses floods (60 messages an hour overall, 5 an hour from the same phone/email).
--    The message is saved against the assembly in the assemblies table. This assumes
--    one assembly; if you ever host several, pass the assembly in instead.
-- ---------------------------------------------------------------------------

drop function if exists public.submit_visit_message(text, text, text, text, date, integer);
create function public.submit_visit_message(
  p_name          text,
  p_phone         text,
  p_email         text,
  p_message       text,
  p_planned_visit date    default null,
  p_people        integer default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_assembly uuid;
  v_name     text := left(trim(coalesce(p_name, '')), 120);
  v_phone    text := nullif(left(trim(coalesce(p_phone, '')), 40), '');
  v_email    text := nullif(left(trim(coalesce(p_email, '')), 200), '');
  v_msg      text := left(trim(coalesce(p_message, '')), 2000);
begin
  if v_name = '' or v_msg = '' then
    raise exception 'Please enter your name and a message.';
  end if;
  if v_phone is null and v_email is null then
    raise exception 'Please give a phone number or an email so we can reply.';
  end if;
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'That email address does not look right.';
  end if;

  if (select count(*) from public.visit_messages
        where created_at > now() - interval '1 hour') >= 60
     or (select count(*) from public.visit_messages
           where created_at > now() - interval '1 hour'
             and ((v_phone is not null and phone = v_phone)
               or (v_email is not null and lower(email) = lower(v_email)))) >= 5 then
    raise exception 'Too many messages right now. Please try again later or call us.';
  end if;

  select id into v_assembly from public.assemblies order by id limit 1;
  if v_assembly is null then
    raise exception 'Messages are not available right now.';
  end if;

  insert into public.visit_messages
    (assembly_id, name, phone, email, message, planned_visit, people_count)
  values
    (v_assembly, v_name, v_phone, v_email, v_msg, p_planned_visit,
     case when p_people between 1 and 100 then p_people::smallint end);
end $$;

revoke all on function public.submit_visit_message(text, text, text, text, date, integer) from public;
grant execute on function public.submit_visit_message(text, text, text, text, date, integer) to anon, authenticated;
