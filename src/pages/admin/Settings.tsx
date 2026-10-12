import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Crosshair } from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { supabase, q } from '@/lib/supabase';
import { Badge, Button, Card, Field, Input, PageHeader, Spinner, Table } from '@/components/ui';
import { useToast } from '@/components/toast';
import type { AssemblyLocation, Criterion, Fund } from '@/types/db';

export default function Settings() {
  const { assembly, reload, isSsLead } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const locs = useQuery({ queryKey: ['locations', assembly?.id], enabled: !!assembly, queryFn: () => q<AssemblyLocation[]>(supabase.from('assembly_locations').select('*').eq('assembly_id', assembly!.id)) });
  const crit = useQuery({ queryKey: ['criteria-all', assembly?.id], enabled: !!assembly, queryFn: () => q<Criterion[]>(supabase.from('ss_scoring_criteria').select('*').eq('assembly_id', assembly!.id).order('sort_order')) });
  const funds = useQuery({ queryKey: ['funds-all', assembly?.id], enabled: !!assembly, queryFn: () => q<Fund[]>(supabase.from('funds').select('*').eq('assembly_id', assembly!.id).order('name')) });

  const [p, setP] = useState({ name: '', district: '', address: '', city: '', state: '', contact_phone: '', contact_email: '' });
  useEffect(() => { if (assembly) setP({ name: assembly.name, district: assembly.district ?? '', address: assembly.address ?? '', city: assembly.city ?? '', state: assembly.state ?? '', contact_phone: assembly.contact_phone ?? '', contact_email: assembly.contact_email ?? '' }); }, [assembly]);
  const [loc, setLoc] = useState({ lat: '', lng: '', radius: '150' });
  useEffect(() => { const l = locs.data?.find((x) => x.is_primary) ?? locs.data?.[0]; if (l) setLoc({ lat: String(l.latitude), lng: String(l.longitude), radius: String(l.radius_m) }); }, [locs.data]);
  const [newFund, setNewFund] = useState('');
  const [points, setPoints] = useState<Record<string, string>>({});

  async function saveProfile() {
    const { error } = await supabase.from('assemblies').update({ name: p.name, district: p.district || null, address: p.address || null, city: p.city || null, state: p.state || null, contact_phone: p.contact_phone || null, contact_email: p.contact_email || null }).eq('id', assembly!.id);
    if (error) toast.err(error.message); else { toast.ok('Saved'); await reload(); }
  }
  function useMyLocation() {
    navigator.geolocation.getCurrentPosition((pos) => setLoc((l) => ({ ...l, lat: pos.coords.latitude.toFixed(6), lng: pos.coords.longitude.toFixed(6) })), () => toast.err('Could not read your location. Allow location access and try again.'), { enableHighAccuracy: true, timeout: 20000 });
  }
  async function saveLocation() {
    const latitude = Number(loc.lat), longitude = Number(loc.lng), radius_m = Number(loc.radius);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) { toast.err('Enter valid coordinates'); return; }
    const existing = locs.data?.find((x) => x.is_primary) ?? locs.data?.[0];
    const { error } = existing
      ? await supabase.from('assembly_locations').update({ latitude, longitude, radius_m }).eq('id', existing.id)
      : await supabase.from('assembly_locations').insert({ assembly_id: assembly!.id, name: 'Church', latitude, longitude, radius_m, is_primary: true });
    if (error) toast.err(error.message); else { toast.ok('Church location saved'); void qc.invalidateQueries({ queryKey: ['locations'] }); }
  }
  async function savePoints(c: Criterion) {
    const v = Number(points[c.id]); if (!(v > 0)) { toast.err('Enter points above zero'); return; }
    const { error } = await supabase.from('ss_scoring_criteria').update({ max_points: v }).eq('id', c.id);
    if (error) toast.err(error.message); else { toast.ok('Saved. Change weights only between quarters.'); void qc.invalidateQueries({ queryKey: ['criteria-all'] }); }
  }
  async function toggleCrit(c: Criterion) {
    const { error } = await supabase.from('ss_scoring_criteria').update({ is_active: !c.is_active }).eq('id', c.id);
    if (error) toast.err(error.message); else void qc.invalidateQueries({ queryKey: ['criteria-all'] });
  }
  async function addFund() {
    if (!newFund.trim()) return;
    const { error } = await supabase.from('funds').insert({ assembly_id: assembly!.id, name: newFund.trim(), kind: 'other' });
    if (error) toast.err(error.message); else { setNewFund(''); void qc.invalidateQueries({ queryKey: ['funds-all'] }); }
  }

  if (!assembly) return <Spinner />;
  return (
    <>
      <PageHeader title="Settings" subtitle={assembly.name} />
      <div className="space-y-6">
        <Card title="Assembly profile"><div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name"><Input value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} /></Field>
          <Field label="District"><Input value={p.district} onChange={(e) => setP({ ...p, district: e.target.value })} /></Field>
          <Field label="Address"><Input value={p.address} onChange={(e) => setP({ ...p, address: e.target.value })} /></Field>
          <Field label="City"><Input value={p.city} onChange={(e) => setP({ ...p, city: e.target.value })} /></Field>
          <Field label="State"><Input value={p.state} onChange={(e) => setP({ ...p, state: e.target.value })} /></Field>
          <Field label="Phone"><Input value={p.contact_phone} onChange={(e) => setP({ ...p, contact_phone: e.target.value })} /></Field>
          <Field label="Email"><Input value={p.contact_email} onChange={(e) => setP({ ...p, contact_email: e.target.value })} /></Field>
          <div className="flex items-end"><Button onClick={() => void saveProfile()}>Save profile</Button></div>
        </div></Card>

        <Card title="Church location for check-in" action={<Button size="sm" variant="secondary" onClick={useMyLocation}><Crosshair className="h-4 w-4" />Use my location</Button>}>
          <p className="mb-3 text-sm text-gray-600">Stand in the middle of the auditorium and press "Use my location", then set a radius that covers the whole building and compound. Test with a few phones before launch.</p>
          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="Latitude"><Input value={loc.lat} onChange={(e) => setLoc({ ...loc, lat: e.target.value })} /></Field>
            <Field label="Longitude"><Input value={loc.lng} onChange={(e) => setLoc({ ...loc, lng: e.target.value })} /></Field>
            <Field label="Radius (metres)"><Input type="number" min={30} max={1000} value={loc.radius} onChange={(e) => setLoc({ ...loc, radius: e.target.value })} /></Field>
            <div className="flex items-end"><Button onClick={() => void saveLocation()}>Save location</Button></div>
          </div>
        </Card>

        {isSsLead && (
          <Card title="Sunday school scoring"><p className="mb-3 text-sm text-gray-600">Points per Sunday. Money is never part of the score. Change weights only when no quarter is active.</p>
            <Table head={['Criterion', 'How', 'Max points', 'Active', '']}>
              {(crit.data ?? []).map((c) => (
                <tr key={c.id}><td className="px-3 py-2.5 font-medium">{c.label}</td><td className="px-3 py-2.5 text-gray-600">{c.source === 'manual' ? 'Teacher scores' : 'Automatic'}</td>
                  <td className="px-3 py-2.5"><Input className="w-24" type="number" min={1} value={points[c.id] ?? String(c.max_points)} onChange={(e) => setPoints({ ...points, [c.id]: e.target.value })} /></td>
                  <td className="px-3 py-2.5"><button onClick={() => void toggleCrit(c)}><Badge tone={c.is_active ? 'green' : 'gray'}>{c.is_active ? 'On' : 'Off'}</Badge></button></td>
                  <td className="px-3 py-2.5 text-right"><Button size="sm" variant="secondary" onClick={() => void savePoints(c)}>Save</Button></td></tr>))}
            </Table></Card>
        )}

        <Card title="Funds (income categories)">
          <div className="mb-3 flex flex-wrap gap-2">{(funds.data ?? []).map((f) => <Badge key={f.id} tone={f.is_active ? 'purple' : 'gray'}>{f.name}</Badge>)}</div>
          <div className="flex gap-2"><Input placeholder="New fund, e.g. Building Fund" value={newFund} onChange={(e) => setNewFund(e.target.value)} className="max-w-xs" /><Button variant="secondary" onClick={() => void addFund()}>Add fund</Button></div>
        </Card>
      </div>
    </>
  );
}
