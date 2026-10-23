import { Link, Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthProvider';
import { supabase, q } from '@/lib/supabase';
import { Button, Card, Empty, PageHeader, Spinner } from '@/components/ui';
import { useClasses } from './hooks';

interface MyStaffRow { class_id: string; staff_role: string }

/** The classes the signed-in teacher or secretary is assigned to. With only one, it opens straight away. */
export default function MyClasses() {
  const { member } = useAuth();
  const classes = useClasses(true);
  const mine = useQuery({
    queryKey: ['my-classes', member?.id], enabled: !!member,
    queryFn: () => q<MyStaffRow[]>(supabase.from('ss_class_staff').select('class_id, staff_role').eq('member_id', member!.id).eq('is_active', true)),
  });

  if (mine.isLoading || classes.isLoading) return <Spinner />;
  const rows = (mine.data ?? [])
    .map((r) => ({ ...r, name: (classes.data ?? []).find((c) => c.id === r.class_id)?.name }))
    .filter((r) => r.name);

  if (rows.length === 0) {
    return <Empty title="You are not assigned to a class yet" hint="The Sunday school lead assigns teachers and secretaries to their classes." />;
  }
  if (rows.length === 1) return <Navigate to={`/app/sunday-school/classes/${rows[0].class_id}`} replace />;

  return (
    <>
      <PageHeader title="My classes" subtitle="Add students, see the register and the quarter sheet for your classes." />
      <div className="space-y-3">
        {rows.map((r) => (
          <Card key={`${r.class_id}-${r.staff_role}`} title={r.name} action={<Link to={`/app/sunday-school/classes/${r.class_id}`}><Button size="sm">Open</Button></Link>}>
            <p className="text-sm capitalize text-gray-600">{r.staff_role}</p>
          </Card>
        ))}
      </div>
    </>
  );
}
