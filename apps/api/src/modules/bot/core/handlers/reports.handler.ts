import { Injectable, NotFoundException } from '@nestjs/common';
import { formatMoneyId, getTodayInJakarta, toDateString } from 'shared';
import { PeriodsService } from '../../../periods/periods.service';
import { AllocationService } from '../../../allocation/allocation.service';
import { DashboardService } from '../../../dashboard/dashboard.service';
import { SavingsService } from '../../../savings/savings.service';
import { WalletsService } from '../../../wallets/wallets.service';
import { formatDateId } from '../format';
import { BotReply, BotUser, send } from '../types';

const MAX_LINES = 9;
const STATUS_LABEL: Record<string, string> = {
  BELUM_ADA: 'belum ada',
  AMAN: 'aman',
  HAMPIR: 'hampir habis',
  LEBIH: 'melebihi',
  KURANG: 'kurang',
  TERCAPAI: 'tercapai',
};

@Injectable()
export class ReportsHandler {
  constructor(
    private wallets: WalletsService,
    private dashboard: DashboardService,
    private savings: SavingsService,
    private allocation: AllocationService,
    private periods: PeriodsService,
  ) {}

  async saldo(user: BotUser): Promise<BotReply[]> {
    const list = await this.wallets.list(user.userId, false);
    if (list.length === 0) return [send('Belum ada dompet. Buat dulu di web (menu Dompet).')];
    const total = list.reduce((acc, w) => acc + BigInt(w.balance), 0n);
    const shown = list.slice(0, MAX_LINES);
    const lines = ['💰 Saldo', ...shown.map((w) => `${w.isDefault ? '⭐ ' : ''}${w.name}: ${formatMoneyId(w.balance)}`)];
    if (list.length > shown.length) lines.push(`… +${list.length - shown.length} dompet lain`);
    lines.push(`Total: ${formatMoneyId(total)}`);
    return [send(lines.join('\n'))];
  }

  async hariIni(user: BotUser): Promise<BotReply[]> {
    const today = getTodayInJakarta();
    const next = new Date(today.getTime() + 86_400_000);
    return this.period(user, `📅 Hari ini (${formatDateId(toDateString(today))})`, today, next);
  }

  async bulanIni(user: BotUser): Promise<BotReply[]> {
    const p = await this.periods.current(user.userId);
    const r = await this.dashboard.periodReport(user.userId, p.key, 3);
    return this.render(`📅 Periode ini: ${p.label}`, r);
  }

  private async period(user: BotUser, title: string, start: Date, endExclusive: Date): Promise<BotReply[]> {
    return this.render(title, await this.dashboard.period(user.userId, start, endExclusive, 3));
  }

  private render(title: string, r: Awaited<ReturnType<DashboardService['period']>>): BotReply[] {
    const lines = [
      title,
      `Masuk: ${formatMoneyId(r.totalIncome)}`,
      `Keluar: ${formatMoneyId(r.totalExpense)}`,
      `Selisih: ${formatMoneyId(r.net)}`,
    ];
    if (r.topExpenseCategories.length > 0) {
      lines.push('Top pengeluaran:');
      r.topExpenseCategories.forEach((c, i) =>
        lines.push(`${i + 1}. ${c.icon ? `${c.icon} ` : ''}${c.name} ${formatMoneyId(c.total)} (${c.percent.toLocaleString('id-ID')}%)`),
      );
    }
    return [send(lines.join('\n'))];
  }

  async alokasi(user: BotUser): Promise<BotReply[]> {
    try {
      const r = await this.allocation.report(user.userId, {});
      const lines = [`📊 Alokasi ${r.period.label} · Fase ${r.phase}`];
      for (const item of r.items.slice(0, MAX_LINES - 1)) {
        lines.push(
          item.dialihkan
            ? `${item.icon ?? ''} ${item.name}: dialihkan`.trim()
            : `${item.icon ?? ''} ${item.name}: ${formatMoneyId(item.realized)}/${formatMoneyId(item.planned)} · ${STATUS_LABEL[item.status]}`.trim(),
        );
      }
      if (r.suggestPhase2) lines.push('💡 Dana darurat tercapai — pertimbangkan pindah ke Fase 2 di web.');
      return [send(lines.join('\n'))];
    } catch (error) {
      if (error instanceof NotFoundException) return [send('Belum ada rencana alokasi. Buat dari template di web (menu Tabungan).')];
      throw error;
    }
  }

  async tabungan(user: BotUser): Promise<BotReply[]> {
    const goals = await this.savings.list(user.userId, false);
    if (goals.length === 0) return [send('Belum ada goal tabungan. Buat di web (menu Tabungan).')];
    const lines = ['🎯 Tabungan'];
    for (const g of goals.slice(0, MAX_LINES)) {
      const target = g.target === null ? 'tanpa target' : formatMoneyId(g.target);
      const pct = g.percent === null ? '' : ` (${g.percent.toLocaleString('id-ID')}%)`;
      lines.push(`${g.icon ?? ''} ${g.name}: ${formatMoneyId(g.collected)} / ${target}${pct}`.trim());
    }
    return [send(lines.join('\n'))];
  }
}
