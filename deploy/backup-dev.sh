#!/usr/bin/env bash
# Backup DB lewat tunnel dari Mac. WAJIB dijalankan sebelum `prisma migrate dev` (database dev = produksi).
#   deploy/backup-dev.sh            # tunnel di localhost:5433, kredensial dari apps/api/.env
# Memakai pg_dump di dalam container (tidak perlu psql di Mac); butuh Docker Desktop menyala.
set -Eeuo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_lib.sh
. "$HERE/_lib.sh"
trap 'die "Backup dev gagal di baris $LINENO."' ERR

ENV_FILE="${ENV_FILE:-$HERE/../apps/api/.env}"
OUT_DIR="${OUT_DIR:-$HOME/backups/dashboardfinance-dev}"
[ -f "$ENV_FILE" ] || die "File env tidak ada: $ENV_FILE"
DATABASE_URL="$(grep -E '^DATABASE_URL=' "$ENV_FILE" | head -1 | cut -d= -f2-)"
DB_USER="$(db_url_part "$DATABASE_URL" user)"
DB_NAME="$(db_url_part "$DATABASE_URL" db)"
DB_PORT="$(db_url_part "$DATABASE_URL" port)"
export PGPASSWORD
PGPASSWORD="$(db_url_part "$DATABASE_URL" password)"

# Tunnel harus hidup (localhost:$DB_PORT).
(exec 3<>"/dev/tcp/127.0.0.1/$DB_PORT") 2>/dev/null || die "Tunnel di localhost:$DB_PORT tidak aktif. Nyalakan dulu."

mkdir -p "$OUT_DIR"
chmod 700 "$OUT_DIR"
FILE="$OUT_DIR/${DB_NAME}-$(date +%Y%m%d-%H%M%S).dump"
docker run --rm -e PGPASSWORD postgres:17-alpine \
  pg_dump -h host.docker.internal -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -Fc > "$FILE.tmp"
[ -s "$FILE.tmp" ] || die "Dump kosong."
mv "$FILE.tmp" "$FILE"
chmod 600 "$FILE"
info "Backup dev tersimpan: $FILE ($(du -h "$FILE" | cut -f1))"
