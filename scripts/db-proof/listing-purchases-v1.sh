#!/usr/bin/env bash
# Listing purchases v1 (registry 6.13 + 6.14) - REAL PostgreSQL proof on a THROWAWAY cluster (never prod).
#   initdb -D $DIR/data -U postgres --auth=trust -E UTF8
#   pg_ctl -D $DIR/data -o "-p 54300 -c listen_addresses=127.0.0.1" -l $DIR/pg.log start
#   PGPROOF_HOST=127.0.0.1 PGPROOF_PORT=54300 bash scripts/db-proof/listing-purchases-v1.sh
# DROPs schema public. Real prior migrations (service offerings, marketplace_listings, the
# universal-marketplace index 20261003150300) build the baseline; the stub prelude is shared
# with marketplace-index-v1 and adds a minimal privacy_erasure_registry_v3.
set -uo pipefail
export PGCLIENTENCODING=UTF8
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; REPO="$(cd "$HERE/../.." && pwd)"
LFD="$(mktemp -d)"
for f in "$REPO"/supabase/migrations/20260627121713*.sql "$REPO"/supabase/migrations/20260627145318*.sql \
         "$REPO"/supabase/migrations/20260718210000*.sql "$REPO"/supabase/migrations/20261003150300*.sql \
         "$REPO"/supabase/migrations/20261023161500*.sql "$REPO"/supabase/rollbacks/20261023161500*.sql; do
  tr -d '\r' < "$f" > "$LFD/$(basename "$f")"; done
