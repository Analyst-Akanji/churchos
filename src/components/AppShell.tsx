import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Inbox, UserCheck, BookOpen, CalendarCheck, CalendarClock, CalendarDays, ClipboardCheck, GraduationCap, Library, UserCircle, Church, ClipboardList, Home, LogOut, MapPin, Menu, Megaphone, Settings, ShieldCheck, Users, X, HandCoins } from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '@/auth/AuthProvider';
import { SyncBadge } from './SyncBadge';
import { Logo } from './Logo';
import { SITE } from '@/config/site';
import { onFlushed } from '@/lib/offline/outbox';
import { usePendingRegistrations } from '@/lib/registrations';
import { supabase } from '@/lib/supabase';

interface Item { to: string; label: string; icon: typeof Home; show: boolean; end?: boolean; badge?: number }

export function AppShell() {
  const a = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const pending = usePendingRegistrations();
  // Unread Plan a visit messages, shown as a badge for the office. The key starts with
  // 'visit-messages' so the inbox page refreshes this count whenever it changes a message.
  const newMessages = useQuery({
    queryKey: ['visit-messages', 'new-count'],
    enabled: !!a.isOffice,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { count, error } = await supabase.from('visit_messages').select('id', { count: 'exact', head: true }).eq('status', 'new');
      if (error) throw error;
      return count ?? 0;
    },
  });

  useEffect(() => onFlushed(() => { void qc.invalidateQueries(); }), [qc]);

  const items: Item[] = [
    { to: '/app', label: 'Home', icon: Home, show: true, end: true },
    { to: '/app/check-in', label: 'Check in', icon: MapPin, show: !!a.member },
    { to: '/app/my-attendance', label: 'My attendance', icon: CalendarCheck, show: !!a.member },
    { to: '/app/my-progress', label: a.isSsLead || a.isClassStaff ? 'My progress' : 'Sunday school', icon: GraduationCap, show: !!a.member },
    { to: '/app/my-assignments', label: 'My assignments', icon: ClipboardCheck, show: !!a.member },
    { to: '/app/my-classes', label: 'My class', icon: Users, show: !!a.member && a.isClassStaff && !a.isSsLead },
    { to: '/app/sunday-school', label: 'Manage Sunday school', icon: BookOpen, show: a.isSsLead || a.isClassStaff },
    { to: '/app/sunday-school/curriculum', label: 'Lesson curriculum', icon: Library, show: a.isAdmin },
    { to: '/app/services', label: 'Services & income', icon: HandCoins, show: a.isOffice || a.isFinance || a.isUsher },
    { to: '/app/registrations', label: 'Registrations', icon: UserCheck, show: a.isOffice, badge: pending.data ?? 0 },
    { to: '/app/messages', label: 'Visit messages', icon: Inbox, show: a.isOffice, badge: newMessages.data ?? 0 },
    { to: '/app/members', label: 'Members', icon: Users, show: a.isStaff },
    { to: '/app/programme', label: 'Weekly programme', icon: CalendarClock, show: a.isOffice },
    { to: '/app/content/events', label: 'Events', icon: CalendarDays, show: a.isOffice },
    { to: '/app/content/sermons', label: 'Sermons', icon: Church, show: a.isOffice },
    { to: '/app/content/announcements', label: 'Announcements', icon: Megaphone, show: a.isOffice },
    { to: '/app/roles', label: 'Roles', icon: ShieldCheck, show: a.isAdmin },
    { to: '/app/settings', label: 'Settings', icon: Settings, show: a.isAdmin },
    { to: '/app/coming-soon', label: 'More (soon)', icon: ClipboardList, show: a.isStaff },
    { to: '/app/profile', label: 'My profile', icon: UserCircle, show: !!a.member },
  ].filter((i) => i.show);

  const links = (
    <nav className="flex flex-col gap-1">
      {items.map((i) => (
        <NavLink key={i.to} to={i.to} end={i.end} onClick={() => setOpen(false)}
          className={({ isActive }) => clsx('flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium', isActive ? 'bg-white/15 text-white' : 'text-brand-100 hover:bg-white/10')}>
          <i.icon className="h-4 w-4" />{i.label}{!!i.badge && <span className="ml-auto rounded-full bg-gold-500 px-2 py-0.5 text-xs font-semibold text-white">{i.badge}</span>}
        </NavLink>
      ))}
    </nav>
  );

  const side = (
    <div className="flex h-full flex-col bg-brand-900 p-4">
      <div className="mb-6 flex items-center gap-3 px-2 text-white">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white"><Logo /></span>
        <div className="leading-tight"><div className="font-serif text-lg font-bold tracking-wide">GOFAMINT</div><div className="text-xs text-brand-200">{a.assembly?.name ?? SITE.assembly}</div></div>
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
