#!/usr/bin/env bash
# ============================================================================
# EVIDENCE-MEDIA BUCKET - per-role storage + table authority proof.
#
# Needs a THROWAWAY Postgres (>=14) reachable through the standard PG* env vars
# (default 127.0.0.1:54300 user postgres, trust auth). Creates and drops its own
# database `evmedia_proof`. Runs the ACTUAL table migration and the ACTUAL bucket
# migration VERBATIM, then measures every verb per actor under
# `set local role authenticated|anon` so RLS genuinely decides.
# Usage:  PGPORT=54300 bash scripts/db-proof/evidence-media-bucket.sh
# Never point this at production or a shared local Supabase stack.
# ============================================================================
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
T1="$REPO/supabase/migrations/20261007100000_evidence_record_media_link_v1.sql"
T2="$REPO/supabase/migrations/20261007180000_evidence_media_bucket_v1.sql"
RB="$REPO/supabase/rollbacks/20261007180000_evidence_media_bucket_v1.down.sql"
export PGHOST="${PGHOST:-127.0.0.1}" PGPORT="${PGPORT:-54300}" PGUSER="${PGUSER:-postgres}"
DB=evmedia_proof

psql -d postgres -qAt -c "drop database if exists $DB" -c "create database $DB" >/dev/null || { echo "cannot create db"; exit 1; }
P() { psql -d "$DB" -qAt -v ON_ERROR_STOP=1 "$@"; }

MGR_A=11111111-1111-4111-8111-111111111111
MGR_B=22222222-2222-4222-8222-222222222222
SUBJ=33333333-3333-4333-8333-333333333333
OUT=44444444-4444-4444-8444-444444444444
ORG_A=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa
ORG_B=bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb
PERSON_A=cccccccc-cccc-4ccc-8ccc-cccccccccccc
H1=$(printf 'a%.0s' $(seq 1 64)); H2=$(printf 'b%.0s' $(seq 1 64)); H3=$(printf 'c%.0s' $(seq 1 64)); H4=$(printf 'd%.0s' $(seq 1 64))

as() { # role uid sql
  psql -d "$DB" -tA -v ON_ERROR_STOP=0 2>&1 <<SQL
begin;
set local role $1;
set local app.uid = '$2';
$3
commit;
SQL
}
tok() { local out; out=$(grep -vE '^(BEGIN|COMMIT|SET|ROLLBACK)$' | sed '/^$/d')
  if echo "$out" | grep -qE "ERROR:"; then echo "DENIED"
  elif [ "$out" = "INSERT 0 1" ]; then echo "NOROWS"
  elif [ -z "$out" ]; then echo "NOROWS"; else echo "$out" | tr '\n' '|' | sed 's/|$//'; fi; }
pass=0; fail=0
check() { if [ "$2" == "$3" ]; then printf '  PASS  %-70s %s\n' "$1" "$3"; pass=$((pass+1));
          else printf '  FAIL  %-70s expected=%s actual=%s\n' "$1" "$2" "$3"; fail=$((fail+1)); fi; }

P -f "$HERE/evidence-media-bucket.prelude.sql" >/dev/null || { echo "prelude failed"; exit 1; }
P >/dev/null <<SQL
insert into public.profiles(id) values ('$MGR_A'),('$MGR_B'),('$SUBJ'),('$OUT');
insert into public.organizations(id,display_name) values ('$ORG_A','A'),('$ORG_B','B');
insert into public.company_memberships(organization_id,profile_id,role) values ('$ORG_A','$MGR_A','manager'),('$ORG_B','$MGR_B','manager');
insert into public.organization_people(id,organization_id,linked_profile_id,link_state) values ('$PERSON_A','$ORG_A','$SUBJ','linked');
SQL
echo "-- apply REAL table migration, then REAL bucket migration (verbatim)"
P -f "$T1" >/dev/null 2>&1 && check "table migration applies" ok ok || check "table migration applies" ok FAILED
P -f "$T2" >/dev/null 2>&1 && check "bucket migration applies" ok ok || { check "bucket migration applies" ok FAILED; exit 1; }

echo "-- bucket + policy inventory"
check "bucket private, 20 MB, 4 mimes" "f|20971520|4" "$(P -c "select public, file_size_limit, array_length(allowed_mime_types,1) from storage.buckets where id='evidence-media'")"
check "exactly 3 evidence-media policies" "3" "$(P -c "select count(*) from pg_policies where schemaname='storage' and tablename='objects' and policyname like 'evidence-media%'")"
check "every policy is authenticated-only" "0" "$(P -c "select count(*) from pg_policies where schemaname='storage' and tablename='objects' and policyname like 'evidence-media%' and roles <> '{authenticated}'")"
check "no UPDATE policy" "0" "$(P -c "select count(*) from pg_policies where schemaname='storage' and tablename='objects' and policyname like 'evidence-media%' and cmd='UPDATE'")"

