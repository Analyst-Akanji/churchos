import { useEffect, useMemo, useState } from 'react';
import {
  createQuarter,
  fetchQuarters,
  updateQuarterTopics,
  type AdminQuarter,
} from '../lib/curriculumApi';
import { addDays, formatShortDate, isSunday, nextSundayOnOrAfter, ordinal, todayInLagos } from '../lib/quarter';

interface LessonDraft {
  id?: string;
  title: string;
}

interface UnitDraft {
  id?: string;
  title: string;
  lessons: LessonDraft[];
}

interface Props {
  /** Pass a quarter id to edit its topics. Leave out to create the next quarter. */
  quarterId?: string;
  onSaved?: (quarterId: string) => void;
}

const field =
  'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-base focus:border-brand-900 focus:outline-none focus:ring-2 focus:ring-brand-900/30 disabled:bg-gray-100';
const label = 'mb-1 block text-sm font-semibold text-gray-800';
const btnPrimary = 'rounded-lg bg-brand-900 px-5 py-2.5 font-semibold text-white hover:opacity-90 disabled:opacity-50';
const btnQuiet = 'rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-brand-900 hover:bg-gray-50';
const btnDanger = 'rounded-lg border border-red-300 bg-white px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50';

const emptyUnits = (): UnitDraft[] =>
  [0, 1, 2].map(() => ({ title: '', lessons: [0, 1, 2, 3].map(() => ({ title: '' })) }));

