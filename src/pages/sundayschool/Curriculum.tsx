import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Button, Card, Empty, PageHeader, Spinner } from '@/components/ui';
import QuarterSetupBanner from '@/pages/admin/QuarterSetupBanner';
import { fetchQuarters, type AdminQuarter } from '@/lib/curriculumApi';
import { formatShortDate, todayInLagos } from '@/lib/quarter';

/** Lists the lesson curriculum by quarter, with a way to add the next one or edit any of them. */
export default function Curriculum() {
  const [quarters, setQuarters] = useState<AdminQuarter[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchQuarters()
      .then(setQuarters)
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load the curriculum.'));
  }, []);

  const today = todayInLagos();

  return (
    <>
      <PageHeader
        title="Lesson curriculum"
        subtitle="The weekly lesson titles for each quarter, shown on the website and on each class register."
        actions={
          <Link to="/app/sunday-school/curriculum/new">
            <Button>Set up next quarter</Button>
          </Link>
        }
      />

      <QuarterSetupBanner />

      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-crimson-600" role="alert">{error}</p>}
      {!quarters && !error && <Spinner />}
      {quarters && quarters.length === 0 && (
        <Empty title="No quarters yet" hint="Set up the first quarter to start showing lessons on the website." />
      )}

      <div className="space-y-4">
        {quarters?.map((q) => {
          const state = q.starts_on > today ? 'upcoming' : q.ends_on >= today ? 'running' : 'ended';
          return (
            <Card
              key={q.id}
              title={q.title}
              action={
                <Link to={`/app/sunday-school/curriculum/${q.id}`}>
                  <Button size="sm" variant="secondary">Edit</Button>
                </Link>
              }
            >
              <p className="font-medium text-gray-900">{q.theme}</p>
              <p className="mt-1 text-sm text-gray-600">
                {formatShortDate(q.starts_on)} to {formatShortDate(q.ends_on)}, {q.lessons.filter((l) => l.kind === 'lesson').length} lessons
              </p>
              <div className="mt-2">
                {state === 'running' && <Badge tone="green">Running</Badge>}
                {state === 'upcoming' && <Badge tone="blue">Upcoming</Badge>}
                {state === 'ended' && <Badge>Ended</Badge>}
              </div>
            </Card>
          );
        })}
      </div>
    </>
  );
}
