import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { isConfigured } from './lib/env';
import { RequireAccess, RequireAuth } from './auth/guards';
import { AppShell } from './components/AppShell';
import { PublicLayout } from './components/PublicLayout';
import Home from './pages/public/Home';
import { About, ContactPage, EventsPage, SermonsPage, ServicesPage, VisitPage } from './pages/public/Pages';
import { ForgotPassword, Login, Register, ResetPassword } from './pages/auth/Auth';
import { Spinner } from './components/ui';

const Dashboard = lazy(() => import('./pages/app/Dashboard'));
const CheckInPage = lazy(() => import('./pages/app/CheckIn'));
const SyncPage = lazy(() => import('./pages/app/Sync'));
const ComingSoon = lazy(() => import('./pages/app/ComingSoon'));
const SsHome = lazy(() => import('./pages/sundayschool/SsHome'));
const Quarters = lazy(() => import('./pages/sundayschool/Quarters'));
const Curriculum = lazy(() => import('./pages/sundayschool/Curriculum'));
const CurriculumForm = lazy(() => import('./pages/sundayschool/CurriculumForm'));
const Classes = lazy(() => import('./pages/sundayschool/Classes'));
const ClassDetail = lazy(() => import('./pages/sundayschool/ClassDetail'));
const SessionEditor = lazy(() => import('./pages/sundayschool/SessionEditor'));
const Leaderboard = lazy(() => import('./pages/sundayschool/Leaderboard'));
const Members = lazy(() => import('./pages/admin/Members'));
const Roles = lazy(() => import('./pages/admin/Roles'));
const Services = lazy(() => import('./pages/admin/Services'));
const ServiceDetail = lazy(() => import('./pages/admin/ServiceDetail'));
const ContentManager = lazy(() => import('./pages/admin/ContentManager'));
const Settings = lazy(() => import('./pages/admin/Settings'));
const Programme = lazy(() => import('./pages/admin/Programme'));
const MyAttendance = lazy(() => import('./pages/app/MyAttendance'));
const MyProgress = lazy(() => import('./pages/app/MyProgress'));
const Profile = lazy(() => import('./pages/app/Profile'));
const Registrations = lazy(() => import('./pages/admin/Registrations'));

function MissingConfig() {
  return (
    <div className="mx-auto max-w-xl p-8">
      <h1 className="text-2xl font-bold text-brand-900">Almost there</h1>
      <p className="mt-3 text-gray-700">This app needs your Supabase details. Copy <code className="rounded bg-gray-100 px-1">.env.example</code> to <code className="rounded bg-gray-100 px-1">.env</code>, fill in <code className="rounded bg-gray-100 px-1">VITE_SUPABASE_URL</code> and <code className="rounded bg-gray-100 px-1">VITE_SUPABASE_ANON_KEY</code>, then restart <code className="rounded bg-gray-100 px-1">npm run dev</code>.</p>
    </div>
  );
}

export default function App() {
  if (!isConfigured) return <MissingConfig />;
  return (
    <Suspense fallback={<Spinner />}>
    <Routes>
      <Route element={<PublicLayout />}>
        <Route index element={<Home />} />
        <Route path="about" element={<About />} />
        <Route path="services" element={<ServicesPage />} />
        <Route path="events" element={<EventsPage />} />
        <Route path="sermons" element={<SermonsPage />} />
        <Route path="visit" element={<VisitPage />} />
        <Route path="contact" element={<ContactPage />} />
      </Route>
      <Route path="login" element={<Login />} />
      <Route path="register" element={<Register />} />
      <Route path="forgot-password" element={<ForgotPassword />} />
      <Route path="reset-password" element={<ResetPassword />} />

      <Route path="app" element={<RequireAuth />}>
        <Route element={<AppShell />}>
          <Route index element={<Dashboard />} />
          <Route path="check-in" element={<CheckInPage />} />
          <Route path="sync" element={<SyncPage />} />
          <Route path="my-attendance" element={<MyAttendance />} />
          <Route path="my-progress" element={<MyProgress />} />
          <Route path="profile" element={<Profile />} />
          <Route path="coming-soon" element={<ComingSoon />} />

          <Route element={<RequireAccess allow={['ssStaff']} />}>
            <Route path="sunday-school" element={<SsHome />} />
            <Route path="sunday-school/sessions/:sessionId" element={<SessionEditor />} />
            <Route path="sunday-school/leaderboard" element={<Leaderboard />} />
          </Route>
          <Route element={<RequireAccess allow={['ssLead']} />}>
            <Route path="sunday-school/quarters" element={<Quarters />} />
            <Route path="sunday-school/classes" element={<Classes />} />
            <Route path="sunday-school/classes/:classId" element={<ClassDetail />} />
          </Route>

          <Route element={<RequireAccess allow={['office', 'finance', 'usher']} />}>
            <Route path="services" element={<Services />} />
            <Route path="services/:serviceId" element={<ServiceDetail />} />
          </Route>
          <Route element={<RequireAccess allow={['staff']} />}><Route path="members" element={<Members />} /></Route>
          <Route element={<RequireAccess allow={['office']} />}>
            <Route path="content/:kind" element={<ContentManager />} />
            <Route path="programme" element={<Programme />} />
            <Route path="registrations" element={<Registrations />} />
          </Route>
          <Route element={<RequireAccess allow={['admin']} />}>
            <Route path="roles" element={<Roles />} />
            <Route path="sunday-school/curriculum" element={<Curriculum />} />
            <Route path="sunday-school/curriculum/new" element={<CurriculumForm />} />
            <Route path="sunday-school/curriculum/:id" element={<CurriculumForm />} />
            <Route path="settings" element={<Settings />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </Suspense>
  );
}
