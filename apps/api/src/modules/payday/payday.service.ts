import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { formatMoneyId, getTodayInJakarta, PaydayActionInput, toDateString } from 'shared';
import type { PeriodInfo } from 'shared';
import { AllocationService, ReportResponse } from '../allocation/allocation.service';
import { PeriodsService, toPeriodInfo } from '../periods/periods.service';
import { SavingsService } from '../savings/savings.service';
import { TransactionsService } from '../transactions/transactions.service';
import { PaydayRepository, SalaryRow } from './payday.repository';

export type ChecklistItemKind = 'SAVING' | 'EXPENSE_SINGLE' | 'EXPENSE_INFO' | 'INCOME';

export interface ChecklistItem {
  /** "s:<posId>" | "e:<posId>" | "i:<posId>" (info) | "inc" */
  key: string;
  kind: ChecklistItemKind;
  name: string;
  icon: string | null;
  /** Nominal rencana pos untuk periode ini (string BigInt); untuk INCOME: gaji yang diterima. */
  amount: string;
  done: boolean;
  goalId?: string;
  goalName?: string;
  /** Goal tanpa dompet penyimpanan: dompet tujuan harus dipilih saat setor. */
  needsDestination?: boolean;
  categoryId?: string;
  /** Hanya INCOME: gaji di rencana saat ini. */
  planIncome?: string;
}

export interface Checklist {
  period: PeriodInfo;
  salary: { id: string; amount: string; walletId: string; walletName: string; date: string };
  hasPlan: boolean;
  phase: number | null;
  items: ChecklistItem[];
}

export type ActionResult =
  | { status: 'DONE'; message: string }
  | { status: 'DRAFT'; message: string; transactionId: string }
  | { status: 'ALREADY'; message: string };

/** Konfirmasi singkat yang bisa dipakai bot dan web. */
@Injectable()
export class PaydayService {
  constructor(
    private repository: PaydayRepository,
    private allocation: AllocationService,
    private savings: SavingsService,
    private transactions: TransactionsService,
    private periods: PeriodsService,
  ) {}

  /** Checklist periode (default: berjalan); null bila belum ada gaji CONFIRMED di periode itu. */
  async getChecklist(userId: string, periodKey?: string): Promise<Checklist | null> {
    const period = await this.periods.resolve(userId, periodKey);
    const salaries = await this.repository.findSalaries(userId, period.start, period.endExclusive);
    if (salaries.length === 0) return null;
    const salary = salaries[0];

    const [done, report, goals] = await Promise.all([
      this.repository.listActionKeys(userId, period.key),
      this.safeReport(userId, period.key),
      this.savings.list(userId, true),
    ]);
    const doneKeys = new Set(done);
    const goalById = new Map(goals.map((g) => [g.id, g]));

    const items: ChecklistItem[] = [];
    if (report) {
      for (const item of report.items) {
        if (item.dialihkan) continue;
        const planned = BigInt(item.planned);
        if (item.kind === 'SAVING' && item.goalId) {
          if (planned <= 0n) continue;
          items.push({
            key: `s:${item.id}`, kind: 'SAVING', name: item.name, icon: item.icon, amount: item.planned, done: doneKeys.has(`s:${item.id}`),
            goalId: item.goalId, goalName: item.goalName ?? undefined, needsDestination: !goalById.get(item.goalId)?.walletId,
          });
        } else if (item.kind === 'EXPENSE' && item.categoryIds.length === 1) {
          items.push({ key: `e:${item.id}`, kind: 'EXPENSE_SINGLE', name: item.name, icon: item.icon, amount: item.planned, done: doneKeys.has(`e:${item.id}`), categoryId: item.categoryIds[0] });
        } else if (item.kind === 'EXPENSE') {
          items.push({ key: `i:${item.id}`, kind: 'EXPENSE_INFO', name: item.name, icon: item.icon, amount: item.planned, done: false });
        }
      }
      if (BigInt(report.monthlyIncome) !== salary.amount) {
        items.push({ key: 'inc', kind: 'INCOME', name: 'Perbarui gaji di alokasi', icon: null, amount: salary.amount.toString(), planIncome: report.monthlyIncome, done: doneKeys.has('inc') });
      }
    }

    return {
      period: toPeriodInfo(period),
      salary: this.toSalary(salary),
      hasPlan: report !== null,
      phase: report?.phase ?? null,
      items,
    };
  }

