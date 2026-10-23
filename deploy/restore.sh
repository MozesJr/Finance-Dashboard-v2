#!/usr/bin/env bash
# Restore DB produksi dari dump. DESTRUKTIF: menimpa isi database. Jalankan di VPS.
#   deploy/restore.sh /home/backups/dashboardfinance/finance_app-YYYYmmdd-HHMMSS.dump [receipts-YYYYmmdd-HHMMSS.tar.gz]
set -Eeuo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_lib.sh
. "$HERE/_lib.sh"
trap 'die "Restore gagal di baris $LINENO. Cek log; backup pengaman ada di BACKUP_DIR."' ERR

DUMP="${1:-}"
RECEIPTS_TAR="${2:-}"
[ -n "$DUMP" ] && [ -f "$DUMP" ] || die "Pakai: restore.sh <file.dump> [receipts.tar.gz]"
ENV_FILE="${ENV_FILE:-$HERE/.env.prod}"
DB_CONTAINER="${DB_CONTAINER:-master_postgresql}"
RECEIPTS_VOLUME="${RECEIPTS_VOLUME:-dashboardfinance-v2_receipts}"
COMPOSE=(docker compose -f "$HERE/docker-compose.prod.yml" --env-file "$ENV_FILE")

DATABASE_URL="$(grep -E '^DATABASE_URL=' "$ENV_FILE" | head -1 | cut -d= -f2-)"
DB_USER="$(db_url_part "$DATABASE_URL" user)"
DB_NAME="$(db_url_part "$DATABASE_URL" db)"
export PGPASSWORD
PGPASSWORD="$(db_url_part "$DATABASE_URL" password)"

echo "Ini akan MENIMPA database '$DB_NAME' dengan isi: $DUMP"
read -r -p "Ketik ulang nama database untuk melanjutkan: " CONFIRM
[ "$CONFIRM" = "$DB_NAME" ] || die "Nama tidak cocok. Dibatalkan, tidak ada yang diubah."

info "Backup pengaman dulu"
"$HERE/backup.sh"

info "Hentikan api (hindari tulis saat restore)"
docker stop dfv2-api > /dev/null 2>&1 || true

info "Restore DB"
docker exec -i -e PGPASSWORD "$DB_CONTAINER" \
  pg_restore -h 127.0.0.1 -U "$DB_USER" -d "$DB_NAME" --clean --if-exists --no-owner --no-privileges < "$DUMP"

if [ -n "$RECEIPTS_TAR" ]; then
  [ -f "$RECEIPTS_TAR" ] || die "Arsip struk tidak ditemukan: $RECEIPTS_TAR"
  info "Restore volume struk"
  docker run --rm -v "$RECEIPTS_VOLUME":/data -v "$(dirname "$(readlink -f "$RECEIPTS_TAR")")":/backup:ro alpine:3.20 \
    sh -c "cd /data && tar xzf /backup/$(basename "$RECEIPTS_TAR")"
fi

info "Nyalakan api lagi"
"${COMPOSE[@]}" up -d api web
info "Selesai. Cek: curl -fsS http://127.0.0.1:\${WEB_PORT:-8098}/api/health"
