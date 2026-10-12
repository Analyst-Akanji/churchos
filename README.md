# ChurchOS (working title)

Church website and management platform for GOFAMINT Mount Zion Sanctuary, Osogbo. Built to be reused by other assemblies (every record carries an `assembly_id`).

**Stack:** Vite, React 18, TypeScript, React Router, Tailwind CSS, TanStack Query, Supabase (Postgres, Auth, RLS), PWA with an offline outbox (IndexedDB). Hosting: Vercel.

## 1. First-time setup

### a) Install and run locally
```bash
npm install
cp .env.example .env      # Windows: copy .env.example .env
# fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm run dev               # http://localhost:5173
```

### b) Create the database (Supabase)
1. Create a Supabase project. Copy the URL and the **anon public** key into `.env`.
2. SQL editor: run the files in `supabase/migrations/` **in order**, `0001` to `0007`. (Or use the Supabase CLI: `supabase link` then `supabase db push`.)
3. Authentication > Providers: keep Email on. While testing you may turn "Confirm email" off so sign-up is instant. Turn it back on before launch.
4. Authentication > URL configuration: add your Vercel URL (and `http://localhost:5173`) as allowed redirect URLs.

### c) Make yourself the admin
1. Open the app, go to `/register`, create your account (and confirm the email if required).
2. Edit and run `supabase/bootstrap.sql` in the SQL editor. It creates the assembly and makes you its admin.
3. Sign in. You should now see Sunday school, Services, Members, Roles and Settings in the menu.

### d) Configure the church
1. **Settings > Church location**: stand in the auditorium, press "Use my location", save. Test radius with several phones.
2. **Members**: add people; press **Invite** to give a person a code. They register, sign in and enter the code to link their login.
3. **Roles**: give church secretary, finance officer, superintendent and usher roles to linked members.
4. **Sunday school > Quarters**: create the quarter and Activate it. **Classes**: add classes, enrol students, assign a teacher and a secretary.
5. Edit `src/config/site.ts` for the public website text, contact details and weekly programme.

## 2. Day-to-day workflow (GitHub file swaps)
```bash
git add -A && git commit -m "describe the change" && git push
```
Vercel deploys `main` automatically; branches get preview URLs. GitHub Actions (`.github/workflows/ci.yml`) type-checks and builds every push.
**Database changes are always a new numbered file** in `supabase/migrations/` (never edit one that has been applied).

## 3. Deploy to Vercel
Import the GitHub repo. Framework preset: Vite. Add the three environment variables from `.env.example`. `vercel.json` already handles single-page-app routing.

## 4. Project map
```
src/
  config/site.ts          public website text (edit this)
  lib/                    supabase client, formatting, offline/ (outbox + cache)
  auth/                   login state, roles, route guards
  components/             UI kit, app shell, public layout, sync badge
  pages/public/           website
  pages/auth/             sign in, register
  pages/app/              member home, check-in, sync status
  pages/sundayschool/     quarters, classes, session editor, leaderboard
  pages/admin/            members, roles, services and income, content, settings
supabase/migrations/      the database (0001 to 0007)
supabase/bootstrap.sql    one-time first admin setup
```

## 5. What is built, and what is next
**Working in this scaffold:** sign-in and invite linking; roles; members; quarters, classes, enrolment; session editor (attendance, punctuality, memory verse, Bible reading, participation, visitors, class offering) that works offline; submit, reopen, lock; offering verification and voiding; live leaderboard and top three; quarter close with frozen grades and ranks; services, headcount, income with verification; geofenced member check-in (offline-capable) with usher review; events, sermons, announcements; public website; settings.

**Schema ready, screens still to build (Phase 4):** online giving and receipts, absentee follow-up list, birthdays and anniversaries, SMS/WhatsApp announcements, volunteer rota, children's check-in, prayer requests, parent view and student view of the leaderboard, QR check-in fallback, printable quarterly register, reports and exports, member import.

## 6. Honest notes
- Verified: the app type-checks and builds, all seven migrations apply cleanly, and the offline sync calls, security rules, geofence and scoring were exercised against a real Postgres through PostgREST (the API layer Supabase uses). The screens themselves have **not** yet been clicked through on a live Supabase project, so expect to find small UI bugs on first run. Report them and we fix them as file swaps.
- Opening a Sunday school session needs a connection once. The superintendent can pre-open sessions for all classes ("Open sessions for all classes"), after which teachers can work fully offline.
- A phone's location cannot be proven on the web. Check-in layers server-side distance, a time window and usher review; a QR fallback is planned.
- Add the real GOFAMINT logo at `public/logo.png` and wire it into the header when you have it.
