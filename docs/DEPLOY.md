# Deploy DashboardFinance v2 ke VPS

Panduan ini dijalankan **oleh kamu** di server. Semua perintah siap salin-tempel. Ganti nilai `GANTI_...`.

- Akses: `http://148.230.97.68:8098` (HTTP, tanpa domain/HTTPS untuk saat ini).
- Project compose: `dashboardfinance-v2`, container `dfv2-api` dan `dfv2-web`.
- Satu-satunya port terbuka: `WEB_PORT` (default 8098) di `dfv2-web`. `dfv2-api` tidak punya port ke host.
- Database: `finance_app` di container `master_postgresql` (network `master_db_net`). **Database dev = produksi.**

> **Jangan scale `dfv2-api` lebih dari 1.** Bot Telegram mode polling hanya boleh satu instance per token. Jangan pakai token produksi di Mac.

## Pertama kali

### 1. Deploy key read-only GitHub dan clone

```bash
ssh-keygen -t ed25519 -f ~/.ssh/dashboardfinance_deploy -N "" -C "dashboardfinance-v2 deploy"
cat ~/.ssh/dashboardfinance_deploy.pub
```

Tambahkan kunci publik di GitHub: repo → Settings → Deploy keys → Add (**jangan** centang "Allow write access"). Lalu:

```bash
cat >> ~/.ssh/config <<'CFG'
Host github-dfv2
  HostName github.com
  User git
  IdentityFile ~/.ssh/dashboardfinance_deploy
  IdentitiesOnly yes
CFG
git clone git@github-dfv2:GANTI_OWNER/GANTI_REPO.git /home/dashboardfinance-v2
cd /home/dashboardfinance-v2
git checkout fase-7   # atau tag/branch yang akan dirilis
```

### 2. Siapkan `deploy/.env.prod`

```bash
cd /home/dashboardfinance-v2
cp deploy/.env.prod.example deploy/.env.prod
chmod 600 deploy/.env.prod
openssl rand -base64 48        # hasilnya untuk JWT_SECRET
nano deploy/.env.prod          # isi DATABASE_URL, JWT_SECRET, LLM_API_KEY, TELEGRAM_BOT_TOKEN
```

Catatan:
- `JWT_SECRET` **baru**: semua sesi lama otomatis logout.
- `COOKIE_SECURE=false` dan `TRUST_PROXY=false` sudah benar untuk HTTP tanpa proxy. API akan mencatat WARNING saat start; itu disengaja.
- `APP_URL` harus persis `http://148.230.97.68:8098`.
- File ini tidak pernah di-commit.

### 3. Cek port 8098 kosong

```bash
ss -ltnp | grep -E ':8098\b' || echo "8098 kosong, aman"
```

Kalau terpakai, ubah `WEB_PORT` (dan `APP_URL` yang ikut) di `.env.prod`.

### 4. Firewall dan port database

Docker menulis aturan iptables sendiri sehingga **mem-bypass `ufw`**: port yang di-publish tetap terbuka ke internet walau `ufw` menutupnya. Konsekuensinya:

- Port **8098 akan terbuka publik**. Itu memang tujuannya, tapi artinya login dan API terjangkau siapa pun. Rate limit login aktif; pakai password admin kuat.
- Pastikan Postgres **tidak** terbuka ke publik. Cek bind port 5432:

```bash
docker port master_postgresql
ss -ltnp | grep ':5432\b'
```

Hasil yang benar: `127.0.0.1:5432` (atau tidak ada publish sama sekali). Kalau `0.0.0.0:5432`, ubah di compose master-db dari `"5432:5432"` menjadi `"127.0.0.1:5432:5432"`, lalu `docker compose up -d` di project itu. **Perhatian:** tunnel SSH dari Mac ke DB tetap jalan karena tunnel menuju `127.0.0.1` di server. Jangan restart master_postgresql saat jam sibuk; lakukan backup dulu (langkah 5).

### 5. Backup (wajib sebelum migrate)

```bash
cd /home/dashboardfinance-v2
mkdir -p /home/backups/dashboardfinance
deploy/backup.sh
ls -lh /home/backups/dashboardfinance
```

### 6. Build

```bash
export GIT_COMMIT=$(git rev-parse --short HEAD)
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env.prod build api web
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env.prod --profile tools build migrate
```

### 7. Migrate (terpisah, tidak otomatis saat boot)

Cek dulu apa yang akan diterapkan:

```bash
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env.prod --profile tools run --rm migrate pnpm exec prisma migrate status
```

Tampilkan migrasi yang pending dan pastikan tidak destruktif (DROP/ALTER yang menghapus data). Kalau aman:

```bash
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env.prod --profile tools run --rm migrate
```

Jangan pernah memakai `migrate reset` atau `db push --force-reset`.

### 8. Jalankan

```bash
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env.prod up -d api web
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env.prod ps
```

### 9. Cek health dan login

```bash
curl -fsS http://127.0.0.1:8098/api/health
```

Hasil benar: `{"status":"ok","db":"up","version":"<commit>"}`. Lalu buka `http://148.230.97.68:8098`, login, refresh halaman (harus tetap login).

### 10. Admin baru dan nonaktifkan admin lama

Skrip menolak password < 12 karakter dan email `.local`. Password tidak dicetak.

```bash
cd /home/dashboardfinance-v2
read -rsp "Password admin baru: " NEW_PW; echo
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env.prod --profile tools run --rm \
  -e NEW_ADMIN_EMAIL=GANTI_EMAIL_ASLI -e NEW_ADMIN_PASSWORD="$NEW_PW" create-admin
unset NEW_PW
```

