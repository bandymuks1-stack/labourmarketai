#!/bin/sh
# Synthetic test of lm-seo-watch.sh: a stub curl answers from this file, so it never reaches the network
# and sends no mail. Run from anywhere: sh lm-seo-watch.test.sh
set -u
HERE=$(cd "$(dirname "$0")" && pwd)
W="$HERE/lm-seo-watch.sh"
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT INT TERM
R="$T/root"; M="$T/mail"; mkdir -p "$R" "$T/bin"; : > "$M"
FAILS=0; N=0

# The stub: -D headers, -o body, the last argument is the URL. BREAK names the one thing to serve wrong.
cat > "$T/bin/curl" <<'STUB'
#!/bin/sh
while [ $# -gt 0 ]; do
  case "$1" in
    -D) H="$2"; shift 2;;
    -o) O="$2"; shift 2;;
    -A|-w|--max-time) shift 2;;
    -sS) shift;;
    *) U="$1"; shift;;
  esac
done
B=https://labourmarket.ai
code=200; loc=""
page() {
  hl=""; for l in lt en ru nl de pl x-default; do hl="$hl<link rel=\"alternate\" hrefLang=\"$l\" href=\"$U\"/>"; done
  [ "${BREAK:-}" = hreflang ] && hl=""
  c="$U"; [ "${BREAK:-}" = canonical ] && c="$B/"
  r="index, follow"; [ "${BREAK:-}" = noindex ] && r="noindex"
  printf '<html><head><meta name="robots" content="%s"/><link rel="canonical" href="%s"/>%s</head><body>x</body></html>' "$r" "$c" "$hl"
}
case "$U" in
  "$B/robots.txt") body='Sitemap: a
Sitemap: b
Sitemap: c';;
  "$B/sitemap.xml") body="<urlset><url><loc>$B/lt</loc></url></urlset>"; [ "${BREAK:-}" = private ] && body="$body<loc>$B/en/dashboard</loc>";;
  "$B/jobs-sitemap.xml") body=""; for i in $(seq 0 40); do body="$body<sitemap><loc>$B/jobs-sitemap/$i.xml</loc></sitemap>
"; done; [ "${BREAK:-}" = shards ] && body="<sitemap><loc>$B/jobs-sitemap/0.xml</loc></sitemap>";;
  "$B"/jobs-sitemap/*) body="<url><loc>$B/en/jobs/a1</loc></url>
<url><loc>$B/en/jobs/a2</loc></url>"; [ "${BREAK:-}" = shard500 ] && { code=503; body=""; };;
  "$B/") code=301; loc="$B/lt"; [ "${BREAK:-}" = root ] && code=307; body="";;
  "$B/en/dashboard") code=307; loc="$B/en/auth/login"; body=""; [ "${BREAK:-}" = dashboard ] && code=200;;
  "$B/en/oauth/consent") body='<meta name="robots" content="noindex, nofollow"/>'; [ "${BREAK:-}" = oauth ] && body='<meta name="robots" content="index"/>';;
  https://www.labourmarket.ai/*) code=308; loc="$B/en"; body="";;
  https://app.labourmarket.ai/*) code=402; body="";;
  *) body=$(page); [ "${BREAK:-}" = status ] && [ "$U" = "$B/en/about" ] && code=500;;
esac
{ printf 'HTTP/1.1 %s\r\n' "$code"; [ -z "$loc" ] || printf 'location: %s\r\n' "$loc"; printf '\r\n'; } > "$H"
printf '%s' "$body" > "$O"
printf '%s' "$code"
STUB
chmod +x "$T/bin/curl"

run() { PATH="$T/bin:$PATH" BREAK="${1:-}" sh "$W" --root "$R" --mail-file "$M" >"$T/out" 2>&1; echo $?; }
mails() { grep -c '^Subject:' "$M"; }
expect() { # name, actual, wanted
  N=$((N + 1))
  if [ "$2" = "$3" ]; then echo "ok $N $1"; else echo "FAIL $N $1: got '$2', wanted '$3' ($(cat "$T/out"))"; FAILS=$((FAILS + 1)); fi
}
reset() { rm -f "$R/seo-watch.state"; : > "$M"; }

reset
expect "all good: healthy" "$(run)" 0
expect "all good: no mail" "$(mails)" 0
expect "the paused app host is told, not alerted" "$(grep -c 'app_host=402' "$T/out")" 1

for b in canonical noindex hreflang private shards shard500 root dashboard oauth status; do
  reset
  expect "$b: a problem" "$(run "$b")" 1
  expect "$b: one alert" "$(mails)" 1
done

reset; run canonical >/dev/null
expect "same problem again: exit 1" "$(run canonical)" 1
expect "same problem again: still one alert" "$(mails)" 1
expect "cleared: healthy" "$(run)" 0
expect "cleared: one recovery message" "$(mails)" 2
expect "healthy again: no new mail" "$(run; mails)" "0
2"

echo "$N checks, $FAILS failed"
[ "$FAILS" = 0 ]
