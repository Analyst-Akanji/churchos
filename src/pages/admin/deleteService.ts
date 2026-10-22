import type { QueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

interface Preview {
  checkins: number;
  child_checkins: number;
  headcount: number;
  income_active: number;
  income_voided: number;
  order_items: number;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Shows what deleting a service will remove, asks the admin to confirm, then deletes it.
 * Refuses when the service still has income entries that are not voided. Returns true if deleted.
 */
export async function confirmAndDeleteService(
  label: string,
  serviceId: string,
  toast: { ok: (m: string) => void; err: (m: string) => void },
  qc: QueryClient,
): Promise<boolean> {
  const { data, error } = await supabase.rpc('service_delete_preview', { p_service: serviceId });
  if (error) { toast.err(error.message); return false; }
  const p = data as Preview;

  if (p.income_active > 0) {
    toast.err(`"${label}" has ${plural(p.income_active, 'income entry', 'income entries')} that ${p.income_active === 1 ? 'is' : 'are'} not voided. Void ${p.income_active === 1 ? 'it' : 'them'} on the Income tab first, then delete.`);
    return false;
  }

  const parts: string[] = [];
  if (p.checkins) parts.push(plural(p.checkins, 'check-in', 'check-ins'));
  if (p.child_checkins) parts.push(plural(p.child_checkins, 'child check-in', 'child check-ins'));
  if (p.headcount) parts.push('the headcount');
  if (p.income_voided) parts.push(plural(p.income_voided, 'voided income entry', 'voided income entries'));
  if (p.order_items) parts.push(`the order of service (${plural(p.order_items, 'item', 'items')})`);

  const detail = parts.length ? `This will also remove: ${parts.join(', ')}.` : 'Nothing else is attached to it.';
  if (!confirm(`Delete "${label}"?\n\n${detail}\n\nThis cannot be undone.`)) return false;

  const { error: e2 } = await supabase.rpc('delete_service', { p_service: serviceId });
  if (e2) { toast.err(e2.message); return false; }
  toast.ok('Service deleted');
  void qc.invalidateQueries();
  return true;
}
