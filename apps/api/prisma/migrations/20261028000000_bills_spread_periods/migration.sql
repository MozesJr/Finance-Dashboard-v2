-- Fitur C: pembagian biaya antar periode (transactions.spread_periods) + tagihan berkala (bills, bill_payments, bill_reminders).
-- Hanya menambah kolom/tabel/indeks/FK dan CHECK. Default spread_periods = 1 menjaga semua laporan lama persis sama.

-- AlterTable
ALTER TABLE "transactions" ADD COLUMN     "bill_id" TEXT,
ADD COLUMN     "spread_periods" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "bills" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "category_id" TEXT,
    "wallet_id" TEXT,
    "interval_months" INTEGER NOT NULL DEFAULT 1,
    "due_day" INTEGER NOT NULL,
    "next_due_date" DATE NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "remind_days" INTEGER[] DEFAULT ARRAY[7, 1]::INTEGER[],
    "snoozed_until" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bill_payments" (
    "id" TEXT NOT NULL,
    "bill_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "transaction_id" TEXT,
    "amount" BIGINT NOT NULL,
    "due_date" DATE NOT NULL,
    "paid_on" DATE NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bill_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bill_reminders" (
    "id" TEXT NOT NULL,
    "bill_id" TEXT NOT NULL,
    "due_date" DATE NOT NULL,
    "days_before" INTEGER NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bill_reminders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bills_user_id_idx" ON "bills"("user_id");

-- CreateIndex
CREATE INDEX "bills_user_id_is_active_next_due_date_idx" ON "bills"("user_id", "is_active", "next_due_date");

-- CreateIndex
CREATE UNIQUE INDEX "bill_payments_transaction_id_key" ON "bill_payments"("transaction_id");

-- CreateIndex
CREATE INDEX "bill_payments_bill_id_idx" ON "bill_payments"("bill_id");

-- CreateIndex
CREATE INDEX "bill_payments_user_id_idx" ON "bill_payments"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "bill_reminders_bill_id_due_date_days_before_key" ON "bill_reminders"("bill_id", "due_date", "days_before");

-- CreateIndex
CREATE INDEX "transactions_bill_id_idx" ON "transactions"("bill_id");

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_bill_id_fkey" FOREIGN KEY ("bill_id") REFERENCES "bills"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bills" ADD CONSTRAINT "bills_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bills" ADD CONSTRAINT "bills_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bills" ADD CONSTRAINT "bills_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bill_payments" ADD CONSTRAINT "bill_payments_bill_id_fkey" FOREIGN KEY ("bill_id") REFERENCES "bills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bill_payments" ADD CONSTRAINT "bill_payments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bill_reminders" ADD CONSTRAINT "bill_reminders_bill_id_fkey" FOREIGN KEY ("bill_id") REFERENCES "bills"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Batas nilai (CHECK)
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_spread_periods_range" CHECK ("spread_periods" BETWEEN 1 AND 12);
ALTER TABLE "bills" ADD CONSTRAINT "bills_interval_months_range" CHECK ("interval_months" BETWEEN 1 AND 12);
ALTER TABLE "bills" ADD CONSTRAINT "bills_due_day_range" CHECK ("due_day" BETWEEN 1 AND 31);
