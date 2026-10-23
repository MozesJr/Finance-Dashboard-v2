import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Bill } from '@prisma/client';
import {
  accumulatedReserve,
  CreateBillInput,
  daysBetween,
  getTodayInJakarta,
  nextDueDate,
  PayBillInput,
  periodIndex,
  reservePerPeriod,
  toDateString,
  UpdateBillInput,
} from 'shared';
import { CategoriesService } from '../categories/categories.service';
import { PeriodsService } from '../periods/periods.service';
import { TransactionEvents } from '../transactions/transaction-events';
import { TransactionResponse, TransactionsService } from '../transactions/transactions.service';
import { WalletsService } from '../wallets/wallets.service';
import { BillsRepository } from './bills.repository';

export const DUE_SOON_DAYS = 7;
/** Kunci pengingat "tunda" dibedakan dari pengingat H-n: 100 + sisa hari. */
export const SNOOZE_KEY_BASE = 100;

const toDate = (s: string) => new Date(`${s}T00:00:00Z`);
const dayOf = (d: Date) => toDateString(d);

export type BillStatus = 'OVERDUE' | 'DUE_SOON' | 'OK' | 'INACTIVE';

export interface BillResponse {
  id: string;
  name: string;
  amount: string;
  categoryId: string | null;
  categoryName: string | null;
  walletId: string | null;
  walletName: string | null;
  /** Dompet yang dipakai saat membayar: dompet tagihan, atau dompet default. */
  payWalletName: string | null;
  intervalMonths: number;
  nextDueDate: string;
  isActive: boolean;
  remindDays: number[];
  snoozedUntil: string | null;
  daysUntilDue: number;
  status: BillStatus;
  /** Perlu disisihkan per periode = nominal / interval (dibulatkan ke atas). */
  reservePerPeriod: string;
  /** Terkumpul seharusnya sejak pembayaran terakhir (virtual, tidak memindahkan uang). */
  accumulated: string;
  lastPaidOn: string | null;
}

export interface BillsOverview {
  bills: BillResponse[];
  nextDue: BillResponse | null;
  /** Total cadangan yang seharusnya sudah disisihkan untuk semua tagihan aktif. */
  totalReserve: string;
  /** Total per periode yang perlu disisihkan untuk semua tagihan aktif. */
  totalPerPeriod: string;
  defaultWallet: { id: string; name: string; balance: string } | null;
  /** Saldo dompet default − total cadangan ("uang bebas"); null bila belum ada dompet default. */
  freeMoney: string | null;
}

export interface PayResult {
  status: 'DONE' | 'DRAFT';
  transactionId: string;
  message: string;
}

export interface DueReminder {
  bill: Bill;
  /** Kunci unik pengingat: hari sebelum jatuh tempo (H-n) atau 100 + sisa hari untuk "tunda". */
  daysBefore: number;
  daysLeft: number;
  snoozed: boolean;
}

@Injectable()
export class BillsService implements OnModuleInit {
  constructor(
    private repository: BillsRepository,
    private transactions: TransactionsService,
    private wallets: WalletsService,
    private categories: CategoriesService,
    private periods: PeriodsService,
    private events: TransactionEvents,
  ) {}

  /** Pembayaran lewat draf bot baru "selesai" saat draf dikonfirmasi: dengarkan konfirmasi transaksi bertaut tagihan. */
  onModuleInit(): void {
    this.events.onConfirmed((userId, tx) => this.settleForTransaction(userId, tx));
  }

  // ---------- Baca ----------

  async list(userId: string, includeInactive = false): Promise<BillResponse[]> {
    const rows = await this.repository.list(userId, includeInactive);
    return this.toResponses(userId, rows);
  }

  async get(userId: string, id: string): Promise<BillResponse> {
    const bill = await this.getOwned(userId, id);
    return (await this.toResponses(userId, [bill]))[0];
  }

  async payments(userId: string, id: string, limit = 50) {
    await this.getOwned(userId, id);
    const rows = await this.repository.payments(userId, id, limit);
    return rows.map((p) => ({ id: p.id, amount: p.amount.toString(), dueDate: dayOf(p.dueDate), paidOn: dayOf(p.paidOn), transactionId: p.transactionId }));
  }

