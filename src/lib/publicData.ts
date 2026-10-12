import { useQuery } from '@tanstack/react-query';
import { supabase, q } from './supabase';
import { env } from './env';

export interface PublicAssembly { id: string; slug: string; name: string; denomination: string; district: string | null; address: string | null; city: string | null; contact_phone: string | null; contact_email: string | null }

export function usePublicAssembly() {
  return useQuery({
    queryKey: ['public', 'assembly', env.publicAssemblySlug],
    queryFn: async () => (await q<PublicAssembly[]>(supabase.from('v_public_assemblies').select('*').eq('slug', env.publicAssemblySlug)))[0] ?? null,
  });
}

/** Read a public view for the website's assembly. Returns [] until the assembly is known. */
export function usePublicList<T>(view: string, orderBy: string, ascending = true, limit = 50) {
  const a = usePublicAssembly();
  return useQuery({
    queryKey: ['public', view, a.data?.id],
    enabled: !!a.data?.id,
    queryFn: async () => q<T[]>(supabase.from(view).select('*').eq('assembly_id', a.data!.id).order(orderBy, { ascending }).limit(limit)),
  });
}
