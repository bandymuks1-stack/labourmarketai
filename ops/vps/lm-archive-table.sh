#!/bin/sh
# Archive rows of one Supabase table to the VPS as age-ENCRYPTED gzip JSONL, through PostgREST with the
# service-role key the container already holds (read from /root/lm-prod/env into a 0600 header file —
# never argv). No new secret, no DB password. Used BEFORE any production prune (owner-approved only).
#
#   sh lm-archive-table.sh <table> "<postgrest filter>" <name>        # e.g. public_vacancies "or=(is_active.eq.false,expires_at.lt.2026-10-17T00:00:00Z)" vacancies-dead
#   sh lm-archive-table.sh --verify <archive.jsonl.gz.age>             # decrypt with the VPS private key, count + validate JSON lines
#   sh lm-archive-table.sh --grep <archive> <text>                       # read the cold data in place (no restore)
#   sh lm-archive-table.sh --restore <archive> <table> <on_conflict cols> [max_rows] [merge|ignore]   # upsert back into Supabase
#
# Output: /root/lm-prod/backups/archive-<name>-<stamp>.jsonl.gz.age (600) + .sha256 + a count line. Prints no values.
set -eu
umask 077
D=/root/lm-prod; BK=$D/backups; ENVF=$D/env; KEY=$D/backup.age.key; PUB=$D/bin/backup.age.pub
mkdir -p "$BK"; chmod 700 "$BK"
if [ "${1:-}" = "--verify" ]; then
  F="${2:?archive path}"; [ -f "$F" ] || { echo "STOP: $F missing"; exit 1; }
  sha=$(sha256sum "$F" | cut -d' ' -f1); [ "$sha" = "$(cut -d' ' -f1 "$F.sha256")" ] && echo "sha256 OK" || { echo "STOP: sha256 mismatch"; exit 1; }
  n=$(age -d -i "$KEY" "$F" | gunzip | awk 'BEGIN{bad=0} { if ($0 !~ /^\{.*\}$/) bad++ } END { print NR" lines, "bad" malformed" }')
  echo "verify: $n"; exit 0
fi
if [ "${1:-}" = "--grep" ]; then
  # Read the cold data without restoring it: decrypt on the fly, case-insensitive fixed-string match, max 50 lines.
  F="${2:?archive path}"; PAT="${3:?pattern}"; age -d -i "$KEY" "$F" | gunzip | grep -iF -m 50 -- "$PAT"; exit 0
fi
if [ "${1:-}" = "--restore" ]; then
  # Restore archived rows into Supabase through PostgREST upsert on the table's unique key (idempotent:
  # rows that already exist are merged, not duplicated). --restore <archive> <table> <on_conflict cols> [max_rows] [merge|ignore]
  # `ignore` (resolution=ignore-duplicates) inserts only the rows that are ABSENT and never overwrites a
  # row that changed after the archive — the mode for undoing a prune of a table that keeps being written.
  F="${2:?archive path}"; TABLE="${3:?table}"; ONC="${4:?on_conflict columns}"; MAX="${5:-0}"; MODE="${6:-merge}"
  case "$MODE" in merge) RES=merge-duplicates;; ignore) RES=ignore-duplicates;; *) echo "STOP: mode is merge or ignore"; exit 1;; esac
  case "$TABLE$ONC" in *[!a-zA-Z0-9_,]*) echo "STOP: bad table/columns"; exit 1;; esac
  URL=$(sed -n 's/^NEXT_PUBLIC_SUPABASE_URL=//p' "$ENVF")
  T=$(mktemp -d "$D/.restore.XXXXXX"); trap 'rm -rf "$T"' EXIT INT TERM
  sed -n 's/^SUPABASE_SERVICE_ROLE_KEY=\(.*\)$/apikey: \1/p' "$ENVF" > "$T/h1"
  sed -n 's/^SUPABASE_SERVICE_ROLE_KEY=\(.*\)$/Authorization: Bearer \1/p' "$ENVF" > "$T/h2"
  age -d -i "$KEY" "$F" | gunzip > "$T/rows.jsonl"
  [ "$MAX" -gt 0 ] 2>/dev/null && head -n "$MAX" "$T/rows.jsonl" > "$T/rows.lim" && mv "$T/rows.lim" "$T/rows.jsonl"
  total=$(wc -l < "$T/rows.jsonl"); done_rows=0
  split -l 500 -d -a 5 "$T/rows.jsonl" "$T/chunk."
  for c in "$T"/chunk.*; do
    python3 -c 'import json,sys; print(json.dumps([json.loads(l) for l in open(sys.argv[1],encoding="utf8") if l.strip()]))' "$c" > "$c.json"
    code=$(curl -s -o "$T/resp" -w '%{http_code}' -X POST -H @"$T/h1" -H @"$T/h2" -H 'content-type: application/json'       -H "Prefer: resolution=$RES, return=minimal" --data-binary @"$c.json" "$URL/rest/v1/$TABLE?on_conflict=$ONC")
    case "$code" in 200|201|204) ;; *) echo "STOP: PostgREST answered $code after $done_rows rows: $(head -c 200 "$T/resp")"; exit 1;; esac
    done_rows=$((done_rows+$(wc -l < "$c")))
  done
  echo "restored rows=$done_rows of $total into $TABLE (upsert on $ONC, $RES)"; exit 0
