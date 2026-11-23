#!/usr/bin/env bash
# ============================================================================
# PROJECT-TO-INVOICE LIFECYCLE v1 - behavioural proof on a scratch PostgreSQL 16.
#
# Loads: the counterparty-authority production-state prelude, the REAL
# counterparty migration (dependency), a reduced-dependency supplement, the REAL
# finance migrations (3), then applies 20261008150000_project_invoice_lifecycle_v1.sql
# VERBATIM and its rollback VERBATIM. Every probe runs as `authenticated` / `anon`
# (never the superuser), so RLS + grants + function bodies decide.
#
# Usage (scratch cluster, no Docker):
#   initdb -D $DIR/data -U postgres --auth=trust -E UTF8
#   pg_ctl -D $DIR/data -o "-p 54397 -c listen_addresses=127.0.0.1" -l $DIR/pg.log start
#   PGPROOF_HOST=127.0.0.1 PGPROOF_PORT=54397 bash scripts/db-proof/project-invoice-lifecycle-v1.sh
# Throwaway only. Never point this at production or a shared local stack.
# ============================================================================
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
HOST="${PGPROOF_HOST:-127.0.0.1}"; PORT="${PGPROOF_PORT:-54397}"
DB="invlife1"
ADMIN="psql -h $HOST -p $PORT -U postgres -d postgres -tA -q"
PSQL="psql -h $HOST -p $PORT -U postgres -d $DB"
MIG="$REPO/supabase/migrations/20261008150000_project_invoice_lifecycle_v1.sql"
DOWN="$REPO/supabase/rollbacks/20261008150000_project_invoice_lifecycle_v1.down.sql"
MIGDIR="$REPO/supabase/migrations"

A1=a0000001-0000-0000-0000-000000000001   # issuer owner (finance)
A2=a0000002-0000-0000-0000-000000000002   # issuer admin (finance)
A3=a0000003-0000-0000-0000-000000000003   # issuer manager (project manager, NOT finance)
WP=a0000004-0000-0000-0000-000000000004   # worker profile
C1=c0000001-0000-0000-0000-000000000001   # client representative
B1=b0000001-0000-0000-0000-000000000001   # other org owner
ORG_A=aaaaaaaa-0000-0000-0000-00000000000a
ORG_C=cccccccc-0000-0000-0000-00000000000c
ORG_B=bbbbbbbb-0000-0000-0000-00000000000b
P1=90000000-0000-0000-0000-0000000000a1   # contractor-owned project (org A)
PC=90000000-0000-0000-0000-0000000000c1   # client-owned project (org C), A supplies the worker
W=aaaa0004-0000-0000-0000-000000000004

pass=0; fail=0
q() { $PSQL -tA -v ON_ERROR_STOP=0 -c "$1" 2>&1; }
as_role() { # uid role sql
  $PSQL -tA -v ON_ERROR_STOP=0 2>&1 <<SQL
\\set VERBOSITY terse
begin;
set local role $2;
select set_config('request.jwt.claim.sub', '$1', true);
$3
commit;
SQL
}
as_user() { as_role "$1" authenticated "$2" | grep -v -E '^(BEGIN|COMMIT|SET|)$' | grep -v -E '^[0-9a-f-]{36}$|^$' ; }
# like as_user but keeps everything except txn noise (used when a uuid is the answer)
as_user_raw() { as_role "$1" authenticated "$2" | grep -v -E '^(BEGIN|COMMIT|SET|)$' | sed '/^$/d'; }
check() { # label kind needle actual
  local hay="${4,,}" needle="${3,,}" found=no
  [[ "$hay" == *"$needle"* ]] && found=yes
  if { [ "$2" = contains ] && [ "$found" = yes ]; } || { [ "$2" = absent ] && [ "$found" = no ]; }; then
    printf '  PASS  %s\n' "$1"; pass=$((pass+1))
  else
    printf '  FAIL  %s\n        expected %s "%s"\n        got: %s\n' "$1" "$2" "$3" "${4//$'\n'/ | }"; fail=$((fail+1))
  fi
}
J() { echo "select ($1)::text;"; }   # jsonb -> text
ST() { echo "select ($1)->>'status';"; }

SNAP() { # md5 of every FINANCIAL field of one invoice, its lines and its sources (control stamps excluded)
  q "select md5(
    (select concat_ws('|', amount_cents, vat_amount_cents, currency, counterparty_name, client_org_id, customer_vat_id, customer_address, invoice_number,
        net_total_cents, tax_total_cents, gross_total_cents, tax_breakdown::text, tax_rounding, issuer_org_id, billing_period_id, project_id, issued_at, issued_by,
        recipient_id, recipient_snapshot::text, number_series, number_year, number_seq)
       from public.finance_records where id='$1')
    || coalesce((select string_agg(concat_ws('|', l.line_no, l.basis_type, l.rate_term_id, l.unit, l.quantity, l.unit_price_cents, l.net_cents, l.currency, l.evidence_class,
        l.qty_client_accepted, l.tax_treatment, l.tax_rate_percent, l.tax_note, l.tax_cents, l.gross_cents), ';' order by l.line_no) from public.finance_record_lines l where l.invoice_id='$1'), '')
    || coalesce((select string_agg(concat_ws('|', s.journal_entry_id, s.source_key, s.hours, s.quantity, s.evidence_class, s.internal_confirmation_id, s.client_confirmation_id, s.entry_hash), ';' order by s.id) from public.finance_record_line_sources s where s.invoice_id='$1'), ''))"
}
DRAFT_SQL() { # period recipient [replaces-literal] [selection-literal]
  echo "public.create_invoice_draft_from_period_v1('$1',null,null,null,null,null,null,${3:-null},'$2',${4:-null})"
}
fresh_db() {
  $ADMIN -c "drop database if exists $1" -c "create database $1" >/dev/null
  PSQL="psql -h $HOST -p $PORT -U postgres -d $1"
  for f in "$HERE/journal-counterparty-authority.prelude.sql" "$MIGDIR/20261003150500_journal_counterparty_review_authority_v1.sql" \
           "$HERE/project-invoice-lifecycle-v1.prelude2.sql" "$HERE/project-invoice-lifecycle-v1.seed.sql" \
           "$MIGDIR/20260711230000_finance_records_v1.sql" "$MIGDIR/20260817123000_finance_org_authority_v1.sql" \
           "$MIGDIR/20260817220000_finance_invoice_upgrades_v1.sql"; do
    $PSQL -q -v ON_ERROR_STOP=1 -f "$f" >/dev/null 2>"$HERE/.inv.err" || { cat "$HERE/.inv.err"; echo "LOAD FAILED: $(basename "$f")"; exit 1; }
  done
}

echo "=============================================================="
echo " Project-to-invoice lifecycle v1 - behavioural proof"
echo "=============================================================="
fresh_db "$DB"

echo; echo "--- 0. BEFORE: the documented defects are real in the production-state finance RPCs"
q "insert into public.companies (id, profile_id) values ('c0c0c0c0-0000-0000-0000-000000000001','$A1');" >/dev/null
q "update public.organizations set legacy_company_id='c0c0c0c0-0000-0000-0000-000000000001' where id='$ORG_A';" >/dev/null
q "grant select on public.finance_records to authenticated" >/dev/null
r=$(as_user $A1 "select public.create_finance_record_v2('invoice_issued','Legacy invoice','Old Client Ltd','100000','issued',null,null,'c0c0c0c0-0000-0000-0000-000000000001',null,'L-1','0',null);")
check "legacy v2 creates an ISSUED invoice" contains "created" "$r"
LEG=$(q "select id from public.finance_records where invoice_number='L-1'")
check "BEFORE: owner can change the amount of an ISSUED invoice (the defect)" contains "updated" "$(as_user $A1 "select public.update_finance_record_v2('$LEG','Legacy invoice','Old Client Ltd','999999',null,null,'L-1','0',null);")"
check "BEFORE: issued -> draft is accepted (the defect)" contains "updated" "$(as_user $A1 "select public.set_finance_record_status_v1('$LEG','draft');")"
q "update public.finance_records set status='issued', amount_cents=100000 where id='$LEG'" >/dev/null

echo; echo "--- 1. apply the migration VERBATIM"
$PSQL -q -v ON_ERROR_STOP=1 -f "$MIG" >/dev/null 2>"$HERE/.inv.err" && echo "  applied cleanly" || { cat "$HERE/.inv.err"; echo MIGRATION FAILED; exit 1; }
check "currency CHECK relaxed to ISO shape" contains "finance_records_currency_iso" "$(q "select conname from pg_constraint where conrelid='public.finance_records'::regclass and conname like 'finance_records_currency%'")"
check "RLS enabled on all 8 new tables" contains "8" "$(q "select count(*) from pg_class where relname in ('project_rate_terms','billing_periods','organization_tax_presets','invoice_series_configs','invoice_number_counters','invoice_recipients','finance_record_lines','finance_record_line_sources') and relrowsecurity")"
check "authenticated/anon have NO write grant on new tables" contains "0" "$(q "select count(*) from information_schema.role_table_grants where grantee in ('authenticated','anon','public') and table_name in ('project_rate_terms','billing_periods','organization_tax_presets','invoice_series_configs','invoice_number_counters','invoice_recipients','finance_record_lines','finance_record_line_sources') and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE')")"
check "anon has NO privilege at all on new tables" contains "0" "$(q "select count(*) from information_schema.role_table_grants where grantee in ('anon','public') and table_name in ('project_rate_terms','billing_periods','finance_record_lines','finance_record_line_sources','organization_tax_presets','invoice_series_configs','invoice_number_counters','invoice_recipients')")"
check "no new function is executable by anon/PUBLIC" contains "0" "$(q "select count(*) from pg_proc p where pronamespace='public'::regnamespace and (proname like '%invoice%' or proname like '%billing_period%' or proname like '%rate_term%' or proname like '%recipient%' or proname like 'correct_%' or proname like 'configure_%' or proname like '%totals%' or proname like '%tax_preset%') and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('public', p.oid, 'execute'))")"
check "the number allocator is NOT executable by authenticated" contains "f" "$(q "select has_function_privilege('authenticated','public._invoice_take_number_v1(uuid,text)','execute')")"
check "internal evidence derivation is NOT executable by authenticated (no oracle)" contains "f" "$(q "select has_function_privilege('authenticated','public._invoice_period_evidence_v1(uuid,uuid)','execute')")"
check "every new SECDEF function pins search_path" contains "0" "$(q "select count(*) from pg_proc p where pronamespace='public'::regnamespace and prosecdef and (proname like '%invoice%' or proname like '%billing_period%' or proname like '%rate_term%' or proname like '%recipient%' or proname like 'correct_%' or proname like 'configure_%' or proname like '%totals%' or proname like '%tax_preset%') and not coalesce(proconfig::text,'') like '%search_path%'")"
check "anon cannot call add_project_rate_term_v1" contains "permission denied" "$(as_role '' anon "select public.add_project_rate_term_v1('$P1','hours',null,4500,'EUR',null,null,'2026-09-01',null);")"
check "legacy issued invoice is now frozen (amount)" contains "immutable_issued" "$(as_user $A1 "select public.update_finance_record_v2('$LEG','Legacy invoice','Old Client Ltd','1','2026-12-31','n','L-1','0',null);")"
check "legacy issued invoice: due date + note still editable" contains "updated" "$(as_user $A1 "select public.update_finance_record_v2('$LEG','Legacy invoice','Old Client Ltd','100000','2026-12-31','n','L-1','0',null);")"
check "legacy v1 update cannot change amount either" contains "immutable_issued" "$(as_user $A1 "select public.update_finance_record_v1('$LEG','Legacy invoice','Old Client Ltd','5',null,null);")"
check "issued -> draft refused" contains "invalid_transition" "$(as_user $A1 "select public.set_finance_record_status_v1('$LEG','draft');")"
check "legacy issued -> paid still allowed (behaviour kept)" contains "updated" "$(as_user $A1 "select public.set_finance_record_status_v1('$LEG','paid');")"
check "paid -> partially_paid allowed (payment bookkeeping correction)" contains "updated" "$(as_user $A1 "select public.set_finance_record_status_v1('$LEG','partially_paid');")"
check "superuser direct UPDATE of an issued amount is blocked by the trigger" contains "issued_invoice_is_immutable" "$(q "update public.finance_records set amount_cents=1 where id='$LEG'")"
check "non-issued behaviour unchanged: a DRAFT manual invoice can be edited" contains "updated" "$(as_user $A1 "select public.create_finance_record_v2('invoice_issued','Draft manual','Cli','500','draft',null,null,'c0c0c0c0-0000-0000-0000-000000000001',null,null,null,null);" >/dev/null; as_user $A1 "select public.update_finance_record_v2((select id::text from public.finance_records where title='Draft manual'),'Draft manual','Cli','600',null,null,null,null,null);")"