P_A="org/$ORG_A/$H1.jpg"; P_B="org/$ORG_B/$H2.jpg"
echo "-- INSERT (upload) matrix"
ins() { echo "insert into storage.objects(bucket_id,name,owner) values ('evidence-media','$1','$2');"; }
check "manager A uploads under own org prefix" "NOROWS" "$(as authenticated $MGR_A "$(ins "$P_A" $MGR_A)" | tok)"
check "manager A REFUSED under org B prefix" "DENIED" "$(as authenticated $MGR_A "$(ins "$P_B" $MGR_A)" | tok)"
check "non-member REFUSED under org A prefix" "DENIED" "$(as authenticated $OUT "$(ins "org/$ORG_A/$H3.jpg" $OUT)" | tok)"
check "subject (non-manager) REFUSED under org A prefix" "DENIED" "$(as authenticated $SUBJ "$(ins "org/$ORG_A/$H3.jpg" $SUBJ)" | tok)"
check "anon REFUSED" "DENIED" "$(as anon '' "$(ins "org/$ORG_A/$H3.jpg" "")" | tok)"
check "traversal org/A/../B/x REFUSED" "DENIED" "$(as authenticated $MGR_A "$(ins "org/$ORG_A/../$ORG_B/$H3.jpg" $MGR_A)" | tok)"
check "extra folder org/A/x/<sha>.jpg REFUSED" "DENIED" "$(as authenticated $MGR_A "$(ins "org/$ORG_A/x/$H3.jpg" $MGR_A)" | tok)"
check "non-hash filename REFUSED" "DENIED" "$(as authenticated $MGR_A "$(ins "org/$ORG_A/photo.jpg" $MGR_A)" | tok)"
check "wrong extension REFUSED" "DENIED" "$(as authenticated $MGR_A "$(ins "org/$ORG_A/$H3.exe" $MGR_A)" | tok)"
check "uppercase uuid prefix REFUSED" "DENIED" "$(as authenticated $MGR_A "$(ins "org/${ORG_A^^}/$H3.jpg" $MGR_A)" | tok)"
check "non-org/ path shape REFUSED" "DENIED" "$(as authenticated $MGR_A "$(ins "worker/$ORG_A/$H3.jpg" $MGR_A)" | tok)"
check "manager B uploads under org B prefix" "NOROWS" "$(as authenticated $MGR_B "$(ins "$P_B" $MGR_B)" | tok)"
check "UPDATE (overwrite) refused: 0 rows changed" "0" "$(as authenticated $MGR_A "with u as (update storage.objects set metadata='{}' where bucket_id='evidence-media' and name='$P_A' returning 1) select count(*) from u;" | tok)"

echo "-- SELECT matrix, UNREGISTERED object (orphan branch)"
sel() { echo "select count(*) from storage.objects where bucket_id='evidence-media' and name='$1';"; }
check "manager A sees own orphan" "1" "$(as authenticated $MGR_A "$(sel "$P_A")" | tok)"
check "manager B does NOT see A's orphan" "0" "$(as authenticated $MGR_B "$(sel "$P_A")" | tok)"
check "non-member does NOT see orphan" "0" "$(as authenticated $OUT "$(sel "$P_A")" | tok)"

echo "-- register (table) - path pin trigger"
check "manager A registers own path (person anchor, subject-visible)" "NOROWS" "$(as authenticated $MGR_A "insert into public.organization_evidence_media(organization_id,organization_person_id,storage_path,mime_type,byte_size,content_sha256,source_system,visibility,imported_by_profile_id) values ('$ORG_A','$PERSON_A','$P_A','image/jpeg',10,'$H1','proof','subject','$MGR_A');" | tok)"
check "FORGED: manager B registers a row pointing INTO org A's prefix" "DENIED" "$(as authenticated $MGR_B "insert into public.organization_evidence_media(organization_id,organization_level,storage_path,mime_type,byte_size,content_sha256,source_system,imported_by_profile_id) values ('$ORG_B',true,'org/$ORG_A/$H4.jpg','image/jpeg',10,'$H4','proof','$MGR_B');" | tok)"
check "FORGED: path not matching content hash" "DENIED" "$(as authenticated $MGR_B "insert into public.organization_evidence_media(organization_id,organization_level,storage_path,mime_type,byte_size,content_sha256,source_system,imported_by_profile_id) values ('$ORG_B',true,'org/$ORG_B/$H4.jpg','image/jpeg',10,'$H3','proof','$MGR_B');" | tok)"
check "FORGED: wrong bucket name" "DENIED" "$(as authenticated $MGR_B "insert into public.organization_evidence_media(organization_id,organization_level,storage_bucket,storage_path,mime_type,byte_size,content_sha256,source_system,imported_by_profile_id) values ('$ORG_B',true,'other','org/$ORG_B/$H2.jpg','image/jpeg',10,'$H2','proof','$MGR_B');" | tok)"
check "manager B registers own org-level photo" "NOROWS" "$(as authenticated $MGR_B "insert into public.organization_evidence_media(organization_id,organization_level,storage_path,mime_type,byte_size,content_sha256,source_system,imported_by_profile_id) values ('$ORG_B',true,'$P_B','image/jpeg',10,'$H2','proof','$MGR_B');" | tok)"

