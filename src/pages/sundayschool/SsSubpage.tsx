import { ArrowLeft } from 'lucide-react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui';

const HOME = '/app/sunday-school';

/**
 * Wraps the Sunday school sub-pages (Quarters, Classes, Leaderboard, Curriculum) and
 * adds a back button above them, so none of those pages needs to change.
 */
export default function SsSubpage() {
  const { pathname } = useLocation();

  let back: { to: string; label: string } | null = { to: HOME, label: 'Sunday school' };
  if (/\/sunday-school\/classes\/[^/]+\/?$/.test(pathname)) back = null; // ClassDetail has its own "All classes" button
  else if (/\/sunday-school\/curriculum\/[^/]+\/?$/.test(pathname)) back = { to: `${HOME}/curriculum`, label: 'Curriculum' };

  return (
    <>
      {back && (
        <div className="mb-3">
          <Link to={back.to}>
            <Button variant="secondary" size="sm">
              <ArrowLeft className="h-4 w-4" /> {back.label}
            </Button>
          </Link>
        </div>
      )}
      <Outlet />
    </>
  );
}
