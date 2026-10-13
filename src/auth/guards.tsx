import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './AuthProvider';
import { Spinner, Empty } from '@/components/ui';

export function RequireAuth() {
  const { loading, session, member, signOut } = useAuth();
  const loc = useLocation();
  if (loading) return <Spinner label="Opening your dashboard" />;
  if (!session) return <Navigate to="/login" state={{ from: loc.pathname }} replace />;
  if (member?.status === 'archived') {
    return (
      <div className="mx-auto max-w-md p-8 text-center">
        <h1 className="font-serif text-2xl font-bold text-brand-900">Your access has been removed</h1>
        <p className="mt-3 text-sm text-gray-600">Your membership access to this assembly is no longer active. If you believe this is a mistake, please speak to the church office.</p>
        <button onClick={() => void signOut()} className="mt-6 rounded-lg bg-brand-700 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-800">Sign out</button>
      </div>
    );
  }
  return <Outlet />;
}

type Gate = 'admin' | 'office' | 'finance' | 'ssLead' | 'usher' | 'ssStaff' | 'staff';
export function RequireAccess({ allow }: { allow: Gate[] }) {
  const a = useAuth();
  const ok = allow.some((g) => ({
    admin: a.isAdmin, office: a.isOffice, finance: a.isFinance, ssLead: a.isSsLead, usher: a.isUsher,
    ssStaff: a.isSsLead || a.isClassStaff, staff: a.isStaff,
  }[g]));
  if (!ok) return <Empty title="You don't have access to this page" hint="If you think this is a mistake, ask your assembly administrator to check your role." />;
  return <Outlet />;
}
