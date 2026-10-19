import { supabase } from './supabase';

export interface AdminUnit {
  id: string;
  unit_number: number;
  title: string;
}

export interface AdminLesson {
  id: string;
  unit_id: string | null;
  lesson_number: number | null;
  lesson_date: string;
  title: string;
  kind: 'lesson' | 'sharing';
}

export interface AdminQuarter {
  id: string;
  quarter_number: number;
  title: string;
  theme: string;
  starts_on: string;
  ends_on: string;
  units: AdminUnit[];
  lessons: AdminLesson[];
}

/** All curriculum quarters, newest first, with units and lessons sorted. */
export async function fetchQuarters(): Promise<AdminQuarter[]> {
  const { data, error } = await supabase
    .from('curriculum_quarters')
    .select(
      `id, quarter_number, title, theme, starts_on, ends_on,
       curriculum_units ( id, unit_number, title ),
       curriculum_lessons ( id, unit_id, lesson_number, lesson_date, title, kind )`,
    )
    .order('starts_on', { ascending: false });
  if (error) throw error;

  type Row = Omit<AdminQuarter, 'units' | 'lessons'> & {
    curriculum_units: AdminUnit[];
    curriculum_lessons: AdminLesson[];
  };

  return ((data ?? []) as unknown as Row[]).map(({ curriculum_units, curriculum_lessons, ...q }) => ({
    ...q,
    units: [...(curriculum_units ?? [])].sort((a, b) => a.unit_number - b.unit_number),
    lessons: [...(curriculum_lessons ?? [])].sort((a, b) => a.lesson_date.localeCompare(b.lesson_date)),
  }));
}

export interface QuarterPayload {
  quarter_number: number;
  title: string;
  theme: string;
  starts_on: string;
  sharing_day: boolean;
  units: { unit_number: number; title: string; lessons: { title: string }[] }[];
}

/**
 * Creates a quarter (no id) or replaces an existing one (with its id). Lessons are
 * dated one Sunday apart from starts_on in the order given.
 */
export async function saveQuarter(quarterId: string | null, payload: QuarterPayload): Promise<string> {
  const { data, error } = await supabase.rpc('save_curriculum_quarter', { p_quarter: quarterId, p: payload });
  if (error) throw error;
  return data as string;
}