echo "-- SELECT matrix, REGISTERED object (table RLS decides)"
check "manager A reads registered A" "1" "$(as authenticated $MGR_A "$(sel "$P_A")" | tok)"
check "linked subject reads subject-visible registered A" "1" "$(as authenticated $SUBJ "$(sel "$P_A")" | tok)"
check "manager B does NOT read A's registered" "0" "$(as authenticated $MGR_B "$(sel "$P_A")" | tok)"
check "non-member does NOT read registered A" "0" "$(as authenticated $OUT "$(sel "$P_A")" | tok)"
check "subject does NOT read B's (private) registered" "0" "$(as authenticated $SUBJ "$(sel "$P_B")" | tok)"
check "anon does NOT read registered" "0" "$(as anon '' "$(sel "$P_A")" | tok)"

echo "-- DELETE matrix"
del() { echo "with d as (delete from storage.objects where bucket_id='evidence-media' and name='$1' returning 1) select count(*) from d;"; }
check "manager A CANNOT delete REGISTERED photo" "0" "$(as authenticated $MGR_A "$(del "$P_A")" | tok)"
check "manager B CANNOT delete A's registered" "0" "$(as authenticated $MGR_B "$(del "$P_A")" | tok)"
as authenticated $MGR_A "$(ins "org/$ORG_A/$H3.jpg" $MGR_A)" >/dev/null
check "manager B CANNOT delete A's orphan" "0" "$(as authenticated $MGR_B "$(del "org/$ORG_A/$H3.jpg")" | tok)"
check "non-member CANNOT delete A's orphan" "0" "$(as authenticated $OUT "$(del "org/$ORG_A/$H3.jpg")" | tok)"
check "manager A deletes own ORPHAN" "1" "$(as authenticated $MGR_A "$(del "org/$ORG_A/$H3.jpg")" | tok)"

echo "-- rollback"
check "rollback refuses while bucket holds objects" "refused" "$(o=$(P -f "$RB" 2>&1); case "$o" in *'holds objects'*) echo refused;; *) echo NOT-REFUSED;; esac)"
P -c "delete from storage.objects where bucket_id='evidence-media'" >/dev/null
check "rollback runs when bucket is empty" "ok" "$(P -f "$RB" >/dev/null 2>&1 && echo ok || echo FAILED)"
check "after rollback: no evidence-media policy" "0" "$(P -c "select count(*) from pg_policies where tablename='objects' and policyname like 'evidence-media%'")"
check "after rollback: trigger and function gone" "0|0" "$(P -c "select (select count(*) from pg_trigger where tgname='organization_evidence_media_path_pin'), (select count(*) from pg_proc where proname='organization_evidence_media_path_pin_v1')")"
check "after rollback: bucket gone" "0" "$(P -c "select count(*) from storage.buckets where id='evidence-media'")"
P -f "$T2" >/dev/null 2>&1 && check "clean re-apply after rollback" ok ok || check "clean re-apply after rollback" ok FAILED
echo "-- a public pre-existing bucket aborts the migration"
P -f "$RB" >/dev/null 2>&1; P -c "insert into storage.buckets(id,name,public) values ('evidence-media','evidence-media',true)" >/dev/null
check "migration ABORTS on a public pre-existing bucket" "aborted" "$(o=$(P -f "$T2" 2>&1); case "$o" in *'refusing to apply'*) echo aborted;; *) echo APPLIED;; esac)"

echo; echo "RESULT: pass=$pass fail=$fail"
psql -d postgres -qAt -c "drop database if exists $DB" >/dev/null 2>&1
[ "$fail" -eq 0 ]
