import { createClient } from '@supabase/supabase-js';
import { env } from './env';

// The client is untyped on purpose: types live in src/types/db.ts and are applied at call sites via q<T>().
// Later you can generate types with `supabase gen types typescript` and swap them in.
export const supabase = createClient(env.supabaseUrl ?? 'http://localhost:54321', env.supabaseKey ?? 'missing-key', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

/** Await a Supabase query and return its data, throwing a normal Error on failure. */
export async function q<T>(p: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data as T;
}
