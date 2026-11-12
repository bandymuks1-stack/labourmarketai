#!/usr/bin/env bash
# ============================================================================
# CHAT PARTICIPANT REVOCATION — REAL PostgreSQL proof (no Docker, no Supabase).
#
# P0 chat privacy (owner 2026-11-11). Proves, on a THROWAWAY native cluster
# with the REAL chat migrations (0021, 20260612170000 revocation,
# 20260712130000 attachments, 20261006100100 server authority), that once a participant is removed:
#   3. they cannot read the thread, its messages (old or new), its attachments
#      (metadata rows or stored files) or write to it;
#   4. they cannot re-add or un-revoke themselves;
#   6. a removal committed while a send is in flight closes the send on every
#      path the database decides: the message insert, the sender-side
#      eligibility re-check the alert fan-out runs before each channel
#      (communication-core.ts isLiveParticipant), and the read-time bell filter
#      (events.ts lostConversationIds);
#   1/7. the live participants keep reading, writing and seeing each other.
# No migration is added or changed by this proof.
#
# Every probe runs under `set role authenticated` with a real
# request.jwt.claim.sub, so RLS and grants genuinely decide.
#
# Usage (Windows git-bash; ports 54290-54389 are outside the Windows excluded range):
#   initdb -D $DIR/data -U postgres --auth=trust -E UTF8
#   pg_ctl -D $DIR/data -o "-p 54300 -c listen_addresses=127.0.0.1" -l $DIR/pg.log start
#   PGPROOF_HOST=127.0.0.1 PGPROOF_PORT=54300 bash scripts/db-proof/chat-participant-revocation.sh
# Never point this at production or at a shared local Supabase stack. It DROPs schema public.
# ============================================================================
set -uo pipefail
export PGCLIENTENCODING=UTF8

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
M="$REPO/supabase/migrations"
LFD="$(mktemp -d)"
for f in "$M"/0021_communication.sql "$M"/20260612170000_conversation_participant_revocation.sql \
         "$M"/20260712130000_conversation_message_attachments.sql \
         "$M"/20261006100100_conversation_participants_server_authority_v1.sql; do
  tr -d '\r' < "$f" > "$LFD/$(basename "$f")"
done

