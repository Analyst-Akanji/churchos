import { CalendarClock, MapPin } from 'lucide-react';
import { clock, dayLabel, groupByDay, timeRange, usePublicProgramme, type ProgrammeItem } from '@/lib/programme';
import { Spinner } from './ui';

/** Presentational: programme items grouped by day. */
export function ProgrammeDays({ items, compact = false, emptyText }: { items: ProgrammeItem[]; compact?: boolean; emptyText?: string }) {
  const days = groupByDay(items);
  if (days.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-8 text-center">
        <CalendarClock className="mx-auto h-8 w-8 text-gold-500" />
        <p className="mt-3 font-medium text-brand-900">{emptyText ?? "This week's programme will be posted here soon."}</p>
        <p className="mt-1 text-sm text-gray-500">Please check back, or contact the church office.</p>
      </div>
    );
  }
  return (
    <div className={compact ? 'grid gap-4 md:grid-cols-2 lg:grid-cols-3' : 'space-y-4'}>
      {days.map((d) => (
        <div key={d.date} className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
          <div className="bg-brand-900 px-5 py-3 font-serif text-base font-bold text-white">{dayLabel(d.date)}</div>
          <ul className="divide-y divide-gray-100">
            {d.items.map((it) => (
              <li key={it.id} className="flex gap-4 px-5 py-4">
                <div className="w-20 shrink-0 text-sm font-semibold text-gold-600">{clock(it.start_time)}</div>
                <div className="min-w-0">
                  <div className="font-semibold text-brand-900">{it.title}</div>
                  {it.end_time && <div className="text-xs text-gray-500">{timeRange(it)}</div>}
                  {it.venue && <div className="mt-0.5 flex items-center gap-1 text-xs text-gray-500"><MapPin className="h-3 w-3" />{it.venue}</div>}
                  {it.details && <p className="mt-1 whitespace-pre-line text-sm text-gray-600">{it.details}</p>}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** The public website's "this week": fed by the church office from Weekly programme in the app. */
export function ProgrammeBoard({ compact = false }: { compact?: boolean }) {
  const { data, isLoading } = usePublicProgramme();
  if (isLoading) return <Spinner />;
  return <ProgrammeDays items={data ?? []} compact={compact} />;
}
