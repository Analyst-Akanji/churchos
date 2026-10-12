import { Link } from 'react-router-dom';
import { CalendarDays, Clock, MapPin } from 'lucide-react';
import { SITE } from '@/config/site';
import { usePublicList } from '@/lib/publicData';
import { fmtDate, fmtTime } from '@/lib/format';
import type { EventRow, SermonRow, AnnouncementRow } from '@/types/db';

interface PublicService { id: string; title: string | null; service_type: string; starts_at: string }

export default function Home() {
  const services = usePublicList<PublicService>('v_public_services', 'starts_at', true, 4);
  const events = usePublicList<EventRow>('v_public_events', 'starts_at', true, 3);
  const sermons = usePublicList<SermonRow>('v_public_sermons', 'preached_on', false, 3);
  const news = usePublicList<AnnouncementRow>('v_public_announcements', 'publish_at', false, 3);

  return (
    <div>
      <section className="bg-gradient-to-br from-brand-900 via-brand-800 to-crimson-600 text-white">
        <div className="mx-auto max-w-6xl px-4 py-16 md:py-24">
          <p className="text-sm font-medium uppercase tracking-widest text-gold-400">{SITE.yearTheme.year} · {SITE.yearTheme.title}</p>
          <h1 className="mt-3 max-w-3xl text-4xl font-bold leading-tight md:text-5xl">Welcome to {SITE.assembly}</h1>
          <p className="mt-4 max-w-2xl text-lg text-brand-100">{SITE.tagline}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/visit" className="rounded-lg bg-gold-500 px-5 py-3 font-medium text-white hover:bg-gold-600">Plan a visit</Link>
            <Link to="/services" className="rounded-lg border border-white/40 px-5 py-3 font-medium text-white hover:bg-white/10">Service times</Link>
          </div>
          <div className="mt-8 flex items-center gap-2 text-sm text-brand-100"><MapPin className="h-4 w-4" />{SITE.district}, {SITE.city}</div>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-6 px-4 py-12 md:grid-cols-2">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold text-brand-900"><Clock className="h-5 w-5 text-gold-500" />Coming up</h2>
          <div className="mt-4 space-y-3">
            {(services.data ?? []).length === 0 && SITE.weeklyProgramme.map((p) => (
              <div key={p.time} className="rounded-xl border border-gray-200 p-4"><div className="font-medium">{p.day}: {p.time}</div><div className="text-sm text-gray-600">{p.note}</div></div>
            ))}
            {(services.data ?? []).map((s) => (
              <div key={s.id} className="rounded-xl border border-gray-200 p-4">
                <div className="font-medium">{s.title ?? s.service_type.replace('_', ' ')}</div>
                <div className="text-sm text-gray-600">{fmtDate(s.starts_at)} at {fmtTime(s.starts_at)}</div>
              </div>
            ))}
          </div>
        </div>
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold text-brand-900"><CalendarDays className="h-5 w-5 text-gold-500" />Events</h2>
          <div className="mt-4 space-y-3">
            {(events.data ?? []).length === 0 && <p className="text-sm text-gray-500">No upcoming events yet. Please check back soon.</p>}
            {(events.data ?? []).map((e) => (
              <div key={e.id} className="rounded-xl border border-gray-200 p-4">
                <div className="font-medium">{e.title}</div>
                <div className="text-sm text-gray-600">{fmtDate(e.starts_at)} · {fmtTime(e.starts_at)}{e.venue ? ` · ${e.venue}` : ''}</div>
              </div>
            ))}
            <Link to="/events" className="inline-block text-sm font-medium text-brand-700 hover:underline">All events</Link>
          </div>
        </div>
      </section>

      {(sermons.data ?? []).length > 0 && (
        <section className="bg-gray-50"><div className="mx-auto max-w-6xl px-4 py-12">
          <h2 className="text-xl font-bold text-brand-900">Latest sermons</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            {sermons.data!.map((s) => (
              <div key={s.id} className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="font-medium">{s.title}</div>
                <div className="text-sm text-gray-600">{s.preacher_name}{s.text_used ? ` · ${s.text_used}` : ''}</div>
                {s.preached_on && <div className="mt-1 text-xs text-gray-500">{fmtDate(s.preached_on)}</div>}
              </div>
            ))}
          </div>
          <Link to="/sermons" className="mt-4 inline-block text-sm font-medium text-brand-700 hover:underline">Sermon archive</Link>
        </div></section>
      )}

      {(news.data ?? []).length > 0 && (
        <section className="mx-auto max-w-6xl px-4 py-12">
          <h2 className="text-xl font-bold text-brand-900">Announcements</h2>
          <div className="mt-4 space-y-3">
            {news.data!.map((n) => <div key={n.id} className="rounded-xl border border-gray-200 p-4"><div className="font-medium">{n.title}</div><p className="mt-1 whitespace-pre-line text-sm text-gray-700">{n.body}</p></div>)}
          </div>
        </section>
      )}
    </div>
  );
}