PGPROOF_HOST=${PGPROOF_HOST:-127.0.0.1}
PGPROOF_PORT=${PGPROOF_PORT:-54300}
case "$PGPROOF_HOST" in 127.0.0.1|localhost|/*) ;; *) echo "refusing non-local host $PGPROOF_HOST"; exit 2;; esac
PSQL="psql -h $PGPROOF_HOST -p $PGPROOF_PORT -U postgres -d postgres -tA -q"

echo "Rebuilding a clean proof database ..."
$PSQL -c "drop schema if exists public cascade; create schema public; drop schema if exists auth cascade; drop schema if exists storage cascade;" >/dev/null 2>&1
for f in "$HERE/chat-participant-revocation.prelude.sql" \
         "$LFD/0021_communication.sql" \
         "$LFD/20260612170000_conversation_participant_revocation.sql" \
         "$LFD/20260712130000_conversation_message_attachments.sql" \
         "$LFD/20261006100100_conversation_participants_server_authority_v1.sql"; do
  tr -d '\r' < "$f" | $PSQL -v ON_ERROR_STOP=1 -f - >/dev/null 2>"$LFD/err" || { echo "BASELINE FAILED: $f"; cat "$LFD/err"; exit 1; }
done

OWNER=11111111-1111-4111-8111-111111111111     # creator of the thread (cannot be revoked)
LIVE=22222222-2222-4222-8222-222222222222      # stays a participant
GONE=33333333-3333-4333-8333-333333333333      # removed by the owner
FRIEND=44444444-4444-4444-8444-444444444444    # an account GONE controls, never a participant
CONV=c0000000-0000-4000-8000-000000000001
OTHER=c0000000-0000-4000-8000-000000000002     # a second thread GONE is still in

$PSQL -v ON_ERROR_STOP=1 >/dev/null <<SQL || { echo "seed FAILED"; exit 1; }
insert into public.profiles(id) values ('$OWNER'),('$LIVE'),('$GONE'),('$FRIEND');
insert into public.conversations(id, created_by, subject) values ('$CONV','$OWNER','site A'), ('$OTHER','$LIVE','site B');
insert into public.conversation_participants(conversation_id, profile_id, added_by) values
  ('$CONV','$OWNER','$OWNER'),('$CONV','$LIVE','$OWNER'),('$CONV','$GONE','$OWNER'),
  ('$OTHER','$LIVE','$LIVE'),('$OTHER','$GONE','$LIVE');
insert into public.conversation_messages(conversation_id, author_id, body) values
  ('$CONV','$OWNER','before removal'), ('$OTHER','$LIVE','other thread');
SQL

pass=0; fail=0
as() { local who="$1"; shift
  printf '%s\n' "set role authenticated; set request.jwt.claim.sub='$who'; $*" | $PSQL -f - 2>&1 | tr -d '\r' | sed 's/^psql:<stdin>:[0-9]*: //'; }
check() { if [ "$2" = "$3" ]; then echo "  PASS  $1"; pass=$((pass+1)); else echo "  FAIL  $1 (expected [$2], got [$3])"; fail=$((fail+1)); fi; }
has() { if printf '%s' "$3" | grep -qiE "$2"; then echo "  PASS  $1"; pass=$((pass+1)); else echo "  FAIL  $1 (wanted /$2/, got [$3])"; fail=$((fail+1)); fi; }
q() { $PSQL -c "$1" 2>&1 | tr -d '\r' | head -1; }

# The sender-side eligibility re-check, exactly as communication-core.ts
# isLiveParticipant asks it (sender's session, one recipient, live rows only).
recheck() { as "$1" "select count(*) from public.conversation_participants where conversation_id='$2' and profile_id='$3' and revoked_at is null;"; }
# The read-time bell filter, as events.ts lostConversationIds asks it under the
# READER's session: is any live row of the thread visible to them?
open_to() { as "$1" "select count(*) from public.conversation_participants where conversation_id='$2' and revoked_at is null;"; }

ATT=a0000000-0000-4000-8000-0000000000a1
APATH="$CONV/$OWNER/$ATT/photo.png"
MSG1=$($PSQL -c "select id from public.conversation_messages where conversation_id='$CONV' and body='before removal';" | tr -d '' | head -1)
check "the owner uploads a file into their own folder of the thread" "INSERT 0 1" "$(printf '%s
' "set role authenticated; set request.jwt.claim.sub='$OWNER'; insert into storage.objects(bucket_id, name) values ('conversation-attachments','$APATH');" | psql -h $PGPROOF_HOST -p $PGPROOF_PORT -U postgres -d postgres -tA -f - 2>&1 | tr -d '' | tail -1)"
as $OWNER "select public.register_conversation_message_attachment('$ATT','$MSG1','photo.png','image/png',120,'$APATH');" >/dev/null

echo; echo "== Before removal: everyone in the thread reads it"
check "GONE sees the attachment row before removal" "1" "$(as $GONE "select count(*) from public.conversation_message_attachments where conversation_id='$CONV';")"
check "GONE sees the stored file before removal" "1" "$(as $GONE "select count(*) from storage.objects where bucket_id='conversation-attachments' and name='$APATH';")"
check "GONE reads the thread's message before removal" "1" "$(as $GONE "select count(*) from public.conversation_messages where conversation_id='$CONV';")"
check "re-check: GONE is eligible before removal" "1" "$(recheck $OWNER $CONV $GONE)"

# GONE writes one message of its own while still a participant, so the
# post-removal registration probe below fails for being REMOVED, not for
# naming someone else's message.
MSGG=$(as $GONE "insert into public.conversation_messages(conversation_id, author_id, body) values ('$CONV','$GONE','gone before removal') returning id;" | grep -oE '[0-9a-f-]{36}' | head -1)
check "GONE could write while a participant" "36" "${#MSGG}"

echo; echo "== The owner removes GONE"
check "revoke_conversation_participant → ok" "ok" "$(as $OWNER "select public.revoke_conversation_participant('$CONV','$GONE');")"
$PSQL -c "insert into public.conversation_messages(conversation_id, author_id, body) values ('$CONV','$OWNER','after removal');" >/dev/null

echo; echo "== 3. A removed participant cannot read or write the thread"
check "conversation row hidden" "0" "$(as $GONE "select count(*) from public.conversations where id='$CONV';")"
check "no message visible (old or new)" "0" "$(as $GONE "select count(*) from public.conversation_messages where conversation_id='$CONV';")"
check "co-participant rows hidden; only their own revoked row" "1" "$(as $GONE "select count(*) from public.conversation_participants where conversation_id='$CONV';")"
has "sending is refused by RLS" "row-level security|violates" "$(as $GONE "insert into public.conversation_messages(conversation_id, author_id, body) values ('$CONV','$GONE','still here?');")"
check "nothing was written by the refused send" "0" "$(q "select count(*) from public.conversation_messages where author_id='$GONE' and body='still here?';")"

check "attachment rows hidden" "0" "$(as $GONE "select count(*) from public.conversation_message_attachments where conversation_id='$CONV';")"
check "the stored file is hidden (no download)" "0" "$(as $GONE "select count(*) from storage.objects where bucket_id='conversation-attachments' and name='$APATH';")"
has "uploading into the thread is refused" "row-level security|violates" "$(as $GONE "insert into storage.objects(bucket_id, name) values ('conversation-attachments','$CONV/$GONE/$ATT/x.png');")"
has "registering an attachment on their OWN earlier message is refused" "not|denied|participant|42501" "$(as $GONE "select public.register_conversation_message_attachment('a0000000-0000-4000-8000-0000000000a2','$MSGG','x.png','image/png',10,'$CONV/$GONE/a0000000-0000-4000-8000-0000000000a2/x.png');")"

echo; echo "== 4. A removed participant cannot re-add or un-revoke themselves"
has "un-revoke via UPDATE is refused (column grant: last_read_at only)" "permission denied" "$(as $GONE "update public.conversation_participants set revoked_at = null where conversation_id='$CONV' and profile_id='$GONE';")"
has "re-insert of their own row is refused" "duplicate key|row-level security|violates" "$(as $GONE "insert into public.conversation_participants(conversation_id, profile_id, added_by) values ('$CONV','$GONE','$GONE');")"
has "adding a friend account to read for them is refused" "row-level security|violates" "$(as $GONE "insert into public.conversation_participants(conversation_id, profile_id, added_by) values ('$CONV','$FRIEND','$GONE');")"
has "they cannot revoke someone else" "not_authorized" "$(as $GONE "select public.revoke_conversation_participant('$CONV','$LIVE');")"
check "still revoked after every attempt" "1" "$(q "select count(*) from public.conversation_participants where conversation_id='$CONV' and profile_id='$GONE' and revoked_at is not null;")"
check "FRIEND never became a participant" "0" "$(q "select count(*) from public.conversation_participants where profile_id='$FRIEND';")"
has "the creator cannot be revoked (no owner-less thread, no bypass)" "cannot_revoke_creator" "$(as $OWNER "select public.revoke_conversation_participant('$CONV','$OWNER');")"

echo; echo "== 6. Removal while a send is in flight"
# The send read the participant list BEFORE the removal (the fan-out list held
# GONE). After the removal commits, every database-decided step re-reads:
check "re-check before the bell: GONE not eligible" "0" "$(recheck $OWNER $CONV $GONE)"
check "re-check before the e-mail / push: still not eligible" "0" "$(recheck $LIVE $CONV $GONE)"
check "read-time bell filter: the thread is closed to GONE" "0" "$(open_to $GONE $CONV)"
# A concurrent revoke and insert in two sessions: READ COMMITTED re-evaluates
# the insert policy on the committed state, so the late insert is refused.
$PSQL -c "update public.conversation_participants set revoked_at = null where conversation_id='$OTHER' and profile_id='$GONE';" >/dev/null
( printf '%s\n' "begin; set local role authenticated; set local request.jwt.claim.sub='$LIVE'; select public.revoke_conversation_participant('$OTHER','$GONE'); select pg_sleep(1); commit;" | $PSQL -f - >/dev/null 2>&1 ) &
sleep 0.3
LATE=$(as $GONE "select pg_sleep(1.5); insert into public.conversation_messages(conversation_id, author_id, body) values ('$OTHER','$GONE','racing the removal');")
wait
has "a send that lands after the concurrent removal commits is refused" "row-level security|violates" "$LATE"
check "re-check after the concurrent removal: GONE not eligible" "0" "$(recheck $LIVE $OTHER $GONE)"

echo; echo "== 1 / 7. The live participants are untouched"
check "LIVE reads the thread's messages (incl. GONE's earlier one)" "3" "$(as $LIVE "select count(*) from public.conversation_messages where conversation_id='$CONV';")"
check "LIVE can still send" "INSERT 0 1" "$(printf '%s\n' "set role authenticated; set request.jwt.claim.sub='$LIVE'; insert into public.conversation_messages(conversation_id, author_id, body) values ('$CONV','$LIVE','hello');" | psql -h $PGPROOF_HOST -p $PGPROOF_PORT -U postgres -d postgres -tA -f - 2>&1 | tr -d '\r' | tail -1)"
check "re-check: LIVE is still eligible" "1" "$(recheck $OWNER $CONV $LIVE)"
check "re-check: OWNER is eligible for LIVE's messages" "1" "$(recheck $LIVE $CONV $OWNER)"
check "read-time bell filter: the thread stays open to LIVE" "2" "$(open_to $LIVE $CONV)"
check "LIVE still sees the attachment row and the file" "1 1" "$(as $LIVE "select count(*) from public.conversation_message_attachments where conversation_id='$CONV';") $(as $LIVE "select count(*) from storage.objects where name='$APATH';")"
check "LIVE still sees GONE's revoked row (why the fan-out must filter it)" "1" "$(as $LIVE "select count(*) from public.conversation_participants where conversation_id='$CONV' and profile_id='$GONE' and revoked_at is not null;")"

echo; echo "Result: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
