import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { todayInLagos, type Quarter } from '../lib/quarter';

export type QuarterState =
  | { status: 'loading' }
  | { status: 'ready'; quarter: Quarter | null }
  | { status: 'error'; message: string };

/**
 * Loads the curriculum quarter that is running now, or the next one that has been added.
 * Returns quarter: null when no quarter covers today or later (between quarters).
 */
export function useQuarter(): QuarterState {
  const [state, setState] = useState<QuarterState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const today = todayInLagos();

      const { data, error } = await supabase
        .from('curriculum_quarters')
        .select(
          `id, quarter_number, title, theme, starts_on, ends_on,
           curriculum_lessons (
             id, lesson_number, lesson_date, title, kind,
             unit:curriculum_units ( unit_number, title )
           )`,
        )
        .gte('ends_on', today)
        .order('starts_on', { ascending: true })
        .order('lesson_date', { referencedTable: 'curriculum_lessons', ascending: true })
        .limit(1)
        .maybeSingle();

      if (cancelled) return;

      if (error) {
        console.error('Could not load the quarter', error);
        setState({ status: 'error', message: error.message });
        return;
      }

      if (!data) {
        setState({ status: 'ready', quarter: null });
        return;
      }

      const { curriculum_lessons, ...rest } = data as unknown as Omit<Quarter, 'lessons'> & {
        curriculum_lessons: Quarter['lessons'];
      };
      setState({ status: 'ready', quarter: { ...rest, lessons: curriculum_lessons ?? [] } });
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
