import { useState, type ChangeEvent, type FormEvent } from 'react';
import { supabase } from '@/lib/supabase';

const inputCls =
  'w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-brand-700 focus:outline-none focus:ring-1 focus:ring-brand-700';

const EMPTY = { name: '', phone: '', email: '', date: '', people: '', message: '', website: '' };

/**
 * The "Plan a visit" message form. Saves through the submit_visit_message database function,
 * so visitors never get direct access to the table. `website` is a hidden trap field: real
 * people leave it empty, simple spam bots fill it in.
 */
export function VisitMessageForm() {
  const [f, setF] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  const set = (k: keyof typeof EMPTY) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setF((prev) => ({ ...prev, [k]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (!f.name.trim() || !f.message.trim()) {
      setError('Please enter your name and a message.');
      return;
    }
    if (!f.phone.trim() && !f.email.trim()) {
      setError('Please give a phone number or an email so we can reply.');
      return;
    }
    if (f.website) {
      setSent(true); // spam trap: pretend it worked, save nothing
      return;
    }
    setBusy(true);
    const { error: err } = await supabase.rpc('submit_visit_message', {
      p_name: f.name,
      p_phone: f.phone,
      p_email: f.email,
      p_message: f.message,
      p_planned_visit: f.date || null,
      p_people: f.people ? Number(f.people) : null,
    });
    setBusy(false);
    if (err) {
      // P0001 is one of our own friendly messages; anything else gets a generic line.
      setError(err.code === 'P0001' ? err.message : 'We could not send your message. Please try again, or call us.');
      return;
    }
    setSent(true);
    setF(EMPTY);
  }

  if (sent) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-6 text-center shadow-sm">
        <h2 className="font-serif text-2xl font-bold text-brand-900">Thank you</h2>
        <p className="mt-2 text-gray-700">Your message has reached our office. We will get back to you soon.</p>
        <button
          type="button"
          onClick={() => setSent(false)}
          className="mt-4 text-sm font-medium text-brand-700 underline"
        >
          Send another message
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
      <h2 className="font-serif text-2xl font-bold text-brand-900">Let us know you are coming</h2>
      <p className="mt-1 text-sm text-gray-600">Send us a message or a question and our office will reply.</p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium text-gray-700">
          Your name *
          <input className={`${inputCls} mt-1`} value={f.name} onChange={set('name')} maxLength={120} autoComplete="name" />
        </label>
        <label className="block text-sm font-medium text-gray-700">
          Phone
          <input className={`${inputCls} mt-1`} value={f.phone} onChange={set('phone')} maxLength={40} inputMode="tel" autoComplete="tel" />
        </label>
        <label className="block text-sm font-medium text-gray-700 sm:col-span-2">
          Email
          <input className={`${inputCls} mt-1`} type="email" value={f.email} onChange={set('email')} maxLength={200} autoComplete="email" />
        </label>
        <p className="-mt-2 text-xs text-gray-500 sm:col-span-2">Give at least a phone number or an email so we can reply.</p>
        <label className="block text-sm font-medium text-gray-700">
          Planned visit date (optional)
          <input className={`${inputCls} mt-1`} type="date" value={f.date} onChange={set('date')} min={new Date().toISOString().slice(0, 10)} />
        </label>
        <label className="block text-sm font-medium text-gray-700">
          Number of people (optional)
          <input className={`${inputCls} mt-1`} type="number" min={1} max={100} inputMode="numeric" value={f.people} onChange={set('people')} />
        </label>
        <label className="block text-sm font-medium text-gray-700 sm:col-span-2">
          Your message *
          <textarea className={`${inputCls} mt-1 min-h-[7rem]`} value={f.message} onChange={set('message')} maxLength={2000} />
        </label>
      </div>

      {/* Spam trap: hidden from people, visible to bots */}
      <div className="absolute -left-[9999px] h-0 w-0 overflow-hidden" aria-hidden="true">
        <label>
          Website
          <input tabIndex={-1} autoComplete="off" value={f.website} onChange={set('website')} />
        </label>
      </div>

      {error && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}

      <button
        type="submit"
        disabled={busy}
        className="mt-5 rounded-lg bg-brand-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-60"
      >
        {busy ? 'Sending...' : 'Send message'}
      </button>
    </form>
  );
}
