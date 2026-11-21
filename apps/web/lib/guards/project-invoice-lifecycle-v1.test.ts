import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * PROJECT-TO-INVOICE LIFECYCLE - structural guards (static source assertions;
 * the behavioural proof is scripts/db-proof/project-invoice-lifecycle-v1.sh).
 *
 *  1. WORK acceptance is never INVOICE acceptance (owner decision, 2026-10-08).
 *  2. No invoice approval / acceptance workflow exists in this slice.
 *  3. An issued invoice is frozen by a trigger and the legacy RPCs refuse it.
 *  4. Tax is country-neutral data: no country, rate or wording in code or copy.
 *  5. Currency is neutral: no EUR assumption in the lifecycle code.
 *  6. Every new table has RLS and no anon/PUBLIC privilege; no new function is
 *     SECURITY DEFINER without a pinned search_path.
 */

const WEB = join(__dirname, "..", "..");
const REPO = join(WEB, "..", "..");
const MIG = readFileSync(join(REPO, "supabase", "migrations", "20261008150000_project_invoice_lifecycle_v1.sql"), "utf8").replace(/\r/g, "");
const DOWN = readFileSync(join(REPO, "supabase", "rollbacks", "20261008150000_project_invoice_lifecycle_v1.down.sql"), "utf8").replace(/\r/g, "");

function walk(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(f) && !/\.test\.ts$/.test(f)) out.push(p);
  }
  return out;
}

/** Every non-test source file of the lifecycle UI/logic. */
const LIFECYCLE_FILES = [
  ...["invoice-tax-model.ts", "invoice-currency.ts", "invoice-evidence-parity.ts", "project-invoice-model.ts", "project-invoice.ts", "project-invoice-actions.ts"].map((f) => join(WEB, "lib", "finance", f)),
  join(WEB, "components", "app", "project-financial-history.tsx"),
  ...walk(join(WEB, "app", "[locale]", "dashboard", "projects", "[id]", "invoicing")),
];
const SRC = new Map(LIFECYCLE_FILES.map((f) => [f, readFileSync(f, "utf8")]));

const LOCALES = ["en", "lt", "de", "nl", "pl", "ru"] as const;
function messages(locale: string): Record<string, unknown> {
  const all = JSON.parse(readFileSync(join(WEB, "messages", `${locale}.json`), "utf8")) as Record<string, unknown>;
  return all.projectInvoice as Record<string, unknown>;
}
function flatten(o: unknown, prefix = "", out: Record<string, string> = {}): Record<string, string> {
  if (typeof o === "string") out[prefix] = o;
  else if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) flatten(v, prefix ? `${prefix}.${k}` : k, out);
  return out;
}