  /** Jalankan satu tombol checklist. Idempoten: tombol yang sudah dijalankan mengembalikan ALREADY. */
  async runAction(userId: string, input: PaydayActionInput, channel: 'WEB' | 'TELEGRAM'): Promise<ActionResult> {
    const checklist = await this.getChecklist(userId, input.periodKey);
    if (!checklist) throw new NotFoundException('Belum ada gaji yang tercatat di periode ini.');
    const item = checklist.items.find((i) => i.key === input.itemKey);
    if (!item || item.kind === 'EXPENSE_INFO') throw new NotFoundException('Pos checklist tidak ditemukan.');
    if (item.done) return { status: 'ALREADY', message: `${item.name} sudah dijalankan.` };

    if (item.kind === 'SAVING' && item.needsDestination && !input.destinationWalletId) {
      throw new BadRequestException(`Pilih dompet tujuan untuk ${item.goalName ?? item.name}.`);
    }

    // Catat dulu (unik per user+periode+item): permintaan ganda bersamaan hanya satu yang lolos.
    const claimed = await this.repository.markAction(userId, checklist.period.key, item.key);
    if (!claimed) return { status: 'ALREADY', message: `${item.name} sudah dijalankan.` };

    try {
      return await this.perform(userId, checklist, item, input.destinationWalletId ?? null, channel);
    } catch (error) {
      await this.repository.unmarkAction(userId, checklist.period.key, item.key);
      throw error;
    }
  }

  /** Dipakai pemberi tahu: true bila notifikasi gaji ini belum pernah dikirim (sekaligus menandainya). */
  claimNotification(userId: string, period: string, transactionId: string): Promise<boolean> {
    return this.repository.markAction(userId, period, `n:${transactionId}`);
  }

  private async perform(userId: string, c: Checklist, item: ChecklistItem, destination: string | null, channel: 'WEB' | 'TELEGRAM'): Promise<ActionResult> {
    const amount = BigInt(item.amount);
    const today = toDateString(getTodayInJakarta());
    switch (item.kind) {
      case 'SAVING': {
        await this.savings.addContribution(userId, item.goalId as string, {
          type: 'DEPOSIT',
          amount,
          date: today,
          note: `Alokasi gaji ${c.period.label}`,
          walletId: c.salary.walletId,
          ...(item.needsDestination ? { counterWalletId: destination } : {}),
        });
        return { status: 'DONE', message: `Setor ${formatMoneyId(amount)} ke ${item.goalName ?? item.name} dari ${c.salary.walletName}.` };
      }
      case 'EXPENSE_SINGLE': {
        if (channel === 'TELEGRAM') {
          const draft = await this.transactions.createDraft(
            userId,
            { type: 'EXPENSE', walletId: c.salary.walletId, categoryId: item.categoryId, amount, date: today, merchant: item.name },
            'TELEGRAM',
          );
          return { status: 'DRAFT', message: `Draft ${item.name} ${formatMoneyId(amount)} dibuat.`, transactionId: draft.id };
        }
        await this.transactions.create(
          userId,
          { type: 'EXPENSE', walletId: c.salary.walletId, categoryId: item.categoryId, amount, date: today, merchant: item.name, note: `Alokasi gaji ${c.period.label}` },
          { source: 'WEB', status: 'CONFIRMED' },
        );
        return { status: 'DONE', message: `${item.name} ${formatMoneyId(amount)} dicatat.` };
      }
      case 'INCOME': {
        await this.allocation.updatePlan(userId, { monthlyIncome: amount });
        return { status: 'DONE', message: `Gaji di alokasi diperbarui ke ${formatMoneyId(amount)}.` };
      }
      default:
        throw new BadRequestException('Aksi tidak dikenal.');
    }
  }

  private async safeReport(userId: string, month: string): Promise<ReportResponse | null> {
    try {
      return await this.allocation.report(userId, { month });
    } catch (error) {
      if (error instanceof NotFoundException) return null; // belum punya rencana alokasi
      throw error;
    }
  }

  private toSalary(s: SalaryRow): Checklist['salary'] {
    return { id: s.id, amount: s.amount.toString(), walletId: s.walletId, walletName: s.walletName, date: toDateString(s.date) };
  }
}
