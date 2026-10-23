-- AlterTable
ALTER TABLE "telegram_link_codes" DROP COLUMN "code",
ADD COLUMN     "code_hash" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "telegram_links" ADD COLUMN     "username" TEXT;

-- AlterTable
ALTER TABLE "wallets" ADD COLUMN     "is_default" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "bot_pending_inputs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bot_pending_inputs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bot_pending_inputs_user_id_idx" ON "bot_pending_inputs"("user_id");

-- CreateIndex
CREATE INDEX "bot_pending_inputs_created_at_idx" ON "bot_pending_inputs"("created_at");

-- CreateIndex
CREATE INDEX "telegram_link_codes_code_hash_idx" ON "telegram_link_codes"("code_hash");

-- CreateIndex
CREATE INDEX "transactions_status_created_at_idx" ON "transactions"("status", "created_at");

-- AddForeignKey
ALTER TABLE "bot_pending_inputs" ADD CONSTRAINT "bot_pending_inputs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

