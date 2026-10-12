import { Empty, PageHeader } from '@/components/ui';

export default function ComingSoon() {
  return (
    <>
      <PageHeader title="Coming next" subtitle="The database already supports these. The screens are the next build steps." />
      <Empty title="Phase 4 modules" hint="Online giving and receipts, absentee follow-up, birthdays and anniversaries, SMS/WhatsApp announcements, volunteer rota, children's check-in, prayer requests, parent view." />
    </>
  );
}
