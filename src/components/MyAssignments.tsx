import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthProvider';
import { supabase, q } from '@/lib/supabase';
import { clock, dayLabel } from '@/lib/programme';
import { Badge, Card } from '@/components/ui';

interface Row {
  service_id: string; service_date: string; starts_at: string; theme_line: string | null;
  role_title: string; is_moderator: boolean; start_time: string | null; end_time: string | null;
  minutes: number | null; sort_order: number;
}

/** The member's own upcoming duties in a published order of service. Shows nothing when they have none. */
export function MyAssignments() {
  const { member } = useAuth();
  const rows = useQuery({
    queryKey: ['my-assignments', member?.id], enabled: !!member,
    queryFn: () => q<Row[]>(supabase.rpc('my_service_assignments')),
  });
  const list = rows.data ?? [];
  if (list.length === 0) return null;

  return (
    <Card title="Your assignments">
      <ul className="divide-y divide-gray-100">
        {list.map((r, i) => (
          <li key={`${r.service_id}-${i}`} className="flex flex-wrap items-center justify-between gap-2 py-3">
            <div className="min-w-0">
              <div className="font-medium text-brand-900">{r.is_moderator ? 'Moderator for the service' : r.role_title}</div>
              <div className="text-sm text-gray-600">
                {dayLabel(r.service_date)}
                {r.start_time ? `, ${clock(r.start_time)}${r.end_time ? ` to ${clock(r.end_time)}` : ''}` : ''}
              </div>
              {r.theme_line && <div className="text-xs text-gray-500">{r.theme_line}</div>}
            </div>
            {r.is_moderator && <Badge tone="purple">Moderator</Badge>}
          </li>
        ))}
      </ul>
    </Card>
  );
}
