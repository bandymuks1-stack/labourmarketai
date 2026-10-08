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
        net_total_cents, tax_total_cents, gross_total_cents, tax_breakdown::text, tax_rounding, issuer_org_id, billing_period_id, project_id, issued_at, issued_by)
       from public.finance_records where id='$1')
    || coalesce((select string_agg(concat_ws('|', l.line_no, l.basis_type, l.rate_term_id, l.unit, l.quantity, l.unit_price_cents, l.net_cents, l.currency, l.evidence_class,
        l.qty_client_accepted, l.tax_treatment, l.tax_rate_percent, l.tax_note, l.tax_cents, l.gross_cents), ';' order by l.line_no) from public.finance_record_lines l where l.invoice_id='$1'), '')
    || coalesce((select string_agg(concat_ws('|', s.journal_entry_id, s.source_key, s.hours, s.quantity, s.evidence_class, s.internal_confirmation_id, s.client_confirmation_id, s.entry_hash), ';' order by s.id) from public.finance_record_line_sources s where s.invoice_id='$1'), ''))"
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
check "RLS enabled on all 6 new tables" contains "6" "$(q "select count(*) from pg_class where relname in ('project_rate_terms','billing_periods','organization_tax_presets','invoice_number_sequences','finance_record_lines','finance_record_line_sources') and relrowsecurity")"
check "authenticated/anon have NO write grant on new tables" contains "0" "$(q "select count(*) from information_schema.role_table_grants where grantee in ('authenticated','anon','public') and table_name in ('project_rate_terms','billing_periods','organization_tax_presets','invoice_number_sequences','finance_record_lines','finance_record_line_sources') and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE')")"
check "anon has NO privilege at all on new tables" contains "0" "$(q "select count(*) from information_schema.role_table_grants where grantee in ('anon','public') and table_name in ('project_rate_terms','billing_periods','finance_record_lines','finance_record_line_sources','organization_tax_presets','invoice_number_sequences')")"
check "no new function is executable by anon/PUBLIC" contains "0" "$(q "select count(*) from pg_proc p where pronamespace='public'::regnamespace and (proname like '%invoice%' or proname like '%billing_period%' or proname like '%rate_term%' or proname like '%tax_preset%') and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('public', p.oid, 'execute'))")"
check "internal evidence derivation is NOT executable by authenticated (no oracle)" contains "f" "$(q "select has_function_privilege('authenticated','public._invoice_period_evidence_v1(uuid,uuid)','execute')")"
check "every new SECDEF function pins search_path" contains "0" "$(q "select count(*) from pg_proc p where pronamespace='public'::regnamespace and prosecdef and (proname like '%invoice%' or proname like '%billing_period%' or proname like '%rate_term%' or proname like '%tax_preset%') and not coalesce(proconfig::text,'') like '%search_path%'")"
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

