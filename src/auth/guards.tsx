import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './AuthProvider';
import { Spinner, Empty } from '@/components/ui';

export function RequireAuth() {
  const { loading, session } = useAuth();
  const loc = useLocation();
  if (loading) return <Spinner label="Opening your dashboard" />;
  if (!session) return <Navigate to="/login" state={{ from: loc.pathname }} replace />;
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
