import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Card, Empty, Spinner } from '@/components/ui';
import { timeRange } from '@/lib/serviceOrder';

interface Assignment {
  service_id: string;
  service_date: string;
  theme_line: string | null;
  role_title: string;
  is_moderator: boolean;
  start_time: string | null;
  end_time: string | null;
  minutes: number | null;
}

const dayLabel = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

/**
 * The parts of upcoming services the signed-in member is taking. On a dashboard it stays
 * hidden when there is nothing; pass showEmpty on a page of its own to explain instead.
 */
export function MyAssignments({ showEmpty = false }: { showEmpty?: boolean }) {
  const list = useQuery({
    queryKey: ['my-assignments'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('my_service_assignments');
      if (error) throw error;
      return (data ?? []) as Assignment[];
    },
  });

  if (list.isLoading) return showEmpty ? <Spinner /> : null;
  const rows = list.data ?? [];

  if (rows.length === 0) {
    return showEmpty ? (
      <Empty title="Nothing assigned to you yet" hint="When the church office publishes an order of service with your name on it, it will show here." />
    ) : null;
  }

  const byService = new Map<string, Assignment[]>();
  rows.forEach((r) => byService.set(r.service_id, [...(byService.get(r.service_id) ?? []), r]));

  return (
    <div className="space-y-4">
      {[...byService.values()].map((group) => (
        <Card key={group[0].service_id} title={`You are on this ${dayLabel(group[0].service_date).split(' ')[0]}`}>
          <p className="text-sm text-gray-600">{dayLabel(group[0].service_date)}{group[0].theme_line ? ` · ${group[0].theme_line}` : ''}</p>
          <ul className="mt-3 divide-y divide-gray-100">
            {group.map((a, i) => (
              <li key={i} className="flex flex-wrap items-baseline justify-between gap-2 py-2.5">
                <span className="font-semibold text-brand-900">{a.is_moderator ? 'You are the moderator' : a.role_title}</span>
                {!a.is_moderator && a.start_time && (
                  <span className="text-sm text-gray-600">
                    {timeRange(a.start_time, a.end_time)}{a.minutes ? ` · ${a.minutes} min` : ''}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}
