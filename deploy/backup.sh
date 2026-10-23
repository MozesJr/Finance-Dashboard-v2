#!/usr/bin/env bash
# Backup produksi: dump DB (format custom, terkompresi) + arsip volume struk. Jalankan di VPS.
#   deploy/backup.sh
# Crontab harian 02:30 WIB (VPS pakai UTC => 19:30 UTC hari sebelumnya):
#   30 19 * * * cd /home/dashboardfinance-v2 && deploy/backup.sh >> /home/backups/dashboardfinance/backup.log 2>&1
# Atau jika zona waktu server sudah Asia/Jakarta:
#   30 2 * * * cd /home/dashboardfinance-v2 && deploy/backup.sh >> /home/backups/dashboardfinance/backup.log 2>&1
set -Eeuo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_lib.sh
. "$HERE/_lib.sh"
trap 'die "Backup gagal di baris $LINENO. Tidak ada rotasi yang dilakukan."' ERR

ENV_FILE="${ENV_FILE:-$HERE/.env.prod}"
DB_CONTAINER="${DB_CONTAINER:-master_postgresql}"
BACKUP_DIR="${BACKUP_DIR:-/home/backups/dashboardfinance}"
KEEP_DAYS="${KEEP_DAYS:-14}"
RECEIPTS_VOLUME="${RECEIPTS_VOLUME:-dashboardfinance-v2_receipts}"

[ -f "$ENV_FILE" ] || die "File env tidak ada: $ENV_FILE"
DATABASE_URL="$(grep -E '^DATABASE_URL=' "$ENV_FILE" | head -1 | cut -d= -f2-)"
[ -n "$DATABASE_URL" ] || die "DATABASE_URL kosong di $ENV_FILE"
DB_USER="$(db_url_part "$DATABASE_URL" user)"
DB_NAME="$(db_url_part "$DATABASE_URL" db)"
export PGPASSWORD
PGPASSWORD="$(db_url_part "$DATABASE_URL" password)"
[ -n "$DB_USER" ] && [ -n "$DB_NAME" ] || die "Gagal membaca user/db dari DATABASE_URL"

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
DUMP="$BACKUP_DIR/${DB_NAME}-${STAMP}.dump"

info "Dump $DB_NAME dari container $DB_CONTAINER"
docker exec -e PGPASSWORD "$DB_CONTAINER" pg_dump -h 127.0.0.1 -U "$DB_USER" -d "$DB_NAME" -Fc > "$DUMP.tmp"
# Validasi: dump harus bisa dibaca pg_restore sebelum dianggap sah.
docker exec -i "$DB_CONTAINER" pg_restore --list < "$DUMP.tmp" > /dev/null
mv "$DUMP.tmp" "$DUMP"
chmod 600 "$DUMP"
info "DB  : $DUMP ($(du -h "$DUMP" | cut -f1))"

if docker volume inspect "$RECEIPTS_VOLUME" > /dev/null 2>&1; then
  RCP="$BACKUP_DIR/receipts-${STAMP}.tar.gz"
  docker run --rm -v "$RECEIPTS_VOLUME":/data:ro -v "$BACKUP_DIR":/backup alpine:3.20 \
    tar czf "/backup/$(basename "$RCP")" -C /data .
  chmod 600 "$RCP"
  info "Struk: $RCP ($(du -h "$RCP" | cut -f1))"
else
  info "Volume $RECEIPTS_VOLUME belum ada, arsip struk dilewati."
fi

# Rotasi hanya setelah backup baru sukses.
find "${BACKUP_DIR:?}" -maxdepth 1 -type f \( -name '*.dump' -o -name 'receipts-*.tar.gz' \) -mtime "+$KEEP_DAYS" -print -delete
info "Selesai. Backup lebih lama dari $KEEP_DAYS hari dihapus."