echo; echo "--- 2. seed journal evidence (worker W on project P1, org A engagement)"
$PSQL -q -v ON_ERROR_STOP=1 >/dev/null 2>"$HERE/.inv.err" <<SQL || { cat "$HERE/.inv.err"; echo SEED2 FAILED; exit 1; }
insert into public.projects (id, organization_id, title) values ('$PC','$ORG_C','Client-owned site');
insert into public.project_worker_assignments (project_id, worker_id, status) values ('$PC','$W','active');
create or replace function pg_temp.mk(p_id uuid, p_day text, p_proj uuid) returns void language sql as \$\$
  insert into public.journal_entries (id, worker_id, engagement_context_id, original_text, hash_self, project_id, created_at)
  values (p_id, '$W', 'ec000004-0000-0000-0000-000000000004', 'work ' || p_day, 'h-' || p_id, p_proj, (p_day || ' 12:00:00+00')::timestamptz);
  insert into public.journal_entry_metrics (entry_id, metric_slug, value_text) values (p_id, 'work_date', p_day);
\$\$;
select pg_temp.mk('e1000000-0000-0000-0000-000000000001','2026-09-02','$P1');
select pg_temp.mk('e1000000-0000-0000-0000-000000000002','2026-09-03','$P1');
select pg_temp.mk('e1000000-0000-0000-0000-000000000003','2026-09-04','$P1');
select pg_temp.mk('e1000000-0000-0000-0000-000000000004','2026-09-05','$P1');
select pg_temp.mk('e1000000-0000-0000-0000-000000000005','2026-09-06','$P1');
select pg_temp.mk('e1000000-0000-0000-0000-000000000006','2026-10-02','$P1');
select pg_temp.mk('e1000000-0000-0000-0000-000000000007','2026-09-07','$P1');
select pg_temp.mk('e1000000-0000-0000-0000-000000000008','2026-09-10','$P1');
select pg_temp.mk('e2000000-0000-0000-0000-000000000001','2026-09-08','$PC');
select pg_temp.mk('e2000000-0000-0000-0000-000000000002','2026-09-09','$PC');
select pg_temp.mk('e2000000-0000-0000-0000-000000000003','2026-09-11','$PC');
-- E1: fragment time 8 h (two fragments: 5 h + 180 min = 8 h)
insert into public.journal_entry_metrics (entry_id, metric_slug, value_text, value_numeric, unit_slug) values
 ('e1000000-0000-0000-0000-000000000001','fragment_time','1',5,'hours'),
 ('e1000000-0000-0000-0000-000000000001','fragment_time','2',180,'minutes');
-- E2: entry-level 90 minutes = 1.5 h
insert into public.journal_entry_metrics (entry_id, metric_slug, value_numeric, unit_slug) values ('e1000000-0000-0000-0000-000000000002','quantity',90,'minutes');
-- E3: 4 h AND 40 square meters (output quantity, never summed with time)
insert into public.journal_entry_metrics (entry_id, metric_slug, value_numeric, unit_slug) values
 ('e1000000-0000-0000-0000-000000000003','quantity',4,'hours'),('e1000000-0000-0000-0000-000000000003','quantity',40,'square_meters');
-- E4 6 h unconfirmed, E5 5 h approved-then-rejected, E6 3 h outside the period, E7 2 h with 2 photos, E8 3 h (used after the lock)
insert into public.journal_entry_metrics (entry_id, metric_slug, value_numeric, unit_slug) values
 ('e1000000-0000-0000-0000-000000000004','quantity',6,'hours'),('e1000000-0000-0000-0000-000000000005','quantity',5,'hours'),
 ('e1000000-0000-0000-0000-000000000006','quantity',3,'hours'),('e1000000-0000-0000-0000-000000000007','quantity',2,'hours'),
 ('e1000000-0000-0000-0000-000000000008','quantity',3,'hours'),
 ('e2000000-0000-0000-0000-000000000001','quantity',7,'hours'),('e2000000-0000-0000-0000-000000000002','quantity',2,'hours'),('e2000000-0000-0000-0000-000000000003','quantity',1,'hours');
insert into public.journal_entry_photos (entry_id, profile_id) values
 ('e1000000-0000-0000-0000-000000000007','$WP'),('e1000000-0000-0000-0000-000000000007','$WP');
grant select on public.company_memberships, public.organizations, public.engagement_contexts to authenticated;
SQL
REV() { echo "select public.review_journal_entry('$1'::uuid,'$2','$3');"; }
for e in 1 2 3 5 6 7; do as_user $A1 "$(REV e1000000-0000-0000-0000-00000000000$e approved ok)" >/dev/null; done
as_user $A2 "$(REV e1000000-0000-0000-0000-000000000005 rejected 'not worked')" >/dev/null
check "E5 latest independent decision is rejected" contains "rejected" "$(q "select confirmation_scope->>'decision' from public.journal_entry_confirmations where entry_id='e1000000-0000-0000-0000-000000000005' order by created_at desc limit 1")"
q "update public.engagement_contexts set journal_review_enabled=true" >/dev/null

echo; echo "--- 2b. recipients (issuer-owned contact book) and numbering configuration"
check "a plain project manager cannot create a recipient" contains "not_found" "$(as_user $A3 "$(ST "public.save_invoice_recipient_v1('$ORG_A',null,'Client UAB','1 Main Street, Vilnius','LT',null,null,null,null,null,null)")")"
check "lowercase country code refused" contains "invalid" "$(as_user $A2 "$(ST "public.save_invoice_recipient_v1('$ORG_A',null,'Client UAB','1 Main Street','lt',null,null,null,null,null,null)")")"
check "malformed e-mail refused" contains "invalid" "$(as_user $A2 "$(ST "public.save_invoice_recipient_v1('$ORG_A',null,'Client UAB','1 Main Street','LT',null,null,'not-an-email',null,null,null)")")"
check "a recipient cannot be linked to the issuer's own organization" contains "invalid_client_org" "$(as_user $A2 "$(ST "public.save_invoice_recipient_v1('$ORG_A',null,'Client UAB','1 Main Street','LT',null,null,null,null,'$ORG_A',null)")")"
RCP_A=$(as_user_raw $A2 "select (public.save_invoice_recipient_v1('$ORG_A',null,'Client UAB','1 Main Street, 01001 Vilnius','LT','LT100001',null,null,'PO-1','$ORG_C',null))->>'id';" | tail -1)
check "recipient created (a contact need not be a LabourMarket user)" contains "-" "$RCP_A"
RCP_INC=$(as_user_raw $A2 "select (public.save_invoice_recipient_v1('$ORG_A',null,'Name Only Ltd',null,null,null,null,null,null,null,null))->>'id';" | tail -1)
check "an incomplete contact can be saved early (completeness is checked at issue)" contains "-" "$RCP_INC"
RCP_B=$(as_user_raw $B1 "select (public.save_invoice_recipient_v1('$ORG_B',null,'Other Issuer Client','2 Road, Gdansk','PL',null,null,null,null,null,null))->>'id';" | tail -1)
check "the contact book is private to the issuing org (client rep, outsider, manager see none)" contains "0|1|0" "$(as_user $C1 "select count(*) from public.invoice_recipients;")|$(as_user $B1 "select count(*) from public.invoice_recipients;")|$(as_user $A3 "select count(*) from public.invoice_recipients;")"
check "the issuer admin reads exactly its own two contacts" contains "2" "$(as_user $A2 "select count(*) from public.invoice_recipients;")"
check "another issuer cannot update this issuer's contact by id" contains "not_found" "$(as_user $B1 "$(ST "public.save_invoice_recipient_v1('$ORG_B','$RCP_A','Hijacked Ltd','x street','LT',null,null,null,null,null,null)")")"
check "a manager cannot archive a contact" contains "not_found" "$(as_user $A3 "$(ST "public.archive_invoice_recipient_v1('$RCP_INC')")")"
echo "  -- numbering is configured per issuing organization and document type"
check "a project manager cannot configure the series" contains "not_found" "$(as_user $A3 "$(ST "public.configure_invoice_series_v1('$ORG_A','invoice','','-',4,false)")")"
check "pad 0 refused" contains "invalid" "$(as_user $A2 "$(ST "public.configure_invoice_series_v1('$ORG_A','invoice','','-',0,false)")")"
check "a prefix with spaces/symbols refused" contains "invalid" "$(as_user $A2 "$(ST "public.configure_invoice_series_v1('$ORG_A','invoice','A B%','-',4,false)")")"
check "unknown document type refused" contains "invalid" "$(as_user $A2 "$(ST "public.configure_invoice_series_v1('$ORG_A','receipt','','-',4,false)")")"
check "issuer admin configures the invoice series (no prefix, 4 digits, no year)" contains "saved" "$(as_user $A2 "$(ST "public.configure_invoice_series_v1('$ORG_A','invoice','','-',4,false)")")"
check "the configuration is audited (who, what)" contains "configure_invoice_series|a0000002-0000-0000-0000-000000000002" "$(q "select action||'|'||actor_id from public.audit_logs where action='configure_invoice_series' and entity_id='$ORG_A' order by occurred_at desc limit 1")"
check "series configs are readable only by the issuing org's owner/admin" contains "1|0|0" "$(as_user $A2 "select count(*) from public.invoice_series_configs;")|$(as_user $A3 "select count(*) from public.invoice_series_configs;")|$(as_user $C1 "select count(*) from public.invoice_series_configs;")"

echo; echo "--- 3. authority matrix: rate terms"
ADD_T() { echo "select public.add_project_rate_term_v1('$P1','$1',$2,$3,'EUR',$4,null,'2026-09-01',null);"; }
check "project manager WITHOUT finance authority cannot set the commercial basis" contains "not_found" "$(as_user $A3 "$(ST "$(ADD_T hours null 4500 null | sed 's/^select //;s/;$//')")")"
check "other org owner cannot" contains "not_found" "$(as_user $B1 "$(ST "$(ADD_T hours null 4500 null | sed 's/^select //;s/;$//')")")"
check "worker cannot" contains "not_found" "$(as_user $WP "$(ST "$(ADD_T hours null 4500 null | sed 's/^select //;s/;$//')")")"
R=$(as_user_raw $A2 "select public.add_project_rate_term_v1('$P1','hours',null,4500,'EUR','Hourly',null,'2026-09-01',null);")
check "admin (finance authority) adds the hours basis" contains "created" "$R"
check "overlapping hours basis refused" contains "overlapping_term" "$(as_user_raw $A2 "select public.add_project_rate_term_v1('$P1','hours',null,5000,'EUR',null,null,'2026-09-15',null);")"
check "quantity basis for a time unit refused" contains "invalid" "$(as_user_raw $A2 "select public.add_project_rate_term_v1('$P1','quantity','hours',100,'EUR',null,null,'2026-09-01',null);")"
check "quantity basis for minutes refused too (time is hours)" contains "invalid" "$(as_user_raw $A2 "select public.add_project_rate_term_v1('$P1','quantity','minutes',100,'EUR',null,null,'2026-09-01',null);")"
check "quantity basis (square_meters) added" contains "created" "$(as_user_raw $A1 "select public.add_project_rate_term_v1('$P1','quantity','square_meters',1200,'EUR','Plaster',null,'2026-09-01',null);")"
check "milestone basis added" contains "created" "$(as_user_raw $A1 "select public.add_project_rate_term_v1('$P1','milestone',null,250000,'EUR','Phase 1 handover',null,'2026-09-01',null);")"
check "fixed basis added" contains "created" "$(as_user_raw $A1 "select public.add_project_rate_term_v1('$P1','fixed',null,333,'EUR','Small fixed fee',null,'2026-09-01',null);")"
check "rate terms are not readable by the worker (RLS)" contains "0" "$(as_user $WP "select count(*) from public.project_rate_terms;")"
check "rate terms readable by the project manager" contains "4" "$(as_user $A3 "select count(*) from public.project_rate_terms;")"
check "rate terms invisible to the client rep and outsiders" contains "0" "$(as_user $C1 "select count(*) from public.project_rate_terms;") $(as_user $B1 "select count(*) from public.project_rate_terms;")"
check "agreed rate term is immutable (superuser UPDATE)" contains "append_only" "$(q "update public.project_rate_terms set rate_cents=1")"
check "rate terms cannot be deleted" contains "append_only" "$(q "delete from public.project_rate_terms")"

echo; echo "--- 4. billing period + evidence preview"
check "manager cannot create a billing period" contains "not_found" "$(as_user $A3 "$(ST "public.create_billing_period_v1('$P1','2026-09-01','2026-09-30')")")"
PER=$(as_user_raw $A2 "select (public.create_billing_period_v1('$P1','2026-09-01','2026-09-30'))->>'id';" | tail -1)
check "admin creates the September period" contains "-" "$PER"
check "overlapping period refused" contains "overlapping_period" "$(as_user $A2 "$(ST "public.create_billing_period_v1('$P1','2026-09-15','2026-10-15')")")"
PV=$(as_user_raw $A2 "select public.billing_period_preview_v1('$PER');")
check "preview: unconfirmed work is reported, not billed (E4)" contains "not_confirmed" "$PV"
check "preview: E1 fragments sum into two source rows f1,f2" contains "\"source_key\": \"f2\"" "$PV"
check "preview: output quantity row present (q:square_meters)" contains "q:square_meters" "$PV"
check "preview: the out-of-period entry (E6) is absent" absent "e1000000-0000-0000-0000-000000000006" "$PV"
check "preview refuses the outsider" contains "not_found" "$(as_user $B1 "select public.billing_period_preview_v1('$PER');")"
check "billable source rows (E1 f1+f2, E2, E3 hours+m2, E7)" contains "6" "$(echo "$PV" | grep -o '"eligibility": "billable"' | wc -l)"

