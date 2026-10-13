import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Clock, MapPin, ShieldAlert } from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { supabase, q } from '@/lib/supabase';
import { withCache, cacheGet, cacheSet } from '@/lib/offline/cache';
import { enqueue, pendingFor, useSyncState } from '@/lib/offline/outbox';
import { uid } from '@/lib/uid';
import { fmtDate, fmtDateTime, fmtTime } from '@/lib/format';
import { Badge, Button, Card, Empty, ErrorBox, Modal, PageHeader, Spinner } from '@/components/ui';
import { useToast } from '@/components/toast';
import type { Checkin, Service } from '@/types/db';

const FLAG_TEXT: Record<string, string> = {
  outside_geofence: 'Your phone location was outside the church area.',
  no_location: 'No location was received.',
  before_window: 'This was before check-in opened.',
  after_window: 'This was after check-in closed.',
  device_time_in_future: "Your phone's clock looks wrong.",
  no_church_location_configured: 'The church location is not set up yet.',
};

async function deviceId(): Promise<string> {
  const have = await cacheGet<string>('device-id');
  if (have) return have;
  const id = uid(); await cacheSet('device-id', id); return id;
}
function windowOf(s: Service) {
  const start = new Date(s.starts_at).getTime();
  return { opens: s.checkin_opens_at ? new Date(s.checkin_opens_at).getTime() : start - 3600_000, closes: s.checkin_closes_at ? new Date(s.checkin_closes_at).getTime() : start + 4 * 3600_000 };
}

