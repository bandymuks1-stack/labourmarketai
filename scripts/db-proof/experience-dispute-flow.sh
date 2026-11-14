#!/usr/bin/env bash
# ============================================================================
# Register 2.24 — experience records: the DISPUTE and the RIGHT OF REPLY run
# end to end. REAL PostgreSQL proof (no Docker, no Supabase) on a throwaway
# local PG16. No migration is under test: this proves the contract the
# existing RPCs already have, which the web app must follow.
#
# Schema = the REAL 20260802120000 + 20260806230000 + 20261002143000
# migrations; the prelude is the EVID-6 one (external bits only).
#
# What it pins:
#   * a dispute moves opened -> under_review -> resolved_*; a decision straight
#     from 'opened' is REFUSED by the database (the web app used to send
#     exactly that, so no dispute could ever be decided);
#   * only the subject opens, only a platform admin reviews and decides, one
#     dispute per record, every step leaves an audit row with its reason;
#   * a decision never rewrites the record (body, sentiment, moderation state);
#   * a reply is invisible to the record's author until an admin publishes it.
#
# What it does NOT prove: the conflict-of-interest rule (a moderator who is a
# party does not decide). That rule lives in the web app
# (lib/trust/experience-conflict.ts); the database lets ANY admin decide, as
# the checks below show. is_admin / manages_organization are the prelude's
# copies of production, not the migrations themselves.
#
#   PGPROOF_HOST=127.0.0.1 PGPROOF_PORT=54301 bash scripts/db-proof/experience-dispute-flow.sh
# Uses database `expdisp` (dropped and rebuilt). Refuses non-local hosts.
# ============================================================================
set -uo pipefail
export PGCLIENTENCODING=UTF8
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; REPO="$(cd "$HERE/../.." && pwd)"
M="$REPO/supabase/migrations"
PGPROOF_HOST=${PGPROOF_HOST:-127.0.0.1}; PGPROOF_PORT=${PGPROOF_PORT:-54301}
case "$PGPROOF_HOST" in 127.0.0.1|localhost|/*) ;; *) echo "refusing non-local host"; exit 2;; esac
ADMINP="psql -h $PGPROOF_HOST -p $PGPROOF_PORT -U postgres -d postgres -tA -q"
PSQL="psql -h $PGPROOF_HOST -p $PGPROOF_PORT -U postgres -d expdisp -tA -q"
LFD="$(mktemp -d)"
$ADMINP -c "drop database if exists expdisp" -c "create database expdisp" >/dev/null 2>&1
for f in "$HERE/evid6-experience-responses.prelude.sql" "$M/20260802120000_experience_records_v1.sql" \
         "$M/20260806230000_experience_author_subject_v1.sql" "$M/20261002143000_experience_responses_select_reply_status_v1.sql"; do
  tr -d '\r' < "$f" > "$LFD/f.sql"
  $PSQL -v ON_ERROR_STOP=1 -f "$LFD/f.sql" >/dev/null 2>"$LFD/err" || { echo "BASELINE FAILED: $f"; cat "$LFD/err"; exit 1; }
done
pass=0; fail=0
check() { if [ "$2" = "$3" ]; then echo "  PASS  $1"; pass=$((pass+1)); else echo "  FAIL  $1 (expected [$2], got [$3])"; fail=$((fail+1)); fi; }
as() { local who="$1"; shift
  case "$who" in anon) pre="set role anon;";; *) pre="set role authenticated; set request.jwt.claim.sub='$who';";; esac
  printf '%s\n' "$pre $*" | $PSQL -f - 2>&1 | tr -d '\r' | sed 's/^psql:<stdin>:[0-9]*: //' | head -1; }
q() { $PSQL -c "$1" 2>&1 | tr -d '\r' | head -1; }
A=a0000000-0000-0000-0000-000000000001    # author of the experience
S=a0000000-0000-0000-0000-000000000002    # the person it is about (subject)
O=a0000000-0000-0000-0000-000000000003    # unrelated signed-in person
ADM=a0000000-0000-0000-0000-000000000004  # platform admin
MX=a0000000-0000-0000-0000-000000000005   # manager of organization X
ORGX=b0b0b0b0-0000-0000-0000-00000000000b
R1=d0000000-0000-0000-0000-000000000001   # published, about S
R2=d0000000-0000-0000-0000-000000000002   # published, about organization X
R3=d0000000-0000-0000-0000-000000000003   # NOT published, about S
$PSQL >/dev/null <<SQL
insert into public.profiles (id, active_role) values ('$A','worker'),('$S','worker'),('$O','worker'),('$ADM','admin'),('$MX','company');
insert into public.organizations (id) values ('$ORGX');
insert into public.engagement_contexts (profile_id, organization_id, status, relationship_slug) values ('$MX','$ORGX','active','manager');
insert into public.experience_records (id, author_profile_id, subject_type, subject_profile_id, subject_organization_id, interaction_kind, interaction_id, sentiment, body, moderation_status, published_at) values
 ('$R1','$A','worker','$S',null,'completed_engagement','e0000000-0000-0000-0000-000000000001','negative','the original text','published',now()),
 ('$R2','$A','organization',null,'$ORGX','completed_engagement','e0000000-0000-0000-0000-000000000002','negative','about the organization','published',now()),
 ('$R3','$A','worker','$S',null,'completed_engagement','e0000000-0000-0000-0000-000000000003','negative','still in moderation','submitted',null);
SQL
code() { printf '%s' "$1" | grep -oE '"code": ?"[a-z_]+"' | grep -oE '[a-z_]+"$' | tr -d '"'; }
ok() { case "$1" in *'"ok": true'*|*'"ok":true'*) echo ok;; *) code "$1";; esac; }
open_d() { ok "$(as "$1" "select public.open_experience_dispute('$2', ${3:-'this is not what happened'});")"; }
review() { ok "$(as "$1" "select public.review_experience_dispute('$2');")"; }
resolve() { ok "$(as "$1" "select public.resolve_experience_dispute('$2', '$3', ${4:-'checked both accounts'});")"; }
dstat() { q "select dispute_status from public.experience_records where id='$1';"; }
counts() { as $O "select (c->>'negative')||':'||(c->>'disputed')||':'||(c->>'total_considered') from public.get_experience_counts('worker','$S') c;"; }
audit() { q "select count(*) from public.audit_logs where entity_id='$1' and action='$2';"; }

echo "WHO MAY OPEN A DISPUTE"
check "the author cannot dispute their own record" "not_subject" "$(open_d $A $R1)"
check "an unrelated person cannot" "not_subject" "$(open_d $O $R1)"
check "a manager of an unrelated organization cannot dispute a person's record" "not_subject" "$(open_d $MX $R1)"
check "anon cannot execute" "1" "$(as anon "select public.open_experience_dispute('$R1','x');" | grep -c 'permission denied')"
check "a reason is required" "reason_required" "$(open_d $S $R1 "'  '")"
check "a record that is not published cannot be disputed" "not_published" "$(open_d $S $R3)"
check "nothing was written by any refusal" "none:0" "$(dstat $R1):$(q "select count(*) from public.audit_logs;")"
check "counts before: 1 negative, 0 disputed, 1 considered" "1:0:1" "$(counts)"
check "the SUBJECT opens the dispute" "ok" "$(open_d $S $R1)"
check "state is 'opened'; the record stays published" "opened:published" "$(dstat $R1):$(q "select moderation_status from public.experience_records where id='$R1';")"
check "a second dispute on the same record is refused" "dispute_exists" "$(open_d $S $R1)"
check "the organization's manager opens a dispute on the organization's record" "ok" "$(open_d $MX $R2)"
check "while disputed it STAYS counted and is surfaced as disputed" "1:1:1" "$(counts)"

echo "WHO DECIDES, AND IN WHICH ORDER"
check "the subject cannot review their own dispute" "not_authorized" "$(review $S $R1)"
check "the author cannot review it" "not_authorized" "$(review $A $R1)"
check "the organization's manager cannot decide the organization's own dispute" "not_authorized" "$(resolve $MX $R2 removed)"
check "THE DEAD END: a decision straight from 'opened' is refused, even for an admin" "invalid_transition" "$(resolve $ADM $R1 upheld)"
check "… and it changed nothing" "opened" "$(dstat $R1)"
check "admin starts the review" "ok" "$(review $ADM $R1)"
check "state is 'under_review'" "under_review" "$(dstat $R1)"
check "starting the review twice is refused" "invalid_transition" "$(review $ADM $R1)"
check "a decision needs a reason" "reason_required" "$(resolve $ADM $R1 upheld "''")"
check "an unknown decision is refused" "invalid_resolution" "$(resolve $ADM $R1 deleted)"
check "the subject still cannot decide" "not_authorized" "$(resolve $S $R1 removed)"
check "admin decides: removed from public view" "ok" "$(resolve $ADM $R1 removed)"
check "state is 'resolved_removed'" "resolved_removed" "$(dstat $R1)"
check "a decided dispute cannot be decided again" "invalid_transition" "$(resolve $ADM $R1 upheld)"
check "… nor reopened by the subject" "dispute_exists" "$(open_d $S $R1)"

echo "WHAT A DECISION CHANGES"
check "the record is NOT rewritten: text, sentiment and moderation state stay" "the original text:negative:published" "$(q "select body||':'||sentiment||':'||moderation_status from public.experience_records where id='$R1';")"
check "the row still exists (no delete)" "1" "$(q "select count(*) from public.experience_records where id='$R1';")"
check "a removed record leaves the public counts" "0:0:0" "$(counts)"
check "the subject's reason and the decision's reason are both kept" "this is not what happened|checked both accounts" "$(q "select dispute_reason||'|'||dispute_resolution_reason from public.experience_records where id='$R1';")"
as $ADM "select public.review_experience_dispute('$R2');" >/dev/null
check "admin decides the organization's dispute: upheld" "ok" "$(resolve $ADM $R2 upheld)"
check "an upheld record stays counted and is no longer 'disputed'" "1:0:1" "$(as $O "select (c->>'negative')||':'||(c->>'disputed')||':'||(c->>'total_considered') from public.get_experience_counts('organization','$ORGX') c;")"

echo "AUDIT TRAIL"
check "opened: one row, by the subject, with the reason" "1:$S:this is not what happened" "$(q "select count(*)||':'||min(actor_id::text)||':'||min(payload->>'reason') from public.audit_logs where entity_id='$R1' and action='dispute_opened';")"
check "review started: one row, by the admin" "1:$ADM" "$(q "select count(*)||':'||min(actor_id::text) from public.audit_logs where entity_id='$R1' and action='dispute_review_started';")"
check "resolved: one row, by the admin, with the transition and the reason" "1:$ADM:under_review:resolved_removed:checked both accounts" "$(q "select count(*)||':'||min(actor_id::text)||':'||min(payload->>'prev_status')||':'||min(payload->>'new_status')||':'||min(payload->>'reason') from public.audit_logs where entity_id='$R1' and action='dispute_resolved';")"
check "refused attempts left no audit row (3 rows per decided dispute)" "3:3" "$(q "select (select count(*) from public.audit_logs where entity_id='$R1')||':'||(select count(*) from public.audit_logs where entity_id='$R2');")"

echo "WHO SEES WHAT (RLS)"
check "the subject reads the record and its dispute state" "resolved_removed" "$(as $S "select dispute_status from public.experience_records where id='$R1';")"
check "the author reads it too" "resolved_removed" "$(as $A "select dispute_status from public.experience_records where id='$R1';")"
check "an unrelated person reads no row" "0" "$(as $O "select count(*) from public.experience_records;")"
check "a manager of organization X reads X's record, not the person's" "1" "$(as $MX "select count(*) from public.experience_records;")"
check "nobody but the service reads the audit trail through this domain's grants" "1" "$(as $S "select count(*) from public.audit_logs;" | grep -c -E 'permission denied|^0$')"

echo "RIGHT OF REPLY"
RID="$(as $S "select public.submit_experience_response('$R2','x')->>'code';")"
check "a person who is not the subject cannot reply" "not_subject" "$RID"
RP="$(as $MX "select public.submit_experience_response('$R2','our side of it')->>'id';")"
check "the subject side replies" "1" "$(q "select count(*) from public.experience_responses where id='$RP' and moderation_status='submitted';")"
check "the record's author does NOT read a reply moderation has not published" "0" "$(as $A "select count(*) from public.experience_responses where id='$RP';")"
check "the reply's own author reads it in every state" "1" "$(as $MX "select count(*) from public.experience_responses where id='$RP';")"
check "the record's author cannot publish the reply" "not_authorized" "$(ok "$(as $A "select public.moderate_experience_response('$RP','published','x');")")"
check "the reply's author cannot publish their own reply" "not_authorized" "$(ok "$(as $MX "select public.moderate_experience_response('$RP','published','x');")")"
check "admin publishes the reply (a reason is required)" "reason_required:ok" "$(ok "$(as $ADM "select public.moderate_experience_response('$RP','published','');")"):$(ok "$(as $ADM "select public.moderate_experience_response('$RP','published','within the rules');")")"
check "now the record's author reads it" "1" "$(as $A "select count(*) from public.experience_responses where id='$RP';")"
check "a decided reply cannot be decided again" "invalid_transition" "$(ok "$(as $ADM "select public.moderate_experience_response('$RP','rejected','changed my mind');")")"
check "the reply did not change the counts or the record" "1:0:1" "$(as $O "select (c->>'negative')||':'||(c->>'disputed')||':'||(c->>'total_considered') from public.get_experience_counts('organization','$ORGX') c;")"
check "reply moderation left its audit row" "1" "$(audit $RP response_moderated)"
RJ="$(as $S "select public.submit_experience_response('$R1','a reply that will be rejected')->>'id';")"
check "admin rejects another reply" "ok" "$(ok "$(as $ADM "select public.moderate_experience_response('$RJ','rejected','outside the rules');")")"
check "a REJECTED reply stays hidden from the record's author" "0" "$(as $A "select count(*) from public.experience_responses where id='$RJ';")"
check "… and its own author still reads it" "1" "$(as $S "select count(*) from public.experience_responses where id='$RJ';")"
echo; echo "RESULT: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