  /** Kartu dashboard: jatuh tempo terdekat, total cadangan, dan "uang bebas" (saldo dompet default − cadangan). */
  async overview(userId: string): Promise<BillsOverview> {
    const bills = await this.list(userId, false);
    const totalReserve = bills.reduce((a, b) => a + BigInt(b.accumulated), 0n);
    const totalPerPeriod = bills.reduce((a, b) => a + BigInt(b.reservePerPeriod), 0n);
    const wallet = (await this.wallets.list(userId, false)).find((w) => w.isDefault) ?? null;
    return {
      bills,
      nextDue: bills[0] ?? null,
      totalReserve: totalReserve.toString(),
      totalPerPeriod: totalPerPeriod.toString(),
      defaultWallet: wallet ? { id: wallet.id, name: wallet.name, balance: wallet.balance } : null,
      freeMoney: wallet ? (BigInt(wallet.balance) - totalReserve).toString() : null,
    };
  }

  /** Cadangan per periode dijumlahkan per kategori (untuk pos alokasi: "terpakai untuk cadangan tagihan"). */
  async reservePerPeriodByCategory(userId: string): Promise<Map<string, bigint>> {
    const rows = await this.repository.list(userId, false);
    const map = new Map<string, bigint>();
    for (const b of rows) {
      if (!b.categoryId) continue;
      map.set(b.categoryId, (map.get(b.categoryId) ?? 0n) + reservePerPeriod(b.amount, b.intervalMonths));
    }
    return map;
  }

  /** Tagihan aktif yang jatuh tempo (atau lewat) sebelum batas periode, plus yang sudah dibayar untuk jatuh tempo di periode itu. */
  async dueInPeriod(userId: string, start: Date, endExclusive: Date): Promise<Array<{ bill: BillResponse; done: boolean }>> {
    const [active, paid] = await Promise.all([this.repository.list(userId, false), this.repository.paymentsDueIn(userId, start, endExclusive)]);
    const paidIds = new Set(paid.map((p) => p.billId));
    const pending = active.filter((b) => b.nextDueDate < endExclusive);
    const done = active.filter((b) => paidIds.has(b.id) && b.nextDueDate >= endExclusive);
    const responses = await this.toResponses(userId, [...pending, ...done]);
    return responses.map((bill) => ({ bill, done: !pending.some((p) => p.id === bill.id) }));
  }

  // ---------- Tulis ----------

  async create(userId: string, input: CreateBillInput): Promise<BillResponse> {
    await this.assertExpenseCategory(userId, input.categoryId);
    if (input.walletId) await this.wallets.getOwned(userId, input.walletId);
    const created = await this.repository.create(userId, {
      name: input.name,
      amount: input.amount,
      categoryId: input.categoryId,
      walletId: input.walletId ?? null,
      intervalMonths: input.intervalMonths,
      dueDay: Number(input.nextDueDate.slice(8, 10)),
      nextDueDate: toDate(input.nextDueDate),
      remindDays: input.remindDays,
    });
    return this.get(userId, created.id);
  }

  async update(userId: string, id: string, input: UpdateBillInput): Promise<BillResponse> {
    await this.getOwned(userId, id);
    if (input.categoryId) await this.assertExpenseCategory(userId, input.categoryId);
    if (input.walletId) await this.wallets.getOwned(userId, input.walletId);
    const updated = await this.repository.update(userId, id, {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.amount !== undefined ? { amount: input.amount } : {}),
      ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
      ...(input.walletId !== undefined ? { walletId: input.walletId } : {}),
      ...(input.intervalMonths !== undefined ? { intervalMonths: input.intervalMonths } : {}),
      ...(input.nextDueDate !== undefined ? { nextDueDate: toDate(input.nextDueDate), dueDay: Number(input.nextDueDate.slice(8, 10)), snoozedUntil: null } : {}),
      ...(input.remindDays !== undefined ? { remindDays: input.remindDays } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    });
    if (!updated) throw new NotFoundException('Tagihan tidak ditemukan');
    return this.get(userId, id);
  }

