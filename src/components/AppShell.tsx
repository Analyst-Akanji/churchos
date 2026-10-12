import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { BookOpen, CalendarDays, Church, ClipboardList, Home, LogOut, MapPin, Menu, Megaphone, Settings, ShieldCheck, Users, X, HandCoins } from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '@/auth/AuthProvider';
import { SyncBadge } from './SyncBadge';
import { onFlushed } from '@/lib/offline/outbox';

interface Item { to: string; label: string; icon: typeof Home; show: boolean; end?: boolean }

export function AppShell() {
  const a = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  useEffect(() => onFlushed(() => { void qc.invalidateQueries(); }), [qc]);

  const items: Item[] = [
    { to: '/app', label: 'Home', icon: Home, show: true, end: true },
    { to: '/app/check-in', label: 'Check in', icon: MapPin, show: !!a.member },
    { to: '/app/sunday-school', label: 'Sunday school', icon: BookOpen, show: a.isSsLead || a.isClassStaff },
    { to: '/app/services', label: 'Services & income', icon: HandCoins, show: a.isOffice || a.isFinance || a.isUsher },
    { to: '/app/members', label: 'Members', icon: Users, show: a.isStaff },
    { to: '/app/content/events', label: 'Events', icon: CalendarDays, show: a.isOffice },
    { to: '/app/content/sermons', label: 'Sermons', icon: Church, show: a.isOffice },
    { to: '/app/content/announcements', label: 'Announcements', icon: Megaphone, show: a.isOffice },
    { to: '/app/roles', label: 'Roles', icon: ShieldCheck, show: a.isAdmin },
    { to: '/app/settings', label: 'Settings', icon: Settings, show: a.isAdmin },
    { to: '/app/coming-soon', label: 'More (soon)', icon: ClipboardList, show: a.isStaff },
  ].filter((i) => i.show);

  const links = (
    <nav className="flex flex-col gap-1">
      {items.map((i) => (
        <NavLink key={i.to} to={i.to} end={i.end} onClick={() => setOpen(false)}
          className={({ isActive }) => clsx('flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium', isActive ? 'bg-white/15 text-white' : 'text-brand-100 hover:bg-white/10')}>
          <i.icon className="h-4 w-4" />{i.label}
        </NavLink>
      ))}
    </nav>
  );

  const side = (
    <div className="flex h-full flex-col bg-brand-900 p-4">
      <div className="mb-6 flex items-center gap-2 px-2 text-white">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gold-500 text-lg font-bold">✝</span>
        <div className="leading-tight"><div className="font-semibold">ChurchOS</div><div className="text-xs text-brand-200">{a.assembly?.name ?? 'Your assembly'}</div></div>
      </div>
      <div className="flex-1 overflow-y-auto">{links}</div>
      <button onClick={async () => { await a.signOut(); nav('/'); }} className="mt-4 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-brand-100 hover:bg-white/10">
        <LogOut className="h-4 w-4" />Sign out
      </button>
    </div>
  );

  return (
    <div className="flex min-h-screen">
      <aside className="no-print hidden w-64 shrink-0 md:block"><div className="fixed inset-y-0 w-64">{side}</div></aside>
      {open && (
        <div className="fixed inset-0 z-40 md:hidden" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div className="absolute inset-y-0 left-0 w-72" onClick={(e) => e.stopPropagation()}>{side}</div>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print sticky top-0 z-30 flex items-center justify-between border-b border-gray-200 bg-white/90 px-4 py-3 backdrop-blur" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
          <button className="rounded p-1 md:hidden" onClick={() => setOpen((o) => !o)} aria-label="Menu">{open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}</button>
          <div className="hidden text-sm text-gray-500 md:block">{a.member ? `${a.member.first_name} ${a.member.last_name}` : a.user?.email}</div>
          <SyncBadge />
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 p-4 pb-24 md:p-6"><Outlet /></main>
      </div>
    </div>
  );
}
