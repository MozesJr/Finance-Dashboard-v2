import { PageHeader } from '@/components/PageHeader';
import { PeriodSettings } from '@/features/settings/components/PeriodSettings';
import { TelegramSettings } from '@/features/telegram/components/TelegramSettings';

export function SettingsPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Pengaturan" subtitle="Kelola periode keuangan dan integrasi akunmu." />
      <PeriodSettings />
      <TelegramSettings />
    </div>
  );
}
