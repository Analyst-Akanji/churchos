import { useQuarter } from '@/hooks/useQuarter';
import {
  daysBetween,
  formatShortDate,
  formatSunday,
  pickUpcoming,
  todayInLagos,
  totalLessons,
} from '@/lib/quarter';

/** A light card for the dark homepage hero: this Sunday's Sunday school lesson. */
export default function ThisSundayCard() {
  const state = useQuarter();

  if (state.status === 'loading') {
    return (
      <section
        className="w-full max-w-md animate-pulse rounded-2xl bg-white p-6 shadow-2xl motion-reduce:animate-none"
        aria-busy="true"
        aria-label="Loading this Sunday's lesson"
      >
        <div className="h-4 w-1/2 rounded bg-gray-200" />
        <div className="mt-4 h-8 w-5/6 rounded bg-gray-200" />
        <div className="mt-4 h-4 w-2/3 rounded bg-gray-200" />
      </section>
    );
  }

  // A public page should never show a broken card. The error is already logged.
  if (state.status === 'error') return null;

  const { quarter } = state;
  const today = todayInLagos();
  const upcoming = quarter ? pickUpcoming(quarter.lessons, today) : null;

  if (!quarter || !upcoming || !upcoming.current) {
    return (
      <section className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl" aria-labelledby="tsc-empty">
        <h3 id="tsc-empty" className="text-lg font-medium text-gray-600">
          The next quarter's lessons will appear here once they are added.
        </h3>
      </section>
    );
  }

  const { current, next, sorted, index } = upcoming;
  const daysAway = daysBetween(today, current.lesson_date);
  const when = daysAway === 0 ? 'Today' : daysAway <= 6 ? 'This Sunday' : 'Coming up';
  const lessonCount = totalLessons(quarter.lessons);
  const isSharing = current.kind === 'sharing';

  return (
    <section className="w-full max-w-md rounded-2xl bg-white p-6 text-gray-900 shadow-2xl" aria-labelledby="tsc-title">
      <p className="text-sm text-brand-900">
        <strong className="font-bold">{when}</strong>, {formatSunday(current.lesson_date)}
      </p>

      <h3 id="tsc-title" className="mt-2 text-2xl font-bold leading-tight text-brand-900 [text-wrap:balance]">
        {current.title}
      </h3>

      <p className="mt-2 text-sm text-gray-600">
        {isSharing
          ? 'The last Sunday of the quarter, with no lesson. We share testimonies and admonish one another.'
          : `Lesson ${current.lesson_number} of ${lessonCount}${
              current.unit ? `, Unit ${current.unit.unit_number}: ${current.unit.title}` : ''
            }`}
      </p>

      <div className="mt-5">
        <ol className="flex items-center gap-1" aria-label={`${quarter.title} progress`}>
          {sorted.map((l, i) => {
            const pos = i < index ? 'done' : i === index ? 'now' : 'ahead';
            const base = 'flex-1 rounded-full';
            const look =
              pos === 'done'
                ? 'h-1.5 bg-brand-900'
                : pos === 'now'
                  ? l.kind === 'sharing'
                    ? 'h-3 border-2 border-amber-600'
                    : 'h-3 bg-amber-600'
                  : l.kind === 'sharing'
                    ? 'h-1.5 border border-gray-300'
                    : 'h-1.5 bg-gray-200';
            return (
              <li key={l.id} className={`${base} ${look}`} aria-current={pos === 'now' ? 'step' : undefined}>
                <span className="sr-only">
                  {l.kind === 'sharing' ? 'Sharing and Admonition' : `Lesson ${l.lesson_number}`},{' '}
                  {formatShortDate(l.lesson_date)}
                  {pos === 'done' ? ', done' : pos === 'now' ? ', up next' : ''}
                </span>
              </li>
            );
          })}
        </ol>
        <p className="mt-2 text-xs text-gray-600">{quarter.theme}</p>
      </div>

      {next && (
        <p className="mt-4 border-t border-gray-200 pt-3 text-sm">
          Next, {formatShortDate(next.lesson_date)}: {next.title}
        </p>
      )}
    </section>
  );
}
