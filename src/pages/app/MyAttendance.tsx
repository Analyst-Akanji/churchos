import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Flame, Hourglass, Minus } from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { supabase, q } from '@/lib/supabase';
import { withCache } from '@/lib/offline/cache';
import { fmtDate } from '@/lib/format';
import { Card, Empty, PageHeader, Spinner } from '@/components/ui';
import type { Checkin, Service } from '@/types/db';

export default function MyAttendance() {
  const { member, assembly } = useAuth();
  const data = useQuery({
    queryKey: ['my-attendance', member?.id], enabled: !!member && !!assembly,
    queryFn: () => withCache(`my-attendance:${member!.id}`, async () => {
      const services = await q<Service[]>(supabase.from('services').select('*').eq('assembly_id', assembly!.id).eq('service_type', 'sunday_worship').lte('starts_at', new Date().toISOString()).order('starts_at', { ascending: false }).limit(12));
      const ids = services.map((s) => s.id);
      const checks = ids.length ? await q<Checkin[]>(supabase.from('member_checkins').select('*').eq('member_id', member!.id).in('service_id', ids)) : [];
      return { services, checks };
    }),
  });

  if (!member) return <Empty title="Link your account first" hint="Go to Home and enter your invite code." />;
  if (data.isLoading) return <Spinner />;
  const { services = [], checks = [] } = data.data ?? {};
  const by = new Map(checks.map((c) => [c.service_id, c]));
  const state = (id: string) => { const c = by.get(id); return c ? (c.status === 'verified' ? 'yes' : c.status === 'flagged' ? 'review' : 'no') : 'no'; };
  const attended = services.filter((s) => state(s.id) === 'yes').length;
  let streak = 0;
  for (const s of services) { if (state(s.id) === 'yes') streak++; else break; }

  return (
    <>
      <PageHeader title="My attendance" subtitle="Your Sunday worship check-ins." />
      {services.length === 0 ? <Empty title="No Sunday services recorded yet" hint="Your attendance will appear here after services have been scheduled." /> : (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-gray-200 bg-white p-4"><div className="text-xs uppercase tracking-wide text-gray-500">Last {services.length} Sundays</div><div className="mt-1 text-2xl font-bold text-brand-900">{attended} <span className="text-base font-medium text-gray-500">attended</span></div></div>
            <div className="rounded-xl border border-gray-200 bg-white p-4"><div className="flex items-center gap-1 text-xs uppercase tracking-wide text-gray-500"><Flame className="h-3.5 w-3.5 text-gold-500" />Current streak</div><div className="mt-1 text-2xl font-bold text-brand-900">{streak} <span className="text-base font-medium text-gray-500">{streak === 1 ? 'Sunday' : 'Sundays'} in a row</span></div></div>
          </div>
          <Card>
            <ul className="divide-y divide-gray-100">
              {services.map((s) => {
                const st = state(s.id);
                return (
                  <li key={s.id} className="flex items-center justify-between py-3 text-sm">
                    <span className="font-medium text-gray-800">{fmtDate(s.starts_at)}</span>
                    {st === 'yes' && <span className="inline-flex items-center gap-1.5 text-emerald-700"><CheckCircle2 className="h-4 w-4" />Checked in</span>}
                    {st === 'review' && <span className="inline-flex items-center gap-1.5 text-amber-700"><Hourglass className="h-4 w-4" />Awaiting confirmation</span>}
                    {st === 'no' && <span className="inline-flex items-center gap-1.5 text-gray-400"><Minus className="h-4 w-4" />No check-in</span>}
                  </li>
                );
              })}
            </ul>
          </Card>
          <p className="mt-3 text-xs text-gray-500">If you were at church but see "No check-in", speak to an usher. They can record your attendance.</p>
        </>
      )}
    </>
  );
}
