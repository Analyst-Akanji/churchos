import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import QuarterSetupBanner from '../../admin/QuarterSetupBanner';
import { fetchQuarters, type AdminQuarter } from '../../lib/curriculumApi';
import { formatShortDate } from '../../lib/quarter';

/** Lists the lesson curriculum by quarter, with a way to add the next one. */
export default function Curriculum() {
  const [quarters, setQuarters] = useState<AdminQuarter[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchQuarters()
      .then(setQuarters)
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load the curriculum.'));
  }, []);

  return (
    <div className="mx-auto max-w-2xl p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-brand-900">Lesson curriculum</h1>
        <Link
          to="/app/sunday-school/curriculum/new"
          className="rounded-lg bg-brand-900 px-4 py-2 font-semibold text-white hover:opacity-90"
        >
          Set up next quarter
        </Link>
      </div>

      <QuarterSetupBanner />

      {error && <p className="rounded-lg border border-red-300 p-3 text-red-700" role="alert">{error}</p>}
      {!quarters && !error && <p aria-busy="true">Loading…</p>}

      <ul className="space-y-3">
        {quarters?.map((q) => (
          <li key={q.id} className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-semibold text-brand-900">{q.title}</h2>
              <Link to={`/app/sunday-school/curriculum/${q.id}`} className="text-sm font-semibold text-brand-900 underline">
                Edit topics
              </Link>
            </div>
            <p className="text-gray-800">{q.theme}</p>
            <p className="text-sm text-gray-600">
              {formatShortDate(q.starts_on)} to {formatShortDate(q.ends_on)}, {q.lessons.filter((l) => l.kind === 'lesson').length} lessons
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