echo; echo "--- 3. authority matrix: rate terms"
ADD_T() { echo "select public.add_project_rate_term_v1('$P1','$1',$2,$3,'EUR',$4,null,'2026-09-01',null);"; }
check "project manager WITHOUT finance authority cannot set the commercial basis" contains "not_found" "$(as_user $A3 "$(ST "$(ADD_T hours null 4500 null | sed 's/^select //;s/;$//')")")"
check "other org owner cannot" contains "not_found" "$(as_user $B1 "$(ST "$(ADD_T hours null 4500 null | sed 's/^select //;s/;$//')")")"
check "worker cannot" contains "not_found" "$(as_user $WP "$(ST "$(ADD_T hours null 4500 null | sed 's/^select //;s/;$//')")")"
R=$(as_user_raw $A2 "select public.add_project_rate_term_v1('$P1','hours',null,4500,'EUR','Hourly',null,'2026-09-01',null);")
check "admin (finance authority) adds the hours basis" contains "created" "$R"
check "overlapping hours basis refused" contains "overlapping_term" "$(as_user_raw $A2 "select public.add_project_rate_term_v1('$P1','hours',null,5000,'EUR',null,null,'2026-09-15',null);")"
check "quantity basis for a time unit refused" contains "invalid" "$(as_user_raw $A2 "select public.add_project_rate_term_v1('$P1','quantity','hours',100,'EUR',null,null,'2026-09-01',null);")"
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
check "manager (no finance) cannot draft" contains "not_found" "$(as_user $A3 "$(ST "public.create_invoice_draft_from_period_v1('$PER','Client UAB','$ORG_C')")")"
check "client org equal to issuer refused" contains "invalid_client_org" "$(as_user $A2 "$(ST "public.create_invoice_draft_from_period_v1('$PER','Client UAB','$ORG_A')")")"
DR=$(as_user_raw $A2 "select public.create_invoice_draft_from_period_v1('$PER','Client UAB','$ORG_C','CLIENT-VAT-1','1 Main St',null,'Sept');")
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
check "client-reader predicate is strictly FALSE for the issuer admin" contains "f" "$(as_user $A2 "select public.invoice_client_reader_v1('$ORG_C')::text;")"
check "outsider cannot issue" contains "not_found" "$(as_user $B1 "$(ST "public.issue_invoice_v1('$INV', true)")")"
check "client rep cannot issue" contains "not_found" "$(as_user $C1 "$(ST "public.issue_invoice_v1('$INV', true)")")"
R=$(as_user $A2 "select public.issue_invoice_v1('$INV', true);")
check "issue succeeds and assigns number 0001" contains "0001" "$R"
SNAP0="$(SNAP $INV)"
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
for col in "counterparty_name='Other Customer'" "currency='SEK'" "client_org_id=null" "customer_vat_id='X1'" "customer_address='Elsewhere'" "billing_period_id=null" "issuer_org_id='$ORG_C'" "project_id=null" "vat_amount_cents=1" "tax_total_cents=1" "gross_total_cents=1" "net_total_cents=1" "title='Renamed doc'" "issued_at=now()" ; do
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
check "no accept/approve column on the new tables (work acceptance column excepted)" contains "0" "$(q "select count(*) from information_schema.columns where table_schema='public' and table_name in ('project_rate_terms','billing_periods','organization_tax_presets','invoice_number_sequences','finance_record_lines','finance_record_line_sources') and column_name ~ '(approv|accept)' and column_name <> 'qty_client_accepted'")"
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
D2=$(as_user_raw $A2 "select public.create_invoice_draft_from_period_v1('$PER2','Client-owned Oy','$ORG_C');")
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

