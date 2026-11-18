-- ChurchOS: Sunday school weekly scoring out of 50, to match the paper register.
--   Attendance      P or A only, no marks
--   Punctuality     15  (marked by the teacher or secretary)
--   Memory verse    15
--   Participation   20  (class participation / class work)
-- Run once in the Supabase SQL Editor.

update public.ss_scoring_criteria
   set label = 'Punctuality / On time', source = 'manual', max_points = 15, sort_order = 1, is_active = true, updated_at = now()
 where code = 'punctuality';

update public.ss_scoring_criteria
   set label = 'Memory verse', max_points = 15, sort_order = 2, is_active = true, updated_at = now()
 where code = 'memory_verse';

update public.ss_scoring_criteria
   set label = 'Class participation / Class work', max_points = 20, sort_order = 3, is_active = true, updated_at = now()
 where code = 'participation';

-- Attendance no longer earns points, and Bible reading is not part of the weekly marks.
-- They are switched off, not deleted, so nothing already recorded is lost.
update public.ss_scoring_criteria
   set is_active = false, updated_at = now()
 where code in ('attendance', 'bible_reading');

-- Check: should list three active criteria adding up to 50.
select code, label, source, max_points, is_active,
       sum(max_points) filter (where is_active) over () as active_total
  from public.ss_scoring_criteria
 order by is_active desc, sort_order;
