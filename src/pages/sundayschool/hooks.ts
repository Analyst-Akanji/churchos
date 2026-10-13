import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthProvider';
import { supabase, q } from '@/lib/supabase';
import { withCache } from '@/lib/offline/cache';
import type { Member, SsClass, SsQuarter } from '@/types/db';

export function useQuarters() {
  const { assembly } = useAuth();
  return useQuery({
    queryKey: ['quarters', assembly?.id], enabled: !!assembly,
    queryFn: () => withCache(`quarters:${assembly!.id}`, () =>
      q<SsQuarter[]>(supabase.from('ss_quarters').select('*').eq('assembly_id', assembly!.id).order('year', { ascending: false }).order('quarter_no', { ascending: false }))),
  });
}
export function useActiveQuarter() {
  const qs = useQuarters();
  return { ...qs, data: (qs.data ?? []).find((x) => x.status === 'active') ?? null };
}
export function useClasses(includeInactive = false) {
  const { assembly } = useAuth();
  return useQuery({
    queryKey: ['classes', assembly?.id, includeInactive], enabled: !!assembly,
    queryFn: () => withCache(`classes:${assembly!.id}:${includeInactive}`, async () => {
      let query = supabase.from('ss_classes').select('*').eq('assembly_id', assembly!.id).order('sort_order').order('name');
      if (!includeInactive) query = query.eq('is_active', true);
      return q<SsClass[]>(query);
    }),
  });
}
export function useMembersLite() {
  const { assembly, isStaff } = useAuth();
  return useQuery({
    queryKey: ['members-lite', assembly?.id], enabled: !!assembly && isStaff,
    queryFn: () => withCache(`members-lite:${assembly!.id}`, () =>
      q<Pick<Member, 'id' | 'first_name' | 'last_name' | 'age_group' | 'user_id' | 'phone' | 'whatsapp'>[]>(
        supabase.from('members').select('id, first_name, last_name, age_group, user_id, phone, whatsapp').eq('assembly_id', assembly!.id).neq('status', 'archived').order('last_name').order('first_name').limit(2000))),
  });
}
