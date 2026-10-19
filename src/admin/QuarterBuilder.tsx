import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Button, Card, Field, Input, PageHeader, Select, Spinner } from '@/components/ui';
import { useToast } from '@/components/toast';
import { fetchQuarters, saveQuarter, type AdminQuarter } from '../lib/curriculumApi';
import { addDays, formatShortDate, isSunday, nextSundayOnOrAfter, ordinal, todayInLagos } from '../lib/quarter';

interface LessonDraft {
  title: string;
}

interface UnitDraft {
  title: string;
  lessons: LessonDraft[];
}

interface Props {
  /** Pass a quarter id to edit it. Leave out to set up the next quarter. */
  quarterId?: string;
  onSaved?: (quarterId: string) => void;
  onCancel?: () => void;
}

const emptyUnits = (): UnitDraft[] =>
  [0, 1, 2].map(() => ({ title: '', lessons: [0, 1, 2, 3].map(() => ({ title: '' })) }));

export default function QuarterBuilder({ quarterId, onSaved, onCancel }: Props) {
  const editing = Boolean(quarterId);
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [quarters, setQuarters] = useState<AdminQuarter[]>([]);

  const [quarterNumber, setQuarterNumber] = useState(1);
  const [title, setTitle] = useState('');
  const [theme, setTheme] = useState('');
  const [startsOn, setStartsOn] = useState('');
  const [sharingDay, setSharingDay] = useState(true);
  const [units, setUnits] = useState<UnitDraft[]>(emptyUnits());

  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const all = await fetchQuarters();
        if (cancelled) return;
        setQuarters(all);

        if (editing) {
          const q = all.find((x) => x.id === quarterId);
          if (!q) {
            setLoadError('That quarter could not be found.');
            return;
          }
          setQuarterNumber(q.quarter_number);
          setTitle(q.title);
          setTheme(q.theme);
          setStartsOn(q.starts_on);
          setSharingDay(q.lessons.some((l) => l.kind === 'sharing'));
          setUnits(
            q.units.map((u) => ({
              title: u.title,
              lessons: q.lessons.filter((l) => l.unit_id === u.id).map((l) => ({ title: l.title })),
            })),
          );
        } else {
          // Start the next quarter the Sunday after the latest one ends.
          const latest = all[0];
          const nextNumber = latest ? (latest.quarter_number % 4) + 1 : 1;
          setQuarterNumber(nextNumber);
          setTitle(`${ordinal(nextNumber)} Quarter`);
          setStartsOn(latest ? addDays(latest.ends_on, 7) : nextSundayOnOrAfter(todayInLagos()));
        }
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : 'Could not load quarters.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [editing, quarterId]);

  // Dates for each lesson: one Sunday apart, in the order entered.
  const datedUnits = useMemo(() => {
    let n = 0;
    return units.map((u) => ({
      ...u,
      lessons: u.lessons.map((l) => {
        const date = startsOn && isSunday(startsOn) ? addDays(startsOn, 7 * n) : '';
        n += 1;
        return { ...l, date };
      }),
    }));
  }, [units, startsOn]);

  const lessonCount = units.reduce((sum, u) => sum + u.lessons.length, 0);
  const sharingDate =
    startsOn && isSunday(startsOn) && lessonCount > 0 ? addDays(startsOn, 7 * lessonCount) : '';

  function patchUnit(i: number, patch: Partial<UnitDraft>) {
    setUnits((prev) => prev.map((u, idx) => (idx === i ? { ...u, ...patch } : u)));
  }

  function patchLesson(ui: number, li: number, value: string) {
    setUnits((prev) =>
      prev.map((u, idx) =>
        idx === ui ? { ...u, lessons: u.lessons.map((l, j) => (j === li ? { title: value } : l)) } : u,
      ),
    );
  }

  function moveLesson(ui: number, li: number, by: -1 | 1) {
    setUnits((prev) =>
      prev.map((u, idx) => {
        const j = li + by;
        if (idx !== ui || j < 0 || j >= u.lessons.length) return u;
        const lessons = [...u.lessons];
        [lessons[li], lessons[j]] = [lessons[j], lessons[li]];
        return { ...u, lessons };
      }),
    );
  }

  function validate(): string | null {
    if (!title.trim()) return 'Add a quarter title.';
    if (!theme.trim()) return 'Add the quarter theme.';
    if (!startsOn || !isSunday(startsOn)) return 'The first day must be a Sunday.';
    if (units.length === 0 || lessonCount === 0) return 'Add at least one unit with one lesson.';
    if (units.some((u) => !u.title.trim())) return 'Every unit needs a title.';
    if (units.some((u) => u.lessons.length === 0)) return 'Every unit needs at least one lesson. Remove empty units.';
    if (units.some((u) => u.lessons.some((l) => !l.title.trim()))) return 'Every lesson needs a title. Remove any you do not need.';
    return null;
  }

  async function save() {
    const issue = validate();
    setProblem(issue);
    if (issue) return;
    setSaving(true);
    try {
      const id = await saveQuarter(quarterId ?? null, {
        quarter_number: quarterNumber,
        title: title.trim(),
        theme: theme.trim(),
        starts_on: startsOn,
        sharing_day: sharingDay,
        units: units.map((u, i) => ({
          unit_number: i + 1,
          title: u.title.trim(),
          lessons: u.lessons.map((l) => ({ title: l.title.trim() })),
        })),
      });
      toast.ok(editing ? 'Quarter updated' : `${title.trim()} is ready`);
      onSaved?.(id);
    } catch (e) {
      toast.err(e instanceof Error ? e.message : 'The quarter could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Spinner />;
  if (loadError) return <p className="rounded-lg bg-red-50 p-3 text-sm text-crimson-600">{loadError}</p>;

  return (
    <>
      <PageHeader
        title={editing ? `Edit ${title || 'quarter'}` : 'Set up the next quarter'}
        subtitle={
          editing
            ? 'Change anything. Lessons stay dated one Sunday after another from the first Sunday.'
            : 'Enter the theme and the lesson titles from the new manual. Each lesson is dated one Sunday after the other.'
        }
      />

      <div className="space-y-4">
        <Card title="Quarter">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Quarter">
              <Select
                value={quarterNumber}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  setQuarterNumber(n);
                  if (!editing) setTitle(`${ordinal(n)} Quarter`);
                }}
              >
                {[1, 2, 3, 4].map((n) => (
                  <option key={n} value={n}>{ordinal(n)} Quarter</option>
                ))}
              </Select>
            </Field>
            <Field label="Title">
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </Field>
            <Field label="First Sunday">
              <Input type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
            </Field>
          </div>
          {startsOn && !isSunday(startsOn) && (
            <p className="mt-2 text-sm text-crimson-600" role="alert">That date is not a Sunday.</p>
          )}
          <div className="mt-3">
            <Field label="Theme">
              <Input value={theme} onChange={(e) => setTheme(e.target.value)} placeholder="e.g. The Theology of Hard Work" />
            </Field>
          </div>
        </Card>

        {datedUnits.map((u, ui) => (
          <Card
            key={ui}
            title={`Unit ${ui + 1}`}
            action={
              units.length > 1 ? (
                <Button size="sm" variant="ghost" onClick={() => setUnits(units.filter((_, i) => i !== ui))}>
                  Remove unit
                </Button>
              ) : undefined
            }
          >
            <Field label="Unit title">
              <Input value={u.title} onChange={(e) => patchUnit(ui, { title: e.target.value })} />
            </Field>

            <ul className="mt-3 space-y-2">
              {u.lessons.map((l, li) => (
                <li key={li} className="flex items-center gap-2">
                  <span className="w-16 shrink-0 text-xs text-gray-500 sm:w-20">
                    {l.date ? formatShortDate(l.date) : 'Pick a date'}
                  </span>
                  <Input
                    value={l.title}
                    aria-label={`Unit ${ui + 1} lesson ${li + 1} title`}
                    onChange={(e) => patchLesson(ui, li, e.target.value)}
                  />
                  <div className="flex shrink-0 gap-1">
                    <Button size="sm" variant="ghost" aria-label="Move lesson up" disabled={li === 0} onClick={() => moveLesson(ui, li, -1)}>
                      <ChevronUp className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label="Move lesson down"
                      disabled={li === u.lessons.length - 1}
                      onClick={() => moveLesson(ui, li, 1)}
                    >
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Remove unit ${ui + 1} lesson ${li + 1}`}
                      onClick={() => patchUnit(ui, { lessons: units[ui].lessons.filter((_, j) => j !== li) })}
                    >
                      Remove
                    </Button>
                  </div>
                </li>
              ))}
            </ul>

            <div className="mt-3">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => patchUnit(ui, { lessons: [...units[ui].lessons, { title: '' }] })}
              >
                Add a lesson
              </Button>
            </div>
          </Card>
        ))}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button variant="secondary" onClick={() => setUnits([...units, { title: '', lessons: [{ title: '' }] }])}>
            Add a unit
          </Button>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              className="h-4 w-4 accent-brand-700"
              checked={sharingDay}
              onChange={(e) => setSharingDay(e.target.checked)}
            />
            End with a Sharing &amp; Admonition Sunday{sharingDate && sharingDay ? ` (${formatShortDate(sharingDate)})` : ''}
          </label>
        </div>

        {problem && <p className="text-sm text-crimson-600" role="alert">{problem}</p>}

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? 'Saving…' : editing ? 'Save changes' : 'Create quarter'}
          </Button>
          {onCancel && <Button variant="ghost" onClick={onCancel}>Cancel</Button>}
          {!editing && quarters.length > 0 && (
            <span className="text-xs text-gray-500">
              Latest on record: {quarters[0].title}, ending {formatShortDate(quarters[0].ends_on)}.
            </span>
          )}
        </div>
        {editing && (
          <p className="text-xs text-gray-500">
            Sunday school sessions that already have a lesson title keep it. Sessions with no title pick up the curriculum title.
          </p>
        )}
      </div>
    </>
  );
}
