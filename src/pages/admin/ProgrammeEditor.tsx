import '@fontsource-variable/fraunces';
import '@fontsource-variable/source-sans-3';
import '../styles/sunday-admin.css';

import { useEffect, useState } from 'react';
import {
  fetchPreviousProgramme,
  fetchProgramme,
  saveProgramme,
  type ProgrammeItem,
} from '../lib/sundayApi';
import { formatSunday, isSunday, nextSundayOnOrAfter, todayInLagos } from '../lib/quarter';
import { supabase } from '../lib/supabase';

interface Props {
  assemblyId: string;
}

const blankItem = (): ProgrammeItem => ({ start_time: '', title: '', led_by: '', notes: '' });

export default function ProgrammeEditor({ assemblyId }: Props) {
  const [date, setDate] = useState(() => nextSundayOnOrAfter(todayInLagos()));
  const [theme, setTheme] = useState('');
  const [preacher, setPreacher] = useState('');
  const [notes, setNotes] = useState('');
  const [published, setPublished] = useState(false);
  const [items, setItems] = useState<ProgrammeItem[]>([blankItem()]);
  const [lessonLine, setLessonLine] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error' | 'warn'; text: string } | null>(null);

  // Load whatever has already been entered for the chosen Sunday.
  useEffect(() => {
    if (!date || !isSunday(date)) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setMessage(null);
    (async () => {
      try {
        const [existing, lesson] = await Promise.all([
          fetchProgramme(assemblyId, date),
          supabase
            .from('lessons')
            .select('lesson_number, title, kind')
            .eq('lesson_date', date)
            .maybeSingle(),
        ]);
        if (cancelled) return;

        setTheme(existing?.theme ?? '');
        setPreacher(existing?.preacher ?? '');
        setNotes(existing?.notes ?? '');
        setPublished(existing?.is_published ?? false);
        setItems(existing && existing.items.length > 0 ? existing.items : [blankItem()]);

        const l = lesson.data as { lesson_number: number | null; title: string; kind: string } | null;
        setLessonLine(
          l ? (l.kind === 'sharing' ? l.title : `Lesson ${l.lesson_number}: ${l.title}`) : null,
        );
      } catch (e) {
        if (!cancelled) {
          setMessage({ kind: 'error', text: e instanceof Error ? e.message : 'Could not load this Sunday.' });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [assemblyId, date]);

  function patchItem(i: number, patch: Partial<ProgrammeItem>) {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  }

  function move(i: number, by: -1 | 1) {
    setItems((prev) => {
      const j = i + by;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  async function copyLastWeek() {
    setMessage(null);
    try {
      const previous = await fetchPreviousProgramme(assemblyId, date);
      if (!previous || previous.items.length === 0) {
        setMessage({ kind: 'warn', text: 'There is no earlier order of service to copy yet.' });
        return;
      }
      setItems(previous.items);
      setMessage({ kind: 'ok', text: `Copied the order from ${formatSunday(previous.service_date)}. Edit what changes this week.` });
    } catch (e) {
      setMessage({ kind: 'error', text: e instanceof Error ? e.message : 'Could not copy the last order.' });
    }
  }

  async function save() {
    setMessage(null);
    if (!isSunday(date)) {
      setMessage({ kind: 'error', text: 'Pick a Sunday.' });
      return;
    }
    const filled = items.filter((i) => i.title.trim());
    if (published && filled.length === 0) {
      setMessage({ kind: 'error', text: 'Add at least one item before showing this on the website.' });
      return;
    }
    setSaving(true);
    try {
      await saveProgramme(assemblyId, date, {
        theme,
        preacher,
        notes,
        is_published: published,
        items: filled,
      });
      setItems(filled.length > 0 ? filled : [blankItem()]);
      setMessage({
        kind: 'ok',
        text: published ? 'Saved. This order of service is showing on the website.' : 'Saved as a draft. It is not on the website yet.',
      });
    } catch (e) {
      setMessage({ kind: 'error', text: e instanceof Error ? e.message : 'Could not save.' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="sa" aria-busy={loading}>
      <h2>Order of service</h2>
      <p className="sa-lead">Enter what is happening on a Sunday. Keep it as a draft until it is ready, then show it on the website.</p>

      <div className="sa-field">
        <label htmlFor="pe-date">Sunday</label>
        <input id="pe-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        {date && !isSunday(date) && <span className="sa-hint" role="alert">That date is not a Sunday.</span>}
        {date && isSunday(date) && (
          <span className="sa-hint">
            {formatSunday(date)}
            {lessonLine ? `. Sunday school: ${lessonLine}` : ''}
          </span>
        )}
      </div>

      <div className="sa-row sa-row--2">
        <div className="sa-field">
          <label htmlFor="pe-theme">Service theme</label>
          <input id="pe-theme" type="text" value={theme} onChange={(e) => setTheme(e.target.value)} />
        </div>
        <div className="sa-field">
          <label htmlFor="pe-preacher">Preacher</label>
          <input id="pe-preacher" type="text" value={preacher} onChange={(e) => setPreacher(e.target.value)} />
        </div>
      </div>

      <h3>Items</h3>
      <div className="sa-actions" style={{ marginTop: 0, marginBottom: '0.75rem' }}>
        <button type="button" className="sa-btn sa-btn--quiet sa-btn--small" onClick={copyLastWeek}>
          Copy the last order of service
        </button>
      </div>

      {items.map((it, i) => (
        <fieldset key={i} className="sa-block">
          <legend className="sa-sr">Item {i + 1}</legend>
          <div className="sa-row sa-row--2">
            <div className="sa-field">
              <label htmlFor={`pe-title-${i}`}>Item {i + 1}</label>
              <input
                id={`pe-title-${i}`}
                type="text"
                value={it.title}
                onChange={(e) => patchItem(i, { title: e.target.value })}
              />
            </div>
            <div className="sa-field">
              <label htmlFor={`pe-time-${i}`}>Time</label>
              <input
                id={`pe-time-${i}`}
                type="time"
                value={it.start_time}
                onChange={(e) => patchItem(i, { start_time: e.target.value })}
              />
            </div>
          </div>
          <div className="sa-field">
            <label htmlFor={`pe-led-${i}`}>Led by</label>
            <input
              id={`pe-led-${i}`}
              type="text"
              value={it.led_by}
              onChange={(e) => patchItem(i, { led_by: e.target.value })}
            />
          </div>
          <div className="sa-field">
            <label htmlFor={`pe-notes-${i}`}>Note</label>
            <input
              id={`pe-notes-${i}`}
              type="text"
              value={it.notes}
              onChange={(e) => patchItem(i, { notes: e.target.value })}
            />
          </div>
          <div className="sa-actions" style={{ marginTop: 0 }}>
            <button type="button" className="sa-btn sa-btn--quiet sa-btn--small" disabled={i === 0} onClick={() => move(i, -1)}>
              Move up
            </button>
            <button
              type="button"
              className="sa-btn sa-btn--quiet sa-btn--small"
              disabled={i === items.length - 1}
              onClick={() => move(i, 1)}
            >
              Move down
            </button>
            <button
              type="button"
              className="sa-btn sa-btn--danger sa-btn--small"
              onClick={() => setItems(items.length === 1 ? [blankItem()] : items.filter((_, j) => j !== i))}
            >
              Remove
            </button>
          </div>
        </fieldset>
      ))}

      <button type="button" className="sa-btn sa-btn--quiet" onClick={() => setItems([...items, blankItem()])}>
        Add an item
      </button>

      <div className="sa-field" style={{ marginTop: '1rem' }}>
        <label htmlFor="pe-notes">Announcements or notes for the week</label>
        <textarea id="pe-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      <div className="sa-field">
        <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', fontWeight: 400 }}>
          <input type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} />
          Show this order of service on the website
        </label>
      </div>

      {message && (
        <p className={`sa-msg sa-msg--${message.kind}`} role={message.kind === 'error' ? 'alert' : 'status'}>
          {message.text}
        </p>
      )}

      <div className="sa-actions">
        <button type="button" className="sa-btn" onClick={save} disabled={saving || loading}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}