  /** "Ingatkan besok": pengingat dikirim lagi esok hari (Asia/Jakarta) selama tagihan masih aktif. */
  async snooze(userId: string, id: string): Promise<string> {
    await this.getOwned(userId, id);
    const tomorrow = toDateString(new Date(getTodayInJakarta().getTime() + 86_400_000));
    await this.repository.update(userId, id, { snoozedUntil: toDate(tomorrow) });
    return tomorrow;
  }

  /**
   * Bayar tagihan: transaksi EXPENSE dengan spreadPeriods = interval dan bill_id. Web → langsung CONFIRMED + jatuh tempo maju.
   * Bot → DRAFT (jatuh tempo maju saat draf dikonfirmasi lewat event).
   */
  async pay(userId: string, id: string, input: PayBillInput, channel: 'WEB' | 'TELEGRAM'): Promise<PayResult> {
    const bill = await this.getOwned(userId, id);
    if (!bill.isActive) throw new BadRequestException('Tagihan ini nonaktif.');
    if (!bill.categoryId) throw new BadRequestException('Tagihan belum punya kategori. Ubah tagihan dan pilih kategori.');
    const walletId = input.walletId ?? bill.walletId ?? (await this.wallets.findDefault(userId))?.id;
    if (!walletId) throw new BadRequestException('Pilih dompet pembayaran (belum ada dompet default).');
    const amount = input.amount ?? bill.amount;
    const date = input.date ?? toDateString(getTodayInJakarta());
    const base = {
      type: 'EXPENSE' as const,
      walletId,
      categoryId: bill.categoryId,
      amount,
      date,
      merchant: bill.name,
      note: `Tagihan ${bill.name}`,
      spreadPeriods: bill.intervalMonths,
    };

    if (channel === 'TELEGRAM') {
      const draft = await this.transactions.createDraft(userId, { ...base, billId: bill.id }, 'TELEGRAM');
      return { status: 'DRAFT', transactionId: draft.id, message: `Draft ${bill.name} dibuat.` };
    }

    const tx = await this.transactions.create(userId, base, { source: 'WEB', status: 'CONFIRMED', billId: bill.id });
    await this.settleForTransaction(userId, tx);
    if (input.updateBillAmount && amount !== bill.amount) await this.repository.update(userId, id, { amount });
    return { status: 'DONE', transactionId: tx.id, message: `${bill.name} dibayar. Jatuh tempo berikutnya dimajukan.` };
  }

  /** Idempoten (transaction_id unik): dipanggil langsung oleh pembayaran web dan oleh event konfirmasi draf. */
  async settleForTransaction(userId: string, tx: TransactionResponse): Promise<void> {
    if (!tx.billId || tx.status !== 'CONFIRMED') return;
    const bill = await this.repository.findById(userId, tx.billId);
    if (!bill) return;
    const next = nextDueDate(dayOf(bill.nextDueDate), bill.intervalMonths, bill.dueDay);
    await this.repository.settle(userId, bill.id, {
      transactionId: tx.id,
      amount: BigInt(tx.amount),
      dueDate: bill.nextDueDate,
      paidOn: toDate(tx.date),
      nextDueDate: toDate(next),
    });
  }

  // ---------- Pengingat ----------

  /**
   * Pengingat yang harus dikirim hari ini: H-n sesuai remindDays, plus yang ditunda ke hari ini (snooze).
   * Pemanggil (job) yang mengklaim lewat claimReminder supaya tidak terkirim ganda.
   */
  async dueReminders(today: Date): Promise<DueReminder[]> {
    const todayStr = dayOf(today);
    const horizon = new Date(today.getTime() + 61 * 86_400_000);
    const [upcoming, snoozed] = await Promise.all([this.repository.findRemindable(today, horizon), this.repository.findSnoozedFor(today)]);
    const out: DueReminder[] = [];
    const seen = new Set<string>();
    for (const bill of upcoming) {
      const daysLeft = daysBetween(todayStr, dayOf(bill.nextDueDate));
      if (bill.remindDays.includes(daysLeft)) {
        out.push({ bill, daysBefore: daysLeft, daysLeft, snoozed: false });
        seen.add(bill.id);
      }
    }
    for (const bill of snoozed) {
      if (seen.has(bill.id)) continue;
      const daysLeft = daysBetween(todayStr, dayOf(bill.nextDueDate));
      out.push({ bill, daysBefore: SNOOZE_KEY_BASE + daysLeft, daysLeft, snoozed: true });
    }
    return out;
  }

