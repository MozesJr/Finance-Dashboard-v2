# Fungsi bersama deploy/*.sh (di-source, bukan dijalankan langsung). Murni bash: VPS tidak wajib punya Node.

# Ambil satu komponen dari URL postgresql://user:pass@host:port/db (user|password|host|port|db).
# Password boleh percent-encoded. Tidak pernah dicetak kecuali diminta lewat `password`.
db_url_part() {
  local url="$1" part="$2" rest creds hostpart user pass hostport host port db
  rest="${url#*://}"
  creds="${rest%@*}"
  hostpart="${rest##*@}"
  user="${creds%%:*}"
  pass="${creds#*:}"
  hostport="${hostpart%%/*}"
  host="${hostport%%:*}"
  port="${hostport#*:}"
  [ "$port" = "$hostport" ] && port=5432
  db="${hostpart#*/}"
  db="${db%%\?*}"
  case "$part" in
    user) printf '%s' "$user" ;;
    password) local esc='\x'; printf '%b' "${pass//%/$esc}" ;;
    host) printf '%s' "$host" ;;
    port) printf '%s' "$port" ;;
    db) printf '%s' "$db" ;;
  esac
}

die() { echo "❌ $*" >&2; exit 1; }
info() { echo "▶ $*"; }