fi
TABLE="${1:?table}"; FILTER="${2:?postgrest filter}"; NAME="${3:?name}"
case "$TABLE$NAME" in *[!a-zA-Z0-9_-]*) echo "STOP: bad table/name"; exit 1;; esac
[ -f "$PUB" ] || { echo "STOP: $PUB missing (age public key)"; exit 1; }
URL=$(sed -n 's/^NEXT_PUBLIC_SUPABASE_URL=//p' "$ENVF"); [ -n "$URL" ] || { echo "STOP: no Supabase URL in env"; exit 1; }
T=$(mktemp -d "$D/.archive.XXXXXX"); trap 'rm -rf "$T"' EXIT INT TERM
sed -n 's/^SUPABASE_SERVICE_ROLE_KEY=\(.*\)$/apikey: \1/p' "$ENVF" > "$T/h1"
sed -n 's/^SUPABASE_SERVICE_ROLE_KEY=\(.*\)$/Authorization: Bearer \1/p' "$ENVF" > "$T/h2"
[ -s "$T/h1" ] || { echo "STOP: no service role key in env"; exit 1; }
STAMP=$(date -u +%Y%m%dT%H%M%SZ); OUT="$BK/archive-$NAME-$STAMP.jsonl.gz.age"
PAGE=1000; total=0; last=""
: > "$T/rows.jsonl"
# Keyset pagination on the primary key (id > last, order id asc): a deep OFFSET on a 600 MB table hit the
# statement timeout (PostgREST 500 at offset 7000 on 2026-10-17); a keyed page is an index seek.
while :; do
  if [ -n "$last" ]; then key="&id=gt.$last"; else key=""; fi
  tries=0
  while :; do
    code=$(curl -s -o "$T/page.json" -w '%{http_code}' -H @"$T/h1" -H @"$T/h2" -H "Prefer: count=none"       "$URL/rest/v1/$TABLE?select=*&order=id.asc&limit=$PAGE$key&$FILTER")
    case "$code" in 200|206) break;; 5*) tries=$((tries+1)); [ "$tries" -ge 5 ] && { echo "STOP: PostgREST answered $code five times after id $last"; exit 1; }; sleep $((tries*5));; *) echo "STOP: PostgREST answered $code after id $last"; exit 1;; esac
  done
  python3 -c 'import json,sys; rows=json.load(open(sys.argv[1])); [print(json.dumps(r,ensure_ascii=False,separators=(",",":"))) for r in rows]; print(len(rows), (rows[-1]["id"] if rows else ""), file=sys.stderr)' "$T/page.json" 2>"$T/n" >> "$T/rows.jsonl"
  got=$(cut -d' ' -f1 "$T/n"); last=$(cut -d' ' -f2 "$T/n"); total=$((total+got))
  echo "page: got=$got total=$total" >&2
  [ "$got" -lt "$PAGE" ] && break
done
gzip -9 -c "$T/rows.jsonl" > "$T/rows.jsonl.gz"
age -R "$PUB" -o "$OUT" "$T/rows.jsonl.gz"; chmod 600 "$OUT"
sha256sum "$OUT" > "$OUT.sha256"; chmod 600 "$OUT.sha256"
echo "archived table=$TABLE filter=\"$FILTER\" rows=$total bytes_gz=$(stat -c %s "$T/rows.jsonl.gz") file=$OUT"
echo "verify: $(sh "$0" --verify "$OUT" | tr '\n' ' ')"