echo; echo "--- 5. draft from period"
check "manager (no finance) cannot draft" contains "not_found" "$(as_user $A3 "$(ST "$(DRAFT_SQL "$PER" "$RCP_A")")")"
check "a recipient of another issuer cannot be used" contains "recipient_not_found" "$(as_user $A2 "$(ST "$(DRAFT_SQL "$PER" "$RCP_B")")")"
check "client org equal to issuer refused" contains "invalid_client_org" "$(as_user $A2 "$(ST "public.create_invoice_draft_from_period_v1('$PER','Client UAB','$ORG_A')")")"
DR=$(as_user_raw $A2 "select $(DRAFT_SQL "$PER" "$RCP_A");")
check "draft created" contains "created" "$DR"
INV=$(q "select id from public.finance_records where billing_period_id='$PER' and invoice_kind='invoice'")
check "draft has 2 evidence lines (hours + quantity)" contains "2" "$(q "select count(*) from public.finance_record_lines where invoice_id='$INV'")"
check "hours line = 15.5 h x 45.00 = 69750" contains "69750" "$(q "select net_cents from public.finance_record_lines where invoice_id='$INV' and basis_type='hours'")"
check "quantity line = 40 m2 x 12.00 = 48000" contains "48000" "$(q "select net_cents from public.finance_record_lines where invoice_id='$INV' and basis_type='quantity'")"
check "lines carry NO tax treatment until the user sets it (no auto-selection)" contains "2" "$(q "select count(*) from public.finance_record_lines where invoice_id='$INV' and tax_treatment is null")"
check "evidence class on lines is internal_confirmed (client share 0)" contains "internal_confirmed|0" "$(q "select string_agg(distinct evidence_class||'|'||qty_client_accepted::int, ',') from public.finance_record_lines where invoice_id='$INV' and basis_type<>'milestone'")"
check "sources keep the confirmation ids, hash and photos" contains "2" "$(q "select max(coalesce(array_length(photo_ids,1),0)) from public.finance_record_line_sources where invoice_id='$INV'")"
check "every source row cites an internal confirmation" contains "0" "$(q "select count(*) from public.finance_record_line_sources where invoice_id='$INV' and internal_confirmation_id is null")"
check "second draft for the same period refused" contains "already_has_invoice" "$(as_user $A2 "$(ST "public.create_invoice_draft_from_period_v1('$PER','Client UAB')")")"
check "draft is invisible to the client rep (no recipient read path exists)" contains "0" "$(as_user $C1 "select count(*) from public.finance_records where id='$INV';")"
check "line sources are issuer-side only (client rep sees none)" contains "0" "$(as_user $C1 "select count(*) from public.finance_record_line_sources;")"

echo; echo "--- 6. tax: configurable, explicit, snapshot"
check "issue refuses without explicit confirmation" contains "tax_confirmation_required" "$(as_user $A2 "$(ST "public.issue_invoice_v1('$INV', false)")")"
check "issue refuses while a line has no treatment" contains "tax_treatment_missing" "$(as_user $A2 "$(ST "public.issue_invoice_v1('$INV', true)")")"
HL=$(q "select id from public.finance_record_lines where invoice_id='$INV' and basis_type='hours'")
QL=$(q "select id from public.finance_record_lines where invoice_id='$INV' and basis_type='quantity'")
check "standard needs a positive rate" contains "invalid" "$(as_user $A2 "$(ST "public.set_invoice_line_tax_v1('$HL','standard',0,null)")")"
check "zero_rated with a non-zero rate refused" contains "invalid" "$(as_user $A2 "$(ST "public.set_invoice_line_tax_v1('$HL','zero_rated',5,null)")")"
check "unknown treatment refused" contains "invalid" "$(as_user $A2 "$(ST "public.set_invoice_line_tax_v1('$HL','magic',5,null)")")"
check "hours line: standard 20% -> 13950" contains "13950" "$(as_user $A2 "select public.set_invoice_line_tax_v1('$HL','standard',20,null);")"
check "quantity line: reduced 7.5% -> 3600" contains "3600" "$(as_user $A2 "select public.set_invoice_line_tax_v1('$QL','reduced',7.5,null);")"
check "manager cannot set tax" contains "not_found" "$(as_user $A3 "$(ST "public.set_invoice_line_tax_v1('$HL','standard',20,null)")")"
MT=$(q "select id from public.project_rate_terms where basis_type='milestone'")
FT=$(q "select id from public.project_rate_terms where basis_type='fixed'")
check "add milestone line (authorized representative confirms)" contains "added" "$(as_user $A2 "$(ST "public.add_invoice_basis_line_v1('$INV','$MT',1,null)")")"
check "add fixed line" contains "added" "$(as_user $A2 "$(ST "public.add_invoice_basis_line_v1('$INV','$FT',1,null)")")"
check "milestone line carries evidence class agreed_basis + confirmer" contains "agreed_basis|true" "$(q "select string_agg(evidence_class||'|'||(confirmed_by is not null), ',') from public.finance_record_lines where invoice_id='$INV' and basis_type='milestone'")"
check "invoice-level tax: apply reverse_charge to UNSET lines only, with a note" contains "lines" "$(as_user $A2 "select public.set_invoice_tax_v1('$INV','reverse_charge',0,'Tax payable by the recipient (text configured by the issuer)',true);")"
check "reverse_charge line: zero tax, treatment preserved" contains "reverse_charge|0" "$(q "select tax_treatment||'|'||tax_cents from public.finance_record_lines where invoice_id='$INV' and basis_type='milestone'")"
FL=$(q "select id from public.finance_record_lines where invoice_id='$INV' and basis_type='fixed'")
check "fixed line re-set to standard 7.5% (333 -> 24.975 -> 25: half away from zero)" contains "25" "$(as_user $A2 "select public.set_invoice_line_tax_v1('$FL','standard',7.5,null);")"
check "zero_rated and reverse_charge are DIFFERENT stored states" contains "reverse_charge" "$(q "select string_agg(distinct tax_treatment, ',') from public.finance_record_lines where invoice_id='$INV'")"
check "provisional net total (hours+qty+milestone+fixed) = 368083" contains "368083" "$(q "select net_total_cents from public.finance_records where id='$INV'")"
check "tax total = 13950+3600+0+25 = 17575, gross = 385658" contains "17575|385658" "$(q "select tax_total_cents||'|'||gross_total_cents from public.finance_records where id='$INV'")"
check "breakdown groups by treatment+rate (4 groups)" contains "4" "$(q "select jsonb_array_length(tax_breakdown) from public.finance_records where id='$INV'")"
check "legacy amount_cents/vat mirror the gross/tax" contains "385658|17575" "$(q "select amount_cents||'|'||vat_amount_cents from public.finance_records where id='$INV'")"
check "lifecycle draft amount cannot be hand-edited" contains "computed_amount" "$(as_user $A2 "select public.update_finance_record_v2('$INV','x invoice title','Client UAB','1',null,null,null,null,null);")"
check "lifecycle draft cannot be pushed to issued by the status RPC" contains "use_issue_invoice" "$(as_user $A2 "select public.set_finance_record_status_v1('$INV','issued');")"

echo; echo "--- 7. evidence drift between draft and issue is refused"
as_user $A2 "$(REV e1000000-0000-0000-0000-000000000007 rejected 'recheck')" >/dev/null
check "withdrawn approval after draft -> evidence_changed" contains "evidence_changed" "$(as_user $A2 "$(ST "public.issue_invoice_v1('$INV', true)")")"
as_user $A2 "$(REV e1000000-0000-0000-0000-000000000007 approved ok)" >/dev/null

echo; echo "--- 8. issue"
check "authority predicate is strictly FALSE (never NULL) for an outsider" contains "f" "$(as_user $B1 "select public.invoice_issuer_authority_v1('$ORG_A')::text;")"
check "the period reader predicate is strictly FALSE for the client's project manager on a SUPPLIER period" contains "f" "$(as_user $C1 "select public.invoice_period_reader_v1('$P1','$ORG_A')::text;")"
check "outsider cannot issue" contains "not_found" "$(as_user $B1 "$(ST "public.issue_invoice_v1('$INV', true)")")"
check "client rep cannot issue" contains "not_found" "$(as_user $C1 "$(ST "public.issue_invoice_v1('$INV', true)")")"
q "update public.finance_records set recipient_id=null where id='$INV'" >/dev/null
check "issue refuses without a recipient" contains "recipient_missing" "$(as_user $A2 "$(ST "public.issue_invoice_v1('$INV', true)")")"
check "a recipient of ANOTHER issuer cannot be attached" contains "recipient_not_found" "$(as_user $A2 "$(ST "public.set_invoice_recipient_v1('$INV','$RCP_B')")")"
as_user $A2 "select public.set_invoice_recipient_v1('$INV','$RCP_INC');" >/dev/null
INCOMPLETE=$(as_user_raw $A2 "select public.issue_invoice_v1('$INV', true)::text;")
check "issue refuses an incomplete recipient (legal name + address + country are the minimum)" contains "recipient_incomplete" "$INCOMPLETE"
check "... and names exactly what is missing" contains "\"address\"" "$INCOMPLETE"
check "... country too" contains "\"country\"" "$INCOMPLETE"
check "nothing was issued by the refusals" contains "draft" "$(q "select status from public.finance_records where id='$INV'")"
check "the plain project manager really MANAGES the project" contains "true" "$(as_user $A3 "select public.can_manage_project('$P1')::text;")"
check "... and is still refused to issue" contains "not_found" "$(as_user $A3 "$(ST "public.issue_invoice_v1('$INV', true)")")"
check "... refused to confirm tax / set a recipient / discard" contains "not_found|not_found|not_found" "$(as_user $A3 "$(ST "public.set_invoice_tax_v1('$INV','exempt',0,null,true)")")|$(as_user $A3 "$(ST "public.set_invoice_recipient_v1('$INV','$RCP_A')")")|$(as_user $A3 "$(ST "public.discard_invoice_draft_v1('$INV')")")"
as_user $A2 "select public.set_invoice_recipient_v1('$INV','$RCP_A');" >/dev/null
R=$(as_user $A2 "select public.issue_invoice_v1('$INV', true);")
check "issue succeeds and assigns number 0001" contains "0001" "$R"
SNAP0="$(SNAP $INV)"
check "number provenance stored: series, year 0 (not year-based), sequence 1" contains "invoice|0|1" "$(q "select number_series||'|'||number_year||'|'||number_seq from public.finance_records where id='$INV'")"
check "recipient snapshot frozen at issue: legal name, address, country, tax id" contains "Client UAB|1 Main Street, 01001 Vilnius|LT|LT100001" "$(q "select (recipient_snapshot->>'legal_name')||'|'||(recipient_snapshot->>'address')||'|'||(recipient_snapshot->>'country')||'|'||(recipient_snapshot->>'tax_id') from public.finance_records where id='$INV'")"
check "the snapshot cites the recipient record and its (optional) linked organization" contains "$RCP_A|$ORG_C" "$(q "select (recipient_snapshot->>'recipient_id')||'|'||(recipient_snapshot->>'linked_organization_id') from public.finance_records where id='$INV'")"
check "status issued + issued_at + issued_by" contains "issued|true|true" "$(q "select status||'|'||(issued_at is not null)||'|'||(issued_by is not null) from public.finance_records where id='$INV'")"
check "period is locked (invoiced, locked_at set)" contains "invoiced|true" "$(q "select status||'|'||(locked_at is not null) from public.billing_periods where id='$PER'")"
check "new draft for the locked period refused" contains "period_locked" "$(as_user $A2 "$(ST "public.create_invoice_draft_from_period_v1('$PER','Client UAB')")")"

