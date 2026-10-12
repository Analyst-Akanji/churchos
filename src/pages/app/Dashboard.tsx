import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, HandCoins, MapPin } from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { supabase, q } from '@/lib/supabase';
import { withCache } from '@/lib/offline/cache';
import { fmtDate, fmtTime } from '@/lib/format';
import { Button, Card, ErrorBox, Field, Input, PageHeader, Spinner } from '@/components/ui';
import { useToast } from '@/components/toast';
import type { Service } from '@/types/db';

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

  if (!a.member) {
    return (<><PageHeader title="Welcome" subtitle={a.user?.email ?? ''} /><ClaimInvite /></>);
  }
  return (
    <>
      <PageHeader title={`Hello, ${a.member.first_name}`} subtitle={a.assembly?.name} />
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
    </>
  );
}
