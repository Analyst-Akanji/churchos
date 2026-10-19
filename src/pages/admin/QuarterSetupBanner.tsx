import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui';
import { fetchQuarters } from '@/lib/curriculumApi';
import { daysBetween, formatShortDate, ordinal, todayInLagos } from '@/lib/quarter';

interface Props {
  /** Where the quarter builder lives. */
  setupTo?: string;
  /** Start reminding this many days before the last Sunday of the quarter. */
  warnDaysBefore?: number;
}

/**
 * Place this on an admin page. It stays hidden until the curriculum quarter is close
 * to ending and the next one has not been set up yet.
 */
export default function QuarterSetupBanner({
  setupTo = '/app/sunday-school/curriculum/new',
  warnDaysBefore = 28,
}: Props) {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const quarters = await fetchQuarters(); // newest first
        const latest = quarters[0];
        if (!latest || cancelled) return;

        const daysLeft = daysBetween(todayInLagos(), latest.ends_on);
        const next = ordinal((latest.quarter_number % 4) + 1);

        if (daysLeft < 0) {
          setMessage(`${latest.title} has ended and the ${next} Quarter has not been set up. The website has no lesson to show.`);
        } else if (daysLeft <= warnDaysBefore) {
          setMessage(`${latest.title} ends on ${formatShortDate(latest.ends_on)}. Add the ${next} Quarter's topics before it starts.`);
        }
      } catch {
        // The banner is a nudge only. Stay quiet if it cannot load.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [warnDaysBefore]);

  if (!message) return null;

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900" role="status">
      <p>{message}</p>
      <Link to={setupTo}>
        <Button size="sm">Set up next quarter</Button>
      </Link>
    </div>
  );
}
