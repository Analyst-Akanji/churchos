import { usePublicList } from '@/lib/publicData';
import { timeRange, type PublicOrderRow } from '@/lib/serviceOrder';

const dateLabel = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  });

/**
 * The next published order of service: date, theme line, moderator, and every part of the
 * service with its time and who is taking it. Shows nothing until an admin publishes one.
 */
export function OrderOfService() {
  const list = usePublicList<PublicOrderRow>('v_public_order_of_service', 'service_date', true, 150);
  const rows = list.data ?? [];
  if (rows.length === 0) return null;

  // The view only holds today and later, so the earliest service is the next one.
  const first = [...rows].sort((a, b) => a.service_date.localeCompare(b.service_date))[0];
  const items = rows.filter((r) => r.service_id === first.service_id).sort((a, b) => a.sort_order - b.sort_order);

  return (
    <div className="mt-8 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="bg-gradient-to-br from-brand-900 to-brand-700 px-5 py-5 text-white sm:px-6">
        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-gold-400">Order of service</div>
        <h3 className="mt-1 font-serif text-2xl font-bold">{dateLabel(first.service_date)}</h3>
        {first.theme_line && <p className="mt-1 text-sm font-semibold uppercase tracking-wide text-gold-400">{first.theme_line}</p>}
        {first.moderator && (
          <p className="mt-3 text-sm text-brand-100">Moderator: <span className="font-semibold text-white">{first.moderator}</span></p>
        )}
      </div>

      <ol>
        {items.map((it) =>
          it.kind === 'heading' ? (
            <li key={it.id} className="flex flex-wrap items-baseline gap-x-3 bg-gray-50 px-5 py-2.5 sm:px-6">
              <span className="font-serif text-base font-bold uppercase tracking-wide text-brand-900">{it.title}</span>
              <span className="text-sm text-gray-600">{timeRange(it.start_time, it.end_time)}</span>
            </li>
          ) : (
            <li key={it.id} className="grid gap-x-4 gap-y-0.5 border-t border-gray-100 px-5 py-3 sm:grid-cols-[9rem_1fr_auto] sm:px-6">
              <span className="text-sm text-gray-500">{timeRange(it.start_time, it.end_time)}</span>
              <span>
                <span className="font-semibold text-brand-900">{it.title}</span>
                {it.lesson_title && <span className="block text-sm text-gray-600">{it.lesson_title}</span>}
              </span>
              {it.assignee && <span className="text-sm font-medium text-brand-800 sm:text-right">{it.assignee}</span>}
            </li>
          ),
        )}
      </ol>
    </div>
  );
}
