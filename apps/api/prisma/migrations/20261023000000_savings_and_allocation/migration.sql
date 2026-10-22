-- CreateEnum
CREATE TYPE "GoalTargetMode" AS ENUM ('MANUAL', 'MONTHS_OF_EXPENSE');

-- CreateEnum
CREATE TYPE "ContributionType" AS ENUM ('DEPOSIT', 'WITHDRAW');

-- CreateEnum
CREATE TYPE "AllocationKind" AS ENUM ('EXPENSE', 'SAVING');

-- DropIndex
DROP INDEX "allocation_plans_user_id_idx";

-- AlterTable
ALTER TABLE "allocation_items" ADD COLUMN     "description" TEXT,
ADD COLUMN     "icon" TEXT,
ADD COLUMN     "kind" "AllocationKind" NOT NULL,
ADD COLUMN     "sort_order" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "savings_contributions" ADD COLUMN     "transaction_id" TEXT,
ADD COLUMN     "type" "ContributionType" NOT NULL;

-- AlterTable
ALTER TABLE "savings_goals" DROP COLUMN "current",
DROP COLUMN "target",
ADD COLUMN     "color" TEXT,
ADD COLUMN     "icon" TEXT,
ADD COLUMN     "is_archived" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "target_amount" BIGINT,
ADD COLUMN     "target_date" DATE,
ADD COLUMN     "target_mode" "GoalTargetMode" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "target_months" INTEGER,
ADD COLUMN     "wallet_id" TEXT;

-- CreateTable
CREATE TABLE "allocation_item_categories" (
    "item_id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,

    CONSTRAINT "allocation_item_categories_pkey" PRIMARY KEY ("item_id","category_id")
);

-- CreateIndex
CREATE INDEX "allocation_item_categories_category_id_idx" ON "allocation_item_categories"("category_id");

-- CreateIndex
CREATE UNIQUE INDEX "allocation_plans_user_id_key" ON "allocation_plans"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "savings_contributions_transaction_id_key" ON "savings_contributions"("transaction_id");

-- CreateIndex
CREATE INDEX "savings_goals_wallet_id_idx" ON "savings_goals"("wallet_id");

-- AddForeignKey
ALTER TABLE "savings_goals" ADD CONSTRAINT "savings_goals_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "savings_contributions" ADD CONSTRAINT "savings_contributions_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "allocation_item_categories" ADD CONSTRAINT "allocation_item_categories_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "allocation_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "allocation_item_categories" ADD CONSTRAINT "allocation_item_categories_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