PGPROOF_HOST=${PGPROOF_HOST:-127.0.0.1}; PGPROOF_PORT=${PGPROOF_PORT:-54300}
case "$PGPROOF_HOST" in 127.0.0.1|localhost|/*) ;; *) echo "refusing non-local host"; exit 2;; esac
PSQL="psql -h $PGPROOF_HOST -p $PGPROOF_PORT -U postgres -d postgres -tA -q"
FAIL=0
ok() { echo "PASS $1"; }
bad() { echo "FAIL $1 :: $2"; FAIL=1; }
chk() { if [ "$2" == "$3" ]; then ok "$1"; else bad "$1" "expected [$2] got [$3]"; fi; }
as() { $PSQL -c "set role $1" -c "set request.jwt.claim.sub = '$2'" -c "$3" 2>&1 | grep -v '^SET$' | grep -v -e '^CONTEXT' -e '^PL/pgSQL' -e '^SQL statement' | tail -1 | sed 's/^ERROR:  /ERROR: /'; }

U1=11111111-1111-1111-1111-111111111111   # seller, manages ORG, owns the org drill listing
U2=22222222-2222-2222-2222-222222222222   # buyer (person)
U3=33333333-3333-3333-3333-333333333333   # second manager of ORG (seller side by organization)
U4=44444444-4444-4444-4444-444444444444   # manager of ORG2 (buyer side by organization)
U6=66666666-6666-6666-6666-666666666666   # outsider
ADM=55555555-5555-5555-5555-555555555555
ORG=aaaaaaaa-0000-0000-0000-000000000001; ORG2=aaaaaaaa-0000-0000-0000-000000000002
DRILL=cccccccc-0000-0000-0000-000000000001; VAN=cccccccc-0000-0000-0000-000000000002

rebuild() {
  $PSQL -c "drop schema if exists public cascade; create schema public; drop schema if exists auth cascade;" >/dev/null 2>&1
  for f in "$HERE/marketplace-index-v1.prelude.sql" "$LFD/20260627121713_service_offerings.sql" "$LFD/20260627145318_service_offering_requests.sql" "$LFD/20260718210000_marketplace_listings.sql"; do
    $PSQL -v ON_ERROR_STOP=1 -f "$f" >/dev/null 2>"$LFD/err" || { echo "BASELINE FAILED $f"; cat "$LFD/err"; exit 1; }
  done
  $PSQL -v ON_ERROR_STOP=1 -f "$HERE/marketplace-index-v1.seed.sql" >/dev/null || { echo "seed FAILED"; exit 1; }
  $PSQL -v ON_ERROR_STOP=1 -f "$LFD/20261003150300_marketplace_index_v1.sql" >/dev/null 2>"$LFD/err" || { echo "150300 FAILED"; cat "$LFD/err"; exit 1; }
  $PSQL -v ON_ERROR_STOP=1 >/dev/null <<SQL || { echo "extra seed FAILED"; exit 1; }
create table public.privacy_erasure_registry_v3 (
  schema_name text not null default 'public', table_name text not null, column_name text not null,
  parent text not null, fk_rule_expected text, treatment text not null, decided_by text,
  legal_review boolean not null default false, legal_basis text, guard_triggers text[], refuse_where text,
  scrub_columns text[], requires_external text, note text not null, retention text,
  primary key (schema_name, table_name, column_name));
insert into public.profiles(id) values ('$U3'),('$U4'),('$U6');
insert into public.organizations(id) values ('$ORG2');
insert into public.org_members values ('$ORG','$U3'),('$ORG2','$U4');
-- a goods sale (person seller U2), a rental, a wanted, a premises sale (not purchasable)
insert into public.marketplace_listings(id,owner_id,listing_kind,category,title,status,quantity,unit,price_amount,currency) values
 ('cccccccc-0000-0000-0000-000000000010','$U2','sale','goods_handmade','Oak bench','active',3,'pcs',120,'EUR'),
 ('cccccccc-0000-0000-0000-000000000011','$U1','rental','tools','Rental drill','active',null,null,null,null),
 ('cccccccc-0000-0000-0000-000000000012','$U1','wanted','goods_other','Need pallets','active',null,null,null,null),
 ('cccccccc-0000-0000-0000-000000000013','$U1','sale','premises','Small office','active',null,null,null,null),
 ('cccccccc-0000-0000-0000-000000000014','$U1','sale','goods_other','Paused jars','paused',null,null,null,null);
SQL
}
BENCH=cccccccc-0000-0000-0000-000000000010
REQ() { as authenticated "$1" "select request_listing_purchase_v1($2)"; }

echo "== apply"
rebuild
$PSQL -v ON_ERROR_STOP=1 -f "$LFD/20261023161500_listing_purchases_v1.sql" >/dev/null 2>"$LFD/err" || bad "apply" "$(cat "$LFD/err")"
chk "idempotent re-run" "0" "$($PSQL -v ON_ERROR_STOP=1 -f "$LFD/20261023161500_listing_purchases_v1.sql" 2>&1 | grep -ci error)"
chk "existing listings untouched (7 rows)" "7" "$($PSQL -c "select count(*) from marketplace_listings")"
chk "erasure registry rows (2, sever_sentinel, legal review)" "2|2" "$($PSQL -c "select count(*)||'|'||count(*) filter (where treatment='sever_sentinel' and legal_review) from privacy_erasure_registry_v3 where table_name='listing_purchases'")"

echo "== grants"
chk "anon cannot read" "ERROR: permission denied for table listing_purchases" "$(as anon $U2 "select count(*) from listing_purchases")"
chk "anon cannot request" "ERROR: permission denied for function request_listing_purchase_v1" "$(as anon $U2 "select request_listing_purchase_v1('$DRILL',1,'pickup')")"
chk "authenticated cannot insert directly" "ERROR: permission denied for table listing_purchases" "$(as authenticated $U2 "insert into listing_purchases(listing_id,seller_id,buyer_id,listing_title,quantity,fulfilment_method) values ('$DRILL','$U1','$U2','x',1,'pickup')")"

echo "== request rules"
P1=$(REQ $U2 "'$DRILL',2,'delivery','Two please','Site gate B, Kaunas','lt',current_date+3")
chk "buyer requests the org drill (delivery)" "36" "${#P1}"
chk "seller + seller org bound from the listing, snapshot taken, country upper" "$U1|$ORG|Pre-existing drill|LT|direct_between_parties|requested" \
  "$($PSQL -c "select seller_id||'|'||seller_organization_id||'|'||listing_title||'|'||delivery_country||'|'||payment_arrangement||'|'||status from listing_purchases where id='$P1'")"
chk "second open request on same listing refused" "1" "$($PSQL -c "set role authenticated" -c "set request.jwt.claim.sub = '$U2'" -c "select request_listing_purchase_v1('$DRILL',1,'pickup')" 2>&1 | grep -c listing_purchases_one_open_idx)"
chk "owner cannot buy own listing" "ERROR: cannot_purchase_own_listing" "$(REQ $U2 "'$BENCH',1,'pickup'")"
chk "manager of the selling org cannot buy its listing" "ERROR: cannot_purchase_own_listing" "$(REQ $U3 "'$DRILL',1,'pickup'")"
chk "rental is not purchasable" "ERROR: listing_not_purchasable" "$(REQ $U2 "'cccccccc-0000-0000-0000-000000000011',1,'pickup'")"
chk "wanted is not purchasable" "ERROR: listing_not_purchasable" "$(REQ $U2 "'cccccccc-0000-0000-0000-000000000012',1,'pickup'")"
chk "premises sale is not purchasable" "ERROR: listing_not_purchasable" "$(REQ $U2 "'cccccccc-0000-0000-0000-000000000013',1,'pickup'")"
chk "paused listing refused" "ERROR: listing_not_active" "$(REQ $U2 "'cccccccc-0000-0000-0000-000000000014',1,'pickup'")"
chk "draft listing refused" "ERROR: listing_not_active" "$(REQ $U2 "'$VAN',1,'pickup'")"
chk "unknown listing refused" "ERROR: listing_not_found" "$(REQ $U2 "'cccccccc-0000-0000-0000-0000000000ff',1,'pickup'")"
chk "quantity above the stated stock refused" "ERROR: quantity_exceeds_listing" "$(REQ $U1 "'$BENCH',4,'pickup'")"
chk "zero quantity refused" "ERROR: invalid_quantity" "$(REQ $U1 "'$BENCH',0,'pickup'")"
chk "delivery without a place refused" "ERROR: delivery_place_required" "$(REQ $U1 "'$BENCH',1,'delivery'")"
chk "bad method refused" "ERROR: invalid_fulfilment_method" "$(REQ $U1 "'$BENCH',1,'drone'")"
chk "past date refused" "ERROR: requested_date_in_past" "$(REQ $U1 "'$BENCH',1,'pickup',null,null,null,current_date-1")"
chk "buying for an org the caller does not manage refused" "ERROR: not_authorized_for_organization" "$(REQ $U1 "'$BENCH',1,'pickup',null,null,null,null,'$ORG2'")"
P2=$(REQ $U4 "'$BENCH',1,'pickup','For the crew',null,null,null,'$ORG2'")
chk "manager buys for their own org (pickup drops delivery fields)" "36" "${#P2}"
chk "pickup stores no delivery place" "pickup||$ORG2" "$($PSQL -c "select fulfilment_method||'|'||coalesce(delivery_location_label,'')||'|'||buyer_organization_id from listing_purchases where id='$P2'")"

echo "== visibility"
chk "buyer sees own" "1" "$(as authenticated $U2 "select count(*) from listing_purchases where id='$P1'")"
chk "seller sees" "1" "$(as authenticated $U1 "select count(*) from listing_purchases where id='$P1'")"
chk "second manager of seller org sees" "1" "$(as authenticated $U3 "select count(*) from listing_purchases where id='$P1'")"
chk "outsider sees nothing" "0" "$(as authenticated $U6 "select count(*) from listing_purchases")"
chk "buyer-org manager sees the org purchase, not the other" "1" "$(as authenticated $U4 "select count(*) from listing_purchases")"
chk "admin sees all" "2" "$(as authenticated $ADM "select count(*) from listing_purchases")"

echo "== transitions"
T() { as authenticated "$1" "select transition_listing_purchase_v1('$2','$3'${4:+,$4})"; }
chk "outsider refused" "not_party" "$(T $U6 $P1 accept)"
chk "buyer cannot accept" "not_seller" "$(T $U2 $P1 accept)"
chk "bad action" "bad_action" "$(T $U1 $P1 ship)"
chk "fulfil before accept refused" "invalid_transition" "$(T $U1 $P1 fulfil)"
chk "seller cannot cancel a requested one (declines instead)" "invalid_transition" "$(T $U1 $P1 cancel)"
chk "second org manager accepts with a carrier note" "ok" "$(T $U3 $P1 accept "'Ready Friday','Courier picks up 10:00'")"
chk "accepted state + notes + responded_at" "accepted|Ready Friday|Courier picks up 10:00|true" "$($PSQL -c "select status||'|'||seller_note||'|'||carrier_note||'|'||(responded_at is not null) from listing_purchases where id='$P1'")"
chk "accept twice refused" "invalid_transition" "$(T $U1 $P1 accept)"
chk "seller fulfils" "ok" "$(T $U1 $P1 fulfil)"
chk "fulfilled is terminal (buyer cancel refused)" "invalid_transition" "$(T $U2 $P1 cancel)"
chk "fulfilled_at stamped" "fulfilled|true" "$($PSQL -c "select status||'|'||(fulfilled_at is not null) from listing_purchases where id='$P1'")"
chk "buyer-org manager cancels the requested org purchase" "ok" "$(T $U4 $P2 cancel)"
chk "cancel records the side" "cancelled|buyer|true" "$($PSQL -c "select status||'|'||cancelled_by||'|'||(cancelled_at is not null) from listing_purchases where id='$P2'")"
P3=$(REQ $U1 "'$BENCH',1,'pickup'")
chk "seller declines" "ok" "$(T $U2 $P3 decline "'Sold out'")"
chk "declined is terminal" "invalid_transition" "$(T $U2 $P3 accept)"
P4=$(REQ $U1 "'$BENCH',1,'pickup'")
chk "a new request after the closed one is allowed" "36" "${#P4}"
T $U2 $P4 accept >/dev/null
chk "seller cancels what they accepted" "ok" "$(T $U2 $P4 cancel)"
chk "seller cancel recorded" "cancelled|seller" "$($PSQL -c "select status||'|'||cancelled_by from listing_purchases where id='$P4'")"

echo "== deletion never erases a purchase"
$PSQL -c "delete from marketplace_listings where id='$DRILL'" >/dev/null 2>&1
chk "listing deleted, purchase kept with snapshot" "1|Pre-existing drill|true" "$($PSQL -c "select count(*)||'|'||max(listing_title)||'|'||bool_and(listing_id is null) from listing_purchases where id='$P1'")"
chk "parties still read it" "1|1" "$(as authenticated $U2 "select count(*) from listing_purchases where id='$P1'")|$(as authenticated $U1 "select count(*) from listing_purchases where id='$P1'")"

echo "== rollback"
chk "rollback refused while rows exist" "1" "$($PSQL -f "$LFD/20261023161500_listing_purchases_v1.down.sql" 2>&1 | grep -c 'rollback refused')"
rebuild
$PSQL -v ON_ERROR_STOP=1 -f "$LFD/20261023161500_listing_purchases_v1.sql" >/dev/null 2>&1
$PSQL -v ON_ERROR_STOP=1 -f "$LFD/20261023161500_listing_purchases_v1.down.sql" >/dev/null 2>"$LFD/err" || bad "down" "$(cat "$LFD/err")"
chk "after rollback: table, functions, registry rows gone" "0|0|0" "$($PSQL -c "select (select count(*) from pg_class where relname='listing_purchases')||'|'||(select count(*) from pg_proc where proname like '%listing_purchase_v1')||'|'||(select count(*) from privacy_erasure_registry_v3 where table_name='listing_purchases')")"
chk "after rollback: listings intact" "7" "$($PSQL -c "select count(*) from marketplace_listings")"
if $PSQL -v ON_ERROR_STOP=1 -f "$LFD/20261023161500_listing_purchases_v1.sql" >/dev/null 2>"$LFD/err"; then ok "re-apply after rollback"; else bad "re-apply" "$(cat "$LFD/err")"; fi
if [ $FAIL -eq 0 ]; then echo "ALL PASS"; else echo "FAILURES"; exit 1; fi
