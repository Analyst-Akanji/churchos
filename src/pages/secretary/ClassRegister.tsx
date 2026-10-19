import '@fontsource-variable/fraunces';
import '@fontsource-variable/source-sans-3';
import '../styles/sunday-admin.css';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuarter } from '@/hooks/useQuarter';
import {
  fetchQuarterSheet,
  fetchRegister,
  fetchRoster,
  flushPendingRegisters,
  pendingRegisterCount,
  saveRegister,
  type RegisterRow,
  type RosterMember,
  type SheetSession,
} from '@/lib/sundayApi';
import { formatShortDate, todayInLagos, type Lesson } from '@/lib/quarter';

interface Props {
  classId: string;
  className?: string; // shown in the heading, for example "Adult Class"
}

type Criterion = 'on_time' | 'memory_verse' | 'class_work';

const CRITERIA: { key: Criterion; label: string }[] = [
  { key: 'on_time', label: 'On time' },
  { key: 'memory_verse', label: 'M. verse' },
  { key: 'class_work', label: 'Cl. work' },
];

const naira = (n: number) =>
  n.toLocaleString('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 2 });

const blankRow = (member_id: string): RegisterRow => ({
  member_id,
  present: false,
  on_time: false,
  memory_verse: false,
  class_work: false,
});

const rowPoints = (r: RegisterRow) =>
  r.present ? 1 + Number(r.on_time) + Number(r.memory_verse) + Number(r.class_work) : 0;

export default function ClassRegister({ classId, className }: Props) {
  const quarterState = useQuarter();
  const quarter = quarterState.status === 'ready' ? quarterState.quarter : null;

  const lessons: Lesson[] = useMemo(
    () => (quarter ? quarter.lessons.filter((l) => l.kind === 'lesson') : []),
    [quarter],
  );

  const [tab, setTab] = useState<'sunday' | 'sheet'>('sunday');
  const [lessonId, setLessonId] = useState<string>('');
  const [roster, setRoster] = useState<RosterMember[]>([]);
  const [rows, setRows] = useState<Record<string, RegisterRow>>({});
  const [visitors, setVisitors] = useState('0');
  const [offering, setOffering] = useState('0');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error' | 'warn'; text: string } | null>(null);
  const [waiting, setWaiting] = useState(pendingRegisterCount());

  const [sheet, setSheet] = useState<SheetSession[]>([]);

  // Default to the most recent lesson on or before today, so the secretary lands on this Sunday.
  useEffect(() => {
    if (lessons.length === 0 || lessonId) return;
    const today = todayInLagos();
    const past = [...lessons].reverse().find((l) => l.lesson_date <= today);
    setLessonId((past ?? lessons[0]).id);
  }, [lessons, lessonId]);

  // Send anything saved offline as soon as the network is back.
  const syncWaiting = useCallback(async () => {
    if (pendingRegisterCount() === 0) return;
    setWaiting(await flushPendingRegisters());
  }, []);

  useEffect(() => {
    syncWaiting();
    window.addEventListener('online', syncWaiting);
    return () => window.removeEventListener('online', syncWaiting);
  }, [syncWaiting]);

  // Class list of members.
  useEffect(() => {
    let cancelled = false;
    fetchRoster(classId)
      .then((r) => !cancelled && setRoster(r))
      .catch((e) => !cancelled && setMessage({ kind: 'error', text: e.message ?? 'Could not load the class.' }));
    return () => {
      cancelled = true;
    };
  }, [classId]);

  // The chosen Sunday's saved register, if there is one.
  useEffect(() => {
    if (!lessonId || roster.length === 0) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setMessage(null);
    fetchRegister(classId, lessonId)
      .then((session) => {
        if (cancelled) return;
        const byMember = new Map((session?.rows ?? []).map((r) => [r.member_id, r]));
        setRows(Object.fromEntries(roster.map((m) => [m.id, byMember.get(m.id) ?? blankRow(m.id)])));
        setVisitors(String(session?.visitors ?? 0));
        setOffering(String(session?.offering_amount ?? 0));
      })
      .catch((e) => !cancelled && setMessage({ kind: 'error', text: e.message ?? 'Could not load this Sunday.' }))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [classId, lessonId, roster]);

  // The quarter sheet.
  useEffect(() => {
    if (tab !== 'sheet' || lessons.length === 0) return;
    let cancelled = false;
    fetchQuarterSheet(classId, lessons.map((l) => l.id))
      .then((s) => !cancelled && setSheet(s))
      .catch((e) => !cancelled && setMessage({ kind: 'error', text: e.message ?? 'Could not load the sheet.' }));
    return () => {
      cancelled = true;
    };
  }, [tab, classId, lessons]);

  function togglePresent(id: string, checked: boolean) {
    setRows((prev) => ({
      ...prev,
      [id]: checked ? { ...prev[id], present: true } : blankRow(id),
    }));
  }

  function toggleCriterion(id: string, key: Criterion, checked: boolean) {
    setRows((prev) => ({ ...prev, [id]: { ...prev[id], [key]: checked } }));
  }

  async function save() {
    setMessage(null);
    const v = Math.max(0, Math.floor(Number(visitors) || 0));
    const o = Math.max(0, Number(offering) || 0);
    setSaving(true);
    try {
      const { queued } = await saveRegister({
        classId,
        lessonId,
        visitors: v,
        offering: o,
        rows: roster.map((m) => rows[m.id] ?? blankRow(m.id)),
      });
      setWaiting(pendingRegisterCount());
      setMessage(
        queued
          ? { kind: 'warn', text: 'No network. Saved on this phone and it will send by itself when you are back online.' }
          : { kind: 'ok', text: 'Saved.' },
      );
    } catch (e) {
      setMessage({ kind: 'error', text: e instanceof Error ? e.message : 'Could not save.' });
    } finally {
      setSaving(false);
    }
  }

  const lesson = lessons.find((l) => l.id === lessonId);
  const presentCount = roster.filter((m) => rows[m.id]?.present).length;

  if (quarterState.status === 'loading') return <div className="sa" aria-busy="true">Loading…</div>;
  if (!quarter || lessons.length === 0) {
    return (
      <div className="sa">
        <p className="sa-msg sa-msg--warn">There is no quarter set up yet. Ask an admin to add it.</p>
      </div>
    );
  }

  return (
    <div className="sa">
      <h2>{className ? `${className} register` : 'Class register'}</h2>
      <p className="sa-lead">{quarter.title}: {quarter.theme}</p>

      {waiting > 0 && (
        <p className="sa-msg sa-msg--warn" role="status">
          {waiting} {waiting === 1 ? 'register is' : 'registers are'} saved on this phone and waiting to send.
        </p>
      )}

      <div className="sa-tabs" role="tablist" aria-label="Register views">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'sunday'}
          className={`sa-btn sa-btn--small${tab === 'sunday' ? '' : ' sa-btn--quiet'}`}
          onClick={() => setTab('sunday')}
        >
          One Sunday
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'sheet'}
          className={`sa-btn sa-btn--small${tab === 'sheet' ? '' : ' sa-btn--quiet'}`}
          onClick={() => setTab('sheet')}
        >
          Quarter sheet
        </button>
      </div>

      {tab === 'sunday' && (
        <div role="tabpanel" aria-busy={loading}>
          <div className="sa-field">
            <label htmlFor="cr-lesson">Lesson</label>
            <select id="cr-lesson" value={lessonId} onChange={(e) => setLessonId(e.target.value)}>
              {lessons.map((l) => (
                <option key={l.id} value={l.id}>
                  Lesson {l.lesson_number}, {formatShortDate(l.lesson_date)}: {l.title}
                </option>
              ))}
            </select>
            {lesson?.unit && <span className="sa-hint">Unit {lesson.unit.unit_number}: {lesson.unit.title}</span>}
          </div>

          <div className="sa-register-head">
            <div className="sa-field">
              <label htmlFor="cr-visitors">Visitors</label>
              <input
                id="cr-visitors"
                type="number"
                inputMode="numeric"
                min={0}
                value={visitors}
                onChange={(e) => setVisitors(e.target.value)}
              />
            </div>
            <div className="sa-field">
              <label htmlFor="cr-offering">Class offering (₦)</label>
              <input
                id="cr-offering"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={offering}
                onChange={(e) => setOffering(e.target.value)}
              />
            </div>
          </div>

          {roster.length === 0 && !loading && (
            <p className="sa-msg sa-msg--warn">No members have been added to this class yet.</p>
          )}

          {roster.map((m) => {
            const r = rows[m.id] ?? blankRow(m.id);
            return (
              <div className="sa-student" key={m.id}>
                <div className="sa-student-top">
                  <span>{m.name}</span>
                  <span className="sa-total" aria-label={`Total ${rowPoints(r)} of 4`}>{rowPoints(r)} / 4</span>
                </div>
                <div className="sa-checks">
                  <label className="sa-check">
                    <input
                      type="checkbox"
                      checked={r.present}
                      onChange={(e) => togglePresent(m.id, e.target.checked)}
                      aria-label={`${m.name}: present`}
                    />
                    Att.
                  </label>
                  {CRITERIA.map((c) => (
                    <label className="sa-check" key={c.key}>
                      <input
                        type="checkbox"
                        checked={r[c.key]}
                        disabled={!r.present}
                        onChange={(e) => toggleCriterion(m.id, c.key, e.target.checked)}
                        aria-label={`${m.name}: ${c.label}`}
                      />
                      {c.label}
                    </label>
                  ))}
                </div>
              </div>
            );
          })}

          {message && (
            <p className={`sa-msg sa-msg--${message.kind}`} role={message.kind === 'error' ? 'alert' : 'status'}>
              {message.text}
            </p>
          )}

          <div className="sa-actions">
            <button type="button" className="sa-btn" onClick={save} disabled={saving || loading || roster.length === 0}>
              {saving ? 'Saving…' : `Save register (${presentCount} present)`}
            </button>
          </div>
        </div>
      )}

      {tab === 'sheet' && (
        <QuarterSheet roster={roster} lessons={lessons} sheet={sheet} />
      )}
    </div>
  );
}

