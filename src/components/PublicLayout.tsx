import { useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import clsx from 'clsx';
import { SITE } from '@/config/site';
import { useAuth } from '@/auth/AuthProvider';

const links = [
  { to: '/', label: 'Home', end: true }, { to: '/about', label: 'About' }, { to: '/services', label: 'Services' },
  { to: '/events', label: 'Events' }, { to: '/sermons', label: 'Sermons' }, { to: '/visit', label: 'Plan a visit' }, { to: '/contact', label: 'Contact' },
];

export function PublicLayout() {
  const [open, setOpen] = useState(false);
  const { session } = useAuth();
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <header className="sticky top-0 z-30 border-b border-gray-100 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link to="/" className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-900 text-lg font-bold text-gold-400">✝</span>
            <span className="leading-tight"><span className="block text-sm font-bold text-brand-900">GOFAMINT</span><span className="block text-xs text-gray-600">{SITE.assembly}</span></span>
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            {links.map((l) => (
              <NavLink key={l.to} to={l.to} end={l.end} className={({ isActive }) => clsx('rounded-lg px-3 py-2 text-sm font-medium', isActive ? 'text-brand-700' : 'text-gray-600 hover:text-brand-700')}>{l.label}</NavLink>
            ))}
            <Link to={session ? '/app' : '/login'} className="ml-2 rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800">{session ? 'My dashboard' : 'Member login'}</Link>
          </nav>
          <button className="md:hidden" onClick={() => setOpen((o) => !o)} aria-label="Menu">{open ? <X /> : <Menu />}</button>
        </div>
        {open && (
          <div className="border-t border-gray-100 px-4 pb-3 md:hidden">
            {links.map((l) => <NavLink key={l.to} to={l.to} end={l.end} onClick={() => setOpen(false)} className="block py-2.5 text-sm font-medium text-gray-700">{l.label}</NavLink>)}
            <Link to={session ? '/app' : '/login'} onClick={() => setOpen(false)} className="mt-2 block rounded-lg bg-brand-700 px-4 py-2.5 text-center text-sm font-medium text-white">{session ? 'My dashboard' : 'Member login'}</Link>
          </div>
        )}
      </header>
      <main className="flex-1"><Outlet /></main>
      <footer className="bg-brand-900 text-brand-100">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-10 md:grid-cols-3">
          <div><div className="font-semibold text-white">{SITE.fullName}</div><div className="mt-1 text-sm">{SITE.assembly}</div><div className="text-sm">{SITE.district}</div><div className="text-sm">{SITE.city}</div></div>
          <div className="text-sm"><div className="font-semibold text-white">Quick links</div>{links.slice(1).map((l) => <Link key={l.to} to={l.to} className="mt-1 block hover:text-white">{l.label}</Link>)}</div>
          <div className="text-sm"><div className="font-semibold text-white">Contact</div>
            {SITE.contact.phone && <div className="mt-1">{SITE.contact.phone}</div>}
            {SITE.contact.email && <div>{SITE.contact.email}</div>}
            {!SITE.contact.phone && !SITE.contact.email && <div className="mt-1 text-brand-200">Add contact details in src/config/site.ts</div>}
          </div>
        </div>
        <div className="border-t border-white/10 py-4 text-center text-xs text-brand-200">© {new Date().getFullYear()} {SITE.shortName}</div>
      </footer>
    </div>
  );
}
