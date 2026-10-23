#!/usr/bin/env bash
# Deploy rutin di VPS: pull -> build -> backup -> migrate deploy -> up -> tunggu health. Berhenti di kegagalan pertama.
#   deploy/deploy.sh
set -Eeuo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
# shellcheck source=_lib.sh
. "$HERE/_lib.sh"
STEP="awal"
PREV="$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo '?')"
trap 'echo "❌ Deploy BERHENTI saat: $STEP (baris $LINENO). Versi sebelumnya: $PREV. Rollback: lihat docs/DEPLOY.md." >&2' ERR

ENV_FILE="${ENV_FILE:-$HERE/.env.prod}"
[ -f "$ENV_FILE" ] || die "File env tidak ada: $ENV_FILE (salin dari .env.prod.example)"
COMPOSE=(docker compose -f "$HERE/docker-compose.prod.yml" --env-file "$ENV_FILE")
WEB_PORT="$(grep -E '^WEB_PORT=' "$ENV_FILE" | head -1 | cut -d= -f2- || true)"
WEB_PORT="${WEB_PORT:-8098}"

STEP="git pull"; info "$STEP"
git -C "$ROOT" pull --ff-only
export GIT_COMMIT
GIT_COMMIT="$(git -C "$ROOT" rev-parse --short HEAD)"
info "Versi target: $GIT_COMMIT (sebelumnya: $PREV)"

STEP="build image"; info "$STEP"
"${COMPOSE[@]}" build api web
"${COMPOSE[@]}" --profile tools build migrate

STEP="backup"; info "$STEP"
"$HERE/backup.sh"

STEP="prisma migrate deploy"; info "$STEP"
"${COMPOSE[@]}" --profile tools run --rm migrate

STEP="up -d"; info "$STEP"
"${COMPOSE[@]}" up -d api web

STEP="tunggu /api/health"; info "$STEP"
for i in $(seq 1 30); do
  if BODY="$(curl -fsS "http://127.0.0.1:${WEB_PORT}/api/health" 2>/dev/null)"; then
    echo "✅ Sehat: $BODY"
    echo "Versi berjalan: $GIT_COMMIT"
    exit 0
  fi
  sleep 3
done
"${COMPOSE[@]}" logs --tail 50 api >&2 || true
die "Health check tidak OK setelah 90 detik. Log api ada di atas."