function QuarterSheet({
  roster,
  lessons,
  sheet,
}: {
  roster: RosterMember[];
  lessons: Lesson[];
  sheet: SheetSession[];
}) {
  const byLesson = new Map(sheet.map((s) => [s.lesson_id, s]));

  const totals = roster.map((m) => ({
    id: m.id,
    total: sheet.reduce((sum, s) => sum + (s.points[m.id] ?? 0), 0),
  }));
  const rankOf = (id: string) => {
    const mine = totals.find((t) => t.id === id)?.total ?? 0;
    return 1 + totals.filter((t) => t.total > mine).length;
  };

  const offeringTotal = sheet.reduce((sum, s) => sum + s.offering_amount, 0);

  if (sheet.length === 0) {
    return <p className="sa-msg">No Sundays have been recorded for this class yet.</p>;
  }

  return (
    <div className="sa-sheet-wrap">
      <table className="sa-sheet">
        <caption className="sa-sr">Points per lesson and quarterly total</caption>
        <thead>
          <tr>
            <th scope="col">Name</th>
            {lessons.map((l) => (
              <th scope="col" key={l.id}>
                L{l.lesson_number}
                <br />
                <span className="sa-hint">{formatShortDate(l.lesson_date)}</span>
              </th>
            ))}
            <th scope="col">Total</th>
            <th scope="col">Position</th>
          </tr>
        </thead>
        <tbody>
          {roster.map((m) => {
            const total = totals.find((t) => t.id === m.id)?.total ?? 0;
            const rank = rankOf(m.id);
            return (
              <tr key={m.id} className={rank <= 3 && total > 0 ? 'sa-top' : undefined}>
                <th scope="row">{m.name}</th>
                {lessons.map((l) => {
                  const s = byLesson.get(l.id);
                  const pts = s ? s.points[m.id] : undefined;
                  return (
                    <td key={l.id} className={pts === undefined ? 'sa-empty' : undefined}>
                      {pts === undefined ? '–' : pts}
                    </td>
                  );
                })}
                <td className="sa-sheet-total">{total}</td>
                <td>{total > 0 ? rank : '–'}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">Visitors</th>
            {lessons.map((l) => (
              <td key={l.id}>{byLesson.get(l.id)?.visitors ?? '–'}</td>
            ))}
            <td colSpan={2} />
          </tr>
          <tr>
            <th scope="row">Offering</th>
            {lessons.map((l) => (
              <td key={l.id}>{byLesson.get(l.id) ? naira(byLesson.get(l.id)!.offering_amount) : '–'}</td>
            ))}
            <td className="sa-sheet-total" colSpan={2}>{naira(offeringTotal)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
