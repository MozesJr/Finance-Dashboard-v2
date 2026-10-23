# Finance Dashboard v2

Aplikasi pencatatan keuangan pribadi multi-user: **dashboard web** untuk monitoring dan input, plus **bot Telegram** untuk mencatat transaksi langsung dari HP (teks, foto struk, atau tanya jawab), lengkap dengan **alokasi gaji berfase**, **goals tabungan**, **tagihan berkala**, dan **insight AI**.

> Status: `v1.1`, berjalan di VPS pribadi (Docker). Database dev = database produksi, baca [Aturan penting](#aturan-penting) sebelum menyentuh migrasi.

---

## Daftar isi

- [Fitur](#fitur)
- [Tech stack](#tech-stack)
- [Struktur monorepo](#struktur-monorepo)
- [Arsitektur](#arsitektur)
- [Menjalankan di lokal](#menjalankan-di-lokal)
- [Environment variables](#environment-variables)
- [Perintah penting](#perintah-penting)
- [Bot Telegram](#bot-telegram)
- [AI](#ai)
- [Deploy](#deploy)
- [Aturan penting](#aturan-penting)
- [Konvensi kode](#konvensi-kode)

---

## Fitur

### Akun & akses
- Register → status **PENDING** → disetujui admin → baru bisa login.
- Role **ADMIN** (semua fitur user + manajemen user) dan **USER**.
- Admin bisa approve, reject, suspend, dan reactivate user; semua aksi tercatat di audit log. Admin **tidak** bisa melihat transaksi user lain.
- JWT access token + refresh token (opaque, SHA-256, rotasi + reuse detection) di cookie httpOnly. Rate limit di login & register.

### Dashboard & transaksi
- Dompet (Bank, E-wallet, Cash, **Investasi**); saldo **dihitung** dari transaksi, tidak disimpan.
- Transaksi pemasukan, pengeluaran, transfer antar dompet, dan **penyesuaian nilai** (untuk dompet investasi; tidak dihitung sebagai pemasukan/pengeluaran).
- Kategori sistem + kategori custom per user.
- Ringkasan periode, pengeluaran per kategori, tren 6 periode.
- **Periode keuangan mengikuti tanggal gajian** (mis. 25 Okt – 24 Nov), diatur per user.
- **Pembagian biaya** ke N periode (mis. kos per 3 bulan, asuransi tahunan) agar laporan tidak melonjak.

### Tabungan
- **Goals**: Dana Darurat (target manual atau N × rata-rata pengeluaran), Investasi, custom. Progres, sisa, estimasi waktu tercapai.
- Setor/tarik dengan **transfer antar dompet otomatis** (atomik).
- **Alokasi gaji berfase**: Fase 1 (isi dana darurat) dan Fase 2 (investasi penuh), realisasi dihitung otomatis dari transaksi.
- **Checklist gajian**: saat gaji dicatat, bot/web menawarkan aksi sekali tekan (setor tabungan, catat perpuluhan, bayar tagihan).

### Tagihan berkala
- Tagihan bulanan / per N bulan / tahunan, dengan cadangan virtual per periode dan "uang bebas".
- Pengingat Telegram H-7 dan H-1 pukul 08:00 WIB.

### Investasi
- Dompet tipe Investasi dengan **Perbarui nilai** (nilai pasar), modal, dan untung/rugi belum direalisasi.

### Bot Telegram
- Input bahasa sehari-hari: `makan siang 35rb`, `bensin 20k`, `gaji 8,5jt cimb`, `transfer 500rb bca ke gopay`, `kemarin parkir 5000`, multi-baris.
- Selalu **draft + konfirmasi** (Simpan / Kategori / Dompet / Tanggal / Batal); belajar dari koreksi kategori.
- **Foto struk** → OCR → draft otomatis.
- Pertanyaan bebas (`/tanya berapa pengeluaran makan periode ini?`) dan insight (`/insight`).

### AI
- Parsing teks bebas (fallback setelah parser aturan), ekstraksi struk, chat dengan tool calling ke data user, insight periode + rekomendasi.
- Statistik dihitung di kode; LLM hanya menarasikan. LLM tidak pernah menulis SQL.

---

## Tech stack

| Layer | Teknologi |
|---|---|
| Monorepo | pnpm workspaces |
| Backend | NestJS 10, TypeScript, Prisma, PostgreSQL 16 |
| Frontend | React, Vite, Tailwind, TanStack Query, Recharts, react-hook-form |
| Shared | Zod schemas, util uang (BigInt Rupiah), parser transaksi, util periode |
| Bot | grammY (polling / webhook) |
| AI | OpenAI-compatible endpoint (9router), tesseract.js + sharp untuk OCR |
| Job | @nestjs/schedule |
| Test | Jest (api), Vitest (web, shared) |
| Deploy | Docker multi-stage, nginx (web + proxy `/api`), docker compose |

---

## Struktur monorepo

```
.
├── apps/
│   ├── api/                  # NestJS
│   │   ├── prisma/           # schema.prisma, migrations, seed
│   │   └── src/
│   │       ├── common/       # guards, decorators, pipes, types
│   │       └── modules/      # auth, users, admin, wallets, categories,
│   │                         # transactions, dashboard, savings, allocation,
│   │                         # bills, bot (core + adapters), ai, ...
│   └── web/                  # React + Vite
│       └── src/features/     # per fitur: api.ts, hooks.ts, components/, *Page.tsx
├── packages/
│   └── shared/               # Zod schemas, money/date/period utils, parser
├── deploy/                   # compose prod, env example, backup/restore/deploy scripts
├── docs/
│   └── DEPLOY.md             # runbook server
├── .claude/skills/           # skill untuk Claude Code
└── CLAUDE.md                 # aturan proyek untuk AI coding assistant
```

---

## Arsitektur

```
 HP (Telegram) ──► Bot (grammY adapter) ──► BotCore ─┐
                                                     ├──► Services (domain) ──► Repositories ──► PostgreSQL
 Browser ──► nginx (web) ──► /api ──► Controllers ───┘          │
                                                                └──► LlmClient ──► 9router (Qwen)
```

- **Controller** hanya HTTP; **Service** berisi logika bisnis; **Repository** satu-satunya yang menyentuh Prisma.
- Bot dibangun channel-agnostic (`BotCore` + `ChannelAdapter`), sehingga WhatsApp bisa ditambahkan tanpa mengubah core.
- Semua query data user difilter `userId` dari JWT, bukan dari body.

---

## Menjalankan di lokal

### Prasyarat
- Node.js 24 (`nvm alias default 24`) dan pnpm (`npm i -g pnpm`)
- Akses SSH ke VPS database (PostgreSQL **tidak** diinstal di lokal)
- Docker Desktop (hanya untuk uji image)

### Langkah

```bash
# 1. Tunnel ke database (biarkan terbuka)
ssh -N -L 5433:127.0.0.1:5432 <user>@<vps>

# 2. Install & build shared
pnpm install
pnpm build:shared

# 3. Env
cp apps/api/.env.example apps/api/.env   # isi nilainya, lihat bagian env

# 4. Jalankan
pnpm --filter api dev    # http://localhost:3000/api
pnpm --filter web dev    # http://localhost:5173 (proxy /api → 3000)
```

> Bot dev memakai **token bot terpisah** dari produksi. Jangan pernah memakai token produksi di lokal (dua instance polling dengan token sama akan saling bentrok).

---

## Environment variables

Lihat `apps/api/.env.example` (dev) dan `deploy/.env.prod.example` (produksi) untuk daftar lengkap.

| Variabel | Keterangan |
|---|---|
| `DATABASE_URL` | Dev: `...@localhost:5433/finance_app`; prod: `...@master_postgresql:5432/finance_app` |
| `JWT_SECRET`, `JWT_REFRESH_SECRET` | Secret acak; beda antara dev dan prod |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Hanya untuk seed awal |
| `COOKIE_SECURE`, `TRUST_PROXY`, `APP_URL` | Sesuaikan dengan HTTP/HTTPS dan reverse proxy |
| `LLM_BASE_URL`, `LLM_MODEL`, `LLM_API_KEY` | Endpoint OpenAI-compatible |
| `RECEIPT_PARSER` | `ocr` (default) atau `vision` |
| `RECEIPT_VISION_MODEL` | Opsional, hanya untuk `vision` |
| `RECEIPT_STORAGE_DIR` | Lokasi file struk |
| `TELEGRAM_BOT_TOKEN` | Kosong = bot dilewati |
| `TELEGRAM_MODE` | `polling` atau `webhook` |
| `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_WEBHOOK_URL` | Hanya untuk mode webhook (butuh HTTPS) |
| `TELEGRAM_LINK_SECRET` | Hashing kode `/link` |

File `.env` dan `deploy/.env.prod` **tidak pernah di-commit**.

---

## Perintah penting

```bash
# Verifikasi (wajib lulus sebelum commit/rilis)
pnpm lint && pnpm typecheck && pnpm -r test
pnpm --filter api build && pnpm --filter web build

# Database (BACKUP DULU, lihat aturan penting)
deploy/backup-dev.sh
pnpm --filter api prisma migrate dev --name <nama_migrasi>
pnpm --filter api prisma studio
```

---

## Bot Telegram

| Perintah | Fungsi |
|---|---|
| `/start`, `/help` | Sapaan & bantuan |
| `/link <kode>`, `/unlink` | Hubungkan/putuskan akun (kode dari halaman Pengaturan) |
| `/saldo` | Saldo per dompet |
| `/hariini`, `/bulanini` | Ringkasan hari ini / periode ini |
| `/alokasi`, `/tabungan` | Status alokasi gaji & goals |
| `/investasi` | Nilai, modal, untung/rugi dompet investasi |
| `/tagihan` | Tagihan jatuh tempo & cadangan |
| `/tanya <pertanyaan>` | Tanya AI tentang data keuanganmu |
| `/insight` | Insight & rekomendasi periode |
| `/undo`, `/batal` | Batalkan transaksi terakhir / buang draft |

Selain perintah, kirim teks transaksi atau foto struk langsung ke bot.

Keamanan: hanya private chat, satu chat ↔ satu akun, kode link sekali pakai (10 menit), penguncian 15 menit setelah 5 kode salah (bisa dibuka admin).

---

## AI

- Semua panggilan lewat satu `LlmClient` (timeout, retry, strip `<think>`, catat pemakaian token).
- Output terstruktur divalidasi Zod; gagal → retry 1× → pesan ramah.
- Kuota per user per fitur (chat, insight, struk, parsing) via env.
- Jika LLM tidak tersedia, fitur non-AI (parser aturan, input manual) tetap berjalan.
- Prompt disimpan di `apps/api/src/modules/ai/prompts/*.md`.

---

## Deploy

Ringkas (detail lengkap di **[docs/DEPLOY.md](docs/DEPLOY.md)**):

- Dua container: `dfv2-api` (tanpa port ke host) dan `dfv2-web` (nginx, satu-satunya port terbuka).
- Database memakai container `master_postgresql` di network `master_db_net`.
- Update rutin di server:

```bash
cd /home/dashboardfinance-v2
deploy/backup.sh
deploy/deploy.sh          # pull → build → backup → migrate deploy → up → health check
curl -fsS http://127.0.0.1:8098/api/health
```

- Backup harian via cron (rotasi 14 hari), restore dengan `deploy/restore.sh`.
- Rollback: checkout tag sebelumnya lalu rebuild (lihat runbook).

---

## Aturan penting

1. **Database dev = database produksi.** Sebelum `migrate dev`, jalankan `deploy/backup-dev.sh`. **Jangan pernah** menyetujui reset database. Migrasi destruktif (drop/rename kolom berisi data) harus ditinjau dan disetujui eksplisit.
2. Uji end-to-end memakai **user uji sementara**, lalu hapus; jangan menulis ke data asli.
3. Nominal uang selalu **BigInt Rupiah**, tidak pernah float.
4. Tidak ada secret di repo, log, atau output. Rotasi segera jika pernah terpapar.
5. Hanya satu instance API per token bot (jangan scale `dfv2-api`).

---

## Konvensi kode

- Modul backend: `module`, `controller`, `service`, `repository`, `dto/`, `*.spec.ts` (lihat skill `new-module`).
- Validasi input dengan Zod dari `packages/shared` via `ZodValidationPipe`.
- Exception NestJS dibiarkan naik dari service; pesan error ke client dalam Bahasa Indonesia.
- Response tidak pernah memuat field sensitif (mis. `passwordHash`), pakai mapper/select eksplisit.
- Frontend per fitur: `api.ts` → `hooks.ts` (TanStack Query) → komponen → halaman; dark theme dengan design tokens; wajib berfungsi di lebar 375px.
- Detail aturan untuk AI coding assistant ada di [`CLAUDE.md`](CLAUDE.md) dan `.claude/skills/`.