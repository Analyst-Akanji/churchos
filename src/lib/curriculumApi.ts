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

export interface NewQuarterPayload {
  quarter_number: number;
  title: string;
  theme: string;
  starts_on: string;
  sharing_day: boolean;
  units: { unit_number: number; title: string; lessons: { title: string }[] }[];
}

export async function createQuarter(payload: NewQuarterPayload): Promise<string> {
  const { data, error } = await supabase.rpc('create_curriculum_quarter', { p: payload });
  if (error) throw error;
  return data as string;
}

/**
 * Row level security makes a blocked update touch 0 rows without an error,
 * so every update asks for the row back and checks that it came.
 */
async function updateOne(table: string, id: string, values: Record<string, string>) {
  const { data, error } = await supabase.from(table).update(values).eq('id', id).select('id');
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error('That change was not saved. Check that you are signed in as an admin.');
  }
}

export async function updateQuarterTopics(
  quarterId: string,
  changes: {
    theme: string;
    title: string;
    units: { id: string; title: string }[];
    lessons: { id: string; title: string }[];
  },
): Promise<void> {
  await updateOne('curriculum_quarters', quarterId, { theme: changes.theme, title: changes.title });
  await Promise.all([
    ...changes.units.map((u) => updateOne('curriculum_units', u.id, { title: u.title })),
    ...changes.lessons.map((l) => updateOne('curriculum_lessons', l.id, { title: l.title })),
  ]);
}
