-- CreateEnum
CREATE TYPE "AiFeature" AS ENUM ('CHAT', 'INSIGHT', 'RECEIPT', 'PARSE');

-- CreateEnum
CREATE TYPE "AiChatRole" AS ENUM ('USER', 'ASSISTANT');

-- AlterTable
ALTER TABLE "receipts" ADD COLUMN     "mime_type" TEXT NOT NULL,
ADD COLUMN     "size_bytes" INTEGER NOT NULL;

-- CreateTable
CREATE TABLE "ai_usage" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "feature" "AiFeature" NOT NULL,
    "prompt_tokens" INTEGER NOT NULL DEFAULT 0,
    "completion_tokens" INTEGER NOT NULL DEFAULT 0,
    "latency_ms" INTEGER NOT NULL DEFAULT 0,
    "success" BOOLEAN NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_usage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_chat_messages" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" "AiChatRole" NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_usage_user_id_feature_created_at_idx" ON "ai_usage"("user_id", "feature", "created_at");

-- CreateIndex
CREATE INDEX "ai_chat_messages_user_id_created_at_idx" ON "ai_chat_messages"("user_id", "created_at");

-- AddForeignKey
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_chat_messages" ADD CONSTRAINT "ai_chat_messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

