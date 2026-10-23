import { PageHeader } from '@/components/PageHeader';
import { TelegramSettings } from '@/features/telegram/components/TelegramSettings';

export function SettingsPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Pengaturan" subtitle="Kelola integrasi akunmu." />
      <TelegramSettings />
    </div>
  );
}
