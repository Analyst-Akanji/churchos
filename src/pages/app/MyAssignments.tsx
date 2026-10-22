import { PageHeader } from '@/components/ui';
import { MyAssignments } from '@/components/MyAssignments';

export default function MyAssignmentsPage() {
  return (
    <>
      <PageHeader title="My assignments" subtitle="The parts of upcoming services you are taking." />
      <MyAssignments showEmpty />
    </>
  );
}