echo; echo "--- 9. immutability after issue (every writer)"
check "RPC: amount change refused" contains "immutable_issued" "$(as_user $A2 "select public.update_finance_record_v2('$INV','Project invoice x','Client UAB','1',null,null,'0001','0',null);")"
check "RPC: issued -> draft refused" contains "invalid_transition" "$(as_user $A2 "select public.set_finance_record_status_v1('$INV','draft');")"
check "RPC: issued -> cancelled must go through void/credit" contains "use_correct_invoice" "$(as_user $A2 "select public.set_finance_record_status_v1('$INV','cancelled');")"
check "superuser: header amount blocked" contains "issued_invoice_is_immutable" "$(q "update public.finance_records set amount_cents=amount_cents+1 where id='$INV'")"
check "superuser: invoice number blocked" contains "issued_invoice_is_immutable" "$(q "update public.finance_records set invoice_number='X' where id='$INV'")"
check "superuser: tax breakdown blocked" contains "issued_invoice_is_immutable" "$(q "update public.finance_records set tax_breakdown='[]' where id='$INV'")"
check "superuser: line TREATMENT change after issue refused" contains "issued_invoice_is_immutable" "$(q "update public.finance_record_lines set tax_treatment='zero_rated', tax_rate_percent=0, tax_cents=0, gross_cents=net_cents where id='$HL'")"
check "superuser: line net blocked" contains "issued_invoice_is_immutable" "$(q "update public.finance_record_lines set net_cents=1 where id='$HL'")"
check "superuser: line delete blocked" contains "issued_invoice_is_immutable" "$(q "delete from public.finance_record_lines where id='$HL'")"
check "superuser: line insert blocked" contains "issued_invoice_is_immutable" "$(q "insert into public.finance_record_lines (invoice_id,line_no,basis_type,quantity,unit_price_cents,net_cents,currency,evidence_class) values ('$INV',99,'fixed',1,1,1,'EUR','agreed_basis')")"
check "superuser: source row change blocked" contains "issued_invoice_is_immutable" "$(q "update public.finance_record_line_sources set hours=99 where invoice_id='$INV'")"
check "superuser: invoice delete blocked" contains "issued_invoice_is_immutable" "$(q "delete from public.finance_records where id='$INV'")"
check "superuser: draft-back via status blocked" contains "issued_invoice_is_immutable" "$(q "update public.finance_records set status='draft' where id='$INV'")"
for col in "counterparty_name='Other Customer'" "currency='SEK'" "client_org_id=null" "customer_vat_id='X1'" "customer_address='Elsewhere'" "billing_period_id=null" "issuer_org_id='$ORG_C'" "project_id=null" "vat_amount_cents=1" "tax_total_cents=1" "gross_total_cents=1" "net_total_cents=1" "title='Renamed doc'" "issued_at=now()" "recipient_id=null" "recipient_snapshot='{}'::jsonb" "number_seq=999" "number_series='credit_note'" "number_year=1" ; do
  check "superuser: issued invoice field ($col) is frozen" contains "issued_invoice_is_immutable" "$(q "update public.finance_records set $col where id='$INV'")"
done
for col in "rate_term_id=null" "unit_price_cents=1" "quantity=1" "currency='SEK'" "evidence_class='client_accepted'" "tax_rate_percent=1" "tax_note='changed'" "tax_cents=1" "gross_cents=1" "description='x'" "basis_type='fixed'"; do
  check "superuser: issued line field ($col) is frozen" contains "issued_invoice_is_immutable" "$(q "update public.finance_record_lines set $col where id='$HL'")"
done
for col in "hours=1" "quantity=1" "evidence_class='client_accepted'" "entry_hash='x'" "work_day=now()::date"; do
  check "superuser: issued source field ($col) is frozen" contains "issued_invoice_is_immutable" "$(q "update public.finance_record_line_sources set $col where invoice_id='$INV'")"
done
check "RPC: recipient change refused" contains "immutable_issued" "$(as_user $A2 "select public.update_finance_record_v2('$INV','Project invoice 2026-09-01 - 2026-09-30','Someone Else Ltd','385658',null,null,'0001','17575',null);")"
check "RPC: invoice number change refused" contains "immutable_issued" "$(as_user $A2 "select public.update_finance_record_v2('$INV','Project invoice 2026-09-01 - 2026-09-30','Client UAB','385658',null,null,'9999','17575',null);")"
check "RPC: VAT amount change refused" contains "immutable_issued" "$(as_user $A2 "select public.update_finance_record_v2('$INV','Project invoice 2026-09-01 - 2026-09-30','Client UAB','385658',null,null,'0001','0',null);")"
as_user $A2 "select public.save_invoice_recipient_v1('$ORG_A','$RCP_A','Renamed Client AB','Elsewhere 5, Stockholm','SE','SE-VAT-9',null,null,null,null,null);" >/dev/null
check "the contact book can change; the issued invoice still shows the recipient AS ISSUED" contains "Client UAB|LT100001|LT" "$(q "select counterparty_name||'|'||customer_vat_id||'|'||(recipient_snapshot->>'country') from public.finance_records where id='$INV'")"
check "note/due date still editable on issued" contains "updated" "$(as_user $A2 "select public.update_finance_record_v2('$INV','Project invoice 2026-09-01 - 2026-09-30','Client UAB','385658','2026-10-31','payable in 30 days','0001','17575',null);")"
check "tax line edit after issue refused through the RPC" contains "issued_invoice_is_immutable" "$(as_user $A2 "$(ST "public.set_invoice_line_tax_v1('$HL','zero_rated',0,null)")")"
echo "  -- snapshot immutability after a tax-config change"
as_user $A2 "select public.save_org_tax_preset_v1('$ORG_A','Std','standard',20,'n',true);" >/dev/null
as_user $A2 "select public.save_org_tax_preset_v1('$ORG_A','Std','standard',25,'changed note',true);" >/dev/null
check "preset changed to 25% ... " contains "25.0000" "$(q "select rate_percent from public.organization_tax_presets where label='Std'")"
check "... issued line still carries its 20% snapshot" contains "standard|20.0000|13950" "$(q "select tax_treatment||'|'||tax_rate_percent||'|'||tax_cents from public.finance_record_lines where id='$HL'")"
check "preset save: reverse_charge with a rate refused" contains "invalid" "$(as_user $A2 "$(ST "public.save_org_tax_preset_v1('$ORG_A','RC','reverse_charge',17,'x',true)")")"
check "presets invisible to the manager (no finance authority)" contains "0" "$(as_user $A3 "select count(*) from public.organization_tax_presets;")"

echo; echo "--- 10. changes since invoice (locked period stays honest)"
as_user $A1 "$(REV e1000000-0000-0000-0000-000000000008 approved ok)" >/dev/null
q "insert into public.journal_entry_metrics (entry_id, metric_slug, value_numeric, unit_slug, created_at) values ('e1000000-0000-0000-0000-000000000002','quantity',120,'minutes', now() + interval '1 minute')" >/dev/null
CH=$(as_user_raw $A2 "select public.billing_period_changes_v1('$PER');")
check "late-confirmed evidence is flagged new_evidence (E8)" contains "new_evidence" "$CH"
check "edited evidence is flagged changed (E2 90 -> 120 min)" contains "\"kind\": \"changed\"" "$CH"
check "the issued invoice did NOT move" contains "385658" "$(q "select amount_cents from public.finance_records where id='$INV'")"
as_user $A2 "select public.end_project_rate_term_v1((select id from public.project_rate_terms where basis_type='hours' and project_id='$P1' limit 1), '2026-09-30');" >/dev/null
as_user $A2 "select public.add_project_rate_term_v1('$P1','hours',null,9900,'EUR','New higher rate',null,'2026-10-01',null);" >/dev/null
as_user $A2 "select public.save_org_tax_preset_v1('$ORG_A','Std','standard',99,'much later',true);" >/dev/null
q "update public.projects set title='Renamed project' where id='$P1'" >/dev/null
q "update public.journal_entry_metrics set value_numeric=999 where entry_id='e1000000-0000-0000-0000-000000000003' and unit_slug='hours'" >/dev/null
q "update public.journal_entries set original_text='rewritten' where id='e1000000-0000-0000-0000-000000000001'" >/dev/null
check "issued invoice is byte-identical after journal, rate, tax-preset and project data changed" contains "$SNAP0" "$(SNAP $INV)"
check "no recalculation happened: totals unchanged" contains "385658|17575" "$(q "select gross_total_cents||'|'||tax_total_cents from public.finance_records where id='$INV'")"
check "changes are not visible to outsiders" contains "not_found" "$(as_user $B1 "select public.billing_period_changes_v1('$PER');")"

echo; echo "--- 11. NO invoice approval / acceptance anywhere; work acceptance stays separate"
check "no accept/approve column on the new tables (work acceptance column excepted)" contains "0" "$(q "select count(*) from information_schema.columns where table_schema='public' and table_name in ('project_rate_terms','billing_periods','organization_tax_presets','invoice_series_configs','invoice_number_counters','invoice_recipients','finance_record_lines','finance_record_line_sources') and column_name ~ '(approv|accept)' and column_name <> 'qty_client_accepted'")"
check "no invoice accept/approve function exists" contains "0" "$(q "select count(*) from pg_proc where pronamespace='public'::regnamespace and proname ~ '(invoice.*(accept|approv))|((accept|approv).*invoice)'")"
check "no invoice client-response table exists" contains "0" "$(q "select count(*) from pg_class where relname ~ 'invoice.*(response|accept|approv)'")"
check "the issuer issued WITHOUT any client confirmation or approval state" contains "issued|" "$(q "select status||'|'||coalesce(approval_status,'') from public.finance_records where id='$INV'")"
check "a lifecycle invoice cannot carry the legacy approval mirror" contains "fr_no_approval_on_lifecycle" "$(q "update public.finance_records set approval_status='approved' where id='$INV'")"
check "legacy approval submit door cannot attach to a lifecycle invoice" contains "fr_no_approval_on_lifecycle" "$(as_user $A2 "select public.submit_finance_record_approval_v1('$INV');")"
check "the client representative sees NO invoice, line or source" contains "0|0|0" "$(as_user $C1 "select (select count(*) from public.finance_records where billing_period_id is not null)||'|'||(select count(*) from public.finance_record_lines)||'|'||(select count(*) from public.finance_record_line_sources);")"
check "the client representative cannot correct or issue" contains "not_found" "$(as_user $C1 "$(ST "public.correct_invoice_v1('$INV','x reason',null)")")"
check "internal confirmation is never stored as client_accepted" contains "0" "$(q "select count(*) from public.finance_record_line_sources where invoice_id='$INV' and evidence_class='client_accepted'")"

echo; echo "--- 12. SUPPLIER scenario: client-owned project, counterparty acceptance upgrades the class"
check "issuer links to the client-owned project via assigned worker" contains "t" "$(as_user $A2 "select public.invoice_issuer_project_link_v1('$ORG_A','$PC');")"
PER2=$(as_user_raw $A2 "select (public.create_billing_period_v1('$PC','2026-09-01','2026-09-30','$ORG_A'))->>'id';" | tail -1)
check "supplier period created for org A on the client's project" contains "-" "$PER2"
as_user $A2 "select public.add_project_rate_term_v1('$PC','hours',null,5000,'EUR','Supply rate',null,'2026-09-01',null,null,null,'$ORG_A');" >/dev/null
echo "  -- labour supply: the issuer is NOT the project owner; nothing assumes it is"
check "the period's issuer differs from the project's owning organization" contains "true" "$(q "select (bp.organization_id <> pr.organization_id)::text from public.billing_periods bp join public.projects pr on pr.id=bp.project_id where bp.id='$PER2'")"
check "the client's project manager really manages the project" contains "true" "$(as_user $C1 "select public.can_manage_project('$PC')::text;")"
check "... but cannot read the SUPPLIER's rate terms or billing periods (RLS)" contains "0|0" "$(as_user $C1 "select count(*) from public.project_rate_terms where project_id='$PC';")|$(as_user $C1 "select count(*) from public.billing_periods where project_id='$PC';")"
check "... nor its preview or its changes" contains "not_found|not_found" "$(as_user $C1 "select public.billing_period_preview_v1('$PER2');" | grep -o not_found | head -1)|$(as_user $C1 "select public.billing_period_changes_v1('$PER2');" | grep -o not_found | head -1)"
check "the supplier's finance authority reads them" contains "1|1" "$(as_user $A2 "select count(*) from public.project_rate_terms where project_id='$PC';")|$(as_user $A2 "select count(*) from public.billing_periods where project_id='$PC';")"
check "client rep registers the counterparty link" contains "ok" "$(as_user $C1 "select public.register_work_counterparty_link_v1('$PC','$W','client');" | sed 's/registered/ok/;s/linked/ok/;s/created/ok/')"
as_user $WP "select public.submit_journal_entry_for_review_v1('e2000000-0000-0000-0000-000000000001'::uuid);" >/dev/null
as_user $A1 "$(REV e2000000-0000-0000-0000-000000000001 approved ok)" >/dev/null
as_user $A1 "$(REV e2000000-0000-0000-0000-000000000002 approved ok)" >/dev/null
as_user $C1 "$(REV e2000000-0000-0000-0000-000000000001 approved 'accepted on site')" >/dev/null
as_user $WP "select public.submit_journal_entry_for_review_v1('e2000000-0000-0000-0000-000000000003'::uuid);" >/dev/null
as_user $A1 "$(REV e2000000-0000-0000-0000-000000000003 approved ok)" >/dev/null
check "client dispute (with note) recorded through the existing path" contains "rejected" "$(as_user $C1 "$(REV e2000000-0000-0000-0000-000000000003 rejected 'wrong day')")"
PV2=$(as_user_raw $A2 "select public.billing_period_preview_v1('$PER2');")
check "preview: counterparty-accepted entry is client_accepted" contains "client_accepted" "$PV2"
check "preview: internally-approved-only entry stays internal_confirmed" contains "internal_confirmed" "$PV2"
check "preview: client-disputed entry is held back, not billed" contains "client_disputed" "$PV2"
D2=$(as_user_raw $A2 "select $(DRAFT_SQL "$PER2" "$RCP_A");")
check "supplier draft created" contains "created" "$D2"
INV2=$(q "select id from public.finance_records where billing_period_id='$PER2'")
check "line: 9 h total, client-accepted share 7 h, class stays internal_confirmed" contains "9.0000|7.0000|internal_confirmed" "$(q "select quantity||'|'||qty_client_accepted||'|'||evidence_class from public.finance_record_lines where invoice_id='$INV2'")"
check "source classes are kept apart (client_accepted vs internal_confirmed)" contains "client_accepted,internal_confirmed" "$(q "select string_agg(distinct evidence_class, ',' order by evidence_class) from public.finance_record_line_sources where invoice_id='$INV2'")"
check "client_accepted source cites BOTH confirmations" contains "true|true" "$(q "select (internal_confirmation_id is not null)||'|'||(client_confirmation_id is not null) from public.finance_record_line_sources where invoice_id='$INV2' and evidence_class='client_accepted'")"
as_user $C1 "$(REV e2000000-0000-0000-0000-000000000002 rejected 'x')" >/dev/null   # no link/submission -> must NOT create a client row
check "unsubmitted entry cannot be client-reviewed (no counterparty row)" contains "0" "$(q "select count(*) from public.journal_entry_confirmations where entry_id='e2000000-0000-0000-0000-000000000002' and confirmation_scope #>> '{authority,basis}'='counterparty'")"
as_user $A2 "select public.set_invoice_tax_v1('$INV2','zero_rated',0,'export ref',true);" >/dev/null
check "zero_rated stored as zero_rated (not reverse_charge)" contains "zero_rated" "$(q "select string_agg(distinct tax_treatment, ',') from public.finance_record_lines where invoice_id='$INV2'")"
check "issue supplier invoice -> number 0002" contains "0002" "$(as_user $A2 "select public.issue_invoice_v1('$INV2', true);")"
as_user $A2 "$(REV e2000000-0000-0000-0000-000000000001 rejected 'employer re-check')" >/dev/null
check "changes-since-invoice flags a source whose internal approval was withdrawn" contains "no_longer_confirmed" "$(as_user_raw $A2 "select public.billing_period_changes_v1('$PER2');")"

