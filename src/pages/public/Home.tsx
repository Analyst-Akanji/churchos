import { Link } from 'react-router-dom';
import { ArrowRight, Baby, BookOpen, CalendarDays, Check, Church, Clock, Flame, Flower2, Heart, HandHeart, Music, Play, Users, type LucideIcon } from 'lucide-react';
import { SITE } from '@/config/site';
import { HeroCarousel } from '@/components/HeroCarousel';
import { Logo } from '@/components/Logo';
import { ProgrammeBoard } from '@/components/ProgrammeBoard';
import { ABOUT_IMAGE } from '@/lib/aboutImage';
import { clock, dayLabel, groupByDay, usePublicProgramme } from '@/lib/programme';
import { usePublicList } from '@/lib/publicData';
import { fmtDate, fmtTime } from '@/lib/format';
import type { AnnouncementRow, EventRow, SermonRow } from '@/types/db';

const ICONS: Record<string, LucideIcon> = { book: BookOpen, baby: Baby, users: Users, heart: Heart, flower: Flower2, hands: HandHeart, flame: Flame, music: Music, church: Church };
const TONES = ['text-brand-600 bg-brand-50', 'text-emerald-700 bg-emerald-50', 'text-crimson-500 bg-red-50', 'text-gold-600 bg-amber-50', 'text-sky-700 bg-sky-50', 'text-brand-600 bg-brand-50'];
const Icon = ({ name, className }: { name: string; className?: string }) => { const C = ICONS[name] ?? Church; return <C className={className} />; };

function Eyebrow({ children, center }: { children: React.ReactNode; center?: boolean }) {
  return <div className={`text-xs font-semibold uppercase tracking-[0.2em] text-gold-600 ${center ? 'text-center' : ''}`}>{children}</div>;
}