Login dengan admin baru di web, pastikan bisa masuk halaman admin. **Baru setelah itu** nonaktifkan admin lama (skrip menolak jika itu satu-satunya admin aktif; semua sesinya dicabut):

```bash
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env.prod --profile tools run --rm create-admin --deactivate admin@finance.local
```

### 11. Bot Telegram (polling)

```bash
docker logs --tail 50 dfv2-api | grep -iE "telegram|bot|polling"
```

Kirim `/saldo` dari akun yang sudah ter-link. Kalau bot tidak merespons dan ada error 409 "terminated by other getUpdates", ada instance lain yang memakai token yang sama (mis. app versi lama): matikan dulu (langkah 13).

### 12. Cron backup harian

```bash
( crontab -l 2>/dev/null; echo '30 2 * * * cd /home/dashboardfinance-v2 && deploy/backup.sh >> /home/backups/dashboardfinance/backup.log 2>&1' ) | crontab -
crontab -l
```

Cek zona waktu server (`timedatectl`). Jika UTC, 02:30 WIB = `30 19 * * *`. Backup lebih dari 14 hari dihapus otomatis.

### 13. Matikan versi lama (opsional, setelah v2 terbukti jalan)

```bash
docker compose -p finance-dashboard ps
docker compose -p finance-dashboard stop      # berhenti dulu, jangan `down -v`
```

Biarkan beberapa hari. Baru hapus bila yakin: `docker compose -p finance-dashboard down` (tanpa `-v`).

## Operasi rutin

### Update

```bash
cd /home/dashboardfinance-v2
deploy/deploy.sh
```

`deploy.sh`: `git pull --ff-only` → build → backup → `migrate deploy` → `up -d` → tunggu `/api/health`. Berhenti di kegagalan pertama dengan pesan jelas dan versi sebelumnya.

### Rollback ke tag/commit sebelumnya

Rollback kode (skema DB tidak ikut mundur otomatis; migrasi bersifat maju):

```bash
cd /home/dashboardfinance-v2
git fetch --tags
git checkout fase-6      # tag/commit sebelumnya
export GIT_COMMIT=$(git rev-parse --short HEAD)
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env.prod up -d --build api web
curl -fsS http://127.0.0.1:8098/api/health
```

Kalau migrasi terbaru juga harus dibatalkan, restore dari backup yang dibuat sebelum deploy tersebut:

```bash
deploy/restore.sh /home/backups/dashboardfinance/finance_app-YYYYmmdd-HHMMSS.dump [receipts-YYYYmmdd-HHMMSS.tar.gz]
```

Skrip meminta kamu mengetik ulang nama database, membuat backup pengaman, menghentikan api, lalu restore.

### Log

```bash
docker logs -f --tail 100 dfv2-api
docker logs -f --tail 100 dfv2-web
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env.prod ps
```

### Backup manual dan backup dari Mac (sebelum `migrate dev`)

Di server: `deploy/backup.sh`. Di Mac (tunnel 5433 harus hidup, Docker Desktop menyala):

```bash
deploy/backup-dev.sh
```

Hasil: `~/backups/dashboardfinance-dev/finance_app-<waktu>.dump`.

## Upgrade ke HTTPS nanti

1. Arahkan domain/subdomain (A record) ke `148.230.97.68`. Buka port 80 dan 443.
2. Pasang Caddy di depan `dfv2-web` (auto Let's Encrypt). Contoh `Caddyfile`:

   ```
   finance.contoh.com {
     reverse_proxy dfv2-web:80
   }
   ```

   Jalankan Caddy di network yang sama dengan `dfv2-web` (`dashboardfinance-v2_internal`), lalu hapus `ports` dari `web` (atau bind ke `127.0.0.1`) supaya 8098 tidak lagi terbuka publik.
3. Ubah `deploy/.env.prod`:
   - `COOKIE_SECURE=true`
   - `TRUST_PROXY=true`
   - `APP_URL=https://finance.contoh.com`
4. `docker compose ... up -d api web`. Semua sesi perlu login ulang.
5. Opsional pindah bot ke webhook: `TELEGRAM_MODE=webhook`, isi `TELEGRAM_WEBHOOK_SECRET` dan `TELEGRAM_WEBHOOK_URL=https://finance.contoh.com/api/telegram/webhook`.

## Checklist keamanan

- [ ] `deploy/.env.prod` berizin `600`, tidak ada di git (`git status` bersih).
- [ ] Secret yang pernah terpapar dirotasi: `JWT_SECRET` (sudah baru), `LLM_API_KEY`, `TELEGRAM_BOT_TOKEN` (bila pernah tertempel di chat/log), password DB `finance_app` jika ragu.
- [ ] Tidak ada admin default: `admin@finance.local` dinonaktifkan (langkah 10).
- [ ] Port 5432 `master_postgresql` hanya di `127.0.0.1` (langkah 4).
- [ ] Hanya port 8098 yang terbuka dari proyek ini; `dfv2-api` tanpa port ke host: `docker ps --format '{{.Names}} {{.Ports}}' | grep dfv2`.
- [ ] Endpoint dev/simulate mati: `curl -i -X POST http://127.0.0.1:8098/api/dev/bot/simulate` → 404.
- [ ] Cron backup terpasang dan dump terbaru bisa dibaca (`deploy/backup.sh` memvalidasi dengan `pg_restore --list`).
- [ ] Uji restore ke database sementara minimal sekali sebelum bergantung pada backup.
- [ ] Setelah HTTPS dipasang: `COOKIE_SECURE=true`, `TRUST_PROXY=true`, port 8098 ditutup.