describe("1+2. work acceptance is never invoice acceptance; no invoice approval path", () => {
  it("no code file defines an invoice accept/approve command, state or table", () => {
    for (const [file, src] of SRC) {
      const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      expect(code, file).not.toMatch(/(invoice|credit)[_ ]?(accept|approv)/i);
      expect(code, file).not.toMatch(/(accept|approv)\w*[_ ]?invoice/i);
      expect(code, file).not.toMatch(/clientResponse|client_response|invoice_client/i);
    }
    expect(MIG).not.toMatch(/create table[^;]*invoice[a-z_]*(response|accept|approv)/i);
    expect(MIG).not.toMatch(/create (or replace )?function public\.[a-z_]*invoice[a-z_]*(accept|approv)[a-z_]*/i);
    expect(MIG).not.toMatch(/create (or replace )?function public\.[a-z_]*(accept|approv)[a-z_]*invoice/i);
    expect(MIG).not.toMatch(/invoice_client_reader_v1|invoice_client_responses|record_invoice_client_response/);
  });

  it("the migration states no-approval as a constraint on lifecycle invoices", () => {
    expect(MIG).toMatch(/fr_no_approval_on_lifecycle check \(billing_period_id is null or approval_status is null\)/);
  });

  it("issue and correct do not read any client state", () => {
    const issue = MIG.slice(MIG.indexOf("create or replace function public.issue_invoice_v1"), MIG.indexOf("-- 13.9"));
    const correct = MIG.slice(MIG.indexOf("create or replace function public.correct_invoice_v1"), MIG.indexOf("-- 13.10"));
    for (const body of [issue, correct]) {
      expect(body).not.toMatch(/client_state|client_confirmation|journal_entry_confirmations/);
    }
  });

  it("'client_accepted' is only ever DERIVED from a recorded counterparty decision, never assigned from internal confirmation", () => {
    // SQL: the only assignments of the class come from the counterparty `client_state = 'accepted'` or a CASE on it.
    const assignments = [...MIG.matchAll(/'client_accepted'/g)].length;
    expect(assignments).toBeGreaterThan(0);
    const lines = MIG.split("\n").filter((l) => l.includes("'client_accepted'") && !l.trim().startsWith("--"));
    for (const l of lines) {
      const ok =
        /client_state\s*=\s*'accepted'/.test(l) ||
        /evidence_class in \(/.test(l) ||
        /check \(/.test(l) ||
        /evidence_class\s*=\s*'client_accepted'/.test(l) ||
        /'client_accepted'\)/.test(l) ||
        /'internal_confirmed','client_accepted'/.test(l);
      expect(ok, `unexpected client_accepted assignment: ${l.trim()}`).toBe(true);
    }
    // the draft builder stamps a line 'internal_confirmed' with only the accepted SHARE separate
    expect(MIG).toMatch(/'internal_confirmed', g\.qty_client/);
    // TS: no code path maps an internal class to a client class
    for (const [file, src] of SRC) {
      expect(src, file).not.toMatch(/internal_confirmed["']?\s*(\?|\|\|)\s*["']client_accepted/);
      expect(src, file).not.toMatch(/evidenceClass\s*=\s*["']client_accepted["']/);
    }
  });

  it("no locale says the invoice was accepted/approved, and the work-acceptance wording names the WORK", () => {
    for (const loc of LOCALES) {
      const flat = flatten(messages(loc));
      for (const [k, v] of Object.entries(flat)) {
        expect(k, `${loc}:${k}`).not.toMatch(/invoiceAccept|invoice_accept|clientDecision|clientResponse/);
        if (loc === "en") expect(v, `${loc}:${k}`).not.toMatch(/invoice (was |is |has been )?(accepted|approved)/i);
      }
    }
    const en = flatten(messages("en"));
    expect(en["evidence.client_accepted"]).toMatch(/work/i);
    expect(en["evidence.client_accepted_help"]).toMatch(/work/i);
    expect(en["evidence.client_accepted_help"]).toMatch(/never about the invoice/i);
    expect(en["evidence.optionalClient"]).toMatch(/never depends on the client/i);
  });

  it("audit actions are accounting verbs (issue / correct), never acceptance", () => {
    const actions = [...MIG.matchAll(/_invoice_audit_v1\('([a-z_]+)'/g)].map((m) => m[1]);
    expect(actions.length).toBeGreaterThan(3);
    for (const a of actions) expect(a).not.toMatch(/accept|approv/);
    expect(actions).toContain("issue_invoice");
    expect(actions).toContain("correct_invoice");
  });
});

describe("3. an issued invoice is frozen and corrected only through the chain", () => {
  it("a trigger freezes header, lines and sources, and the replaced RPCs refuse", () => {
    expect(MIG).toMatch(/create trigger finance_records_issued_guard/);
    expect(MIG).toMatch(/create trigger finance_record_lines_frozen/);
    expect(MIG).toMatch(/create trigger finance_record_line_sources_frozen/);
    expect(MIG).toMatch(/return 'immutable_issued'/);
    expect(MIG).toMatch(/return 'invalid_transition'/);
    expect(MIG).toMatch(/return 'use_correct_invoice'/);
  });

  it("the frozen header guard lists recipient, currency, parties, tax and chain fields", () => {
    const guard = MIG.slice(MIG.indexOf("function public.finance_records_issued_guard_v1"), MIG.indexOf("create trigger finance_records_issued_guard"));
    for (const col of ["counterparty_name", "currency", "client_org_id", "customer_vat_id", "customer_address", "amount_cents", "vat_amount_cents", "tax_breakdown", "replaces_id", "correction_reason", "corrected_by", "invoice_number"]) {
      expect(guard, col).toContain(`new.${col}`);
    }
  });

  it("the correction chain stores reason, reference, actor and time and is readable from any document", () => {
    expect(MIG).toMatch(/correction_reason\s+text/);
    expect(MIG).toMatch(/correction_reference\s+text/);
    expect(MIG).toMatch(/corrected_by\s+uuid/);
    expect(MIG).toMatch(/corrected_at\s+timestamptz/);
    expect(MIG).toMatch(/create or replace function public\.invoice_correction_chain_v1/);
    expect(MIG).toMatch(/replaces_id/);
  });

  it("nothing recalculates an issued invoice: totals are recomputed only for drafts", () => {
    const calls = [...MIG.matchAll(/perform public\._invoice_recompute_totals_v1\(([a-z_]+)\)/g)].map((m) => m[1]);
    expect(calls.length).toBeGreaterThan(0);
    // called on: draft builder (v_inv), basis line / tax commands (p_invoice_id, draft-only), issue (before the status flips), credit note draft (v_cn)
    for (const c of calls) expect(["v_inv", "p_invoice_id", "v_cn", "l.invoice_id"]).toContain(c);
    const tax = MIG.slice(MIG.indexOf("create or replace function public.set_invoice_line_tax_v1"), MIG.indexOf("create or replace function public.update_invoice_draft_details_v1"));
    expect(tax).toMatch(/issued_invoice_is_immutable/);
  });
});

describe("4. tax is country-neutral data", () => {
  const BANNED = /luxembourg|luxemburg|l[eë]tzebuerg|\b17\s*%|\b17\s*percent|tva\b|mwst|\bBTW\b|\bPVM\b|\bMOMS\b|a1 certificate|posted worker/i;

  it("no code or copy hard-codes a country, a rate or country-specific wording", () => {
    for (const [file, src] of SRC) {
      const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      expect(code, file).not.toMatch(BANNED);
    }
    const migCode = MIG.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
    expect(migCode).not.toMatch(BANNED);
    for (const loc of LOCALES) {
      for (const [k, v] of Object.entries(flatten(messages(loc)))) expect(v, `${loc}:${k}`).not.toMatch(BANNED);
    }
  });

  it("treatment is stored per line with rate and note, set explicitly; the draft builder never selects one", () => {
    expect(MIG).toMatch(/tax_treatment\s+text check/);
    const insertDraftLines = MIG.slice(MIG.indexOf("insert into public.finance_record_lines (invoice_id, line_no, basis_type, description, rate_term_id, unit,\n        quantity"), MIG.indexOf("insert into public.finance_record_line_sources"));
    expect(insertDraftLines.length).toBeGreaterThan(50);
    expect(insertDraftLines).not.toMatch(/tax_treatment/);
    expect(MIG).toMatch(/tax_treatment_missing/);
    expect(MIG).toMatch(/tax_confirmation_required/);
  });

  it("zero_rated and reverse_charge are separate stored values", () => {
    expect(MIG).toMatch(/'zero_rated'/);
    expect(MIG).toMatch(/'reverse_charge'/);
    expect(MIG).toMatch(/'exempt'/);
    expect(MIG).toMatch(/'outside_scope'/);
  });
});

describe("5. currency neutrality", () => {
  it("the lifecycle code and tables carry no EUR assumption", () => {
    for (const [file, src] of SRC) {
      const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      if (file.endsWith("invoice-currency.ts")) continue; // the ISO list itself contains EUR among ~160 codes
      expect(code, file).not.toMatch(/["']EUR["']/);
      expect(code, file).not.toMatch(/formatCentsAsEur|parseAmountInputToCents/);
    }
    const migCode = MIG.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
    expect(migCode).not.toMatch(/currency in \('EUR'\)/);
    expect(migCode).toMatch(/currency\s*~\s*'\^\[A-Z\]\{3\}\$'/);
    // new columns default to nothing: the currency comes from the agreed term
    expect(migCode).not.toMatch(/currency\s+char\(3\)[^,\n]*default\s+'EUR'/);
  });

  it("every currency column is shape-checked and lines are bound to their invoice's currency", () => {
    expect(MIG).toMatch(/line_currency_mismatch/);
    expect((MIG.match(/currency\s+char\(3\) not null check \(currency ~ '\^\[A-Z\]\{3\}\$'\)/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });
});

describe("6. privilege surface", () => {
  const TABLES = ["project_rate_terms", "billing_periods", "organization_tax_presets", "invoice_series_configs", "invoice_number_counters", "invoice_recipients", "finance_record_lines", "finance_record_line_sources"];
  it("every new table has RLS enabled and no anon/PUBLIC privilege", () => {
    for (const t of TABLES) {
      expect(MIG, t).toMatch(new RegExp(`alter table public\\.${t}\\s+enable row level security`));
      expect(MIG, t).toMatch(new RegExp(`public\\.${t}[\\s\\S]{0,400}from public, anon, authenticated`));
    }
  });
  it("no policy is `using (true)` or `to anon`", () => {
    expect(MIG).not.toMatch(/using\s*\(\s*true\s*\)/i);
    expect(MIG).not.toMatch(/to anon/i);
  });
  it("every SECURITY DEFINER function pins search_path", () => {
    const fns = MIG.split(/create or replace function /).slice(1);
    for (const body of fns) {
      const head = body.slice(0, body.indexOf("$$") > 0 ? body.indexOf("$$") + 2 : 400);
      const name = head.split("(")[0];
      if (/security definer/i.test(head)) expect(head, name).toMatch(/set search_path/i);
    }
  });
  it("the rollback removes every new object and refuses on live data", () => {
    expect(DOWN).toMatch(/rollback refused/);
    for (const n of ["correct_invoice_v1", "invoice_correction_chain_v1", "issue_invoice_v1", "finance_record_lines", "billing_periods", "project_rate_terms", "fr_no_approval_on_lifecycle", "replaces_id"]) {
      expect(DOWN, n).toContain(n);
    }
  });
  it("all six full locales carry the same keys", () => {
    const base = Object.keys(flatten(messages("en"))).sort();
    for (const loc of LOCALES) expect(Object.keys(flatten(messages(loc))).sort(), loc).toEqual(base);
  });
});

function fnBody(name: string): string {
  const i = MIG.indexOf(`create or replace function public.${name}(`);
  expect(i, `${name} missing`).toBeGreaterThan(-1);
  const j = MIG.indexOf("\nend $$;", i);
  return MIG.slice(i, j);
}

describe("7. numbering is configuration, not code", () => {
  it("issue and correct take their number from the configurable allocator only", () => {
    for (const fn of ["issue_invoice_v1", "correct_invoice_v1"]) {
      const body = fnBody(fn);
      expect(body, fn).toContain("_invoice_take_number_v1");
      expect(body, fn).not.toMatch(/lpad\(/);
      expect(body, fn).not.toMatch(/'(INV|CN)[-0-9]*'|'0001'/);
    }
  });
  it("the only prefixes in SQL are the audited default row created by the allocator", () => {
    const allocator = fnBody("_invoice_take_number_v1");
    expect(allocator).toMatch(/series_defaulted/);
    expect(allocator).toMatch(/created_by, updated_by/);
    const rest = MIG.replace(allocator, "");
    const code = rest.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
    expect(code).not.toMatch(/'(INV|CN)'/);
  });
  it("series config + counters + provenance + uniqueness exist; changes are audited; counters are per year", () => {
    expect(MIG).toMatch(/create table public\.invoice_series_configs/);
    expect(MIG).toMatch(/year_based\s+boolean/);
    expect(MIG).toMatch(/primary key \(organization_id, document_type, year\)/);
    expect(MIG).toMatch(/fr_issuer_number_uq/);
    expect(MIG).toMatch(/fr_issuer_seq_uq/);
    expect(fnBody("configure_invoice_series_v1")).toMatch(/_invoice_audit_v1\('configure_invoice_series'/);
    expect(fnBody("configure_invoice_series_v1")).not.toMatch(/update public\.finance_records/);
  });
});

describe("8. authority, labour supply and the recipient snapshot", () => {
  it("issuing, tax confirmation, correction and series/recipient commands never grant by project management", () => {
    for (const fn of ["issue_invoice_v1", "set_invoice_tax_v1", "set_invoice_line_tax_v1", "correct_invoice_v1", "discard_invoice_draft_v1", "configure_invoice_series_v1", "save_invoice_recipient_v1", "set_invoice_recipient_v1", "add_invoice_basis_line_v1"]) {
      const body = fnBody(fn);
      expect(body, fn).toMatch(/invoice_issuer_authority_v1/);
      expect(body, fn).not.toMatch(/can_manage_project|manages_organization/);
    }
  });
  it("read access does not assume the issuer owns the project", () => {
    expect(MIG).toMatch(/create policy prt_select[\s\S]{0,120}invoice_period_reader_v1\(project_id, organization_id\)/);
    expect(MIG).toMatch(/create policy bp_select[\s\S]{0,120}invoice_period_reader_v1\(project_id, organization_id\)/);
    for (const fn of ["billing_period_preview_v1", "billing_period_changes_v1"]) {
      expect(fnBody(fn), fn).toMatch(/invoice_period_reader_v1/);
      expect(fnBody(fn), fn).not.toMatch(/can_manage_project/);
    }
    expect(fnBody("invoice_period_reader_v1")).toMatch(/pr\.organization_id = p_org/);
  });
  it("the recipient is the issuer's own record, frozen as a snapshot at issue", () => {
    expect(MIG).toMatch(/create table public\.invoice_recipients/);
    expect(MIG).toMatch(/issuer_org_id\s+uuid not null/);
    const issue = fnBody("issue_invoice_v1");
    expect(issue).toMatch(/recipient_missing/);
    expect(issue).toMatch(/recipient_incomplete/);
    expect(issue).toMatch(/recipient_snapshot = v_snapshot/);
    const guard = MIG.slice(MIG.indexOf("function public.finance_records_issued_guard_v1"), MIG.indexOf("create trigger finance_records_issued_guard"));
    for (const col of ["recipient_id", "recipient_snapshot", "number_series", "number_year", "number_seq"]) expect(guard, col).toContain(`new.${col}`);
    expect(MIG).toMatch(/create policy irc_select[\s\S]{0,160}invoice_issuer_authority_v1\(issuer_org_id\)/);
  });
});

describe("9. corrections: partial lines, over-credit guard, locked period", () => {
  it("correct_invoice_v1 accepts an optional line selection and guards cumulative credit twice", () => {
    expect(MIG).toMatch(/correct_invoice_v1\(\s*p_invoice_id uuid, p_reason text, p_reference text default null, p_lines jsonb default null\)/);
    expect(fnBody("correct_invoice_v1")).toMatch(/over_credit/);
    expect(MIG).toMatch(/create trigger finance_record_lines_credit_guard/);
    expect(MIG).toMatch(/credit_line_must_copy_original/);
  });
  it("a credited period is never reopened by code", () => {
    const code = MIG.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
    expect(code).not.toMatch(/set status = 'open'/);
    expect(fnBody("create_invoice_draft_from_period_v1")).not.toMatch(/update public\.billing_periods/);
    expect(fnBody("correct_invoice_v1")).not.toMatch(/billing_periods/);
  });
  it("a replacement needs a FULLY credited original", () => {
    expect(fnBody("create_invoice_draft_from_period_v1")).toMatch(/orig\.credited_at is null/);
    expect(fnBody("issue_invoice_v1")).toMatch(/orig\.credited_at is null/);
  });
});

describe("10. work evidence: explicit selection, days, role tags, allocations, disputed work", () => {
  it("the draft builder takes an explicit selection and refuses non-billable or conflicting rows", () => {
    const b = fnBody("create_invoice_draft_from_period_v1");
    expect(b).toMatch(/p_selection jsonb/);
    expect(b).toMatch(/selection_not_billable/);
    expect(b).toMatch(/time_basis_conflict/);
  });
  it("days are a generic billable unit, never converted to hours", () => {
    expect(MIG).toMatch(/unit not in \('hours','minutes'\)/);
    const evidence = fnBody("_invoice_period_evidence_v1");
    expect(evidence).not.toMatch(/\* 8|\* 24/);
    expect(evidence).toMatch(/m\.unit_slug not in \('hours','minutes'\)/);
  });
  it("role tags and work_hour_allocations never reach an invoice calculation", () => {
    for (const fn of ["_invoice_period_evidence_v1", "create_invoice_draft_from_period_v1", "issue_invoice_v1", "add_invoice_basis_line_v1"]) {
      expect(fnBody(fn), fn).not.toMatch(/role_label|work_hour_allocations/);
    }
  });
  it("there is no issuer override of disputed work", () => {
    expect(MIG).not.toMatch(/override/i);
  });
});

describe("11. the legacy EUR register cannot misrepresent lifecycle invoices", () => {
  const read = (rel: string) => readFileSync(join(WEB, rel), "utf8").replace(/\r/g, "");
  it("the legacy reader excludes lifecycle rows and degrades to the old read before the migration", () => {
    const finance = read("lib/finance/finance.ts");
    expect(finance).toMatch(/\.is\("billing_period_id", null\)/);
    expect(finance).toMatch(/42703/);
  });
  it("legacy summaries refuse to add across currencies", () => {
    expect(read("lib/finance/finance-model.ts")).toMatch(/refusing to sum across currencies/);
  });
  it("the legacy CSV formats amounts with the currency's own exponent", () => {
    const model = read("lib/finance/finance-model.ts");
    const row = model.slice(model.indexOf("export function buildFinanceCsvRow"), model.indexOf("function csvRow("));
    expect(row).toMatch(/minorToDecimalString\(record\.amountCents, record\.currency\)/);
    expect(row).not.toMatch(/formatCentsAsEur/);
  });
  it("project economics reads only through the legacy reader and lifecycle totals are per currency", () => {
    expect(read("lib/economics/economics.ts")).toMatch(/listMyFinanceRecords/);
    expect(MIG).toMatch(/group by f\.currency, f\.invoice_kind/);
    expect(read("lib/finance/project-invoice-model.ts")).toMatch(/export function totalsByCurrency/);
  });
  it("the lifecycle currency is fixed at creation", () => {
    expect(MIG).toMatch(/lifecycle_currency_immutable/);
  });
});

describe("12. one work-time definition: the shared fixture is consumed by BOTH implementations", () => {
  it("the TypeScript test and the SQL proof read the same fixture", () => {
    const ts = readFileSync(join(WEB, "lib", "finance", "invoice-evidence-parity.test.ts"), "utf8");
    const sh = readFileSync(join(REPO, "scripts", "db-proof", "project-invoice-lifecycle-v1.sh"), "utf8");
    expect(ts).toContain("fixtures");
    expect(ts).toContain("work-time-parity.json");
    expect(sh).toContain("work-time-parity.json");
    expect(sh).toContain("PARITY OK");
  });
});
