-- 001_quarters_and_lessons.sql
-- Sunday school curriculum: one quarter has units, and units have weekly lessons.
-- The curriculum is shared by every assembly, so these tables carry no assembly_id.
-- Each assembly's attendance and scores will reference lessons.id later.

create table if not exists public.quarters (
  id             uuid primary key default gen_random_uuid(),
  quarter_number smallint not null check (quarter_number between 1 and 4),
  title          text not null,
  theme          text not null,
  starts_on      date not null,
  ends_on        date not null,
  created_at     timestamptz not null default now(),
  constraint quarters_starts_on_key unique (starts_on),
  constraint quarters_dates_check check (ends_on >= starts_on)
);

create table if not exists public.units (
  id          uuid primary key default gen_random_uuid(),
  quarter_id  uuid not null references public.quarters(id) on delete cascade,
  unit_number smallint not null,
  title       text not null,
  constraint units_quarter_unit_key unique (quarter_id, unit_number)
);

create table if not exists public.lessons (
  id            uuid primary key default gen_random_uuid(),
  quarter_id    uuid not null references public.quarters(id) on delete cascade,
  unit_id       uuid references public.units(id) on delete set null,
  lesson_number smallint,
  lesson_date   date not null,
  title         text not null,
  kind          text not null default 'lesson' check (kind in ('lesson', 'sharing')),
  constraint lessons_quarter_date_key unique (quarter_id, lesson_date),
  constraint lessons_number_matches_kind check (
    (kind = 'lesson'  and lesson_number is not null) or
    (kind = 'sharing' and lesson_number is null)
  )
);

create index if not exists lessons_lesson_date_idx on public.lessons (lesson_date);

-- Row level security: anyone (including visitors to the public site) can read the
-- curriculum. There are no insert/update/delete policies on purpose. Curriculum is
-- added through the SQL editor or service role until the admin module needs to edit it.
alter table public.quarters enable row level security;
alter table public.units    enable row level security;
alter table public.lessons  enable row level security;

drop policy if exists "quarters are public to read" on public.quarters;
create policy "quarters are public to read" on public.quarters
  for select to anon, authenticated using (true);

drop policy if exists "units are public to read" on public.units;
create policy "units are public to read" on public.units
  for select to anon, authenticated using (true);

drop policy if exists "lessons are public to read" on public.lessons;
create policy "lessons are public to read" on public.lessons
  for select to anon, authenticated using (true);

-- ---------------------------------------------------------------------------
-- Seed: 1st Quarter, September to November 2026 (safe to re-run)
-- ---------------------------------------------------------------------------

insert into public.quarters (quarter_number, title, theme, starts_on, ends_on)
values (1, '1st Quarter', 'The Theology of Hard Work', date '2026-09-06', date '2026-11-29')
on conflict (starts_on) do update
  set quarter_number = excluded.quarter_number,
      title          = excluded.title,
      theme          = excluded.theme,
      ends_on        = excluded.ends_on;

insert into public.units (quarter_id, unit_number, title)
select q.id, v.unit_number, v.title
from public.quarters q
cross join (values
  (1, 'Understanding the Holy Spirit'),
  (2, 'Man Mandated to Work'),
  (3, 'Hard Work: Pathway to Financial Freedom')
) as v(unit_number, title)
where q.starts_on = date '2026-09-06'
on conflict (quarter_id, unit_number) do update
  set title = excluded.title;

insert into public.lessons (quarter_id, unit_id, lesson_number, lesson_date, title, kind)
select q.id, u.id, v.lesson_number, v.lesson_date::date, v.title, v.kind
from public.quarters q
cross join (values
  (1,  1, '2026-09-06', 'God Worked To Put In Place All Creation',      'lesson'),
  (2,  1, '2026-09-13', 'God Designed Man To Work',                     'lesson'),
  (3,  1, '2026-09-20', 'The Gospel Endorses Hard Work',                'lesson'),
  (4,  2, '2026-09-27', 'Created Not To Be Idle',                       'lesson'),
  (5,  2, '2026-10-04', 'Created To Be Responsible',                    'lesson'),
  (6,  2, '2026-10-11', 'Created To Be Skillful',                       'lesson'),
  (7,  2, '2026-10-18', 'Created To Be Wise And Prudent',               'lesson'),
  (8,  3, '2026-10-25', 'The Value Of Contentment In Financial Freedom','lesson'),
  (9,  3, '2026-11-01', 'Wise Investments For A Prosperous Future',     'lesson'),
  (10, 3, '2026-11-08', 'Diligence And Planning In Small Businesses',   'lesson'),
  (11, 3, '2026-11-15', 'Preparation For Retirement',                   'lesson'),
  (12, 3, '2026-11-22', 'The Benefits Of Diligent Hard Work',           'lesson'),
  (null::int, null::int, '2026-11-29', 'Sharing & Admonition',          'sharing')
) as v(lesson_number, unit_number, lesson_date, title, kind)
left join public.units u
  on u.quarter_id = q.id and u.unit_number = v.unit_number
where q.starts_on = date '2026-09-06'
on conflict (quarter_id, lesson_date) do update
  set unit_id       = excluded.unit_id,
      lesson_number = excluded.lesson_number,
      title         = excluded.title,
      kind          = excluded.kind;
