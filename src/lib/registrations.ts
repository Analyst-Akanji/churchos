import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthProvider';
import { supabase } from './supabase';

export interface RegistrationRequest {
  id: string; assembly_id: string; user_id: string; email: string | null; first_name: string; last_name: string;
  whatsapp: string | null; date_of_birth: string | null; status: 'pending' | 'approved' | 'rejected'; member_id: string | null;
  note: string | null; created_at: string; reviewed_at: string | null;
}

/** Number of sign-ups waiting for the church office. Refreshes every minute. */
export function usePendingRegistrations() {
  const { assembly, isOffice } = useAuth();
  return useQuery({
    queryKey: ['pending-registrations', assembly?.id], enabled: !!assembly && isOffice, refetchInterval: 60_000,
    queryFn: async () => {
      const { count, error } = await supabase.from('registration_requests').select('id', { count: 'exact', head: true }).eq('assembly_id', assembly!.id).eq('status', 'pending');
      if (error) throw new Error(error.message);
      return count ?? 0;
    },
  });
}