echo; echo "--- 13. corrections: full + partial credit notes, over-credit guard, replacement (original untouched)"
SNAP2_PRE="$(SNAP $INV2)"
check "replacement of an UN-credited invoice is refused" contains "invalid_replacement" "$(as_user $A2 "$(ST "public.create_invoice_draft_from_period_v1('$PER2',null,null,null,null,null,null,'$INV2','$RCP_A',null)")")"
check "reason is required" contains "invalid" "$(as_user $A2 "$(ST "public.correct_invoice_v1('$INV2','',null)")")"
check "manager (no finance authority) cannot correct" contains "not_found" "$(as_user $A3 "$(ST "public.correct_invoice_v1('$INV2','billed to the wrong entity',null)")")"
check "outsider cannot correct" contains "not_found" "$(as_user $B1 "$(ST "public.correct_invoice_v1('$INV2','billed to the wrong entity',null)")")"
check "credit-note series was never configured: nothing exists yet" contains "0" "$(q "select count(*) from public.invoice_series_configs where organization_id='$ORG_A' and document_type='credit_note'")"
R=$(as_user $A2 "select public.correct_invoice_v1('$INV2','billed to the wrong entity','REF-77');")
check "full correction (no line selection) credits every line; next number of ITS OWN series" contains "CN-0001" "$R"
check "... and reports the original as fully credited" contains "\"fully_credited\": true" "$R"
check "the missing credit-note series was created ONCE, explicitly, and audited" contains "1" "$(q "select count(*) from public.audit_logs where action='series_defaulted' and entity_id='$ORG_A'")"
CN2=$(q "select id from public.finance_records where supersedes_id='$INV2'")
check "original financial content is byte-identical after the correction" contains "$SNAP2_PRE" "$(SNAP $INV2)"
check "original keeps status issued (no cancel, no void)" contains "issued" "$(q "select status from public.finance_records where id='$INV2'")"
check "fully credited original carries the one-way link to the completing credit note" contains "true" "$(q "select (credited_by_id='$CN2' and credited_at is not null)::text from public.finance_records where id='$INV2'")"
check "credit note: kind, chain pointer, same gross + currency" contains "credit_note|true|true|true" "$(q "select c.invoice_kind||'|'||(c.supersedes_id='$INV2')||'|'||(c.gross_total_cents=o.gross_total_cents)||'|'||(c.currency=o.currency) from public.finance_records c join public.finance_records o on o.id='$INV2' where c.id='$CN2'")"
check "credit note stores reason, reference, actor and time" contains "billed to the wrong entity|REF-77|a0000002-0000-0000-0000-000000000002|true" "$(q "select correction_reason||'|'||correction_reference||'|'||corrected_by||'|'||(corrected_at is not null) from public.finance_records where id='$CN2'")"
check "credit note carries the frozen recipient of the original" contains "true" "$(q "select (c.recipient_snapshot = o.recipient_snapshot and c.recipient_id = o.recipient_id)::text from public.finance_records c join public.finance_records o on o.id='$INV2' where c.id='$CN2'")"
check "credit lines reference the ORIGINAL line ids and copy the tax snapshot" contains "zero_rated|true" "$(q "select l.tax_treatment||'|'||(l.credits_line_id is not null) from public.finance_record_lines l where l.invoice_id='$CN2' limit 1")"
check "nothing left to credit on a fully credited invoice" contains "already_credited" "$(as_user $A2 "$(ST "public.correct_invoice_v1('$INV2','again please',null)")")"
check "credit note is immutable (superuser)" contains "issued_invoice_is_immutable" "$(q "update public.finance_records set correction_reason='rewritten history' where id='$CN2'")"
check "the credited link is final (superuser)" contains "issued_invoice_is_immutable" "$(q "update public.finance_records set credited_by_id=null, credited_at=null where id='$INV2'")"
check "the original cannot be cancelled to hide it" contains "issued_invoice_is_immutable" "$(q "update public.finance_records set status='cancelled' where id='$INV2'")"
check "credit note status cannot be changed" contains "not_applicable" "$(as_user $A2 "select public.set_finance_record_status_v1('$CN2','paid');")"
echo "  -- credited period STAYS LOCKED; replacement only for a FULLY credited original"
check "the credited period is still invoiced and locked (never silently reopened)" contains "invoiced|true" "$(q "select status||'|'||(locked_at is not null) from public.billing_periods where id='$PER2'")"
check "a fresh (non-replacement) draft in the credited period is still refused" contains "period_locked" "$(as_user $A2 "$(ST "public.create_invoice_draft_from_period_v1('$PER2',null,null,null,null,null,null,null,'$RCP_A',null)")")"
check "corrected evidence is billable again once its invoice is fully credited" contains "billable" "$(as_user_raw $A2 "select public.billing_period_preview_v1('$PER2');")"
D4=$(as_user_raw $A2 "select public.create_invoice_draft_from_period_v1('$PER2',null,null,null,null,null,'replacement','$INV2','$RCP_A',null);")
check "replacement draft created through the correction lifecycle" contains "created" "$D4"
REP=$(q "select id from public.finance_records where replaces_id='$INV2'")
check "the period is STILL locked while the replacement is a draft" contains "invoiced|true" "$(q "select status||'|'||(locked_at is not null) from public.billing_periods where id='$PER2'")"
check "replacement links to the original and COPIES the correction reason + reference" contains "billed to the wrong entity|REF-77|true" "$(q "select correction_reason||'|'||correction_reference||'|'||(corrected_by is not null) from public.finance_records where id='$REP'")"
check "a second replacement of the same original is refused" contains "already_replaced" "$(as_user $A2 "$(ST "public.create_invoice_draft_from_period_v1('$PER2',null,null,null,null,null,null,'$INV2','$RCP_A',null)")")"
as_user $A2 "select public.set_invoice_tax_v1('$REP','standard',20,null,true);" >/dev/null
check "replacement issued with the next number (0003) while the period stays locked" contains "0003" "$(as_user $A2 "select public.issue_invoice_v1('$REP', true);")"
check "period still invoiced + locked after the replacement" contains "invoiced|true" "$(q "select status||'|'||(locked_at is not null) from public.billing_periods where id='$PER2'")"
CH2=$(as_user_raw $A2 "select public.invoice_correction_chain_v1('$INV2');")
check "chain read from the ORIGINAL lists all three documents" contains "3" "$(echo "$CH2" | grep -o '"id":' | wc -l)"
check "chain read from the CREDIT NOTE names the same root" contains "$INV2" "$(as_user_raw $A2 "select public.invoice_correction_chain_v1('$CN2');")"
check "chain read from the REPLACEMENT names the same root" contains "$INV2" "$(as_user_raw $A2 "select public.invoice_correction_chain_v1('$REP');")"
check "chain carries reason, reference, actor and links" contains "REF-77" "$CH2"
check "chain is invisible to outsiders" contains "not_found" "$(as_user $B1 "select public.invoice_correction_chain_v1('$INV2');")"
R3=$(as_user $A2 "select public.correct_invoice_v1('$REP','replacement had a typo','REF-78');")
check "the replacement can itself be corrected (CN-0002)" contains "CN-0002" "$R3"
check "chain from the original now lists four documents" contains "4" "$(as_user_raw $A2 "select public.invoice_correction_chain_v1('$INV2');" | grep -o '"id":' | wc -l)"

