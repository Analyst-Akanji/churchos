import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthProvider';
import { supabase, q } from './supabase';

export interface Position { id: string; name: string; sort_order: number; is_active: boolean }
export interface MemberPosition { id: string; member_id: string; position_id: string }

export function usePositions() {
  const { assembly } = useAuth();
  return useQuery({ queryKey: ['positions', assembly?.id], enabled: !!assembly,
    queryFn: () => q<Position[]>(supabase.from('church_positions').select('*').eq('assembly_id', assembly!.id).eq('is_active', true).order('sort_order').order('name')) });
}
export function useMemberPositions() {
  const { assembly } = useAuth();
  return useQuery({ queryKey: ['member-positions', assembly?.id], enabled: !!assembly,
    queryFn: () => q<MemberPosition[]>(supabase.from('member_positions').select('id, member_id, position_id').eq('assembly_id', assembly!.id).limit(5000)) });
}
