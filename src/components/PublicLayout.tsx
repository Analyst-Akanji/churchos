import { useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { Facebook, Instagram, Mail, MapPin, Menu, Phone, X, Youtube } from 'lucide-react';
import clsx from 'clsx';
import { SITE } from '@/config/site';
import { useAuth } from '@/auth/AuthProvider';
import { Logo } from './Logo';

const links = [
  { to: '/', label: 'Home', end: true }, { to: '/about', label: 'About' }, { to: '/services', label: 'This week' },
  { to: '/sermons', label: 'Sermons' }, { to: '/events', label: 'Events' }, { to: '/contact', label: 'Contact' },
];

function Socials({ className }: { className?: string }) {
  const items = [[SITE.social.facebook, Facebook, 'Facebook'], [SITE.social.instagram, Instagram, 'Instagram'], [SITE.social.youtube, Youtube, 'YouTube']] as const;
  const shown = items.filter(([url]) => url);
  if (!shown.length) return null;
  return <div className={clsx('flex items-center gap-3', className)}>{shown.map(([url, Icon, label]) => <a key={label} href={url} target="_blank" rel="noreferrer" aria-label={label} className="hover:text-gold-400"><Icon className="h-4 w-4" /></a>)}</div>;
}

export function PublicLayout() {
  const [open, setOpen] = useState(false);
  const { session } = useAuth();
  const hasTopBar = !!(SITE.contact.phone || SITE.contact.email || SITE.social.facebook || SITE.social.instagram || SITE.social.youtube);

  return (
    <div className="flex min-h-screen flex-col bg-white">
      {/* contact bar: only appears once a phone, email or social link is set in src/config/site.ts */}
      {hasTopBar && (
        <div className="bg-brand-900 text-xs text-brand-100">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-2">
            <div className="flex items-center gap-5">
              {SITE.contact.phone && <a href={`tel:${SITE.contact.phone}`} className="flex items-center gap-1.5 hover:text-white"><Phone className="h-3.5 w-3.5 text-gold-400" />{SITE.contact.phone}</a>}
              {SITE.contact.email && <a href={`mailto:${SITE.contact.email}`} className="hidden items-center gap-1.5 hover:text-white sm:flex"><Mail className="h-3.5 w-3.5 text-gold-400" />{SITE.contact.email}</a>}
            </div>
            <Socials />
          </div>
        </div>
      )}

      <header className="sticky top-0 z-30 border-b border-gray-100 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link to="/" className="flex items-center gap-2.5">
            <Logo />
            <span className="leading-tight"><span className="block font-serif text-lg font-bold tracking-wide text-brand-900">GOFAMINT</span><span className="block text-[11px] uppercase tracking-wider text-gray-500">{SITE.assembly}</span></span>
          </Link>
          <nav className="hidden items-center gap-1 lg:flex">
            {links.map((l) => (
              <NavLink key={l.to} to={l.to} end={l.end} className={({ isActive }) => clsx('border-b-2 px-3 py-2 text-sm font-medium', isActive ? 'border-gold-500 text-brand-900' : 'border-transparent text-gray-600 hover:text-brand-800')}>{l.label}</NavLink>
            ))}
          </nav>
          <div className="hidden items-center gap-3 lg:flex">
            <Link to={session ? '/app' : '/login'} className="text-sm font-medium text-brand-800 hover:underline">{session ? 'My dashboard' : 'Member login'}</Link>
            <Link to="/visit" className="rounded-lg bg-gold-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-gold-600">Plan your visit</Link>
          </div>
          <button className="lg:hidden" onClick={() => setOpen((o) => !o)} aria-label="Menu">{open ? <X /> : <Menu />}</button>
        </div>
        {open && (
          <div className="border-t border-gray-100 px-4 pb-4 lg:hidden">
            {links.map((l) => <NavLink key={l.to} to={l.to} end={l.end} onClick={() => setOpen(false)} className="block py-2.5 text-sm font-medium text-gray-700">{l.label}</NavLink>)}
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Link to={session ? '/app' : '/login'} onClick={() => setOpen(false)} className="rounded-lg border border-brand-200 px-4 py-2.5 text-center text-sm font-medium text-brand-800">{session ? 'Dashboard' : 'Member login'}</Link>
              <Link to="/visit" onClick={() => setOpen(false)} className="rounded-lg bg-gold-500 px-4 py-2.5 text-center text-sm font-semibold text-white">Plan your visit</Link>
            </div>
          </div>
        )}
      </header>

      <main className="flex-1"><Outlet /></main>

      <footer className="bg-brand-900 text-brand-100">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <div className="flex items-center gap-2.5"><Logo light /><span className="font-serif text-xl font-bold text-white">GOFAMINT</span></div>
            <p className="mt-3 text-sm">{SITE.assembly}</p><p className="text-sm text-brand-200">{SITE.tagline}</p>
            <Socials className="mt-4" />
          </div>
          <div className="text-sm"><div className="mb-3 font-semibold uppercase tracking-wider text-gold-400">Quick links</div>
            {[...links.slice(1), { to: '/visit', label: 'Plan a visit' }].map((l) => <Link key={l.to} to={l.to} className="block py-1 hover:text-white">{l.label}</Link>)}</div>
          <div className="text-sm"><div className="mb-3 font-semibold uppercase tracking-wider text-gold-400">Ministries</div>
            {SITE.ministries.map((m) => <span key={m.title} className="block py-1">{m.title}</span>)}</div>
          <div className="text-sm"><div className="mb-3 font-semibold uppercase tracking-wider text-gold-400">Contact</div>
            <div className="flex items-start gap-2 py-1"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-gold-400" /><span>{SITE.assembly}, {SITE.district}, {SITE.city}</span></div>
            {SITE.contact.phone && <div className="flex items-center gap-2 py-1"><Phone className="h-4 w-4 text-gold-400" />{SITE.contact.phone}</div>}
            {SITE.contact.email && <div className="flex items-center gap-2 py-1"><Mail className="h-4 w-4 text-gold-400" />{SITE.contact.email}</div>}
          </div>
        </div>
        <div className="border-t border-white/10 py-4 text-center text-xs text-brand-200">© {new Date().getFullYear()} {SITE.fullName}. {SITE.assembly}.</div>
      </footer>
    </div>
  );
}
