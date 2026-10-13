import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, CalendarCheck, GraduationCap, HandCoins, MapPin, UserCircle } from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { supabase, q } from '@/lib/supabase';
import { withCache } from '@/lib/offline/cache';
import { fmtDate, fmtTime } from '@/lib/format';
import { ProgrammeDays } from '@/components/ProgrammeBoard';
import { addDays, toISO, type ProgrammeItem } from '@/lib/programme';
import { Button, Card, ErrorBox, Field, Input, PageHeader, Spinner } from '@/components/ui';
import { useToast } from '@/components/toast';
import type { AnnouncementRow, Service } from '@/types/db';

function ClaimInvite() {
  const { reload } = useAuth();
  const toast = useToast();
  const [code, setCode] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState<unknown>(null);
  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null);
    const { error } = await supabase.rpc('claim_member_invite', { p_code: code });
    setBusy(false);
    if (error) { setErr(new Error(error.message)); return; }
    toast.ok('Account linked. Welcome!'); await reload();
  }
  return (
    <Card title="Link your account to your church record">
      <p className="mb-4 text-sm text-gray-600">Your church office gives each member a short invite code. Enter it once to connect this login to your member record. If you do not have one yet, ask the church secretary.</p>
      <form onSubmit={submit} className="max-w-sm space-y-4">
        <Field label="Invite code"><Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={8} placeholder="e.g. K7M2QX9P" required /></Field>
        {err != null && <ErrorBox error={err} />}
        <Button type="submit" loading={busy}>Link my account</Button>
      </form>
    </Card>
  );
}

export default function Dashboard() {
  const a = useAuth();
  const next = useQuery({
    queryKey: ['next-service', a.assembly?.id],
    enabled: !!a.assembly,
    queryFn: () => withCache(`next-service:${a.assembly!.id}`, async () => {
      const since = new Date(Date.now() - 6 * 3600 * 1000).toISOString();
      const rows = await q<Service[]>(supabase.from('services').select('*').eq('assembly_id', a.assembly!.id).gte('starts_at', since).neq('status', 'closed').order('starts_at').limit(1));
      return rows[0] ?? null;
    }),
  });

  const week = useQuery({
    queryKey: ['member-week', a.assembly?.id], enabled: !!a.assembly && !!a.member,
    queryFn: () => withCache(`member-week:${a.assembly!.id}`, () => {
      const today = toISO(new Date());
      return q<ProgrammeItem[]>(supabase.from('weekly_programme').select('*').eq('assembly_id', a.assembly!.id).gte('programme_date', today).lt('programme_date', addDays(today, 7)));
    }),
  });
  const news = useQuery({
    queryKey: ['member-news', a.assembly?.id], enabled: !!a.assembly && !!a.member,
    queryFn: () => withCache(`member-news:${a.assembly!.id}`, async () => {
      const rows = await q<AnnouncementRow[] & { expires_at: string | null }[]>(supabase.from('announcements').select('*').eq('assembly_id', a.assembly!.id).lte('publish_at', new Date().toISOString()).order('publish_at', { ascending: false }).limit(8));
      return (rows as (AnnouncementRow & { expires_at: string | null })[]).filter((n) => !n.expires_at || new Date(n.expires_at) > new Date()).slice(0, 4);
    }),
  });

  if (!a.member) {
    return (<><PageHeader title="Welcome" subtitle={a.user?.email ?? ''} /><ClaimInvite /></>);
  }
  return (
    <>
      <PageHeader title={`Hello, ${a.member.first_name}`} subtitle={a.assembly?.name} />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[['/app/check-in', 'Check in', MapPin], ['/app/my-progress', 'Sunday school', GraduationCap], ['/app/my-attendance', 'My attendance', CalendarCheck], ['/app/profile', 'My profile', UserCircle]].map(([to, label, Icon]) => {
          const I = Icon as typeof MapPin;
          return <Link key={String(to)} to={String(to)} className="flex flex-col items-center gap-2 rounded-xl border border-gray-200 bg-white p-4 text-center text-sm font-medium text-brand-900 shadow-sm hover:border-brand-200 hover:bg-brand-50"><I className="h-6 w-6 text-gold-600" />{String(label)}</Link>;
        })}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Next service">
          {next.isLoading ? <Spinner /> : next.data ? (
            <div className="space-y-3">
              <div><div className="font-medium">{next.data.title ?? next.data.service_type.replace('_', ' ')}</div><div className="text-sm text-gray-600">{fmtDate(next.data.starts_at)} at {fmtTime(next.data.starts_at)}</div></div>
              <Link to="/app/check-in" className="inline-flex items-center gap-2 rounded-lg bg-brand-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-800"><MapPin className="h-4 w-4" />Check in</Link>
            </div>
          ) : <p className="text-sm text-gray-500">No service scheduled yet.</p>}
        </Card>
        {(a.isSsLead || a.isClassStaff) && (
          <Card title="Sunday school"><p className="mb-3 text-sm text-gray-600">{a.isSsLead ? 'See every class, attendance, offerings and the leaderboard.' : 'Mark attendance, scores and record your class offering.'}</p>
            <Link to="/app/sunday-school" className="inline-flex items-center gap-2 rounded-lg bg-brand-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-800"><BookOpen className="h-4 w-4" />Open Sunday school</Link></Card>
        )}
        {(a.isOffice || a.isFinance) && (
          <Card title="Services and income"><p className="mb-3 text-sm text-gray-600">Record the service, headcount and weekly income.</p>
            <Link to="/app/services" className="inline-flex items-center gap-2 rounded-lg bg-brand-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-800"><HandCoins className="h-4 w-4" />Open services</Link></Card>
        )}
      </div>

      <h2 className="mb-3 mt-8 font-serif text-xl font-bold text-brand-900">This week</h2>
      {week.isLoading ? <Spinner /> : <ProgrammeDays items={week.data ?? []} compact emptyText="This week's programme has not been posted yet." />}

      {(news.data ?? []).length > 0 && (
        <>
          <h2 className="mb-3 mt-8 font-serif text-xl font-bold text-brand-900">Announcements</h2>
          <div className="space-y-3">{news.data!.map((n) => <div key={n.id} className="rounded-xl border border-gray-200 bg-white p-4"><div className="font-semibold text-brand-900">{n.title}</div><p className="mt-1 whitespace-pre-line text-sm text-gray-700">{n.body}</p></div>)}</div>
        </>
      )}
    </>
  );
}