echo; echo "--- 13. correction chain: original -> credit note -> replacement (original untouched)"
SNAP2_PRE="$(SNAP $INV2)"
check "replacement of an UN-credited invoice is refused" contains "invalid_replacement" "$(as_user $A2 "$(ST "public.create_invoice_draft_from_period_v1('$PER2','X Oy',null,null,null,null,null,'$INV2')")")"
check "reason is required" contains "invalid" "$(as_user $A2 "$(ST "public.correct_invoice_v1('$INV2','',null)")")"
check "manager (no finance authority) cannot correct" contains "not_found" "$(as_user $A3 "$(ST "public.correct_invoice_v1('$INV2','billed to the wrong entity',null)")")"
check "outsider cannot correct" contains "not_found" "$(as_user $B1 "$(ST "public.correct_invoice_v1('$INV2','billed to the wrong entity',null)")")"
R=$(as_user $A2 "select public.correct_invoice_v1('$INV2','billed to the wrong entity','REF-77');")
check "correction creates credit note CN-0001" contains "CN-0001" "$R"
CN2=$(q "select id from public.finance_records where supersedes_id='$INV2'")
check "original financial content is byte-identical after the correction" contains "$SNAP2_PRE" "$(SNAP $INV2)"
check "original keeps status issued (no cancel, no void)" contains "issued" "$(q "select status from public.finance_records where id='$INV2'")"
check "original carries the one-way link to its credit note" contains "true" "$(q "select (credited_by_id='$CN2' and credited_at is not null)::text from public.finance_records where id='$INV2'")"
check "credit note: kind, chain pointer, same gross + currency" contains "credit_note|true|true|true" "$(q "select c.invoice_kind||'|'||(c.supersedes_id='$INV2')||'|'||(c.gross_total_cents=o.gross_total_cents)||'|'||(c.currency=o.currency) from public.finance_records c join public.finance_records o on o.id='$INV2' where c.id='$CN2'")"
check "credit note stores reason, reference, actor and time" contains "billed to the wrong entity|REF-77|a0000002-0000-0000-0000-000000000002|true" "$(q "select correction_reason||'|'||correction_reference||'|'||corrected_by||'|'||(corrected_at is not null) from public.finance_records where id='$CN2'")"
check "credit note lines copy treatment snapshots and point at the originals" contains "zero_rated|true" "$(q "select l.tax_treatment||'|'||(l.credits_line_id is not null) from public.finance_record_lines l where l.invoice_id='$CN2' limit 1")"
check "second correction of the same invoice refused" contains "already_credited" "$(as_user $A2 "$(ST "public.correct_invoice_v1('$INV2','again please',null)")")"
check "credit note is immutable (superuser)" contains "issued_invoice_is_immutable" "$(q "update public.finance_records set correction_reason='rewritten history' where id='$CN2'")"
check "the credited link is final (superuser)" contains "issued_invoice_is_immutable" "$(q "update public.finance_records set credited_by_id=null, credited_at=null where id='$INV2'")"
check "the original cannot be cancelled to hide it" contains "issued_invoice_is_immutable" "$(q "update public.finance_records set status='cancelled' where id='$INV2'")"
check "credit note status cannot be changed" contains "not_applicable" "$(as_user $A2 "select public.set_finance_record_status_v1('$CN2','paid');")"
echo "  -- replacement"
check "corrected evidence is billable again (credited originals no longer block)" contains "billable" "$(as_user_raw $A2 "select public.billing_period_preview_v1('$PER2');")"
D4=$(as_user_raw $A2 "select public.create_invoice_draft_from_period_v1('$PER2','Right Client Oy','$ORG_C',null,null,null,'replacement','$INV2');")
check "replacement draft created (period re-opened by the issuer's explicit choice)" contains "created" "$D4"
REP=$(q "select id from public.finance_records where replaces_id='$INV2'")
check "replacement links to the original and COPIES the correction reason + reference" contains "billed to the wrong entity|REF-77|true" "$(q "select correction_reason||'|'||correction_reference||'|'||(corrected_by is not null) from public.finance_records where id='$REP'")"
check "a second replacement of the same original is refused" contains "already_replaced" "$(as_user $A2 "$(ST "public.create_invoice_draft_from_period_v1('$PER2','Again Oy',null,null,null,null,null,'$INV2')")")"
as_user $A2 "select public.set_invoice_tax_v1('$REP','standard',20,null,true);" >/dev/null
check "replacement issued with the next number (0003)" contains "0003" "$(as_user $A2 "select public.issue_invoice_v1('$REP', true);")"
CH2=$(as_user_raw $A2 "select public.invoice_correction_chain_v1('$INV2');")
check "chain read from the ORIGINAL lists all three documents" contains "3" "$(echo "$CH2" | grep -o '"id":' | wc -l)"
check "chain read from the CREDIT NOTE names the same root" contains "$INV2" "$(as_user_raw $A2 "select public.invoice_correction_chain_v1('$CN2');")"
check "chain read from the REPLACEMENT names the same root" contains "$INV2" "$(as_user_raw $A2 "select public.invoice_correction_chain_v1('$REP');")"
check "chain carries reason, reference, actor and links" contains "REF-77" "$CH2"
check "chain is invisible to outsiders" contains "not_found" "$(as_user $B1 "select public.invoice_correction_chain_v1('$INV2');")"
echo "  -- the chain continues: correct the replacement too"
R3=$(as_user $A2 "select public.correct_invoice_v1('$REP','replacement had a typo','REF-78');")
check "replacement can itself be corrected (CN-0002)" contains "CN-0002" "$R3"
check "chain from the original now lists four documents" contains "4" "$(as_user_raw $A2 "select public.invoice_correction_chain_v1('$INV2');" | grep -o '"id":' | wc -l)"
echo "  -- credit-only correction of a PAID invoice: period stays locked"
as_user $A2 "select public.set_finance_record_status_v1('$INV','paid');" >/dev/null
SNAP1_PRE="$(SNAP $INV)"
check "paid invoice corrected by credit note (CN-0003)" contains "CN-0003" "$(as_user $A2 "select public.correct_invoice_v1('$INV','partial scope dispute',null);")"
check "original unchanged by credit-only correction" contains "$SNAP1_PRE" "$(SNAP $INV)"
check "paid status untouched" contains "paid" "$(q "select status from public.finance_records where id='$INV'")"
check "period stays invoiced (no silent rebill)" contains "invoiced" "$(q "select status from public.billing_periods where id='$PER'")"
check "new draft for that period still refused" contains "period_locked" "$(as_user $A2 "$(ST "public.create_invoice_draft_from_period_v1('$PER','Client UAB')")")"
check "credit note numbers come from their own gapless series" contains "CN-0001,CN-0002,CN-0003" "$(q "select string_agg(invoice_number, ',' order by invoice_number) from public.finance_records where invoice_kind='credit_note'")"
check "no invoice shows a cancelled/voided state anywhere" contains "0" "$(q "select count(*) from public.finance_records where billing_period_id is not null and status='cancelled'")"

