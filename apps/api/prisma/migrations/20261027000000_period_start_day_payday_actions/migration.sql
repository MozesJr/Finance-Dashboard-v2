-- Fitur B: tanggal mulai periode keuangan per user + catatan aksi checklist gajian (idempotensi).
-- Hanya menambah: default 1 menjaga perilaku semua user sampai mereka mengubahnya.
ALTER TABLE "users" ADD COLUMN "period_start_day" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "users" ADD CONSTRAINT "users_period_start_day_range" CHECK ("period_start_day" BETWEEN 1 AND 28);

CREATE TABLE "payday_actions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "item_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payday_actions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payday_actions_user_id_period_item_key_key" ON "payday_actions"("user_id", "period", "item_key");

ALTER TABLE "payday_actions" ADD CONSTRAINT "payday_actions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