  claimReminder(bill: Bill, daysBefore: number): Promise<boolean> {
    return this.repository.claimReminder(bill.id, bill.nextDueDate, daysBefore);
  }

  releaseReminder(bill: Bill, daysBefore: number): Promise<void> {
    return this.repository.releaseReminder(bill.id, bill.nextDueDate, daysBefore);
  }

  async clearSnooze(bill: Bill): Promise<void> {
    await this.repository.update(bill.userId, bill.id, { snoozedUntil: null });
  }

  /** Tampilan satu tagihan untuk pesan pengingat (nama kategori/dompet, cadangan). */
  async describe(bill: Bill): Promise<BillResponse> {
    return (await this.toResponses(bill.userId, [bill]))[0];
  }

  // ---------- Internal ----------

  private async getOwned(userId: string, id: string): Promise<Bill> {
    const bill = await this.repository.findById(userId, id);
    if (!bill) throw new NotFoundException('Tagihan tidak ditemukan');
    return bill;
  }

  private async assertExpenseCategory(userId: string, categoryId: string): Promise<void> {
    const category = await this.categories.getVisible(userId, categoryId);
    if (category.type !== 'EXPENSE') throw new BadRequestException('Kategori tagihan harus kategori pengeluaran.');
  }

  private async toResponses(userId: string, rows: Bill[]): Promise<BillResponse[]> {
    if (rows.length === 0) return [];
    const [{ key: currentKey, startDay }, lastPaid, categories, wallets] = await Promise.all([
      this.periods.resolve(userId),
      this.repository.lastPaidOn(userId),
      this.categories.list(userId),
      this.wallets.list(userId, true),
    ]);
    const todayStr = toDateString(getTodayInJakarta());
    const categoryName = new Map(categories.map((c) => [c.id, c.name]));
    const walletName = new Map(wallets.map((w) => [w.id, w.name]));
    const defaultWalletName = wallets.find((w) => w.isDefault && !w.isArchived)?.name ?? null;

    return rows.map((b): BillResponse => {
      const due = dayOf(b.nextDueDate);
      const daysUntilDue = daysBetween(todayStr, due);
      const basis = lastPaid.get(b.id) ?? b.createdAt;
      const elapsed = periodIndex(currentKey) - periodIndex(this.periods.keyForDate(basis, startDay));
      return {
        id: b.id,
        name: b.name,
        amount: b.amount.toString(),
        categoryId: b.categoryId,
        categoryName: b.categoryId ? (categoryName.get(b.categoryId) ?? null) : null,
        walletId: b.walletId,
        walletName: b.walletId ? (walletName.get(b.walletId) ?? null) : null,
        payWalletName: (b.walletId ? walletName.get(b.walletId) : null) ?? defaultWalletName,
        intervalMonths: b.intervalMonths,
        nextDueDate: due,
        isActive: b.isActive,
        remindDays: b.remindDays,
        snoozedUntil: b.snoozedUntil ? dayOf(b.snoozedUntil) : null,
        daysUntilDue,
        status: !b.isActive ? 'INACTIVE' : daysUntilDue < 0 ? 'OVERDUE' : daysUntilDue <= DUE_SOON_DAYS ? 'DUE_SOON' : 'OK',
        reservePerPeriod: reservePerPeriod(b.amount, b.intervalMonths).toString(),
        accumulated: accumulatedReserve(b.amount, b.intervalMonths, elapsed).toString(),
        lastPaidOn: lastPaid.get(b.id) ? dayOf(lastPaid.get(b.id) as Date) : null,
      };
    });
  }
}
