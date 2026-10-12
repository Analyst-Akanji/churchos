export const env = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
  supabaseKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
  publicAssemblySlug: import.meta.env.VITE_PUBLIC_ASSEMBLY_SLUG ?? 'mount-zion',
};
export const isConfigured = Boolean(env.supabaseUrl && env.supabaseKey);