export default function Home() {
  const programme = usePublicProgramme();
  const events = usePublicList<EventRow>('v_public_events', 'starts_at', true, 3);
  const sermons = usePublicList<SermonRow>('v_public_sermons', 'preached_on', false, 3);
  const news = usePublicList<AnnouncementRow>('v_public_announcements', 'publish_at', false, 2);
  const nextItem = groupByDay(programme.data ?? [])[0];
  const nextUp = nextItem?.items[0];

  return (
    <div>
      {/* HERO: full-bleed rotating service photos */}
      <HeroCarousel>
        <div className="mx-auto flex min-h-[78vh] max-w-6xl flex-col justify-center px-4 pb-36 pt-16 md:min-h-[84vh]">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-gold-400">{SITE.hero.eyebrow} · {SITE.yearTheme.year}</p>
          <h1 className="mt-4 max-w-2xl font-serif text-4xl font-bold uppercase leading-[1.08] text-white sm:text-5xl md:text-6xl">
            {SITE.hero.lines.map((l) => <span key={l} className="block">{l}</span>)}
            <span className="block text-gold-400">{SITE.hero.accent}</span>
          </h1>
          <p className="mt-5 max-w-xl text-base text-brand-100 md:text-lg">{SITE.hero.sub}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/visit" className="rounded-lg bg-gold-500 px-6 py-3.5 text-sm font-semibold text-white shadow-lg hover:bg-gold-600">Plan your visit</Link>
            <Link to="/sermons" className="inline-flex items-center gap-2 rounded-lg border border-white/50 bg-white/5 px-6 py-3.5 text-sm font-semibold text-white backdrop-blur hover:bg-white/15"><Play className="h-4 w-4" />Listen to messages</Link>
          </div>
          <div className="mt-10 hidden gap-8 sm:flex">
            {SITE.pillars.map((p) => (
              <div key={p.title} className="flex items-center gap-3 text-white">
                <Icon name={p.icon} className="h-7 w-7 text-gold-400" /><div className="leading-tight"><div className="font-semibold">{p.title}</div><div className="text-xs text-brand-200">{p.note}</div></div>
              </div>
            ))}
          </div>
        </div>
      </HeroCarousel>

      {/* floating "next up" card: driven by the weekly programme the church office posts */}
      <div className="relative z-10 mx-auto -mt-20 max-w-4xl px-4">
        <div className="flex flex-col gap-4 rounded-2xl bg-white p-5 shadow-xl ring-1 ring-black/5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="flex items-center gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700"><Clock className="h-6 w-6" /></span>
            <div>
              <div className="font-serif text-xl font-bold text-brand-900">{nextUp ? 'Next up' : 'Everyone is welcome'}</div>
              <div className="text-sm text-gray-600">{nextUp && nextItem ? `${nextUp.title} · ${dayLabel(nextItem.date)} at ${clock(nextUp.start_time)}` : 'Join us this Sunday. We would love to meet you.'}</div>
            </div>
          </div>
          <div className="flex gap-2"><a href="#this-week" className="rounded-lg bg-brand-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-800">This week's programme</a><Link to="/visit" className="rounded-lg border border-gray-200 px-5 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50">What to expect</Link></div>
        </div>
      </div>

      {/* THIS WEEK */}
      <section id="this-week" className="mx-auto max-w-6xl scroll-mt-24 px-4 pt-20">
        <Eyebrow>This week</Eyebrow>
        <h2 className="mt-2 font-serif text-3xl font-bold text-brand-900 md:text-4xl">What's happening at Mount Zion</h2>
        <p className="mt-2 max-w-2xl text-gray-600">Our programmes for the days ahead. Come and join us.</p>
        <div className="mt-8"><ProgrammeBoard compact /></div>
      </section>

      {/* ABOUT */}
      <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-20 md:grid-cols-2">
        <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-gradient-to-br from-brand-800 to-brand-600 shadow-lg">
          {ABOUT_IMAGE ? <img src={ABOUT_IMAGE} alt="Worship at Mount Zion Sanctuary" loading="lazy" decoding="async" className="h-full w-full object-cover" />
            : <div className="flex h-full items-center justify-center"><div className="scale-[3]"><Logo light /></div></div>}
        </div>
        <div>
          <Eyebrow>About us</Eyebrow>
          <h2 className="mt-2 font-serif text-3xl font-bold text-brand-900 md:text-4xl">A place to belong</h2>
          <p className="mt-4 text-gray-700">{SITE.about[0]}</p>
          <ul className="mt-5 space-y-2.5">
            {SITE.aboutPoints.map((t) => <li key={t} className="flex items-center gap-3 text-gray-800"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-gold-500 text-white"><Check className="h-3 w-3" /></span>{t}</li>)}
          </ul>
          <Link to="/about" className="mt-7 inline-flex items-center gap-2 rounded-lg bg-brand-900 px-5 py-3 text-sm font-semibold text-white hover:bg-brand-800">Learn more about us<ArrowRight className="h-4 w-4" /></Link>
        </div>
      </section>

      {/* MINISTRIES */}
      <section className="bg-gray-50 py-20">
        <div className="mx-auto max-w-6xl px-4">
          <Eyebrow center>Our ministries</Eyebrow>
          <h2 className="mt-2 text-center font-serif text-3xl font-bold text-brand-900 md:text-4xl">Ministries for every season of life</h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {SITE.ministries.map((m, i) => (
              <div key={m.title} className="rounded-2xl border border-gray-200 bg-white p-6 transition-shadow hover:shadow-md">
                <span className={`flex h-12 w-12 items-center justify-center rounded-xl ${TONES[i % TONES.length]}`}><Icon name={m.icon} className="h-6 w-6" /></span>
                <h3 className="mt-4 font-serif text-lg font-bold text-brand-900">{m.title}</h3>
                <p className="mt-1 text-sm text-gray-600">{m.note}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* EVENTS + GIVE / NEW HERE */}
      <section className="mx-auto grid max-w-6xl gap-6 px-4 py-20 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <Eyebrow>Upcoming events</Eyebrow>
          <h2 className="mt-2 font-serif text-3xl font-bold text-brand-900">What's happening</h2>
          <div className="mt-6 divide-y divide-gray-100 rounded-2xl border border-gray-200 bg-white">
            {(events.data ?? []).length === 0 && <p className="p-6 text-sm text-gray-500">No upcoming events yet. Please check back soon.</p>}
            {(events.data ?? []).map((e) => {
              const d = new Date(e.starts_at);
              return (
                <div key={e.id} className="flex items-center gap-4 p-4">
                  <div className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-xl bg-brand-900 text-white"><span className="text-[11px] font-semibold uppercase tracking-wider text-gold-400">{d.toLocaleString('en-GB', { month: 'short' })}</span><span className="text-2xl font-bold leading-none">{d.getDate()}</span></div>
                  <div className="min-w-0 flex-1"><div className="font-semibold text-brand-900">{e.title}</div><div className="truncate text-sm text-gray-600">{fmtTime(e.starts_at)}{e.venue ? ` · ${e.venue}` : ''}</div></div>
                  <Link to="/events" aria-label="Event details" className="text-gold-600"><ArrowRight className="h-5 w-5" /></Link>
                </div>
              );
            })}
          </div>
          <Link to="/events" className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline">View all events<ArrowRight className="h-4 w-4" /></Link>
        </div>
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand-900 to-brand-700 p-8 text-white lg:col-span-2">
          <div className="absolute -right-10 -top-10 h-48 w-48 rounded-full bg-gold-500/20 blur-2xl" />
          {SITE.giving.url ? (<>
            <Eyebrow>Give</Eyebrow><h3 className="mt-2 font-serif text-2xl font-bold">Your generosity changes lives</h3>
            <p className="mt-3 text-sm text-brand-100">{SITE.giving.note}</p>
            <a href={SITE.giving.url} target="_blank" rel="noreferrer" className="mt-6 inline-flex items-center gap-2 rounded-lg bg-gold-500 px-5 py-3 text-sm font-semibold text-white hover:bg-gold-600"><HandHeart className="h-4 w-4" />Give</a>
          </>) : (<>
            <Eyebrow>New here?</Eyebrow><h3 className="mt-2 font-serif text-2xl font-bold">We'd love to meet you</h3>
            <p className="mt-3 text-sm text-brand-100">Not sure what to expect? Our ushers and Sunday school teachers will welcome you and help you feel at home.</p>
            <Link to="/visit" className="mt-6 inline-flex items-center gap-2 rounded-lg bg-gold-500 px-5 py-3 text-sm font-semibold text-white hover:bg-gold-600">Plan your visit<ArrowRight className="h-4 w-4" /></Link>
          </>)}
        </div>
      </section>

      {/* OPTIONAL STATS BAND */}
      {SITE.stats.length > 0 && (
        <section className="bg-brand-900 py-10"><div className="mx-auto grid max-w-6xl gap-6 px-4 text-center text-white sm:grid-cols-2 lg:grid-cols-4">
          {SITE.stats.map((s) => <div key={s.label}><div className="font-serif text-4xl font-bold text-gold-400">{s.value}</div><div className="mt-1 text-sm text-brand-100">{s.label}</div></div>)}
        </div></section>
      )}

      {/* LATEST MESSAGES */}
      {(sermons.data ?? []).length > 0 && (
        <section className="bg-gray-50 py-20"><div className="mx-auto max-w-6xl px-4">
          <Eyebrow center>Latest messages</Eyebrow>
          <h2 className="mt-2 text-center font-serif text-3xl font-bold text-brand-900">Catch up on the Word</h2>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {sermons.data!.map((s) => (
              <Link to="/sermons" key={s.id} className="group overflow-hidden rounded-2xl border border-gray-200 bg-white transition-shadow hover:shadow-md">
                <div className="flex aspect-video items-center justify-center bg-gradient-to-br from-brand-800 to-crimson-600 text-white"><Play className="h-10 w-10 opacity-80 transition-transform group-hover:scale-110" /></div>
                <div className="p-5"><div className="text-xs font-semibold uppercase tracking-wider text-gold-600">{s.preacher_name ?? 'Sermon'}{s.text_used ? ` · ${s.text_used}` : ''}</div>
                  <div className="mt-1 font-serif text-lg font-bold text-brand-900">{s.title}</div>{s.preached_on && <div className="mt-1 text-xs text-gray-500">{fmtDate(s.preached_on)}</div>}</div>
              </Link>
            ))}
          </div>
          <div className="mt-8 text-center"><Link to="/sermons" className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline">Sermon archive<ArrowRight className="h-4 w-4" /></Link></div>
        </div></section>
      )}

      {/* OPTIONAL TESTIMONIES */}
      {SITE.testimonials.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 py-20">
          <Eyebrow center>What people are saying</Eyebrow>
          <h2 className="mt-2 text-center font-serif text-3xl font-bold text-brand-900">Real people. Real stories.</h2>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {SITE.testimonials.map((t) => <figure key={t.name} className="rounded-2xl border border-gray-200 bg-white p-6"><blockquote className="text-sm text-gray-700">“{t.quote}”</blockquote><figcaption className="mt-4 text-sm font-semibold text-brand-900">{t.name}{t.place ? <span className="font-normal text-gray-500">, {t.place}</span> : null}</figcaption></figure>)}
          </div>
        </section>
      )}

      {/* ANNOUNCEMENTS */}
      {(news.data ?? []).length > 0 && (
        <section className="mx-auto max-w-4xl px-4 pb-16">
          <h2 className="font-serif text-2xl font-bold text-brand-900">Announcements</h2>
          <div className="mt-4 space-y-3">{news.data!.map((n) => <div key={n.id} className="rounded-xl border border-gray-200 p-4"><div className="font-semibold">{n.title}</div><p className="mt-1 whitespace-pre-line text-sm text-gray-700">{n.body}</p></div>)}</div>
        </section>
      )}

      {/* CTA BAND */}
      <section className="bg-gold-500">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 text-center sm:flex-row sm:text-left">
          <div className="flex items-center gap-4 text-white"><CalendarDays className="hidden h-10 w-10 sm:block" /><div><div className="font-serif text-2xl font-bold">We'd love to meet you!</div><div className="text-sm text-amber-50">Join us this Sunday and experience a place where you belong.</div></div></div>
          <Link to="/visit" className="rounded-lg bg-brand-900 px-6 py-3 text-sm font-semibold text-white hover:bg-brand-800">Plan your visit</Link>
        </div>
      </section>
    </div>
  );
}
