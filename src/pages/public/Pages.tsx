import { useState } from 'react';
import { Phone, Mail, MapPin } from 'lucide-react';
import { SITE } from '@/config/site';
import { usePublicList } from '@/lib/publicData';
import { ProgrammeBoard } from '@/components/ProgrammeBoard';
import { fmtDate, fmtTime } from '@/lib/format';
import { Spinner, Empty } from '@/components/ui';
import type { EventRow, SermonRow } from '@/types/db';

function Section({ title, intro, children }: { title: string; intro?: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <h1 className="font-serif text-3xl font-bold text-brand-900 md:text-4xl">{title}</h1>
      {intro && <p className="mt-2 text-gray-600">{intro}</p>}
      <div className="mt-8">{children}</div>
    </div>
  );
}

export function About() {
  const pu = SITE.purpose;
  return (
    <Section title="About us" intro={SITE.fullName}>
      <div className="space-y-4 text-gray-800">{SITE.about.map((t, i) => <p key={i}>{t}</p>)}</div>

      <div className="mt-10 overflow-hidden rounded-2xl border border-gray-200">
        <div className="bg-brand-900 px-6 py-5 text-center">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-gold-400">GOFAMINT</div>
          <h2 className="mt-1 font-serif text-2xl font-bold uppercase text-white">{pu.title}</h2>
        </div>
        <ol className="divide-y divide-gray-100 bg-white">
          {pu.items.map((it, i) => (
            <li key={it.key} className="flex gap-4 px-6 py-5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gold-500 font-serif text-lg font-bold text-white">{i + 1}</span>
              <p className="pt-1 text-lg leading-relaxed text-gray-800">{it.before}<strong className="font-bold text-crimson-500">{it.key}</strong>{it.after}</p>
            </li>
          ))}
        </ol>
        <div className="bg-gold-500 px-6 py-4 text-center font-serif text-lg font-bold italic text-white">{pu.motto}</div>
      </div>

      <div className="mt-8 rounded-xl bg-brand-50 p-5">
        <div className="text-xs font-semibold uppercase tracking-widest text-gold-600">{SITE.yearTheme.year} theme</div>
        <div className="mt-1 text-xl font-bold text-brand-900">{SITE.yearTheme.title}</div>
        <div className="text-sm text-gray-600">Anchor scripture: {SITE.yearTheme.anchor}</div>
      </div>
    </Section>
  );
}

export function ServicesPage() {
  return (
    <Section title="This week's programme" intro="Our programmes for the next seven days. Everyone is welcome.">
      <ProgrammeBoard />
    </Section>
  );
}

export function EventsPage() {
  const { data, isLoading } = usePublicList<EventRow>('v_public_events', 'starts_at', true, 50);
  return (
    <Section title="Events">
      {isLoading ? <Spinner /> : (data ?? []).length === 0 ? <Empty title="No upcoming events" hint="Please check back soon." /> :
        <div className="space-y-3">{data!.map((e) => (
          <div key={e.id} className="rounded-xl border border-gray-200 p-4">
            <div className="font-medium">{e.title}</div>
            <div className="text-sm text-gray-600">{fmtDate(e.starts_at)} · {fmtTime(e.starts_at)}{e.venue ? ` · ${e.venue}` : ''}</div>
            {e.description && <p className="mt-2 whitespace-pre-line text-sm text-gray-700">{e.description}</p>}
          </div>))}</div>}
    </Section>
  );
}

export function SermonsPage() {
  const { data, isLoading } = usePublicList<SermonRow>('v_public_sermons', 'preached_on', false, 100);
  const [term, setTerm] = useState('');
  const list = (data ?? []).filter((s) => `${s.title} ${s.preacher_name ?? ''} ${s.text_used ?? ''}`.toLowerCase().includes(term.toLowerCase()));
  return (
    <Section title="Sermon archive" intro="Search by title, preacher or scripture.">
      <input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Search sermons" className="mb-6 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm" />
      {isLoading ? <Spinner /> : list.length === 0 ? <Empty title="No sermons found" /> :
        <div className="space-y-3">{list.map((s) => (
          <div key={s.id} className="rounded-xl border border-gray-200 p-4">
            <div className="font-medium">{s.title}</div>
            <div className="text-sm text-gray-600">{[s.preacher_name, s.text_used, s.preached_on ? fmtDate(s.preached_on) : null].filter(Boolean).join(' · ')}</div>
            {s.summary && <p className="mt-2 text-sm text-gray-700">{s.summary}</p>}
            <div className="mt-2 flex gap-3 text-sm">
              {s.audio_url && <a className="font-medium text-brand-700 hover:underline" href={s.audio_url} target="_blank" rel="noreferrer">Listen</a>}
              {s.video_url && <a className="font-medium text-brand-700 hover:underline" href={s.video_url} target="_blank" rel="noreferrer">Watch</a>}
            </div>
          </div>))}</div>}
    </Section>
  );
}

export function VisitPage() {
  return (
    <Section title="Plan a visit" intro="We would love to meet you. Here is what to expect.">
      <ul className="list-disc space-y-2 pl-5 text-gray-800">
        <li>Sunday school runs first, with classes for children, youth and adults. Our teachers will help you find the right class.</li>
        <li>The main worship service follows. Dress comfortably; you are welcome as you are.</li>
        <li>Our ushers will welcome you at the door and help with seating and children.</li>
      </ul>
      <p className="mt-6 text-gray-700">To let us know you are coming, contact us on the <a href="/contact" className="font-medium text-brand-700 underline">contact page</a>.</p>
    </Section>
  );
}

export function ContactPage() {
  return (
    <Section title="Contact us">
      <div className="space-y-3 text-gray-800">
        <div className="flex items-start gap-3"><MapPin className="mt-0.5 h-5 w-5 text-gold-500" /><div>{SITE.assembly}<br />{SITE.district}<br />{SITE.city}</div></div>
        {SITE.contact.phone && <div className="flex items-center gap-3"><Phone className="h-5 w-5 text-gold-500" />{SITE.contact.phone}</div>}
        {SITE.contact.email && <div className="flex items-center gap-3"><Mail className="h-5 w-5 text-gold-500" />{SITE.contact.email}</div>}
        {SITE.contact.whatsapp && <a className="inline-block rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white" href={`https://wa.me/${SITE.contact.whatsapp}`}>Chat on WhatsApp</a>}
        {SITE.contact.mapUrl && <a className="block font-medium text-brand-700 underline" href={SITE.contact.mapUrl} target="_blank" rel="noreferrer">Open in Google Maps</a>}
        {!SITE.contact.phone && !SITE.contact.email && <p className="text-sm text-gray-500">Contact details will be added soon.</p>}
      </div>
    </Section>
  );
}