echo "  -- PARTIAL / line-level correction on the paid invoice INV (period stays locked)"
as_user $A2 "select public.set_finance_record_status_v1('$INV','paid');" >/dev/null
SNAP1_PRE="$(SNAP $INV)"
LINES_X="$(printf '[{"line_id":"%s","quantity":20}]' "$HL")"
check "OVER-CREDIT by quantity is refused (hours line holds 15.5)" contains "over_credit" "$(as_user $A2 "$(ST "public.correct_invoice_v1('$INV','too much',null,'$LINES_X'::jsonb)")")"
check "a line that is not on the invoice is refused" contains "invalid_line" "$(as_user $A2 "$(ST "public.correct_invoice_v1('$INV','bad line',null,jsonb_build_array(jsonb_build_object('line_id', gen_random_uuid(), 'quantity', 1)))")")"
check "a selection with neither quantity nor amount is refused" contains "invalid" "$(as_user $A2 "$(ST "public.correct_invoice_v1('$INV','empty',null,jsonb_build_array(jsonb_build_object('line_id','$HL')))")")"
LINES_1="$(printf '[{"line_id":"%s","quantity":3}]' "$HL")"
R=$(as_user $A2 "select public.correct_invoice_v1('$INV','3 hours were not worked','REF-P1','$LINES_1'::jsonb);")
check "partial credit by quantity: next credit-note number, original NOT fully credited" contains "CN-0003" "$R"
check "... fully_credited is false" contains "\"fully_credited\": false" "$R"
CNP1=$(q "select id from public.finance_records where supersedes_id='$INV' order by created_at limit 1")
check "credit line: 3 h x 45.00 = 13500 net, tax COPIED from the original line (standard 20% -> 2700)" contains "3.0000|13500|standard|20.0000|2700" "$(q "select quantity||'|'||net_cents||'|'||tax_treatment||'|'||tax_rate_percent||'|'||tax_cents from public.finance_record_lines where invoice_id='$CNP1'")"
check "credit line references the original line id" contains "true" "$(q "select (credits_line_id='$HL')::text from public.finance_record_lines where invoice_id='$CNP1'")"
LINES_2="$(printf '[{"line_id":"%s","net_cents":10000}]' "$QL")"
R=$(as_user $A2 "select public.correct_invoice_v1('$INV','price correction on the plaster line','REF-P2','$LINES_2'::jsonb);")
check "partial credit by AMOUNT only (quantity 0, tax capped at the proportional share)" contains "CN-0004" "$R"
check "... quantity 0, net 10000, tax 750 (7.5%)" contains "0.0000|10000|750" "$(q "select l.quantity||'|'||l.net_cents||'|'||l.tax_cents from public.finance_record_lines l join public.finance_records f on f.id=l.invoice_id where f.invoice_number='CN-0004'")"
LINES_3="$(printf '[{"line_id":"%s","net_cents":38001}]' "$QL")"
check "OVER-CREDIT by amount is refused (38000 remains on the plaster line)" contains "over_credit" "$(as_user $A2 "$(ST "public.correct_invoice_v1('$INV','too much',null,'$LINES_3'::jsonb)")")"
check "trigger-level guard: a direct insert that over-credits is refused for ANY writer" contains "over_credit" "$(q "insert into public.finance_records (id,record_type,title,counterparty_name,amount_cents,currency,status,created_by,issuer_org_id,billing_period_id,invoice_kind,supersedes_id,correction_reason,corrected_by,corrected_at) values ('f1f1f1f1-0000-0000-0000-000000000001','invoice_issued','Credit note x','x x',0,'EUR','draft','$A2','$ORG_A','$PER','credit_note','$INV','direct over-credit','$A2',now()); insert into public.finance_record_lines (invoice_id,line_no,basis_type,unit,quantity,unit_price_cents,net_cents,currency,evidence_class,tax_treatment,tax_rate_percent,tax_cents,gross_cents,credits_line_id) values ('f1f1f1f1-0000-0000-0000-000000000001',1,'hours','hours',100,4500,450000,'EUR','internal_confirmed','standard',20,90000,540000,'$HL')")"
q "delete from public.finance_records where id='f1f1f1f1-0000-0000-0000-000000000001'" >/dev/null
check "a credit line cannot change the tax treatment of the original line" contains "credit_line_must_copy_original" "$(q "insert into public.finance_records (id,record_type,title,counterparty_name,amount_cents,currency,status,created_by,issuer_org_id,billing_period_id,invoice_kind,supersedes_id,correction_reason,corrected_by,corrected_at) values ('f1f1f1f1-0000-0000-0000-000000000002','invoice_issued','Credit note y','y y',0,'EUR','draft','$A2','$ORG_A','$PER','credit_note','$INV','tax swap','$A2',now()); insert into public.finance_record_lines (invoice_id,line_no,basis_type,unit,quantity,unit_price_cents,net_cents,currency,evidence_class,tax_treatment,tax_rate_percent,tax_cents,gross_cents,credits_line_id) values ('f1f1f1f1-0000-0000-0000-000000000002',1,'hours','hours',1,4500,4500,'EUR','internal_confirmed','zero_rated',0,0,4500,'$HL')")"
q "delete from public.finance_records where id='f1f1f1f1-0000-0000-0000-000000000002'" >/dev/null
check "original unchanged by partial credits (byte-identical)" contains "$SNAP1_PRE" "$(SNAP $INV)"
check "the original is NOT marked credited while credit is partial" contains "false" "$(q "select (credited_at is not null)::text from public.finance_records where id='$INV'")"
check "replacement of a PARTIALLY credited invoice is refused" contains "invalid_replacement" "$(as_user $A2 "$(ST "public.create_invoice_draft_from_period_v1('$PER',null,null,null,null,null,null,'$INV','$RCP_A',null)")")"
check "period stays invoiced + locked after credit-only corrections" contains "invoiced|true" "$(q "select status||'|'||(locked_at is not null) from public.billing_periods where id='$PER'")"
check "new draft for that period still refused" contains "period_locked" "$(as_user $A2 "$(ST "public.create_invoice_draft_from_period_v1('$PER',null,null,null,null,null,null,null,'$RCP_A',null)")")"
R=$(as_user $A2 "select public.correct_invoice_v1('$INV','credit the remainder','REF-P3');")
check "credit the REMAINDER (no selection): CN-0005, now fully credited" contains "\"fully_credited\": true" "$R"
check "cumulative credit per original line equals the original on every line" contains "0" "$(q "select count(*) from public.finance_record_lines o where o.invoice_id='$INV' and (o.net_cents <> coalesce((select sum(c.net_cents) from public.finance_record_lines c where c.credits_line_id=o.id),0) or coalesce(o.tax_cents,0) <> coalesce((select sum(c.tax_cents) from public.finance_record_lines c where c.credits_line_id=o.id),0))")"
check "total credited gross equals the original gross (385658): rounding never drifts" contains "385658" "$(q "select sum(gross_total_cents) from public.finance_records where supersedes_id='$INV'")"
check "original now carries the completing mark; its content is still byte-identical" contains "$SNAP1_PRE" "$(SNAP $INV)"
REP_I=$(as_user_raw $A2 "select public.create_invoice_draft_from_period_v1('$PER',null,null,null,null,null,'replacement of INV','$INV','$RCP_A',null);")
check "replacement of the now fully credited INV can be drafted (period still locked)" contains "created" "$REP_I"
REP_ID=$(q "select id from public.finance_records where replaces_id='$INV'")
check "the currency of a lifecycle DRAFT cannot be re-labelled either" contains "lifecycle_currency_immutable" "$(q "update public.finance_records set currency='SEK' where id='$REP_ID'")"
check "discarding that draft leaves the period locked" contains "discarded" "$(as_user $A2 "$(ST "public.discard_invoice_draft_v1('$REP_ID')")")"
check "period locked after discard" contains "invoiced|true" "$(q "select status||'|'||(locked_at is not null) from public.billing_periods where id='$PER'")"
check "credit-note numbers come from their own gapless series" contains "CN-0001,CN-0002,CN-0003,CN-0004,CN-0005" "$(q "select string_agg(invoice_number, ',' order by invoice_number) from public.finance_records where invoice_kind='credit_note' and issuer_org_id='$ORG_A'")"
check "no invoice shows a cancelled/voided state anywhere" contains "0" "$(q "select count(*) from public.finance_records where billing_period_id is not null and status='cancelled'")"

echo; echo "--- 14. numbering: per org + document type, year-based series, immutability, uniqueness, concurrency across series"
ORG_D=dddddddd-0000-0000-0000-00000000000d; D1=d2000001-0000-0000-0000-000000000001; PDY=90000000-0000-0000-0000-0000000000d1
$PSQL -q -v ON_ERROR_STOP=1 >/dev/null 2>"$HERE/.inv.err" <<SQL || { cat "$HERE/.inv.err"; echo SEED-D FAILED; exit 1; }
insert into public.organizations (id) values ('$ORG_D');
insert into public.profiles (id, active_role) values ('$D1','company');
insert into public.company_memberships (profile_id, organization_id, status, role) values ('$D1','$ORG_D','active','owner');
insert into public.engagement_contexts (id, profile_id, organization_id, status, relationship_slug, journal_review_enabled) values
 ('ec0000d1-0000-0000-0000-0000000000d1','$D1','$ORG_D','active','owner',true),
 ('ec0000d4-0000-0000-0000-0000000000d4','$WP','$ORG_D','active','employee',true);
insert into public.projects (id, organization_id, title) values ('$PDY','$ORG_D','Org D project');
create or replace function pg_temp.mkd(p_id uuid, p_day text) returns void language sql as \$\$
  insert into public.journal_entries (id, worker_id, engagement_context_id, original_text, hash_self, project_id, created_at)
  values (p_id, '$W', 'ec0000d4-0000-0000-0000-0000000000d4', 'work ' || p_day, 'hd-' || p_id, '$PDY', (p_day || ' 12:00:00+00')::timestamptz);
  insert into public.journal_entry_metrics (entry_id, metric_slug, value_text) values (p_id, 'work_date', p_day);
  insert into public.journal_entry_metrics (entry_id, metric_slug, value_numeric, unit_slug) values (p_id, 'quantity', 2, 'hours');
\$\$;
select pg_temp.mkd('d1000000-0000-0000-0000-000000000001','2026-11-05');
select pg_temp.mkd('d1000000-0000-0000-0000-000000000002','2026-12-05');
select pg_temp.mkd('d1000000-0000-0000-0000-000000000003','2027-01-05');
select pg_temp.mkd('d1000000-0000-0000-0000-000000000004','2027-02-05');
grant select on public.company_memberships to authenticated;
SQL
for n in 1 2 3 4; do as_user $D1 "$(REV d1000000-0000-0000-0000-00000000000$n approved ok)" >/dev/null; done
as_user $D1 "select public.add_project_rate_term_v1('$PDY','hours',null,5000,'EUR','D hourly',null,'2026-11-01',null);" >/dev/null
RCP_D=$(as_user_raw $D1 "select (public.save_invoice_recipient_v1('$ORG_D',null,'Kunde GmbH','Hauptstrasse 1, 10115 Berlin','DE',null,null,null,null,null,null))->>'id';" | tail -1)
check "org D configures a YEAR-BASED series with its own prefix, separator and padding" contains "saved" "$(as_user $D1 "$(ST "public.configure_invoice_series_v1('$ORG_D','invoice','FA','/',5,true)")")"
issue_d() { # month-start month-end -> invoice number
  local per; per=$(as_user_raw $D1 "select (public.create_billing_period_v1('$PDY','$1','$2'))->>'id';" | tail -1)
  as_user $D1 "select public.create_invoice_draft_from_period_v1('$per',null,null,null,null,null,null,null,'$RCP_D',null);" >/dev/null
  local id; id=$(q "select id from public.finance_records where billing_period_id='$per'")
  as_user $D1 "select public.set_invoice_tax_v1('$id','exempt',0,null,true);" >/dev/null
  as_user $D1 "select public.issue_invoice_v1('$id', true);" >/dev/null
  q "select invoice_number from public.finance_records where id='$id'"
}
N1=$(issue_d 2026-11-01 2026-11-30); N2=$(issue_d 2026-12-01 2026-12-31)
check "year-based number: prefix / year / zero-padded sequence" contains "FA/2026/00001" "$N1"
check "sequential within (org, series, year)" contains "FA/2026/00002" "$N2"
q "insert into public.invoice_number_counters (organization_id, document_type, year, next_number) values ('$ORG_D','invoice',2025,7)" >/dev/null
check "org D reconfigures the series (new prefix, padding)" contains "saved" "$(as_user $D1 "$(ST "public.configure_invoice_series_v1('$ORG_D','invoice','XX','.',6,true)")")"
N3=$(issue_d 2027-01-01 2027-01-31)
check "new configuration applies to NEW documents only (the counter continues)" contains "XX.2026.000003" "$N3"
check "changing the configuration never alters issued numbers" contains "FA/2026/00001|FA/2026/00002" "$(q "select string_agg(invoice_number,'|' order by number_seq) from public.finance_records where issuer_org_id='$ORG_D' and invoice_kind='invoice' and invoice_number like 'FA/%'")"
check "counters are per year: the 2025 counter is untouched" contains "7" "$(q "select next_number from public.invoice_number_counters where organization_id='$ORG_D' and document_type='invoice' and year=2025")"
as_user $D1 "select public.configure_invoice_series_v1('$ORG_D','invoice','XX','.',4,false);" >/dev/null
N4=$(issue_d 2027-02-01 2027-02-28)
check "switching to a non-year series starts its OWN counter (year key 0)" contains "XX.0001" "$N4"
check "counter rows: year 0, 2025 and 2026 are independent" contains "0:2,2025:7,2026:4" "$(q "select string_agg(year||':'||next_number, ',' order by year) from public.invoice_number_counters where organization_id='$ORG_D' and document_type='invoice'")"
check "number provenance is stored on the document (series, year, sequence)" contains "invoice|2026|1" "$(q "select number_series||'|'||number_year||'|'||number_seq from public.finance_records where invoice_number='FA/2026/00001'")"
check "configuration changes are audited with before and after" contains "3" "$(q "select count(*) from public.audit_logs where action='configure_invoice_series' and entity_id='$ORG_D'")"
check "the audit payload carries from/to" contains "FA" "$(q "select payload::text from public.audit_logs where action='configure_invoice_series' and entity_id='$ORG_D' order by occurred_at desc limit 1 offset 1")"
check "an issued number cannot be rewritten (superuser)" contains "issued_invoice_is_immutable" "$(q "update public.finance_records set invoice_number='ZZ/1' where invoice_number='FA/2026/00001'")"
check "the sequence cannot be rewritten (superuser)" contains "issued_invoice_is_immutable" "$(q "update public.finance_records set number_seq=99 where invoice_number='FA/2026/00001'")"
check "uniqueness: same (issuer, kind, year, sequence) is impossible" contains "fr_issuer_seq_uq" "$(q "insert into public.finance_records (record_type,title,counterparty_name,amount_cents,currency,status,created_by,issuer_org_id,invoice_number,number_series,number_year,number_seq,issued_at) values ('invoice_issued','dup dup','dup dup',1,'EUR','issued','$D1','$ORG_D','DUP-NUMBER','invoice',2026,1,now())")"
check "uniqueness: same (issuer, kind, number text) is impossible" contains "fr_issuer_number_uq" "$(q "insert into public.finance_records (record_type,title,counterparty_name,amount_cents,currency,status,created_by,issuer_org_id,invoice_number,number_series,number_year,number_seq,issued_at) values ('invoice_issued','dup dup','dup dup',1,'EUR','issued','$D1','$ORG_D','FA/2026/00001','invoice',2026,777,now())")"
check "the same number text may exist for a DIFFERENT issuer (uniqueness is per issuing org)" contains "INSERT 0 1" "$(q "insert into public.finance_records (record_type,title,counterparty_name,amount_cents,currency,status,created_by,issuer_org_id,invoice_number,number_series,number_year,number_seq,issued_at) values ('invoice_issued','other org','other org',1,'EUR','issued','$A1','$ORG_A','FA/2026/00001','invoice',2026,1,now())")"
q "set session_replication_role = replica; delete from public.finance_records where title='other org'" >/dev/null 2>&1
echo "  -- an org with NO configuration: the default series is created ONCE on first use, audited"
DEF=$($PSQL -tA -c "select set_config('request.jwt.claim.sub','$B1',false); select number from public._invoice_take_number_v1('$ORG_B','invoice');" 2>&1 | tail -1)
check "default invoice series created on first use (explicit stored row)" contains "INV-0001" "$DEF"
check "... with an audit row and the actor recorded" contains "series_defaulted|b0000001-0000-0000-0000-000000000001" "$(q "select action||'|'||actor_id from public.audit_logs where action='series_defaulted' and entity_id='$ORG_B' limit 1")"
check "the allocator itself is not callable by a user" contains "permission denied" "$(as_user $B1 "select * from public._invoice_take_number_v1('$ORG_B','invoice');")"

