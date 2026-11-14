import { useEffect, useState } from 'react';
import { usePublicList } from '@/lib/publicData';
import { clock } from '@/lib/programme';
import { timeRange, type PublicOrderRow } from '@/lib/serviceOrder';

const dateLabel = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  });

/** Today's date and the minutes since midnight in Lagos, wherever the visitor's phone says it is. */
function lagosNow() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return { date: `${get('year')}-${get('month')}-${get('day')}`, minutes: Number(get('hour')) * 60 + Number(get('minute')) };
}
const toMin = (t: string | null) => {
  if (!t) return null;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

/**
 * The next published order of service: date, theme line, moderator, closing time, and every part of
 * the service with its time and who is taking it. On the day itself it also shows what is happening
 * now and what comes next. Shows nothing until an admin publishes one.
 */
export function OrderOfService() {
  const list = usePublicList<PublicOrderRow>('v_public_order_of_service', 'service_date', true, 150);
  const [now, setNow] = useState(lagosNow);
  useEffect(() => {
    const t = setInterval(() => setNow(lagosNow()), 30_000);
    return () => clearInterval(t);
  }, []);

  const rows = list.data ?? [];
  if (rows.length === 0) return null;

  // The view only holds today and later, so the earliest service is the next one.
  const first = [...rows].sort((a, b) => a.service_date.localeCompare(b.service_date))[0];
  const items = rows.filter((r) => r.service_id === first.service_id).sort((a, b) => a.sort_order - b.sort_order);

  // The service closes when the last timed part ends.
  const closes = items.reduce<string | null>((latest, it) => (it.end_time && (!latest || it.end_time > latest) ? it.end_time : latest), null);

  const isToday = first.service_date === now.date;
  const timed = items.filter((it) => it.kind === 'item' && toMin(it.start_time) !== null);
  let currentId: string | null = null;
  let nextId: string | null = null;
  let beforeStart = false;
  let finished = false;
  if (isToday && timed.length > 0) {
    for (let i = 0; i < timed.length; i++) {
      const start = toMin(timed[i].start_time) as number;
      const explicitEnd = toMin(timed[i].end_time);
      const end = explicitEnd ?? (i + 1 < timed.length ? (toMin(timed[i + 1].start_time) as number) : start + 1);
      if (currentId === null && start <= now.minutes && now.minutes < end) currentId = timed[i].id;
      if (nextId === null && start > now.minutes) nextId = timed[i].id;
    }
    beforeStart = now.minutes < (toMin(timed[0].start_time) as number);
    const closeMin = toMin(closes);
    finished = closeMin !== null && now.minutes >= closeMin;
  }
  const current = items.find((it) => it.id === currentId);
  const next = items.find((it) => it.id === nextId);
  const who = (it: PublicOrderRow) => (it.assignee ? ` · ${it.assignee}` : '');

  return (
    <div className="mt-8 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="bg-gradient-to-br from-brand-900 to-brand-700 px-5 py-5 text-white sm:px-6">
        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-gold-400">Order of service</div>
        <h3 className="mt-1 font-serif text-2xl font-bold">{dateLabel(first.service_date)}</h3>
        {first.theme_line && <p className="mt-1 text-sm font-semibold uppercase tracking-wide text-gold-400">{first.theme_line}</p>}
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-brand-100">
          {first.moderator && <p>Moderator: <span className="font-semibold text-white">{first.moderator}</span></p>}
          {closes && <p>Service closes at <span className="font-semibold text-white">{clock(closes)}</span></p>}
        </div>

        {isToday && timed.length > 0 && (
          <div className="mt-4 space-y-1 rounded-xl bg-white/10 px-4 py-3 text-sm" aria-live="polite">
            {finished ? (
              <p>Today's service has closed. God bless you.</p>
            ) : beforeStart ? (
              <p>Today's service begins at <span className="font-semibold">{clock(timed[0].start_time)}</span>.</p>
            ) : (
              <>
                {current && <p><span className="font-semibold text-gold-400">Now:</span> {current.title}{who(current)}</p>}
                {next && <p><span className="font-semibold text-gold-400">Next:</span> {next.title}{who(next)} at {clock(next.start_time)}</p>}
              </>
            )}
          </div>
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
            <li
              key={it.id}
              className={`grid gap-x-4 gap-y-0.5 border-t border-gray-100 px-5 py-3 sm:grid-cols-[9rem_1fr_auto] sm:px-6 ${it.id === currentId ? 'bg-amber-50' : ''}`}
            >
              <span className="text-sm text-gray-500">{timeRange(it.start_time, it.end_time)}</span>
              <span>
                <span className="font-semibold text-brand-900">{it.title}</span>
                {it.id === currentId && <span className="ml-2 rounded-full bg-gold-500 px-2 py-0.5 text-xs font-semibold text-white">Now</span>}
                {it.id === nextId && !finished && <span className="ml-2 rounded-full bg-brand-100 px-2 py-0.5 text-xs font-semibold text-brand-800">Next</span>}
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
