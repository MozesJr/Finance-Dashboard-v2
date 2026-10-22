# Finance App — Project Rules

## Overview

Aplikasi pencatatan keuangan multi-user. Web dashboard (monitoring + input) dan bot Telegram (input via HP, teks/foto struk/chat). WA menyusul lewat adapter.
Dua menu utama: (1) Dashboard arus kas, (2) Tabungan (goals: dana darurat, investasi, custom + alokasi gaji berfase). Ditambah AI insight & rekomendasi.

## Stack

- Monorepo pnpm: apps/api (NestJS + TS), apps/web (React + Vite + Tailwind + shadcn/ui + TanStack Query + Recharts), packages/shared (Zod schemas, types, money utils)
- PostgreSQL lokal + Prisma. BELUM pakai Docker (nanti saat deploy).
- Bot: grammY. LLM: OpenAI SDK, baseURL dari env LLM_BASE_URL (https://9router.gamabms.tech/v1), model dari env LLM_MODEL (smartgov/qwen3.8-27b)., LLM_API_KEY, RECEIPT_PARSER=ocr|vision, RECEIPT_VISION_MODEL

## Architecture rules (WAJIB)

- Modular per domain di apps/api/src/modules/<domain>/: <domain>.module.ts, .controller.ts, .service.ts, .repository.ts, dto/, <domain>.spec.ts
- Controller: hanya HTTP (validasi, panggil service). Service: business logic. Repository: satu-satunya layer yang menyentuh Prisma.
- OOP + dependency injection. Gunakan interface untuk hal yang bisa ditukar: ChannelAdapter (telegram/whatsapp), ReceiptParser (vision/ocr), LlmClient.
- Semua input divalidasi Zod dari packages/shared. Jangan duplikasi schema.
- Uang = BigInt rupiah. DILARANG float untuk nominal.
- Setiap query data user WAJIB difilter userId dari JWT, bukan dari body request.
- LLM tidak pernah menulis/menjalankan SQL. Chat AI memakai tool calling ke fungsi service yang sudah ada. Statistik dihitung di kode; LLM hanya parse & menarasikan.
- Output LLM selalu JSON → validasi Zod → kalau gagal retry 1x → kalau tetap gagal kembalikan error yang ramah.
- Prompt LLM disimpan di apps/api/src/modules/ai/prompts/\*.md, bukan inline string.

## Domain

- User: role ADMIN|USER, status PENDING|ACTIVE|REJECTED|SUSPENDED. Register → PENDING. Login hanya jika ACTIVE. Admin punya semua akses user + /admin/\* (approve/reject/suspend user, statistik agregat). Admin TIDAK boleh melihat transaksi user lain.
- Auth: argon2, JWT access (15m) + refresh (7d) di httpOnly cookie, rate limit login.
- Wallet (Cash/Bank/E-wallet), Category (default seed + custom per user), Transaction (INCOME|EXPENSE|TRANSFER, amount BigInt, walletId, toWalletId untuk transfer, categoryId, date, merchant, note, source WEB|TELEGRAM|WHATSAPP, receiptId?, status DRAFT|CONFIRMED).
- SavingsGoal (name, type EMERGENCY|INVESTMENT|CUSTOM, target, current) + SavingsContribution.
- AllocationPlan per user: gaji bulanan, fase aktif, item pos (nama, persen) per fase. Total persen harus 100.
- Budget per kategori per bulan, RecurringRule, MerchantCategoryRule (belajar dari koreksi user), AiInsight (cache), TelegramLink (chatId ↔ userId via kode 6 digit).

## Bot behavior

- Hanya chat dari akun terhubung & ACTIVE yang dilayani.
- Input teks/foto → parse → simpan sebagai DRAFT → kirim preview + inline button (Simpan / Ubah kategori / Batal). CONFIRMED hanya setelah user menekan Simpan.
- Commands: /start /link <kode> /saldo /hariini /bulanini /budget /undo /help
- Parser nominal lokal ("35rb", "1,2jt", "1.250.000") dijalankan sebelum LLM.

## Workflow

- Kerjakan per fase, satu modul per sesi. Mulai dengan plan, tunggu persetujuan, baru implement.
- Setelah tiap perubahan: pnpm typecheck, pnpm lint, pnpm test. Jangan lanjut kalau gagal.
- Jangan install dependency baru tanpa menyebutkan alasannya.
- Env var di .env.example, jangan hardcode secret.
- Sebuah fase/tugas BELUM selesai sebelum `pnpm lint`, `pnpm typecheck`, `pnpm -r test`, dan build terkait lulus tanpa error. Laporkan output perintah-perintah itu, bukan klaim.

## Phases

0. Scaffold monorepo, Prisma schema lengkap, seed (admin awal dari env, kategori default), lint/test setup.
1. Auth + approval flow + halaman admin user management.
2. Wallets, categories, transactions CRUD + Dashboard (ringkasan, per kategori, tren).
3. Tabungan: goals, contributions, alokasi gaji berfase (konfigurasi per user).
4. Bot Telegram: linking, input teks, konfirmasi, commands.
5. AI: parse struk via OcrReceiptParser (sharp preprocessing → tesseract.js ind+eng → teks → LLM ke JSON, validasi Zod). Model LLM_MODEL TIDAK support vision. Sediakan VisionReceiptParser sebagai opsi, aktif hanya jika env RECEIPT_VISION_MODEL diisi. Chat dengan tool calling, insight bulanan + rekomendasi (cache).
6. Budget, recurring, notifikasi bot (reminder 21:00, alert budget 80%, laporan bulanan), export Excel.
7. Dockerize (api, web, bot) untuk deploy ke VPS.
