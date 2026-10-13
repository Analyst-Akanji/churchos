import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthProvider';
import { supabase, q } from './supabase';

export interface RemovedMember {
  id: string; first_name: string; last_name: string; phone: string | null; whatsapp: string | null;
  removed_at: string | null; removal_reason: string | null;
}

/** Members who were removed from the church (kept on record). Visible to the church office only. */
export function useRemovedMembers() {
  const { assembly, isOffice } = useAuth();
  return useQuery({
    queryKey: ['removed-members', assembly?.id], enabled: !!assembly && isOffice,
    queryFn: () => q<RemovedMember[]>(supabase.from('members').select('id, first_name, last_name, phone, whatsapp, removed_at, removal_reason').eq('assembly_id', assembly!.id).eq('status', 'archived').order('removed_at', { ascending: false })),
  });
}
