import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthProvider';
import { supabase } from '@/lib/supabase';
import { Badge, Button, Card, Field, Input, PageHeader, Spinner, Table } from '@/components/ui';
import { useToast } from '@/components/toast';
import { useClasses } from './hooks';

export default function Classes() {
  const { assembly } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const classes = useClasses(true);
  const [name, setName] = useState(''); const [busy, setBusy] = useState(false);

  async function create(e: FormEvent) {
    e.preventDefault(); setBusy(true);
    const { error } = await supabase.from('ss_classes').insert({ assembly_id: assembly!.id, name: name.trim(), sort_order: (classes.data?.length ?? 0) + 1 });
    setBusy(false);
    if (error) { toast.err(error.message); return; }
    setName(''); toast.ok('Class added'); void qc.invalidateQueries({ queryKey: ['classes'] });
  }
  async function toggle(id: string, is_active: boolean) {
    const { error } = await supabase.from('ss_classes').update({ is_active }).eq('id', id);
    if (error) toast.err(error.message); else void qc.invalidateQueries({ queryKey: ['classes'] });
  }

  return (
    <>
      <PageHeader title="Classes" subtitle="Classes are archived, never deleted, so history is kept." />
      <Card title="Add a class" className="mb-6">
        <form onSubmit={create} className="flex flex-wrap items-end gap-3">
          <div className="min-w-[14rem] flex-1"><Field label="Class name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Adults, Youth, Primary 1-3" required /></Field></div>
          <Button type="submit" loading={busy}>Add class</Button>
        </form>
      </Card>
      {classes.isLoading ? <Spinner /> : (
        <Card>
          <Table head={['Class', 'Status', '']}>
            {(classes.data ?? []).map((c) => (
              <tr key={c.id}>
                <td className="px-3 py-3 font-medium">{c.name}</td>
                <td className="px-3 py-3"><Badge tone={c.is_active ? 'green' : 'gray'}>{c.is_active ? 'Active' : 'Archived'}</Badge></td>
                <td className="flex justify-end gap-2 px-3 py-3">
                  <Link to={`/app/sunday-school/classes/${c.id}`}><Button size="sm" variant="secondary">Manage</Button></Link>
                  <Button size="sm" variant="ghost" onClick={() => void toggle(c.id, !c.is_active)}>{c.is_active ? 'Archive' : 'Restore'}</Button>
                </td>
              </tr>
            ))}
          </Table>
        </Card>
      )}
    </>
  );
}
