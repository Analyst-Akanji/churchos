import { supabase } from './supabase';

/**
 * If your existing tables are named differently, change them here. Nothing else
 * in the TypeScript needs to change.
 */
export const SCHEMA = {
  classMembersTable: 'class_members', // columns: class_id, member_id
  membersTable: 'members', // columns: id, plus the name column below
  memberNameColumn: 'full_name',
} as const;

// ---------------------------------------------------------------------------
// Quarters (admin)
// ---------------------------------------------------------------------------

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

/** All quarters, newest first, with their units and lessons sorted. */
export async function fetchQuarters(): Promise<AdminQuarter[]> {
  const { data, error } = await supabase
    .from('quarters')
    .select(
      `id, quarter_number, title, theme, starts_on, ends_on,
       units ( id, unit_number, title ),
       lessons ( id, unit_id, lesson_number, lesson_date, title, kind )`,
    )
    .order('starts_on', { ascending: false });
  if (error) throw error;

  return ((data ?? []) as unknown as AdminQuarter[]).map((q) => ({
    ...q,
    units: [...q.units].sort((a, b) => a.unit_number - b.unit_number),
    lessons: [...q.lessons].sort((a, b) => a.lesson_date.localeCompare(b.lesson_date)),
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
  const { data, error } = await supabase.rpc('create_quarter', { p: payload });
  if (error) throw error;
  return data as string;
}

/**
 * Row level security makes a blocked update touch 0 rows without an error,
 * so every update asks for the row back and checks it came.
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
  await updateOne('quarters', quarterId, { theme: changes.theme, title: changes.title });
  await Promise.all([
    ...changes.units.map((u) => updateOne('units', u.id, { title: u.title })),
    ...changes.lessons.map((l) => updateOne('lessons', l.id, { title: l.title })),
  ]);
}

// ---------------------------------------------------------------------------
// Weekly order of service (admin)
// ---------------------------------------------------------------------------

export interface ProgrammeItem {
  start_time: string; // "HH:MM" or ""
  title: string;
  led_by: string;
  notes: string;
}

export interface Programme {
  service_date: string;
  theme: string;
  preacher: string;
  notes: string;
  is_published: boolean;
  items: ProgrammeItem[];
}

interface ProgrammeRow {
  service_date: string;
  theme: string | null;
  preacher: string | null;
  notes: string | null;
  is_published: boolean;
  programme_items: {
    position: number;
    start_time: string | null;
    title: string;
    led_by: string | null;
    notes: string | null;
  }[];
}

function toProgramme(row: ProgrammeRow): Programme {
  return {
    service_date: row.service_date,
    theme: row.theme ?? '',
    preacher: row.preacher ?? '',
    notes: row.notes ?? '',
    is_published: row.is_published,
    items: [...row.programme_items]
      .sort((a, b) => a.position - b.position)
      .map((i) => ({
        start_time: i.start_time ? i.start_time.slice(0, 5) : '',
        title: i.title,
        led_by: i.led_by ?? '',
        notes: i.notes ?? '',
      })),
  };
}

const PROGRAMME_SELECT = `service_date, theme, preacher, notes, is_published,
  programme_items ( position, start_time, title, led_by, notes )`;

export async function fetchProgramme(assemblyId: string, date: string): Promise<Programme | null> {
  const { data, error } = await supabase
    .from('programmes')
    .select(PROGRAMME_SELECT)
    .eq('assembly_id', assemblyId)
    .eq('service_date', date)
    .maybeSingle();
  if (error) throw error;
  return data ? toProgramme(data as unknown as ProgrammeRow) : null;
}

/** The most recent programme before a date, used to start a new week from last week's order. */
export async function fetchPreviousProgramme(
  assemblyId: string,
  beforeDate: string,
): Promise<Programme | null> {
  const { data, error } = await supabase
    .from('programmes')
    .select(PROGRAMME_SELECT)
    .eq('assembly_id', assemblyId)
    .lt('service_date', beforeDate)
    .order('service_date', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? toProgramme(data as unknown as ProgrammeRow) : null;
}

export async function saveProgramme(
  assemblyId: string,
  date: string,
  programme: Omit<Programme, 'service_date'>,
): Promise<void> {
  const { error } = await supabase.rpc('save_programme', {
    p_assembly: assemblyId,
    p_date: date,
    p: programme,
  });
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Class register
// ---------------------------------------------------------------------------

export interface RosterMember {
  id: string;
  name: string;
}

export interface RegisterRow {
  member_id: string;
  present: boolean;
  on_time: boolean;
  memory_verse: boolean;
  class_work: boolean;
}

export interface RegisterSession {
  visitors: number;
  offering_amount: number;
  rows: RegisterRow[];
}

export async function fetchRoster(classId: string): Promise<RosterMember[]> {
  const nameCol = SCHEMA.memberNameColumn;
  const { data, error } = await supabase
    .from(SCHEMA.classMembersTable)
    .select(`member_id, member:${SCHEMA.membersTable} ( id, ${nameCol} )`)
    .eq('class_id', classId);
  if (error) throw error;

  type Row = { member: Record<string, string> | null };
  return ((data ?? []) as unknown as Row[])
    .filter((r) => r.member)
    .map((r) => ({ id: r.member!.id, name: r.member![nameCol] ?? 'Unnamed member' }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function fetchRegister(classId: string, lessonId: string): Promise<RegisterSession | null> {
  const { data, error } = await supabase
    .from('class_sessions')
    .select(
      `visitors, offering_amount,
       class_attendance ( member_id, present, on_time, memory_verse, class_work )`,
    )
    .eq('class_id', classId)
    .eq('lesson_id', lessonId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const row = data as unknown as {
    visitors: number;
    offering_amount: number | string;
    class_attendance: RegisterRow[];
  };
  return {
    visitors: row.visitors,
    offering_amount: Number(row.offering_amount),
    rows: row.class_attendance,
  };
}

export interface SheetSession {
  lesson_id: string;
  offering_amount: number;
  visitors: number;
  points: Record<string, number>; // member_id -> points that week
}

export async function fetchQuarterSheet(classId: string, lessonIds: string[]): Promise<SheetSession[]> {
  if (lessonIds.length === 0) return [];
  const { data, error } = await supabase
    .from('class_sessions')
    .select('lesson_id, visitors, offering_amount, class_attendance ( member_id, points )')
    .eq('class_id', classId)
    .in('lesson_id', lessonIds);
  if (error) throw error;

  type Row = {
    lesson_id: string;
    visitors: number;
    offering_amount: number | string;
    class_attendance: { member_id: string; points: number }[];
  };
  return ((data ?? []) as unknown as Row[]).map((s) => ({
    lesson_id: s.lesson_id,
    visitors: s.visitors,
    offering_amount: Number(s.offering_amount),
    points: Object.fromEntries(s.class_attendance.map((a) => [a.member_id, a.points])),
  }));
}

// --- Saving, with an offline queue ------------------------------------------

export interface RegisterSave {
  classId: string;
  lessonId: string;
  visitors: number;
  offering: number;
  rows: RegisterRow[];
  savedAt: string;
}

const PENDING_KEY = 'sunday-register-pending';

function readPending(): RegisterSave[] {
  try {
    return JSON.parse(localStorage.getItem(PENDING_KEY) ?? '[]') as RegisterSave[];
  } catch {
    return [];
  }
}

function writePending(items: RegisterSave[]) {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(items));
  } catch {
    /* storage can be unavailable; the save already failed once, nothing more to do */
  }
}

export function pendingRegisterCount(): number {
  return readPending().length;
}

async function sendRegister(s: RegisterSave) {
  const { error } = await supabase.rpc('save_class_register', {
    p_class: s.classId,
    p_lesson: s.lessonId,
    p_visitors: s.visitors,
    p_offering: s.offering,
    p_rows: s.rows,
  });
  if (error) throw error;
}

function looksOffline(err: unknown): boolean {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true;
  const msg = err instanceof Error ? err.message : String((err as { message?: string })?.message ?? '');
  return /failed to fetch|network|load failed/i.test(msg);
}

/** Saves now, or keeps it on this phone and syncs when the network is back. */
export async function saveRegister(
  save: Omit<RegisterSave, 'savedAt'>,
): Promise<{ queued: boolean }> {
  const full: RegisterSave = { ...save, savedAt: new Date().toISOString() };
  try {
    await sendRegister(full);
    // A newer online save replaces any older queued copy of the same Sunday.
    writePending(
      readPending().filter((p) => !(p.classId === full.classId && p.lessonId === full.lessonId)),
    );
    return { queued: false };
  } catch (err) {
    if (!looksOffline(err)) throw err;
    const rest = readPending().filter(
      (p) => !(p.classId === full.classId && p.lessonId === full.lessonId),
    );
    writePending([...rest, full]);
    return { queued: true };
  }
}

/** Sends everything saved offline. Returns how many are still waiting. */
export async function flushPendingRegisters(): Promise<number> {
  const waiting = readPending();
  const failed: RegisterSave[] = [];
  for (const item of waiting) {
    try {
      await sendRegister(item);
    } catch {
      failed.push(item);
    }
  }
  writePending(failed);
  return failed.length;
}