export default function CheckInPage() {
  const { member, assembly, user } = useAuth();
  const toast = useToast();
  const sync = useSyncState();
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  const services = useQuery({
    queryKey: ['checkin-services', assembly?.id],
    enabled: !!assembly,
    queryFn: () => withCache(`checkin-services:${assembly!.id}`, async () => {
      const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      return q<Service[]>(supabase.from('services').select('*').eq('assembly_id', assembly!.id).gte('starts_at', since).neq('status', 'closed').order('starts_at').limit(8));
    }),
  });
  const now = Date.now();
  const open = (services.data ?? []).find((s) => { const w = windowOf(s); return now >= w.opens && now <= w.closes; });
  const upcoming = (services.data ?? []).find((s) => new Date(s.starts_at).getTime() > now);
  const svc = open ?? upcoming ?? null;

  const mine = useQuery({
    queryKey: ['my-checkin', svc?.id, member?.id, sync.pending],
    enabled: !!svc && !!member,
    queryFn: async () => {
      const server = await q<Checkin[]>(supabase.from('member_checkins').select('*').eq('service_id', svc!.id).eq('member_id', member!.id)).catch(() => [] as Checkin[]);
      const queued = (await pendingFor('member_checkins')).some((i) => i.payload.service_id === svc!.id);
      return { server: server[0] ?? null, queued };
    },
  });

  const history = useQuery({
    queryKey: ['my-history', member?.id],
    enabled: !!member,
    queryFn: () => withCache(`my-history:${member!.id}`, async () => {
      const rows = await q<Checkin[]>(supabase.from('member_checkins').select('*').eq('member_id', member!.id).order('checked_in_at', { ascending: false }).limit(10));
      return rows;
    }),
  });

  async function checkIn() {
    if (!svc || !member || !assembly || !user) return;
    setConsent(false); setBusy(true); setGeoError(null);
    if (!('geolocation' in navigator)) { setGeoError('This device cannot share its location. Please ask an usher to check you in.'); setBusy(false); return; }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const nowIso = new Date().toISOString();
          await enqueue({
            key: `checkin:${svc.id}:${member.id}`, label: `Check-in ${fmtDateTime(svc.starts_at)}`,
            table: 'member_checkins', onConflict: 'service_id,member_id', ignoreDuplicates: true,
            payload: {
              assembly_id: assembly.id, service_id: svc.id, member_id: member.id, method: 'geofence',
              latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy_m: pos.coords.accuracy,
              location_consent_at: nowIso, checked_in_at: nowIso, device_id: await deviceId(), client_id: uid(),
            },
          });
          toast.ok(navigator.onLine ? 'Check-in sent' : 'Saved on your phone. It will send when you are online.');
        } catch (e) { toast.err(e instanceof Error ? e.message : 'Could not save check-in'); }
        setBusy(false);
      },
      (err) => {
        setBusy(false);
        setGeoError(err.code === err.PERMISSION_DENIED
          ? 'Location permission was blocked. Allow location for this site in your browser settings, or ask an usher to check you in.'
          : 'We could not get your location. Move near a window or outdoors and try again, or ask an usher to check you in.');
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    );
  }

  if (!member) return <Empty title="Link your account first" hint="Go to Home and enter your invite code." />;
  const done = mine.data?.server;
  return (
    <>
      <PageHeader title="Check in" subtitle="Confirm that you worshipped with us today." />
      <Card>
        {services.isLoading ? <Spinner /> : !svc ? <p className="text-sm text-gray-600">No service is open for check-in right now.</p> : (
          <div className="space-y-4">
            <div><div className="text-lg font-semibold text-brand-900">{svc.title ?? svc.service_type.replace('_', ' ')}</div><div className="text-sm text-gray-600">{fmtDate(svc.starts_at)} at {fmtTime(svc.starts_at)}</div></div>
            {done ? (
              <div className={`flex items-start gap-3 rounded-xl p-4 ${done.status === 'verified' ? 'bg-emerald-50 text-emerald-900' : 'bg-amber-50 text-amber-900'}`}>
                {done.status === 'verified' ? <CheckCircle2 className="mt-0.5 h-5 w-5" /> : <ShieldAlert className="mt-0.5 h-5 w-5" />}
                <div className="text-sm"><div className="font-semibold">{done.status === 'verified' ? "You're checked in. God bless you!" : 'Recorded. An usher will confirm it.'}</div>
                  {done.status !== 'verified' && done.flag_reason && <div>{FLAG_TEXT[done.flag_reason] ?? done.flag_reason}</div>}</div>
              </div>
            ) : mine.data?.queued ? (
              <div className="flex items-start gap-3 rounded-xl bg-sky-50 p-4 text-sm text-sky-900"><Clock className="mt-0.5 h-5 w-5" /><div><div className="font-semibold">Saved on your phone</div><div>It will be sent as soon as you are online.</div></div></div>
            ) : !open ? (
              <p className="text-sm text-gray-600">Check-in opens at {fmtTime(new Date(windowOf(svc).opens))}.</p>
            ) : (
              <Button size="lg" loading={busy} onClick={() => setConsent(true)} className="w-full sm:w-auto"><MapPin className="h-5 w-5" />I'm at church. Check me in</Button>
            )}
            {geoError && <ErrorBox error={geoError} />}
          </div>
        )}
      </Card>

      <h2 className="mb-2 mt-8 text-base font-semibold text-brand-900">Your recent check-ins</h2>
      <Card>
        {(history.data ?? []).length === 0 ? <p className="text-sm text-gray-500">Nothing yet.</p> : (
          <ul className="divide-y divide-gray-100">
            {history.data!.map((c) => (
              <li key={c.id} className="flex items-center justify-between py-2.5 text-sm">
                <span>{fmtDateTime(c.checked_in_at)}</span>
                <Badge tone={c.status === 'verified' ? 'green' : c.status === 'flagged' ? 'amber' : 'red'}>{c.status}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Modal open={consent} title="Share your location once?" onClose={() => setConsent(false)}>
        <p className="text-sm text-gray-700">This app will read your phone's location <strong>one time, right now</strong>, only to confirm you are at church. It does not track you afterwards. The exact coordinates are deleted after 30 days.</p>
        <div className="mt-5 flex gap-2"><Button onClick={checkIn}>Allow and check in</Button><Button variant="secondary" onClick={() => setConsent(false)}>Cancel</Button></div>
      </Modal>
    </>
  );
}