echo "  -- concurrency ACROSS series: 6 invoices, then 3 invoices + 3 credit notes at the same time"
$PSQL -q >/dev/null <<SQL
do \$\$ begin for i in 1..9 loop
  insert into public.projects (id, organization_id, title) values (('90000000-0000-0000-0000-00000000f0' || lpad(i::text,2,'0'))::uuid, '$ORG_A', 'Conc ' || i);
  insert into public.billing_periods (id, project_id, organization_id, period_start, period_end, created_by)
    values (('bb000000-0000-0000-0000-0000000000' || lpad(i::text,2,'0'))::uuid, ('90000000-0000-0000-0000-00000000f0' || lpad(i::text,2,'0'))::uuid, '$ORG_A', '2026-11-01','2026-11-30','$A2');
  insert into public.project_rate_terms (project_id, organization_id, basis_type, unit, rate_cents, currency, valid_from, agreed_by)
    values (('90000000-0000-0000-0000-00000000f0' || lpad(i::text,2,'0'))::uuid, '$ORG_A','hours','hours',1000,'EUR','2026-11-01','$A2');
  insert into public.journal_entries (id, worker_id, engagement_context_id, original_text, hash_self, project_id, created_at)
    values (('c1000000-0000-0000-0000-0000000000' || lpad(i::text,2,'0'))::uuid, '$W','ec000004-0000-0000-0000-000000000004','c','h',('90000000-0000-0000-0000-00000000f0' || lpad(i::text,2,'0'))::uuid,'2026-11-05 10:00+00');
  insert into public.journal_entry_metrics (entry_id, metric_slug, value_numeric, unit_slug) values (('c1000000-0000-0000-0000-0000000000' || lpad(i::text,2,'0'))::uuid,'quantity',1,'hours');
end loop; end \$\$;
SQL
for i in 1 2 3 4 5 6 7 8 9; do
  n=$(printf '%02d' $i)
  as_user $A1 "$(REV c1000000-0000-0000-0000-0000000000$n approved ok)" >/dev/null
  as_user $A2 "select public.create_invoice_draft_from_period_v1('bb000000-0000-0000-0000-0000000000$n',null,null,null,null,null,null,null,'$RCP_A',null);" >/dev/null
  CID=$(q "select id from public.finance_records where billing_period_id='bb000000-0000-0000-0000-0000000000$n'")
  as_user $A2 "select public.set_invoice_tax_v1('$CID','exempt',0,null,true);" >/dev/null
done
for i in 1 2 3 4 5 6; do
  n=$(printf '%02d' $i)
  CID=$(q "select id from public.finance_records where billing_period_id='bb000000-0000-0000-0000-0000000000$n'")
  ( as_user $A2 "select public.issue_invoice_v1('$CID', true);" >/dev/null ) &
done
wait
for i in 7 8 9; do
  n=$(printf '%02d' $i)
  CID=$(q "select id from public.finance_records where billing_period_id='bb000000-0000-0000-0000-0000000000$n'")
  ( as_user $A2 "select public.issue_invoice_v1('$CID', true);" >/dev/null ) &
done
for i in 1 2 3; do
  n=$(printf '%02d' $i)
  CID=$(q "select id from public.finance_records where billing_period_id='bb000000-0000-0000-0000-0000000000$n' and invoice_kind='invoice'")
  ( as_user $A2 "select public.correct_invoice_v1('$CID','concurrency correction',null);" >/dev/null ) &
done
wait
check "9 concurrent-ish issues -> 9 distinct numbers" contains "9|9" "$(q "select count(*)||'|'||count(distinct invoice_number) from public.finance_records where billing_period_id::text like 'bb000000%' and invoice_kind='invoice' and issued_at is not null")"
check "... gapless: the sequence numbers are contiguous" contains "9" "$(q "select max(number_seq)-min(number_seq)+1 from public.finance_records where billing_period_id::text like 'bb000000%' and invoice_kind='invoice' and issued_at is not null")"
check "3 credit notes issued at the same time as invoices: distinct and contiguous in THEIR series" contains "3|3|3" "$(q "select count(*)||'|'||count(distinct invoice_number)||'|'||(max(number_seq)-min(number_seq)+1) from public.finance_records where invoice_kind='credit_note' and billing_period_id::text like 'bb000000%'")"
check "the two series are independent counters" contains "t" "$(q "select (select next_number from public.invoice_number_counters where organization_id='$ORG_A' and document_type='invoice' and year=0) <> (select next_number from public.invoice_number_counters where organization_id='$ORG_A' and document_type='credit_note' and year=0)")"
check "duplicate number per issuer impossible (unique index)" contains "duplicate key" "$(q "insert into public.finance_records (record_type,title,counterparty_name,amount_cents,currency,status,created_by,issuer_org_id,invoice_number,issued_at) values ('invoice_issued','dup dup','dup',1,'EUR','issued','$A1','$ORG_A','0001',now())")"

echo; echo "--- 15. day unit, explicit selection, role tags and allocations stay out"
PD=90000000-0000-0000-0000-0000000000e1
$PSQL -q -v ON_ERROR_STOP=1 >/dev/null 2>"$HERE/.inv.err" <<SQL || { cat "$HERE/.inv.err"; echo SEED-DAY FAILED; exit 1; }
insert into public.projects (id, organization_id, title) values ('$PD','$ORG_A','Day-rate project');
create or replace function pg_temp.mkp(p_id uuid, p_day text) returns void language sql as \$\$
  insert into public.journal_entries (id, worker_id, engagement_context_id, original_text, hash_self, project_id, created_at)
  values (p_id, '$W', 'ec000004-0000-0000-0000-000000000004', 'work ' || p_day, 'hp-' || p_id, '$PD', (p_day || ' 12:00:00+00')::timestamptz);
  insert into public.journal_entry_metrics (entry_id, metric_slug, value_text) values (p_id, 'work_date', p_day);
\$\$;
select pg_temp.mkp('e5000000-0000-0000-0000-000000000001','2026-11-10');
select pg_temp.mkp('e5000000-0000-0000-0000-000000000002','2026-11-11');
select pg_temp.mkp('e5000000-0000-0000-0000-000000000003','2026-11-12');
select pg_temp.mkp('e5000000-0000-0000-0000-000000000004','2026-11-13');
insert into public.journal_entry_metrics (entry_id, metric_slug, value_numeric, unit_slug) values
 ('e5000000-0000-0000-0000-000000000001','quantity',2,'days'),
 ('e5000000-0000-0000-0000-000000000002','quantity',1,'days'),
 ('e5000000-0000-0000-0000-000000000003','quantity',3,'days'),
 ('e5000000-0000-0000-0000-000000000003','quantity',8,'hours'),
 ('e5000000-0000-0000-0000-000000000004','quantity',1,'days');
-- the hours were recorded AFTER the days (distinct created_at: 'latest quantity' must be deterministic)
update public.journal_entry_metrics set created_at = now() + interval '1 minute' where entry_id = 'e5000000-0000-0000-0000-000000000003' and unit_slug = 'hours';
SQL
for n in 1 2 3; do as_user $A1 "$(REV e5000000-0000-0000-0000-00000000000$n approved ok)" >/dev/null; done
check "a quantity basis in DAYS is a legal commercial basis (generic unit, not hour-centric)" contains "created" "$(as_user $A2 "$(ST "public.add_project_rate_term_v1('$PD','quantity','days',60000,'EUR','Day rate',null,'2026-11-01',null)")")"
check "an hourly basis can coexist with the day basis" contains "created" "$(as_user $A2 "$(ST "public.add_project_rate_term_v1('$PD','hours',null,4500,'EUR','Hourly','Foreman','2026-11-01',null)")")"
PERD=$(as_user_raw $A2 "select (public.create_billing_period_v1('$PD','2026-11-01','2026-11-30'))->>'id';" | tail -1)
PVD=$(as_user_raw $A2 "select public.billing_period_preview_v1('$PERD');")
check "preview: recorded work-days appear as q:days quantity rows, never as hours" contains "q:days" "$PVD"
check "preview: the entry that recorded BOTH days and hours offers both rows (the issuer picks one basis)" contains "\"source_key\": \"e\"" "$PVD"
check "preview: the unconfirmed work-day is held back" contains "not_confirmed" "$PVD"
check "selection naming evidence that is NOT billable is refused" contains "selection_not_billable" "$(as_user $A2 "$(ST "public.create_invoice_draft_from_period_v1('$PERD',null,null,null,null,null,null,null,'$RCP_A','[{\"entry_id\":\"e5000000-0000-0000-0000-000000000004\",\"source_key\":\"q:days\"}]'::jsonb)")")"
check "an EMPTY selection bills nothing" contains "nothing_billable" "$(as_user $A2 "$(ST "public.create_invoice_draft_from_period_v1('$PERD',null,null,null,null,null,null,null,'$RCP_A','[]'::jsonb)")")"
check "hours AND days of the same entry cannot both be billed" contains "time_basis_conflict" "$(as_user $A2 "$(ST "public.create_invoice_draft_from_period_v1('$PERD',null,null,null,null,null,null,null,'$RCP_A','[{\"entry_id\":\"e5000000-0000-0000-0000-000000000003\",\"source_key\":\"e\"},{\"entry_id\":\"e5000000-0000-0000-0000-000000000003\",\"source_key\":\"q:days\"}]'::jsonb)")")"
check "a malformed selection is refused" contains "invalid" "$(as_user $A2 "$(ST "public.create_invoice_draft_from_period_v1('$PERD',null,null,null,null,null,null,null,'$RCP_A','{\"a\":1}'::jsonb)")")"
DD=$(as_user_raw $A2 "select public.create_invoice_draft_from_period_v1('$PERD',null,null,null,null,null,'day rate',null,'$RCP_A','[{\"entry_id\":\"e5000000-0000-0000-0000-000000000001\",\"source_key\":\"q:days\"},{\"entry_id\":\"e5000000-0000-0000-0000-000000000003\",\"source_key\":\"q:days\"}]'::jsonb);")
check "draft created from the EXPLICIT selection (2 work-days + 3 work-days)" contains "created" "$DD"
IND=$(q "select id from public.finance_records where billing_period_id='$PERD'")
check "the day line is quantity x unit rate in its OWN unit: 5 days x 600.00 = 300000, no hours line" contains "days|5.0000|60000|300000|0" "$(q "select unit||'|'||quantity||'|'||unit_price_cents||'|'||net_cents||'|'||(select count(*) from public.finance_record_lines where invoice_id='$IND' and basis_type='hours') from public.finance_record_lines where invoice_id='$IND' and basis_type='quantity'")"
check "sources are the explicitly selected recorded work-days (quantity, never hours)" contains "2|0" "$(q "select count(*)||'|'||count(hours) from public.finance_record_line_sources where invoice_id='$IND'")"
check "the unselected approved work-day is NOT silently billed" contains "0" "$(q "select count(*) from public.finance_record_line_sources where invoice_id='$IND' and journal_entry_id='e5000000-0000-0000-0000-000000000002'")"
PVD2=$(as_user_raw $A2 "select public.billing_period_preview_v1('$PERD');")
check "the same entry's HOURS row is now 'billed' (cross-unit double-billing guard)" contains "billed" "$(echo "$PVD2" | tr -d '\n' | grep -o '"entry_id": "e5000000-0000-0000-0000-000000000003"[^}]*"source_key": "e"[^}]*"eligibility": "billed"' | head -1)"
as_user $A2 "select public.set_invoice_tax_v1('$IND','standard',20,null,true);" >/dev/null
check "day invoice: net 300000 + 20% = 360000 gross" contains "300000|60000|360000" "$(q "select net_total_cents||'|'||tax_total_cents||'|'||gross_total_cents from public.finance_records where id='$IND'")"
check "day invoice issued" contains "issued" "$(as_user $A2 "$(ST "public.issue_invoice_v1('$IND', true)")")"
check "the audit row records that the issuer chose the evidence explicitly" contains "true" "$(q "select (payload->>'explicit_selection') from public.audit_logs where action='create_invoice_draft' and entity_id='$IND'")"
check "unselected evidence stays visible after the lock as 'new evidence' (never silently billed)" contains "new_evidence" "$(as_user_raw $A2 "select public.billing_period_changes_v1('$PERD');")"
check "role tags are informational: only the term writer and its immutability guard mention role_label" contains "0" "$(q "select count(*) from pg_proc where pronamespace='public'::regnamespace and prosrc ilike '%role_label%' and proname not in ('add_project_rate_term_v1','project_rate_terms_guard_v1')")"
check "work_hour_allocations are outside every invoice function" contains "0" "$(q "select count(*) from pg_proc where pronamespace='public'::regnamespace and prosrc ilike '%work_hour_allocations%' and (proname ilike '%invoice%' or proname ilike '%billing%' or proname ilike '%rate_term%')")"
check "disputed work has NO override path: no invoice/billing function takes an override" contains "0" "$(q "select count(*) from pg_proc where pronamespace='public'::regnamespace and (proname ilike '%override%' or pg_get_function_arguments(oid) ilike '%override%') and (proname ilike '%invoice%' or proname ilike '%billing%')")"

