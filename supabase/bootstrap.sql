-- =====================================================================
-- One-time bootstrap: creates your assembly and makes YOU its admin.
-- Run in the Supabase SQL editor AFTER:
--   1. migrations 0001 to 0007 have been applied, and
--   2. you have signed up in the app (so your login exists).
-- Edit the three values marked CHANGE, then run.
-- =====================================================================
do $$
declare
  v_email text := 'CHANGE_ME@example.com';   -- CHANGE: the email you signed up with
  v_first text := 'CHANGE';                   -- CHANGE: your first name
  v_last  text := 'CHANGE';                   -- CHANGE: your last name
  uid uuid; aid uuid;
begin
  select id into uid from auth.users where email = v_email;
  if uid is null then raise exception 'No login found for %. Sign up in the app first.', v_email; end if;

  insert into platform_admins (user_id) values (uid) on conflict do nothing;

  insert into assemblies (slug, name, district, city, state)
  values ('mount-zion', 'Mount Zion Sanctuary', 'P.P.S Osogbo, Ring Road District', 'Osogbo', 'Osun State')
  returning id into aid;   -- default scoring criteria, grade bands and funds are seeded automatically

  insert into members (assembly_id, user_id, first_name, last_name, age_group)
  values (aid, uid, v_first, v_last, 'adult');

  insert into user_roles (assembly_id, user_id, role) values (aid, uid, 'assembly_admin'), (aid, uid, 'member');
  raise notice 'Done. Assembly % created and % is its admin.', aid, v_email;
end $$;