export default function QuarterBuilder({ quarterId, onSaved }: Props) {
  const editing = Boolean(quarterId);

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
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

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
              id: u.id,
              title: u.title,
              lessons: q.lessons.filter((l) => l.unit_id === u.id).map((l) => ({ id: l.id, title: l.title })),
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
        idx === ui ? { ...u, lessons: u.lessons.map((l, j) => (j === li ? { ...l, title: value } : l)) } : u,
      ),
    );
  }

  function validate(): string | null {
    if (!theme.trim()) return 'Add the quarter theme.';
    if (!title.trim()) return 'Add a quarter title.';
    if (!editing) {
      if (!startsOn || !isSunday(startsOn)) return 'The start date must be a Sunday.';
      if (units.length === 0 || lessonCount === 0) return 'Add at least one unit with one lesson.';
    }
    if (units.some((u) => !u.title.trim())) return 'Every unit needs a title.';
    if (units.some((u) => u.lessons.length === 0)) return 'Every unit needs at least one lesson.';
    if (units.some((u) => u.lessons.some((l) => !l.title.trim()))) return 'Every lesson needs a title.';
    return null;
  }

  async function save() {
    setSaved(false);
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setSaving(true);
    try {
      if (editing && quarterId) {
        await updateQuarterTopics(quarterId, {
          theme: theme.trim(),
          title: title.trim(),
          units: units.filter((u) => u.id).map((u) => ({ id: u.id!, title: u.title.trim() })),
          lessons: units.flatMap((u) =>
            u.lessons.filter((l) => l.id).map((l) => ({ id: l.id!, title: l.title.trim() })),
          ),
        });
        setSaved(true);
        onSaved?.(quarterId);
      } else {
        const id = await createQuarter({
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
        setSaved(true);
        onSaved?.(id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The quarter could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="p-4" aria-busy="true">Loading…</div>;
  if (loadError) return <p className="m-4 rounded-lg border border-red-300 p-3 text-red-700">{loadError}</p>;

  return (
    <div className="mx-auto max-w-2xl p-4">
      <h2 className="text-2xl font-bold text-brand-900">{editing ? `Edit ${title}` : 'Set up the next quarter'}</h2>
      <p className="mb-5 mt-1 text-gray-600">
        {editing
          ? 'Change the theme and the unit and lesson titles. Dates stay as they are so recorded registers are not affected.'
          : 'Enter the theme and the lesson titles from the new manual. Lessons are dated one Sunday after another from the first Sunday.'}
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="qb-title" className={label}>Quarter</label>
          <input id="qb-title" className={field} type="text" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <label htmlFor="qb-start" className={label}>First Sunday</label>
          <input
            id="qb-start"
            className={field}
            type="date"
            value={startsOn}
            disabled={editing}
            onChange={(e) => setStartsOn(e.target.value)}
          />
          {startsOn && !isSunday(startsOn) && (
            <p className="mt-1 text-sm text-red-700" role="alert">That date is not a Sunday.</p>
          )}
        </div>
      </div>

      {!editing && (
        <div className="mt-4">
          <label htmlFor="qb-number" className={label}>Quarter number</label>
          <select
            id="qb-number"
            className={field}
            value={quarterNumber}
            onChange={(e) => {
              const n = Number(e.target.value);
              setQuarterNumber(n);
              setTitle(`${ordinal(n)} Quarter`);
            }}
          >
            {[1, 2, 3, 4].map((n) => (
              <option key={n} value={n}>{ordinal(n)} Quarter</option>
            ))}
          </select>
        </div>
      )}

      <div className="mt-4">
        <label htmlFor="qb-theme" className={label}>Theme</label>
        <input id="qb-theme" className={field} type="text" value={theme} onChange={(e) => setTheme(e.target.value)} />
      </div>

      <div className="mt-6 space-y-4">
        {datedUnits.map((u, ui) => (
          <fieldset key={u.id ?? ui} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
            <legend className="sr-only">Unit {ui + 1}</legend>
            <label htmlFor={`qb-unit-${ui}`} className={label}>Unit {ui + 1} title</label>
            <input
              id={`qb-unit-${ui}`}
              className={field}
              type="text"
              value={u.title}
              onChange={(e) => patchUnit(ui, { title: e.target.value })}
            />

            <div className="mt-3 space-y-2">
              {u.lessons.map((l, li) => (
                <div className="flex items-start gap-2" key={l.id ?? li}>
                  <span className="w-24 shrink-0 pt-2.5 text-sm text-gray-600">
                    {l.date ? formatShortDate(l.date) : 'Pick a date'}
                  </span>
                  <input
                    className={field}
                    type="text"
                    aria-label={`Unit ${ui + 1} lesson ${li + 1} title`}
                    value={l.title}
                    onChange={(e) => patchLesson(ui, li, e.target.value)}
                  />
                  {!editing && (
                    <button
                      type="button"
                      className={btnDanger}
                      aria-label={`Remove unit ${ui + 1} lesson ${li + 1}`}
                      onClick={() => patchUnit(ui, { lessons: units[ui].lessons.filter((_, j) => j !== li) })}
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
            </div>

            {!editing && (
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className={btnQuiet}
                  onClick={() => patchUnit(ui, { lessons: [...units[ui].lessons, { title: '' }] })}
                >
                  Add a lesson to this unit
                </button>
                {units.length > 1 && (
                  <button type="button" className={btnDanger} onClick={() => setUnits(units.filter((_, i) => i !== ui))}>
                    Remove this unit
                  </button>
                )}
              </div>
            )}
          </fieldset>
        ))}
      </div>

      {!editing && (
        <>
          <button
            type="button"
            className={`${btnQuiet} mt-4`}
            onClick={() => setUnits([...units, { title: '', lessons: [{ title: '' }] }])}
          >
            Add a unit
          </button>

          <label className="mt-4 flex items-center gap-2 text-gray-800">
            <input type="checkbox" checked={sharingDay} onChange={(e) => setSharingDay(e.target.checked)} />
            End with a Sharing &amp; Admonition Sunday
            {sharingDate && sharingDay ? ` (${formatShortDate(sharingDate)})` : ''}
          </label>
        </>
      )}

      {error && <p className="mt-4 rounded-lg border border-red-300 p-3 text-red-700" role="alert">{error}</p>}
      {saved && (
        <p className="mt-4 rounded-lg border border-green-600 p-3 text-green-800" role="status">
          {editing ? 'Changes saved.' : `${title} is ready. The website switches to it after the current quarter's last Sunday.`}
        </p>
      )}

      <div className="mt-5">
        <button type="button" className={btnPrimary} onClick={save} disabled={saving}>
          {saving ? 'Saving…' : editing ? 'Save changes' : 'Create quarter'}
        </button>
      </div>

      {!editing && quarters.length > 0 && (
        <p className="mt-4 text-sm text-gray-600">
          Latest quarter on record: {quarters[0].title}, ending {formatShortDate(quarters[0].ends_on)}.
        </p>
      )}
    </div>
  );
}