echo; echo "--- 16. currency-neutral: SEK / NOK / PLN / JPY (0 decimals) / KWD (3 decimals); totals grouped per currency"
for bad in "sek" "SE" " SEK" "SEKK" "S3K" ""; do
  check "currency '$bad' refused by the command" contains "invalid" "$(as_user $A2 "$(ST "public.add_project_rate_term_v1('$P1','fixed',null,1,'$bad',null,null,'2028-01-01',null)")")"
done
check "lowercase currency refused by the table CHECK" contains "currency" "$(q "insert into public.project_rate_terms (project_id, organization_id, basis_type, unit, rate_cents, currency, valid_from, agreed_by) values ('$P1','$ORG_A','fixed',null,1,'eur','2028-01-01','$A2')")"
check "lowercase currency refused on the invoice header" contains "currency" "$(q "insert into public.finance_records (record_type,title,counterparty_name,amount_cents,currency,created_by) values ('invoice_issued','x x x','y y',1,'eur','$A1')")"
PCUR=90000000-0000-0000-0000-0000000000c9
$PSQL -q >/dev/null <<SQL
insert into public.projects (id, organization_id, title) values ('$PCUR','$ORG_A','Multi-currency project');
do \$\$
declare codes text[] := array['SEK','NOK','PLN','JPY','KWD']; rates bigint[] := array[45000,52000,18000,5000,12500]; i int;
begin for i in 1..5 loop
  insert into public.billing_periods (id, project_id, organization_id, period_start, period_end, created_by)
    values (('bc000000-0000-0000-0000-0000000000' || lpad(i::text,2,'0'))::uuid, '$PCUR', '$ORG_A', make_date(2027,i,1), (make_date(2027,i,1) + interval '1 month - 1 day')::date, '$A2');
  insert into public.project_rate_terms (project_id, organization_id, basis_type, unit, rate_cents, currency, valid_from, valid_to, agreed_by)
    values ('$PCUR', '$ORG_A','hours','hours',rates[i],codes[i],make_date(2027,i,1),(make_date(2027,i,1) + interval '1 month - 1 day')::date,'$A2');
  insert into public.journal_entries (id, worker_id, engagement_context_id, original_text, hash_self, project_id, created_at)
    values (('c2000000-0000-0000-0000-0000000000' || lpad(i::text,2,'0'))::uuid, '$W','ec000004-0000-0000-0000-000000000004','c','h','$PCUR', make_date(2027,i,5) + time '10:00');
  insert into public.journal_entry_metrics (entry_id, metric_slug, value_numeric, unit_slug) values (('c2000000-0000-0000-0000-0000000000' || lpad(i::text,2,'0'))::uuid,'quantity',3,'hours');
end loop; end \$\$;
SQL
CODES=(SEK NOK PLN JPY KWD); EXP_NET=(135000 156000 54000 15000 37500); EXP_TAX=(33750 39000 13500 3750 9375)
for i in 1 2 3 4 5; do
  n=$(printf '%02d' $i)
  as_user $A1 "$(REV c2000000-0000-0000-0000-0000000000$n approved ok)" >/dev/null
  as_user $A2 "select public.create_invoice_draft_from_period_v1('bc000000-0000-0000-0000-0000000000$n',null,null,null,null,null,null,null,'$RCP_A',null);" >/dev/null
  XID=$(q "select id from public.finance_records where billing_period_id='bc000000-0000-0000-0000-0000000000$n'")
  as_user $A2 "select public.set_invoice_tax_v1('$XID','standard',25,null,true);" >/dev/null
  as_user $A2 "select public.issue_invoice_v1('$XID', true);" >/dev/null
  check "${CODES[$((i-1))]} invoice: header + line currency, net and 25% tax in integer minor units" contains "${CODES[$((i-1))]}|${CODES[$((i-1))]}|${EXP_NET[$((i-1))]}|${EXP_TAX[$((i-1))]}" "$(q "select f.currency||'|'||(select string_agg(distinct l.currency,',') from public.finance_record_lines l where l.invoice_id=f.id)||'|'||f.net_total_cents||'|'||f.tax_total_cents from public.finance_records f where f.id='$XID'")"
done
XID=$(q "select id from public.finance_records where billing_period_id='bc000000-0000-0000-0000-000000000004'")
check "JPY issued invoice currency is frozen" contains "issued_invoice_is_immutable" "$(q "update public.finance_records set currency='EUR' where id='$XID'")"
check "a line of another currency cannot be added to an invoice (trigger)" contains "line_currency_mismatch" "$(q "insert into public.finance_records (id,record_type,title,counterparty_name,amount_cents,currency,status,created_by,issuer_org_id) values ('f0f0f0f0-0000-0000-0000-000000000001','invoice_issued','mix mix','mix mix',0,'SEK','draft','$A1','$ORG_A'); insert into public.finance_record_lines (invoice_id,line_no,basis_type,quantity,unit_price_cents,net_cents,currency,evidence_class) values ('f0f0f0f0-0000-0000-0000-000000000001',1,'fixed',1,1,1,'USD','agreed_basis')")"
q "delete from public.finance_records where id='f0f0f0f0-0000-0000-0000-000000000001'" >/dev/null
SEKID=$(q "select id from public.finance_records where billing_period_id='bc000000-0000-0000-0000-000000000001'")
SEKL=$(q "select id from public.finance_record_lines where invoice_id='$SEKID'")
check "partial credit in SEK (amount only): 10000 + 25% tax capped at 2500" contains "corrected" "$(as_user $A2 "$(ST "public.correct_invoice_v1('$SEKID','part of the work not accepted',null,jsonb_build_array(jsonb_build_object('line_id','$SEKL','net_cents',10000)))")")"
echo "  -- mixed-currency totals are GROUPED per currency and kind, never summed across currencies"
TOT=$(as_user $A2 "select string_agg(currency||':'||invoice_kind||'='||gross_cents, ',' order by currency, invoice_kind) from public.project_invoice_totals_v1('$PCUR');")
check "one row per (currency, kind); no cross-currency sum anywhere" contains "JPY:invoice=18750,KWD:invoice=46875,NOK:invoice=195000,PLN:invoice=67500,SEK:credit_note=12500,SEK:invoice=168750" "$TOT"
check "six rows, five currencies" contains "6|5" "$(as_user $A2 "select count(*)||'|'||count(distinct currency) from public.project_invoice_totals_v1('$PCUR');")"
check "totals are RLS-scoped: an outsider sees nothing" contains "0" "$(as_user $B1 "select count(*) from public.project_invoice_totals_v1('$PCUR');")"
check "totals are RLS-scoped: the client representative sees nothing" contains "0" "$(as_user $C1 "select count(*) from public.project_invoice_totals_v1('$PCUR');")"

echo; echo "--- 17. work-time PARITY: the SQL rule equals the TypeScript rule on ONE shared fixture"
FIX="$REPO/apps/web/lib/finance/fixtures/work-time-parity.json"
PPAR=90000000-0000-0000-0000-0000000000aa; PERPAR=bd000000-0000-0000-0000-0000000000aa
node "$HERE/work-time-parity.mjs" sql "$FIX" "$PPAR" "$W" "ec000004-0000-0000-0000-000000000004" > "$HERE/.parity.sql"
$PSQL -q -v ON_ERROR_STOP=1 >/dev/null 2>"$HERE/.inv.err" <<SQL || { cat "$HERE/.inv.err"; echo SEED-PARITY FAILED; exit 1; }
insert into public.projects (id, organization_id, title) values ('$PPAR','$ORG_A','Parity project');
insert into public.billing_periods (id, project_id, organization_id, period_start, period_end, created_by) values ('$PERPAR','$PPAR','$ORG_A','2026-01-01','2026-12-31','$A2');
SQL
$PSQL -q -v ON_ERROR_STOP=1 -f "$HERE/.parity.sql" >/dev/null 2>"$HERE/.inv.err" || { cat "$HERE/.inv.err"; echo PARITY LOAD FAILED; exit 1; }
$PSQL -tA -c "select coalesce(json_agg(json_build_object('entry', entry_id, 'day', work_day, 'key', source_key, 'kind', line_kind, 'unit', unit, 'hours', hours, 'quantity', quantity)), '[]'::json) from public._invoice_period_evidence_v1('$PERPAR')" > "$HERE/.parity.actual.json"
PAR=$(node "$HERE/work-time-parity.mjs" compare "$FIX" "$HERE/.parity.actual.json" 2>&1)
check "SQL == TypeScript on every fixture case (day, keys, hours, quantities)" contains "PARITY OK" "$PAR"
echo "  $PAR"

echo; echo "--- 18. the legacy EUR register cannot create, mutate or misrepresent lifecycle invoices"
check "legacy manual create can link a project but never a billing period; it stamps EUR" contains "created" "$(as_user $A1 "select public.create_finance_record_v2('expense','Legacy cost','Vendor','5000','issued',null,'$P1','c0c0c0c0-0000-0000-0000-000000000001',null,null,null,null);")"
check "... the row is EUR with NO billing period / issuer / number provenance" contains "EUR|true|true|true" "$(q "select currency||'|'||(billing_period_id is null)||'|'||(issuer_org_id is null)||'|'||(number_seq is null) from public.finance_records where title='Legacy cost'")"
check "legacy rows never enter the lifecycle totals of the same project" contains "true" "$(q "select ((select coalesce(sum(documents),0) from public.project_invoice_totals_v1('$P1')) = (select count(*) from public.finance_records where project_id='$P1' and billing_period_id is not null and issued_at is not null))::text")"
check "no legacy create function has a billing-period / series parameter" contains "0" "$(q "select count(*) from pg_proc where proname in ('create_finance_record_v1','create_finance_record_v2') and (pg_get_function_arguments(oid) ilike '%period%' or pg_get_function_arguments(oid) ilike '%series%' or pg_get_function_arguments(oid) ilike '%currency%')")"
check "the legacy update door cannot change an issued lifecycle invoice's amount" contains "immutable_issued" "$(as_user $A2 "select public.update_finance_record_v2('$IND','x invoice title','Client UAB','1',null,null,null,null,null);")"
check "the legacy status door cannot issue or cancel a lifecycle invoice" contains "use_correct_invoice" "$(as_user $A2 "select public.set_finance_record_status_v1('$IND','cancelled');")"

echo; echo "--- 19. rollback REFUSES while lifecycle rows exist, then works at zero rows"
RB=$($PSQL -q -v ON_ERROR_STOP=0 -f "$DOWN" 2>&1)
check "populated rollback refused" contains "rollback refused" "$RB"
check "tables survive a refused rollback" contains "billing_periods" "$(q "select to_regclass('public.billing_periods')")"
fresh_db "invlife2"
$PSQL -q -v ON_ERROR_STOP=1 -f "$MIG" >/dev/null 2>&1 || { echo "re-apply failed"; fail=$((fail+1)); }
RB=$($PSQL -q -v ON_ERROR_STOP=0 -f "$DOWN" 2>&1)
check "rollback at zero rows succeeds" absent "error" "$RB"
check "rollback removes the lifecycle tables" contains "0" "$(q "select count(*) from pg_class where relname in ('billing_periods','project_rate_terms','finance_record_lines')")"
check "rollback restores EUR-only CHECK" contains "finance_records_currency_check" "$(q "select conname from pg_constraint where conrelid='public.finance_records'::regclass and conname like 'finance_records_currency%'")"
check "rollback restores the old v2 body (no immutability guard)" absent "immutable_issued" "$(q "select prosrc from pg_proc where proname='update_finance_record_v2'")"
$PSQL -q -v ON_ERROR_STOP=1 -f "$MIG" >/dev/null 2>&1 && echo "  re-apply after rollback ok" || { echo "re-apply after rollback FAILED"; fail=$((fail+1)); }
$ADMIN -c "drop database if exists invlife2" >/dev/null

echo
echo "=============================================================="
echo " RESULT: $pass passed, $fail failed"
echo "=============================================================="
[ "$fail" -eq 0 ] || exit 1
