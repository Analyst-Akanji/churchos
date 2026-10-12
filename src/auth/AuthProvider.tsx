import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase, q } from '@/lib/supabase';
import { withCache } from '@/lib/offline/cache';
import { startOutbox } from '@/lib/offline/outbox';
import type { Assembly, ClassStaffRow, Member, Role } from '@/types/db';

interface Ctx {
  loading: boolean;
  session: Session | null;
  user: User | null;
  member: Member | null;
  assembly: Assembly | null;
  roles: Role[];
  classStaff: ClassStaffRow[];
  isAdmin: boolean; isOffice: boolean; isFinance: boolean; isSsLead: boolean; isUsher: boolean; isClassStaff: boolean; isStaff: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<{ needsConfirmation: boolean }>;
  signOut: () => Promise<void>;
  reload: () => Promise<void>;
}
const AuthCtx = createContext<Ctx | null>(null);
export const useAuth = () => {
  const c = useContext(AuthCtx);
  if (!c) throw new Error('useAuth outside AuthProvider');
  return c;
};

interface Loaded { member: Member | null; assembly: Assembly | null; roles: Role[]; classStaff: ClassStaffRow[] }
const EMPTY: Loaded = { member: null, assembly: null, roles: [], classStaff: [] };

async function loadContext(uid: string): Promise<Loaded> {
  return withCache(`ctx:${uid}`, async () => {
    const members = await q<Member[]>(supabase.from('members').select('*').eq('user_id', uid));
    const roleRows = await q<{ assembly_id: string; role: Role }[]>(supabase.from('user_roles').select('assembly_id, role').eq('user_id', uid));
    const member = members[0] ?? null;
    const assemblyId = member?.assembly_id ?? roleRows[0]?.assembly_id ?? null;
    if (!assemblyId) return EMPTY;
    const assemblies = await q<Assembly[]>(supabase.from('assemblies').select('*').eq('id', assemblyId));
    const classStaff = member
      ? await q<ClassStaffRow[]>(supabase.from('ss_class_staff').select('*').eq('member_id', member.id).eq('is_active', true))
      : [];
    return { member, assembly: assemblies[0] ?? null, roles: roleRows.filter((r) => r.assembly_id === assemblyId).map((r) => r.role), classStaff };
  });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [booting, setBooting] = useState(true);
  const [ctx, setCtx] = useState<Loaded>(EMPTY);
  const [ctxLoading, setCtxLoading] = useState(false);
  const uid = session?.user.id ?? null;

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setBooting(false); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const reload = useCallback(async () => {
    if (!uid) { setCtx(EMPTY); return; }
    setCtxLoading(true);
    try { setCtx(await loadContext(uid)); } catch { setCtx(EMPTY); } finally { setCtxLoading(false); }
  }, [uid]);

  useEffect(() => { void reload(); startOutbox(uid); }, [uid, reload]);

  const value = useMemo<Ctx>(() => {
    const has = (...r: Role[]) => ctx.roles.some((x) => r.includes(x));
    const isClassStaff = ctx.classStaff.length > 0;
    return {
      loading: booting || ctxLoading,
      session, user: session?.user ?? null,
      ...ctx,
      isAdmin: has('assembly_admin'),
      isOffice: has('assembly_admin', 'church_secretary'),
      isFinance: has('assembly_admin', 'finance_officer'),
      isSsLead: has('assembly_admin', 'superintendent'),
      isUsher: has('assembly_admin', 'church_secretary', 'usher'),
      isClassStaff,
      isStaff: ctx.roles.some((r) => r !== 'member') || isClassStaff,
      signIn: async (email, password) => {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw new Error(error.message);
      },
      signUp: async (email, password) => {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw new Error(error.message);
        return { needsConfirmation: !data.session };
      },
      signOut: async () => { await supabase.auth.signOut(); setCtx(EMPTY); },
      reload,
    };
  }, [session, booting, ctx, ctxLoading, reload]);

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}
