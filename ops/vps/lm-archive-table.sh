#!/bin/sh
# Archive rows of one Supabase table to the VPS as age-ENCRYPTED gzip JSONL, through PostgREST with the
# service-role key the container already holds (read from /root/lm-prod/env into a 0600 header file —
# never argv). No new secret, no DB password. Used BEFORE any production prune (owner-approved only).
#
#   sh lm-archive-table.sh <table> "<postgrest filter>" <name>        # e.g. public_vacancies "or=(is_active.eq.false,expires_at.lt.2026-10-17T00:00:00Z)" vacancies-dead
#   sh lm-archive-table.sh --verify <archive.jsonl.gz.age>             # decrypt with the VPS private key, count + validate JSON lines
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
TABLE="${1:?table}"; FILTER="${2:?postgrest filter}"; NAME="${3:?name}"
case "$TABLE$NAME" in *[!a-zA-Z0-9_-]*) echo "STOP: bad table/name"; exit 1;; esac
[ -f "$PUB" ] || { echo "STOP: $PUB missing (age public key)"; exit 1; }
URL=$(sed -n 's/^NEXT_PUBLIC_SUPABASE_URL=//p' "$ENVF"); [ -n "$URL" ] || { echo "STOP: no Supabase URL in env"; exit 1; }
T=$(mktemp -d "$D/.archive.XXXXXX"); trap 'rm -rf "$T"' EXIT INT TERM
sed -n 's/^SUPABASE_SERVICE_ROLE_KEY=\(.*\)$/apikey: \1/p' "$ENVF" > "$T/h1"
sed -n 's/^SUPABASE_SERVICE_ROLE_KEY=\(.*\)$/Authorization: Bearer \1/p' "$ENVF" > "$T/h2"
[ -s "$T/h1" ] || { echo "STOP: no service role key in env"; exit 1; }
STAMP=$(date -u +%Y%m%dT%H%M%SZ); OUT="$BK/archive-$NAME-$STAMP.jsonl.gz.age"
PAGE=1000; from=0; total=0
: > "$T/rows.jsonl"
while :; do
  to=$((from+PAGE-1))
  code=$(curl -s -o "$T/page.json" -w '%{http_code}' -H @"$T/h1" -H @"$T/h2" -H "Range: $from-$to" -H "Range-Unit: items" -H "Prefer: count=none" \
    "$URL/rest/v1/$TABLE?select=*&order=id.asc&$FILTER")
  case "$code" in 200|206) ;; *) echo "STOP: PostgREST answered $code at range $from-$to"; exit 1;; esac
  n=$(python3 -c 'import json,sys; rows=json.load(open(sys.argv[1])); [print(json.dumps(r,ensure_ascii=False,separators=(",",":"))) for r in rows]; print(len(rows),file=sys.stderr)' "$T/page.json" 2>"$T/n" >> "$T/rows.jsonl")
  got=$(cat "$T/n"); total=$((total+got))
  [ "$got" -lt "$PAGE" ] && break
  from=$((from+PAGE))
done
gzip -9 -c "$T/rows.jsonl" > "$T/rows.jsonl.gz"
age -R "$PUB" -o "$OUT" "$T/rows.jsonl.gz"; chmod 600 "$OUT"
sha256sum "$OUT" > "$OUT.sha256"; chmod 600 "$OUT.sha256"
echo "archived table=$TABLE filter=\"$FILTER\" rows=$total bytes_gz=$(stat -c %s "$T/rows.jsonl.gz") file=$OUT"
echo "verify: $(sh "$0" --verify "$OUT" | tr '\n' ' ')"