echo; echo "--- 14. number sequence under concurrency (gapless, unique)"
$PSQL -q >/dev/null <<SQL
do \$\$ begin for i in 1..6 loop
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
for i in 1 2 3 4 5 6; do
  n=$(printf '%02d' $i)
  as_user $A1 "$(REV c1000000-0000-0000-0000-0000000000$n approved ok)" >/dev/null
  as_user $A2 "select public.create_invoice_draft_from_period_v1('bb000000-0000-0000-0000-0000000000$n','Conc client');" >/dev/null
  CID=$(q "select id from public.finance_records where billing_period_id='bb000000-0000-0000-0000-0000000000$n'")
  as_user $A2 "select public.set_invoice_tax_v1('$CID','exempt',0,null,true);" >/dev/null
done
for i in 1 2 3 4 5 6; do
  n=$(printf '%02d' $i)
  CID=$(q "select id from public.finance_records where billing_period_id='bb000000-0000-0000-0000-0000000000$n'")
  ( as_user $A2 "select public.issue_invoice_v1('$CID', true);" >/dev/null ) &
done
wait
check "6 concurrent issues -> 6 distinct numbers" contains "6" "$(q "select count(distinct invoice_number) from public.finance_records where billing_period_id::text like 'bb000000%' and issued_at is not null")"
check "numbers are gapless 0004..0009" contains "0004,0005,0006,0007,0008,0009" "$(q "select string_agg(invoice_number, ',' order by invoice_number) from public.finance_records where billing_period_id::text like 'bb000000%' and issued_at is not null")"
check "duplicate number per issuer impossible (unique index)" contains "duplicate key" "$(q "update public.finance_records set issued_at=issued_at where false; insert into public.finance_records (record_type,title,counterparty_name,amount_cents,currency,status,created_by,issuer_org_id,invoice_number,issued_at) values ('invoice_issued','dup dup','dup',1,'EUR','issued','$A1','$ORG_A','0001',now())")"

echo; echo "--- 15. currency-neutral: SEK / NOK / PLN / JPY (0 decimals) / KWD (3 decimals); shape refused otherwise"
for bad in "sek" "SE" " SEK" "SEKK" "S3K" ""; do
  check "currency '$bad' refused by the command" contains "invalid" "$(as_user $A2 "$(ST "public.add_project_rate_term_v1('$P1','fixed',null,1,'$bad',null,null,'2027-01-01',null)")")"
