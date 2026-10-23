import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Baby, BookOpen, Church, Flame, Flower2, HandHelping, Heart, Mail, MapPin, MessageCircle, Music, Phone, Users, type LucideIcon } from 'lucide-react';
import { SITE, ministrySlug } from '@/config/site';
import { usePublicList } from '@/lib/publicData';
import { ProgrammeBoard } from '@/components/ProgrammeBoard';
import { VisitMessageForm } from '@/components/VisitMessageForm';
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
      <div className="mt-10">
        <VisitMessageForm />
      </div>
      <p className="mt-6 text-sm text-gray-600">Prefer to talk? See our <a href="/contact" className="font-medium text-brand-700 underline">contact page</a> for our phone number and address.</p>
    </Section>
  );
}

/** Nigerian numbers like 0803... become +234803... so the phone dialler works from anywhere. */
const telHref = (n: string) => {
  const d = n.replace(/\D/g, '');
  return `tel:${d.startsWith('0') ? `+234${d.slice(1)}` : `+${d}`}`;
};

function ContactCard({ icon, label, className = '', children }: { icon: React.ReactNode; label: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={`flex gap-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm ${className}`}>
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-900 text-gold-400">{icon}</div>
      <div className="min-w-0">
        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">{label}</div>
        <div className="mt-1 text-gray-800">{children}</div>
      </div>
    </div>
  );
}

export function ContactPage() {
  const c = SITE.contact;
  return (
    <Section title="Contact us" intro="Call, message or visit us. You are always welcome.">
      <div className="grid gap-4 sm:grid-cols-2">
        <ContactCard icon={<MapPin size={20} />} label="Address" className="sm:col-span-2">
          <address className="not-italic">
            <div className="font-semibold text-brand-900">{SITE.assembly}</div>
            <div>{c.address || SITE.city}</div>
            <div className="text-sm text-gray-600">{SITE.district}</div>
          </address>
          {c.mapUrl && (
            <a className="mt-3 inline-block rounded-lg bg-brand-900 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-800" href={c.mapUrl} target="_blank" rel="noreferrer">
              Open in Google Maps
            </a>
          )}
        </ContactCard>

        {c.phone && (
          <ContactCard icon={<Phone size={20} />} label="Phone">
            <a className="font-semibold text-brand-900 hover:underline" href={telHref(c.phone)}>{c.phone}</a>
          </ContactCard>
        )}

        {c.whatsapp && (
          <ContactCard icon={<MessageCircle size={20} />} label="WhatsApp">
            <a className="font-semibold text-brand-900 hover:underline" href={`https://wa.me/${c.whatsapp}`} target="_blank" rel="noreferrer">Chat with us on WhatsApp</a>
          </ContactCard>
        )}

        {c.email && (
          <ContactCard icon={<Mail size={20} />} label="Email" className="sm:col-span-2">
            <a className="break-all font-semibold text-brand-900 hover:underline" href={`mailto:${c.email}`}>{c.email}</a>
          </ContactCard>
        )}
      </div>

      {!c.phone && !c.email && <p className="text-sm text-gray-500">Contact details will be added soon.</p>}
    </Section>
  );
}

const MINISTRY_ICONS: Record<string, LucideIcon> = {
  book: BookOpen, baby: Baby, users: Users, heart: Heart, flower: Flower2,
  hands: HandHelping, flame: Flame, music: Music, church: Church,
};

/** One page for every ministry in SITE.ministries. Footer links open it at the right card (/ministries#youth). */
export function MinistriesPage() {
  const { hash } = useLocation();
  useEffect(() => {
    if (!hash) return;
    document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [hash]);

  return (
    <Section title="Our ministries" intro="There is a place for everyone at Mount Zion Sanctuary.">
      <div className="grid gap-4 sm:grid-cols-2">
        {SITE.ministries.map((m) => {
          const Icon = MINISTRY_ICONS[m.icon] ?? Church;
          const slug = ministrySlug(m.title);
          const active = hash === `#${slug}`;
          return (
            <section
              key={slug}
              id={slug}
              className={`scroll-mt-28 rounded-2xl border bg-white p-5 shadow-sm ${active ? 'border-gold-500 ring-1 ring-gold-500' : 'border-gray-200'}`}
            >
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-900 text-gold-400"><Icon size={20} /></span>
                <h2 className="font-serif text-xl font-bold text-brand-900">{m.title}</h2>
              </div>
              <p className="mt-3 text-gray-700">{m.note}</p>
            </section>
          );
        })}
      </div>

      <div className="mt-8 rounded-2xl bg-brand-50 p-5">
        <div className="font-semibold text-brand-900">Want to join or ask about a ministry?</div>
        <p className="mt-1 text-sm text-gray-700">Send us a message and our office will point you to the right team.</p>
        <Link to="/visit" className="mt-3 inline-block rounded-lg bg-brand-900 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-800">Message the office</Link>
      </div>
    </Section>
  );
}
