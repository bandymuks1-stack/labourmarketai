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
  ...["invoice-tax-model.ts", "invoice-currency.ts", "project-invoice-model.ts", "project-invoice.ts", "project-invoice-actions.ts"].map((f) => join(WEB, "lib", "finance", f)),
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
  const TABLES = ["project_rate_terms", "billing_periods", "organization_tax_presets", "invoice_number_sequences", "finance_record_lines", "finance_record_line_sources"];
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