done
check "lowercase currency refused by the table CHECK" contains "currency" "$(q "insert into public.project_rate_terms (project_id, organization_id, basis_type, unit, rate_cents, currency, valid_from, agreed_by) values ('$P1','$ORG_A','fixed',null,1,'eur','2027-01-01','$A2')")"
check "lowercase currency refused on the invoice header" contains "currency" "$(q "insert into public.finance_records (record_type,title,counterparty_name,amount_cents,currency,created_by) values ('invoice_issued','x x x','y y',1,'eur','$A1')")"
$PSQL -q >/dev/null <<SQL
do \$\$
declare codes text[] := array['SEK','NOK','PLN','JPY','KWD']; rates bigint[] := array[45000,52000,18000,5000,12500]; i int;
begin for i in 1..5 loop
  insert into public.projects (id, organization_id, title) values (('90000000-0000-0000-0000-00000000e0' || lpad(i::text,2,'0'))::uuid, '$ORG_A', 'Cur ' || codes[i]);
  insert into public.billing_periods (id, project_id, organization_id, period_start, period_end, created_by)
    values (('bc000000-0000-0000-0000-0000000000' || lpad(i::text,2,'0'))::uuid, ('90000000-0000-0000-0000-00000000e0' || lpad(i::text,2,'0'))::uuid, '$ORG_A', '2026-12-01','2026-12-31','$A2');
  insert into public.project_rate_terms (project_id, organization_id, basis_type, unit, rate_cents, currency, valid_from, agreed_by)
    values (('90000000-0000-0000-0000-00000000e0' || lpad(i::text,2,'0'))::uuid, '$ORG_A','hours','hours',rates[i],codes[i],'2026-12-01','$A2');
  insert into public.journal_entries (id, worker_id, engagement_context_id, original_text, hash_self, project_id, created_at)
    values (('c2000000-0000-0000-0000-0000000000' || lpad(i::text,2,'0'))::uuid, '$W','ec000004-0000-0000-0000-000000000004','c','h',('90000000-0000-0000-0000-00000000e0' || lpad(i::text,2,'0'))::uuid,'2026-12-05 10:00+00');
  insert into public.journal_entry_metrics (entry_id, metric_slug, value_numeric, unit_slug) values (('c2000000-0000-0000-0000-0000000000' || lpad(i::text,2,'0'))::uuid,'quantity',3,'hours');
end loop; end \$\$;
SQL
CODES=(SEK NOK PLN JPY KWD); EXP_NET=(135000 156000 54000 15000 37500); EXP_TAX=(33750 39000 13500 3750 9375)
for i in 1 2 3 4 5; do
  n=$(printf '%02d' $i)
  as_user $A1 "$(REV c2000000-0000-0000-0000-0000000000$n approved ok)" >/dev/null
  as_user $A2 "select public.create_invoice_draft_from_period_v1('bc000000-0000-0000-0000-0000000000$n','Nordic customer');" >/dev/null
  XID=$(q "select id from public.finance_records where billing_period_id='bc000000-0000-0000-0000-0000000000$n'")
  as_user $A2 "select public.set_invoice_tax_v1('$XID','standard',25,null,true);" >/dev/null
  as_user $A2 "select public.issue_invoice_v1('$XID', true);" >/dev/null
  check "${CODES[$((i-1))]} invoice: header + line currency, net and 25% tax in integer minor units" contains "${CODES[$((i-1))]}|${CODES[$((i-1))]}|${EXP_NET[$((i-1))]}|${EXP_TAX[$((i-1))]}" "$(q "select f.currency||'|'||(select string_agg(distinct l.currency,',') from public.finance_record_lines l where l.invoice_id=f.id)||'|'||f.net_total_cents||'|'||f.tax_total_cents from public.finance_records f where f.id='$XID'")"
done
XID=$(q "select id from public.finance_records where billing_period_id='bc000000-0000-0000-0000-000000000004'")
check "JPY issued invoice currency is frozen" contains "issued_invoice_is_immutable" "$(q "update public.finance_records set currency='EUR' where id='$XID'")"
check "a line of another currency cannot be added to an invoice (trigger)" contains "line_currency_mismatch" "$(q "insert into public.finance_records (id,record_type,title,counterparty_name,amount_cents,currency,status,created_by,issuer_org_id) values ('f0f0f0f0-0000-0000-0000-000000000001','invoice_issued','mix mix','mix mix',0,'SEK','draft','$A1','$ORG_A'); insert into public.finance_record_lines (invoice_id,line_no,basis_type,quantity,unit_price_cents,net_cents,currency,evidence_class) values ('f0f0f0f0-0000-0000-0000-000000000001',1,'fixed',1,1,1,'USD','agreed_basis')")"
q "delete from public.finance_records where id='f0f0f0f0-0000-0000-0000-000000000001'" >/dev/null

echo; echo "--- 16. rollback REFUSES while lifecycle rows exist, then works at zero rows"
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
