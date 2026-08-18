import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { activeLocales, locales } from "@/lib/i18n/config";
import {
  PROCUREMENT_MAX_OFFERS,
  PROCUREMENT_READ_LIMIT,
  PROCUREMENT_STATUSES,
  PROCUREMENT_APPROVAL_STATUSES,
  isProcurementEditable,
  isProcurementOfferable,
  procurementNoticeForOutcome,
} from "@/lib/procurement/procurement-model";
import {
  TRIP_MAX_SPAN_DAYS,
  TRIP_READ_LIMIT,
  TRIP_STATUSES,
  isTripCancellable,
  isTripEditable,
  tripNoticeForOutcome,
  tripSpanDays,
} from "@/lib/trips/trips-model";
import {
  FINANCE_APPROVAL_STATUSES,
  financeApprovalContext,
  isValidFinanceApprovalStatus,
} from "@/lib/finance/finance-model";

/**
 * FINANCIAL OPS guards (functional completion train V2, train J — the audit's
 * MISSING "procurement" and "business trips" rows plus the PARTIAL invoice
 * handling row).
 *
 * What these pins protect:
 *
 *   - THIN MODULES ON EXISTING ENGINES. Approval decisions belong to the
 *     canonical Workflow & Approval Engine (context 'expense' / 'invoice' /
 *     'procurement' / 'business_trip' — all four already in the engine's own
 *     closed vocabulary); receipts belong to the Document engine. Neither is
 *     forked: no module defines an approval state machine, an approver
 *     resolver, a bucket or a file table of its own.
 *   - MIRROR, NEVER DECISION. Every module-local approval column is written
 *     only by its own submit/sync command, and the sync command's ONLY job is
 *     copying a TERMINAL engine outcome.
 *   - RPC-ONLY WRITES. No .insert/.update/.delete/.upsert anywhere in the
 *     three layers; the gated SECURITY DEFINER commands are the only writers.
 *   - MONEY IS INTEGER CENTS. No parseFloat, no toFixed, no float rounding.
 *   - NO ERP, NO OCR, NO AI, NO OUTBOUND. Recording an offer contacts no
 *     supplier; selecting one orders nothing; an advance pays nobody; a trip
 *     books nothing.
 *   - HONEST DEGRADATION while the human-gated migrations are unapplied.
 */

const ROOT = join(__dirname, "..", "..");
const REPO = join(ROOT, "..", "..");
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");

const MIGRATIONS = join(REPO, "supabase", "migrations");
const ROLLBACKS = join(REPO, "supabase", "rollbacks");

const INVOICE_MIGRATION = "20260817220000_finance_invoice_upgrades_v1";
const PROCUREMENT_MIGRATION = "20260817221000_procurement_v1";
const TRIPS_MIGRATION = "20260817222000_business_trips_v1";
const TRAIN_J = [INVOICE_MIGRATION, PROCUREMENT_MIGRATION, TRIPS_MIGRATION];

/**
 * CRLF IS NORMALISED AT THE READ, deliberately.
 *
 * This repository ships no `.gitattributes`, so a Windows checkout materialises
 * these `.sql` files with CRLF while a Linux CI runner gets LF. Several
 * assertions below compare against multi-line string literals written with a
 * bare newline escape — `PROCUREMENT_SQL` must contain the `check (status in`
 * clause across two lines — and a carriage return before every newline makes
 * those literals unmatchable.
 *
 * The result was the worst possible failure mode: a guard that passes on CI and
 * fails on every Windows machine, which trains a developer to ignore a red
 * guard and hides the next real regression behind the noise.
 *
 * The migration itself is CORRECT and is NOT touched — it is applied in
 * production, and an applied migration must never be edited to satisfy a test.
 * The same normalisation idiom is already used by
 * `secdef-local-reset-reproducibility.test.ts`, for exactly this reason.
 */
const readNormalized = (path: string): string =>
  readFileSync(path, "utf8").replace(/\r/g, "");
const sql = (name: string): string =>
  readNormalized(join(MIGRATIONS, `${name}.sql`));
const down = (name: string): string =>
  readNormalized(join(ROLLBACKS, `${name}.down.sql`));

const INVOICE_SQL = sql(INVOICE_MIGRATION);
const PROCUREMENT_SQL = sql(PROCUREMENT_MIGRATION);
const TRIPS_SQL = sql(TRIPS_MIGRATION);
const ALL_SQL = [INVOICE_SQL, PROCUREMENT_SQL, TRIPS_SQL];

const PROC_MODEL = read("lib/procurement/procurement-model.ts");
const PROC_READS = read("lib/procurement/procurement.ts");
const PROC_ACTIONS = read("lib/procurement/procurement-actions.ts");
const TRIP_MODEL = read("lib/trips/trips-model.ts");
const TRIP_READS = read("lib/trips/trips.ts");
const TRIP_ACTIONS = read("lib/trips/trips-actions.ts");
const FINANCE_ACTIONS = read("lib/finance/finance-actions.ts");
const FINANCE_READS = read("lib/finance/finance.ts");
const PROC_SECTION_REL = "app/[locale]/dashboard/finance/procurement-section.tsx";
const TRIPS_SECTION_REL = "app/[locale]/dashboard/finance/trips-section.tsx";
const PROC_SECTION = read(PROC_SECTION_REL);
const TRIPS_SECTION = read(TRIPS_SECTION_REL);
const FINANCE_PAGE = read("app/[locale]/dashboard/finance/page.tsx");

const FINOPS_LAYER = [
  PROC_MODEL,
  PROC_READS,
  PROC_ACTIONS,
  TRIP_MODEL,
  TRIP_READS,
  TRIP_ACTIONS,
  PROC_SECTION,
  TRIPS_SECTION,
];

/** Strip TS comments so a pin measures CODE, not prose that mentions the rule. */
function code(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

/**
 * Strip SQL line comments the same way. These migrations DOCUMENT their
 * exclusions in prose ("NO OCR", "NO per-diem statutory tables") — a pin that
 * read the header would fire on the very sentence promising the opposite, so
 * every "this must not appear" assertion below measures the STATEMENTS.
 */
function sqlCode(src: string): string {
  return src.replace(/^[ \t]*--.*$/gm, "").replace(/--[^\n]*$/gm, "");
}

const INVOICE_CODE = sqlCode(INVOICE_SQL);
const PROCUREMENT_CODE = sqlCode(PROCUREMENT_SQL);
const TRIPS_CODE = sqlCode(TRIPS_SQL);
const ALL_SQL_CODE = [INVOICE_CODE, PROCUREMENT_CODE, TRIPS_CODE];

/** The body of ONE function, cut at its own revoke line (never bleeding into
 *  the next function — a slice that overran produced a false pass once). */
function fnBody(src: string, fn: string): string {
  const at = src.indexOf(`create or replace function public.${fn}`);
  if (at < 0) return "";
  const rest = src.slice(at);
  const end = rest.indexOf(`revoke all on function public.${fn}`);
  return end > 0 ? rest.slice(0, end) : rest;
}

const PROCUREMENT_COMMANDS = [
  "create_procurement_inquiry_v1",
  "update_procurement_inquiry_v1",
  "submit_procurement_inquiry_v1",
  "add_procurement_offer_v1",
  "select_procurement_offer_v1",
  "set_procurement_status_v1",
  "set_procurement_finance_record_v1",
  "submit_procurement_approval_v1",
  "sync_procurement_approval_v1",
] as const;

const TRIP_COMMANDS = [
  "create_business_trip_v1",
  "update_business_trip_v1",
  "submit_business_trip_v1",
  "sync_business_trip_decision_v1",
  "complete_business_trip_v1",
  "cancel_business_trip_v1",
  "set_finance_record_trip_v1",
] as const;

const INVOICE_COMMANDS = [
  "create_finance_record_v2",
  "update_finance_record_v2",
  "submit_finance_record_approval_v1",
  "sync_finance_record_approval_v1",
] as const;

const NEW_TABLES = [
  "procurement_inquiries",
  "procurement_offers",
  "procurement_events",
  "business_trips",
  "business_trip_events",
] as const;

describe("1. exactly three human-gated migration pairs own the financial-ops slice", () => {
  it("each migration has a paired rollback and stays a needs-human-gate DRAFT citing the owner mandate", () => {
    for (const name of TRAIN_J) {
      const up = sql(name);
      expect(existsSync(join(ROLLBACKS, `${name}.down.sql`)), name).toBe(true);
      expect(up, name).toContain("needs-human-gate");
      expect(up, name).toMatch(
        /--\s*@human-gate-approved/,
      );
      // The annotation must state its AUTHORITY, not merely exist.
      expect(up, name).toContain("owner mandate 2026-08-17");
      expect(up, name).toMatch(/SAFETY CLASS|TIER:/);
      expect(up, name).toMatch(/ROLLBACK/i);
      // The rollback itself is never gate-annotated — undoing needs no
      // approval (the booking-engagement-end precedent).
      expect(down(name), name).not.toMatch(
        /(^|\r?\n)[ \t]*--[ \t]*@human-gate-approved\b/i,
      );
    }
  });

  it("no other migration or rollback defines the new tables or commands", () => {
    const OWNED = [
      ...NEW_TABLES,
      ...PROCUREMENT_COMMANDS,
      ...TRIP_COMMANDS,
      ...INVOICE_COMMANDS,
    ];
    for (const dir of ["migrations", "rollbacks"]) {
      const abs = join(REPO, "supabase", dir);
      for (const f of readdirSync(abs).filter((n) => n.endsWith(".sql"))) {
        if (TRAIN_J.some((p) => f.startsWith(p))) continue;
        const src = readFileSync(join(abs, f), "utf8");
        for (const name of OWNED) {
          expect(src, `${dir}/${f} must not define ${name}`).not.toContain(
            name,
          );
        }
      }
    }
  });

  it("every rollback drops exactly what its migration created — nothing recreated", () => {
    // Invoice upgrades: 4 additive columns + 4 functions + 1 index.
    const invoiceDown = down(INVOICE_MIGRATION);
    for (const col of [
      "invoice_number",
      "vat_amount_cents",
      "org_document_id",
      "approval_status",
    ]) {
      expect(INVOICE_SQL).toContain(`add column if not exists ${col}`);
      expect(invoiceDown).toContain(`drop column if exists ${col}`);
    }
    for (const fn of INVOICE_COMMANDS) {
      expect(INVOICE_SQL).toContain(`create or replace function public.${fn}`);
      expect(invoiceDown).toContain(`drop function if exists public.${fn}`);
    }
    // A rollback NEVER recreates a function — the up migration touched none.
    expect(invoiceDown).not.toMatch(/create (or replace )?function/i);

    const procDown = down(PROCUREMENT_MIGRATION);
    for (const fn of PROCUREMENT_COMMANDS) {
      expect(PROCUREMENT_SQL).toContain(
        `create or replace function public.${fn}`,
      );
      expect(procDown).toContain(`drop function if exists public.${fn}`);
    }
    for (const tbl of [
      "procurement_inquiries",
      "procurement_offers",
      "procurement_events",
    ]) {
      expect(PROCUREMENT_SQL).toContain(
        `create table if not exists public.${tbl}`,
      );
      expect(procDown).toContain(`drop table if exists public.${tbl}`);
    }
    expect(procDown).not.toMatch(/create (or replace )?function/i);

    const tripsDown = down(TRIPS_MIGRATION);
    for (const fn of TRIP_COMMANDS) {
      expect(TRIPS_SQL).toContain(`create or replace function public.${fn}`);
      expect(tripsDown).toContain(`drop function if exists public.${fn}`);
    }
    for (const tbl of ["business_trips", "business_trip_events"]) {
      expect(TRIPS_SQL).toContain(`create table if not exists public.${tbl}`);
      expect(tripsDown).toContain(`drop table if exists public.${tbl}`);
    }
    // The one additive finance column is dropped too.
    expect(TRIPS_SQL).toContain("add column if not exists trip_id");
    expect(tripsDown).toContain("drop column if exists trip_id");
    expect(tripsDown).not.toMatch(/create (or replace )?function/i);
  });

  it("the v1 finance RPCs are never recreated or dropped (rollback-chain rule)", () => {
    for (const src of [...ALL_SQL, down(INVOICE_MIGRATION), down(TRIPS_MIGRATION)]) {
      for (const fn of [
        "create_finance_record_v1",
        "update_finance_record_v1",
        "set_finance_record_status_v1",
      ]) {
        expect(src).not.toMatch(
          new RegExp(
            `(create (or replace )?function[^(]*\\b${fn}\\b|drop function[^(]*\\b${fn}\\b)`,
            "i",
          ),
        );
      }
    }
  });
});

describe("2. the engines are CONSUMED, never forked", () => {
  it("no module defines an approval state machine, approver resolver or engine object", () => {
    for (const src of ALL_SQL) {
      // No engine table/function is created or dropped anywhere.
      expect(src).not.toMatch(
        /(create table[^(]*\bworkflow_|drop table[^;]*\bworkflow_)/i,
      );
      expect(src).not.toMatch(
        /create (or replace )?function[^(]*\b(start_workflow|decide_workflow|delegate_workflow|withdraw_workflow|cancel_workflow|publish_workflow|create_workflow|mark_overdue_workflow|workflow_resolve)/i,
      );
      // No trigger on an engine table (a module may trigger its OWN tables).
      expect(src).not.toMatch(/create\s+trigger[^;]*\bon\s+public\.workflow_/i);
      // No second document/file layer, no bucket of its own.
      expect(src).not.toMatch(
        /(create table[^(]*\b(document_files|org_documents)\b|insert into storage\.buckets)/i,
      );
    }
  });

  it("each module ASSERTS the engine exists rather than assuming it", () => {
    for (const src of ALL_SQL) {
      expect(src).toMatch(
        /to_regclass\('public\.workflow_instances'\) is null/,
      );
    }
    // The two document-linking migrations assert the document engine too.
    for (const src of [INVOICE_SQL, PROCUREMENT_SQL]) {
      expect(src).toMatch(/to_regclass\('public\.org_documents'\) is null/);
    }
  });

  it("every sync command only COPIES a terminal outcome — it can never decide", () => {
    const syncs: [string, string][] = [
      ["sync_finance_record_approval_v1", INVOICE_SQL],
      ["sync_procurement_approval_v1", PROCUREMENT_SQL],
      ["sync_business_trip_decision_v1", TRIPS_SQL],
    ];
    for (const [fn, src] of syncs) {
      const body = src.slice(
        src.indexOf(`create or replace function public.${fn}`),
      );
      const end = body.indexOf("revoke all on function");
      const fnBody = body.slice(0, end > 0 ? end : undefined);
      // It READS the engine and refuses to act while pending or absent.
      expect(fnBody, fn).toMatch(/from public\.workflow_instances/);
      expect(fnBody, fn).toContain("'still_pending'");
      expect(fnBody, fn).toContain("'no_instance'");
      // It never writes an engine row, and never decides one.
      expect(fnBody, fn).not.toMatch(
        /(insert into|update)\s+public\.workflow_/i,
      );
      expect(fnBody, fn).not.toContain("decide_workflow_step_v1");
    }
  });

  it("the engine contexts used are exactly the four already in the engine's closed vocabulary", () => {
    const engine = readFileSync(
      join(MIGRATIONS, "20260817130000_workflow_engine_v1.sql"),
      "utf8",
    );
    for (const ctx of ["expense", "invoice", "procurement", "business_trip"]) {
      expect(engine, `engine must already admit '${ctx}'`).toContain(`'${ctx}'`);
    }
    expect(INVOICE_SQL).toMatch(/context_entity_type = v_ctx/);
    expect(PROCUREMENT_SQL).toContain("i.context_entity_type = 'procurement'");
    expect(TRIPS_SQL).toContain("i.context_entity_type = 'business_trip'");
    // The mapping is ONE function app-side, not scattered literals.
    expect(financeApprovalContext("expense")).toBe("expense");
    expect(financeApprovalContext("invoice_issued")).toBe("invoice");
    expect(financeApprovalContext("invoice_received")).toBe("invoice");
  });

  it("the app layer starts instances through the ENGINE's own commands, with compensation", () => {
    for (const [name, src] of [
      ["finance", FINANCE_ACTIONS],
      ["procurement", PROC_ACTIONS],
      ["trips", TRIP_ACTIONS],
    ] as const) {
      expect(src, name).toMatch(/\.rpc\(\s*\n?\s*"start_workflow_instance_v1"/);
      // If the module-local flip fails after the instance started, the
      // instance is withdrawn again — no orphaned approval request.
      expect(src, name).toMatch(
        /\.rpc\(\s*\n?\s*"withdraw_workflow_instance_v1"/,
      );
      // Nothing decides on anyone's behalf.
      expect(src, name).not.toContain("decide_workflow_step_v1");
    }
  });
});

describe("3. writes are RPC-only and authority is re-checked server-side", () => {
  it("no .insert/.update/.delete/.upsert anywhere in the financial-ops layer", () => {
    for (const src of [...FINOPS_LAYER, FINANCE_ACTIONS, FINANCE_READS]) {
      const c = code(src);
      expect(c).not.toMatch(/\.insert\(/);
      expect(c).not.toMatch(/\.update\(/);
      expect(c).not.toMatch(/\.upsert\(/);
      // `.delete(` is pinned too — the readers deliberately use a Map+filter
      // instead of Set.delete so this assertion can stay absolute rather than
      // carrying a "but Sets are fine" exception a real DB write could hide in.
      expect(c).not.toMatch(/\.delete\(/);
    }
  });

  it("the migrations revoke direct DML and create no write policy", () => {
    expect(PROCUREMENT_SQL).toMatch(
      /revoke all on public\.procurement_inquiries[\s\S]*?from authenticated/,
    );
    expect(TRIPS_SQL).toMatch(
      /revoke all on public\.business_trips, public\.business_trip_events from authenticated/,
    );
    for (const src of [PROCUREMENT_SQL, TRIPS_SQL]) {
      expect(src).not.toMatch(/create policy[^;]*for (insert|update|delete)/i);
      expect(src).not.toMatch(/using \(true\)|with check \(true\)/i);
      expect(src).not.toMatch(/\bto anon\b/i);
    }
  });

  it("every gated command is SECURITY DEFINER with a pinned search_path, auth check and least-privilege grants", () => {
    const all: [string, string][] = [
      ...INVOICE_COMMANDS.map((f) => [f, INVOICE_SQL] as [string, string]),
      ...PROCUREMENT_COMMANDS.map(
        (f) => [f, PROCUREMENT_SQL] as [string, string],
      ),
      ...TRIP_COMMANDS.map((f) => [f, TRIPS_SQL] as [string, string]),
    ];
    for (const [fn, src] of all) {
      const at = src.indexOf(`create or replace function public.${fn}`);
      expect(at, `${fn} defined`).toBeGreaterThan(-1);
      const decl = src.slice(at, at + 4000);
      expect(decl, fn).toContain("security definer");
      expect(decl, fn).toContain("set search_path = public");
      expect(decl, fn).toMatch(/if uid is null then/);
      expect(decl, fn).toContain("errcode = '42501'");
      // Least privilege: revoked from public AND anon, granted only to
      // authenticated. Never anon, never public.
      expect(src, fn).toMatch(
        new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\) from public;`),
      );
      expect(src, fn).toMatch(
        new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\) from anon;`),
      );
      expect(src, fn).toMatch(
        new RegExp(
          `grant execute on function public\\.${fn}\\([^)]*\\) to authenticated;`,
        ),
      );
      expect(src, fn).not.toMatch(
        new RegExp(`grant execute on function public\\.${fn}\\([^)]*\\) to anon`),
      );
    }
  });

  it("unauthorized and missing answer the SAME outcome — no existence oracle", () => {
    // Every authority gate merges the two cases onto 'not_found'.
    for (const src of ALL_SQL) {
      expect(src).toMatch(/no oracle/);
    }
    expect(PROCUREMENT_SQL).toMatch(
      /if v_row\.id is null[\s\S]{0,400}?return 'not_found';/,
    );
    expect(TRIPS_SQL).toMatch(
      /if v_row\.id is null[\s\S]{0,400}?return 'not_found';/,
    );
  });

  it("decision authority is org managers only; requesting is open to any active member", () => {
    // Choosing an offer / ordering / closing / linking an invoice: managers.
    for (const fn of [
      "select_procurement_offer_v1",
      "set_procurement_finance_record_v1",
    ]) {
      const body = fnBody(PROCUREMENT_CODE, fn);
      expect(body, fn).not.toBe("");
      expect(body, fn).toContain("public.has_org_demand_access");
      // A plain requester may NOT decide: the requester predicate appears
      // NOWHERE in these two command bodies (the slice is cut at the
      // function's own revoke line, so it cannot bleed into the next one).
      expect(body, fn).not.toContain("requester_profile_id = uid");
    }
    // Filing an inquiry / a trip: any active member of EITHER membership
    // truth (a site worker asking for materials is not a manager).
    expect(PROCUREMENT_SQL).toMatch(
      /create or replace function public\.create_procurement_inquiry_v1[\s\S]*?public\.belongs_to_organization\(v_org\)/,
    );
    expect(TRIPS_SQL).toMatch(
      /create or replace function public\.create_business_trip_v1[\s\S]*?public\.belongs_to_organization\(v_org\)/,
    );
  });

  it("finance authority uses the org-aware helper, never the legacy owner check alone", () => {
    for (const src of [INVOICE_SQL, PROCUREMENT_SQL, TRIPS_SQL]) {
      if (!/finance_records/.test(src)) continue;
      expect(src).toContain("public.finance_company_authority_v1");
    }
    // The v2 commands must not regress to owns_company().
    expect(INVOICE_SQL).not.toMatch(/public\.owns_company\(/);
  });

  it("document links are authorization-gated through the document engine's own predicate", () => {
    for (const src of [INVOICE_SQL, PROCUREMENT_SQL]) {
      expect(src).toContain("public.can_read_org_document_v1");
    }
  });
});

describe("4. append-only history and immutability", () => {
  it("both event tables are trigger-immutable for EVERY role", () => {
    for (const [tbl, src] of [
      ["procurement_events", PROCUREMENT_SQL],
      ["business_trip_events", TRIPS_SQL],
    ] as const) {
      expect(src).toMatch(
        new RegExp(`create trigger ${tbl.replace(/s$/, "s")}_append_only`),
      );
      expect(src).toMatch(/before update or delete on public\.\w+_events/);
      expect(src).toContain("is append-only");
      expect(src, tbl).toContain("APPEND-ONLY");
    }
  });

  it("the trigger guards live on the modules' OWN tables, never on an engine table", () => {
    for (const src of [PROCUREMENT_SQL, TRIPS_SQL]) {
      const triggers = [...src.matchAll(/create trigger \w+\s+[\s\S]*?on (public\.\w+)/g)].map(
        (m) => m[1],
      );
      expect(triggers.length).toBeGreaterThan(0);
      for (const t of triggers) {
        expect(t).not.toMatch(/public\.workflow_/);
        expect(t).toMatch(/public\.(procurement|business_trip)/);
      }
    }
  });
});

describe("5. money is integer cents everywhere", () => {
  it("no parseFloat / toFixed / float rounding in the financial-ops layer", () => {
    for (const src of FINOPS_LAYER) {
      const c = code(src);
      expect(c).not.toMatch(/parseFloat/);
      expect(c).not.toMatch(/\.toFixed\(/);
    }
  });

  it("both TS layers reuse the ONE cents parser, never a second one", () => {
    for (const [name, src] of [
      ["procurement", PROC_ACTIONS],
      ["trips", TRIP_ACTIONS],
    ] as const) {
      expect(src, name).toMatch(
        /import \{ parseAmountInputToCents \} from "@\/lib\/finance\/finance-model"/,
      );
    }
  });

  it("every money column is a bounded bigint of cents; no numeric/float/money type", () => {
    for (const src of ALL_SQL) {
      const moneyCols = [
        ...src.matchAll(/\b(\w*(?:amount|budget)\w*_cents)\s+bigint/gi),
      ];
      expect(moneyCols.length).toBeGreaterThan(0);
      expect(src).not.toMatch(/\b(numeric|decimal|real|double precision|money)\b\s*(\(|,|\n)/i);
      // The RPC boundary accepts DIGIT STRINGS only — no float ever crosses.
      expect(src).toMatch(/!~ '\^\[0-9\]\{1,12\}\$'/);
    }
  });

  it("EUR only — no currency conversion, no second currency", () => {
    expect(PROCUREMENT_SQL).toMatch(/currency\s+char\(3\)[^,]*check \(currency in \('EUR'\)\)/);
    for (const src of FINOPS_LAYER) {
      expect(src).not.toMatch(/exchange\s*rate|convertCurrency|fx_rate/i);
    }
  });

  it("trip expense totals are DERIVED, never stored", () => {
    // No total column anywhere on business_trips.
    expect(TRIPS_SQL).not.toMatch(/total_(cents|amount)/i);
    // The read service sums the caller's own visible rows at read time.
    expect(FINANCE_READS).toMatch(/bucket\.totalCents \+= record\.amountCents/);
    expect(FINANCE_READS).toMatch(/status !== "cancelled"/);
  });
});

describe("6. duplicate detection is a WARNING, never a block", () => {
  it("the create command still inserts the row and returns a distinct outcome", () => {
    const at = INVOICE_SQL.indexOf(
      "create or replace function public.create_finance_record_v2",
    );
    const body = INVOICE_SQL.slice(at, INVOICE_SQL.indexOf("revoke all on function public.create_finance_record_v2"));
    // The duplicate probe sets a FLAG…
    expect(body).toMatch(/into v_dup;/);
    // …the INSERT happens unconditionally after it…
    const insertAt = body.indexOf("insert into public.finance_records");
    const dupAt = body.indexOf("into v_dup;");
    expect(insertAt).toBeGreaterThan(dupAt);
    // …and only the RETURN differs.
    expect(body).toContain("return 'created_possible_duplicate';");
    expect(body).toContain("return 'created';");
    // It must never refuse.
    expect(body).not.toMatch(/if v_dup then\s*return 'duplicate'/);
    expect(body).not.toMatch(/raise exception[^;]*duplicate/i);
    // No UNIQUE constraint on the invoice number — recurring monthly
    // invoices legitimately repeat numbers across periods.
    expect(INVOICE_SQL).not.toMatch(/unique[^;]*invoice_number/i);
  });

  it("the match is scoped: received invoices only, same counterparty, same scope, cancelled excluded", () => {
    const at = INVOICE_SQL.indexOf("if v_type = 'invoice_received' and v_inv_no is not null then");
    expect(at).toBeGreaterThan(-1);
    const probe = INVOICE_SQL.slice(at, at + 1200);
    expect(probe).toContain("lower(fr.invoice_number) = lower(v_inv_no)");
    expect(probe).toContain("lower(fr.counterparty_name) = lower(v_cp)");
    expect(probe).toContain("fr.status <> 'cancelled'");
    // Scope: same company link, or the caller's OWN unlinked records — never
    // another creator's private rows.
    expect(probe).toContain("fr.company_id = v_company");
    expect(probe).toContain("fr.created_by = uid");
  });

  it("the app layer surfaces the warning as its own honest notice", () => {
    expect(FINANCE_ACTIONS).toContain('"created_possible_duplicate"');
    expect(FINANCE_PAGE).toContain("created_possible_duplicate");
    const en = JSON.parse(read("messages/en.json")).finance;
    expect(en.notice.created_possible_duplicate).toMatch(/saved/i);
    expect(en.notice.created_possible_duplicate).toMatch(/already exists/i);
  });
});

describe("7. mirror columns are written ONLY by their own gated commands", () => {
  it("approval_status is never set by any other command or by the app", () => {
    // Procurement: only the two approval commands touch approval_status.
    const writers = [
      ...PROCUREMENT_SQL.matchAll(/set approval_status = ([^,\n]+)/g),
    ];
    expect(writers.length).toBeGreaterThan(0);
    for (const src of [PROC_READS, PROC_ACTIONS, PROC_SECTION]) {
      expect(src).not.toMatch(/approval_status:\s*["']/);
    }
    // Finance: same rule.
    expect(INVOICE_SQL).toMatch(/set approval_status = 'pending'/);
    expect(INVOICE_SQL).toMatch(/set approval_status = 'approved'/);
    expect(INVOICE_SQL).toMatch(/set approval_status = 'rejected'/);
    // The create/update v2 commands must NOT accept an approval status.
    expect(INVOICE_SQL).not.toMatch(/p_approval_status/);
  });

  it("finance_records.trip_id has exactly ONE writer", () => {
    const setters = [...TRIPS_SQL.matchAll(/set trip_id = /g)];
    expect(setters).toHaveLength(1);
    expect(TRIPS_SQL).toMatch(
      /create or replace function public\.set_finance_record_trip_v1[\s\S]*?set trip_id = v_trip/,
    );
  });

  it("a withdrawn/cancelled engine instance NEVER silently approves anything", () => {
    // finance: mirror clears; procurement: mirror clears; trips: back to draft.
    expect(INVOICE_SQL).toMatch(/set approval_status = null[\s\S]{0,200}?return 'cleared'/);
    expect(PROCUREMENT_SQL).toMatch(/set approval_status = null[\s\S]{0,300}?return 'cleared'/);
    expect(TRIPS_SQL).toMatch(
      /set status = 'draft', submitted_at = null[\s\S]{0,300}?return 'reopened'/,
    );
  });
});

describe("8. honest scope — no ERP, no OCR, no AI, no outbound", () => {
  it("no travel booking, per-diem law table, stock count or supplier registry", () => {
    for (const src of ALL_SQL_CODE) {
      expect(src).not.toMatch(
        /per_diem_rates?|statutory|booking_api|\bflights?\b|\bhotels?\b/i,
      );
      expect(src).not.toMatch(
        /create table[^(]*\b(suppliers|inventory|stock|ledger_entries|chart_of_accounts)\b/i,
      );
    }
    // The advance is documented as metadata only — this one DOES read the
    // header, because the promise itself is what is being pinned.
    expect(TRIPS_SQL).toContain("METADATA ONLY");
  });

  it("no payment provider anywhere in the layer", () => {
    for (const src of [...FINOPS_LAYER.map(code), ...ALL_SQL_CODE]) {
      // Word-bounded: "isTripEditable" contains the letters of "stripe" and
      // an unbounded pattern flagged it — a guard that cries wolf gets
      // weakened later, so it is made precise instead.
      expect(src).not.toMatch(/\b(stripe|mollie|paypal|adyen|braintree)\b/i);
      expect(src).not.toMatch(/checkout\.session|paymentIntent|setupIntent/i);
    }
  });

  it("no OCR / AI anywhere — manual entry is the only intake", () => {
    for (const src of [...FINOPS_LAYER.map(code), ...ALL_SQL_CODE]) {
      expect(src).not.toMatch(
        /\bocr\b|tesseract|textract|openai|anthropic|gpt-|\bllm\b/i,
      );
    }
    // …and the migrations SAY so in their headers (the promise is pinned
    // separately from the absence).
    expect(PROCUREMENT_SQL).toMatch(/NO AI/);
    expect(INVOICE_SQL).toMatch(/NO OCR, NO AI/);
  });

  it("no outbound transport — no supplier is contacted, nothing is ordered", () => {
    for (const src of FINOPS_LAYER) {
      expect(code(src)).not.toMatch(/\bfetch\s*\(/);
      expect(src).not.toMatch(
        /import[^;]*(nodemailer|twilio|sendgrid|mailgun|postmark|web-push|firebase|@sendgrid|telegram)/i,
      );
    }
    // The order reference is a bounded MANUAL note, not an integration.
    expect(PROCUREMENT_CODE).toMatch(
      /order_reference\s+text check \(order_reference is null\s*\n?\s*or char_length\(order_reference\) <= 120\)/,
    );
  });

  it("reads are RLS-scoped (server client, never the admin client) and bounded", () => {
    for (const [name, src, limit] of [
      ["procurement", PROC_READS, "PROCUREMENT_READ_LIMIT"],
      ["trips", TRIP_READS, "TRIP_READ_LIMIT"],
    ] as const) {
      expect(src, name).toMatch(/from "@\/lib\/supabase\/server"/);
      expect(src, name).not.toMatch(
        /supabase\/admin|createAdminClient|service_role/,
      );
      expect(src, name).toContain(limit);
    }
    expect(PROCUREMENT_READ_LIMIT).toBeLessThanOrEqual(500);
    expect(TRIP_READ_LIMIT).toBeLessThanOrEqual(500);
  });

  it("finance_records stays read by lib/finance/finance.ts alone", () => {
    for (const src of FINOPS_LAYER) {
      expect(src).not.toMatch(/\.from\("finance_records"\)/);
    }
    expect(FINANCE_READS).toMatch(/\.from\("finance_records"\)/);
  });
});

describe("9. pure model behaviour (single contract with the SQL)", () => {
  it("procurement status vocabulary is the honest one the CHECK admits", () => {
    expect([...PROCUREMENT_STATUSES]).toEqual([
      "draft",
      "submitted",
      "decided",
      "ordered",
      "closed",
      "cancelled",
    ]);
    expect(PROCUREMENT_SQL).toContain(
      "check (status in\n                             ('draft','submitted','decided','ordered','closed','cancelled'))",
    );
    expect(isProcurementEditable("draft")).toBe(true);
    expect(isProcurementEditable("submitted")).toBe(false);
    expect(isProcurementOfferable("draft")).toBe(true);
    expect(isProcurementOfferable("submitted")).toBe(true);
    expect(isProcurementOfferable("decided")).toBe(false);
    expect(PROCUREMENT_MAX_OFFERS).toBe(20);
    expect(PROCUREMENT_SQL).toContain(") >= 20 then");
  });

  it("trip status vocabulary and transitions match the SQL", () => {
    expect([...TRIP_STATUSES]).toEqual([
      "draft",
      "submitted",
      "approved",
      "rejected",
      "completed",
      "cancelled",
    ]);
    expect(isTripEditable("draft")).toBe(true);
    expect(isTripEditable("submitted")).toBe(false);
    expect(isTripCancellable("draft")).toBe(true);
    expect(isTripCancellable("submitted")).toBe(true);
    expect(isTripCancellable("approved")).toBe(true);
    expect(isTripCancellable("completed")).toBe(false);
    expect(isTripCancellable("cancelled")).toBe(false);
  });

  it("the trip span bound is the SAME rule the CHECK and the RPC enforce", () => {
    expect(TRIP_MAX_SPAN_DAYS).toBe(365);
    expect(TRIPS_SQL).toContain("date_to - date_from <= 365");
    expect(tripSpanDays("2026-08-01", "2026-08-01")).toBe(1);
    expect(tripSpanDays("2026-08-01", "2026-08-05")).toBe(5);
    // Reversed order is refused before a round trip.
    expect(tripSpanDays("2026-08-05", "2026-08-01")).toBe(null);
    expect(tripSpanDays("bad", "2026-08-01")).toBe(null);
    expect(tripSpanDays("2026-08-01", "2028-08-01")).toBe(null);
  });

  it("approval statuses are the same three everywhere, and null means never requested", () => {
    expect([...FINANCE_APPROVAL_STATUSES]).toEqual([
      "pending",
      "approved",
      "rejected",
    ]);
    expect([...PROCUREMENT_APPROVAL_STATUSES]).toEqual([
      "pending",
      "approved",
      "rejected",
    ]);
    expect(isValidFinanceApprovalStatus("pending")).toBe(true);
    expect(isValidFinanceApprovalStatus("withdrawn")).toBe(false);
    for (const src of [INVOICE_SQL, PROCUREMENT_SQL]) {
      expect(src).toMatch(
        /approval_status is null\s*\n?\s*or approval_status in \('pending','approved','rejected'\)/,
      );
    }
  });

  it("outcome→notice mapping never invents a success", () => {
    expect(procurementNoticeForOutcome("decided")).toBe("decided");
    expect(procurementNoticeForOutcome("offer_not_found")).toBe("not_found");
    expect(procurementNoticeForOutcome("not_submitted")).toBe("not_editable");
    expect(procurementNoticeForOutcome("something_new")).toBe("error");
    expect(tripNoticeForOutcome("approved")).toBe("approved");
    expect(tripNoticeForOutcome("not_approved")).toBe("not_editable");
    expect(tripNoticeForOutcome("invalid_dates")).toBe("invalid_dates");
    expect(tripNoticeForOutcome("whatever")).toBe("error");
  });

  it("all four missing-migration codes map to the honest not-enabled state", () => {
    for (const src of [PROC_MODEL, TRIP_MODEL]) {
      expect(src).toContain('"42P01"');
      expect(src).toContain('"42703"');
      expect(src).toContain('"42883"');
      expect(src).toContain('"PGRST202"');
    }
    for (const src of [PROC_READS, TRIP_READS]) {
      expect(src).toMatch(/"needs-migration"/);
    }
    for (const src of [PROC_ACTIONS, TRIP_ACTIONS]) {
      expect(src).toMatch(/needs_migration/);
    }
    expect(PROC_SECTION).toMatch(/procurement-needs-migration/);
    expect(TRIPS_SECTION).toMatch(/trips-needs-migration/);
  });
});

describe("10. UI — hosted on an existing declared surface, native-nav, honest", () => {
  it("no new route was added: both areas live on the finance page", () => {
    expect(
      existsSync(join(ROOT, "app", "[locale]", "dashboard", "procurement")),
      "procurement must NOT get its own route",
    ).toBe(false);
    expect(
      existsSync(join(ROOT, "app", "[locale]", "dashboard", "trips")),
      "trips must NOT get its own route",
    ).toBe(false);
    expect(existsSync(join(ROOT, PROC_SECTION_REL))).toBe(true);
    expect(existsSync(join(ROOT, TRIPS_SECTION_REL))).toBe(true);
    expect(FINANCE_PAGE).toContain("<ProcurementSection");
    expect(FINANCE_PAGE).toContain("<TripsSection");
    // Anchored sections (the #timesheets precedent).
    expect(PROC_SECTION).toMatch(/id="procurement"/);
    expect(TRIPS_SECTION).toMatch(/id="trips"/);
  });

  it("both sections are pure server components with native-nav forms", () => {
    for (const [name, src] of [
      ["procurement", PROC_SECTION],
      ["trips", TRIPS_SECTION],
    ] as const) {
      const c = code(src);
      expect(c, name).not.toMatch(/"use client"/);
      expect(c, name).not.toMatch(/useTransition|startTransition|useState/);
      expect(c, name).not.toMatch(/draggable|onDragStart|onDrop/);
      // Feedback is a role="status" banner after the redirect.
      expect(src, name).toMatch(/role="status"/);
    }
  });

  it("every form is bound to a real server action — no dead controls", () => {
    const procActions = [
      "createProcurementInquiryAction",
      "updateProcurementInquiryAction",
      "submitProcurementInquiryAction",
      "addProcurementOfferAction",
      "selectProcurementOfferAction",
      "setProcurementStatusAction",
      "setProcurementFinanceRecordAction",
      "submitProcurementApprovalAction",
      "syncProcurementApprovalAction",
    ];
    for (const a of procActions) {
      expect(PROC_ACTIONS, a).toContain(`export async function ${a}`);
      expect(PROC_SECTION, a).toContain(`action={${a}}`);
    }
    const tripActions = [
      "createTripAction",
      "updateTripAction",
      "submitTripAction",
      "syncTripDecisionAction",
      "completeTripAction",
      "cancelTripAction",
      "setFinanceRecordTripAction",
      "createStandardTripTemplateAction",
    ];
    for (const a of tripActions) {
      expect(TRIP_ACTIONS, a).toContain(`export async function ${a}`);
      expect(TRIPS_SECTION, a).toContain(`action={${a}}`);
    }
    for (const a of ["submitFinanceApprovalAction", "syncFinanceApprovalAction"]) {
      expect(FINANCE_ACTIONS, a).toContain(`export async function ${a}`);
      expect(FINANCE_PAGE, a).toContain(`action={${a}}`);
    }
  });

  it("submit is only offered where a PUBLISHED template exists — never a dead button", () => {
    // Trips: the submit control is gated on the template state, and the
    // no-template case offers the engine's own one-click standard template.
    expect(TRIPS_SECTION).toMatch(/template\?\.published/);
    expect(TRIPS_SECTION).toContain("createStandardTripTemplateAction");
    expect(TRIPS_SECTION).toContain('t("noTemplate")');
    // Every action stops honestly BEFORE any write when none exists.
    for (const src of [FINANCE_ACTIONS, PROC_ACTIONS, TRIP_ACTIONS]) {
      expect(src).toContain('"no_template"');
      expect(src).toContain('"no_approvers"');
    }
  });

  it("the page renders the new invoice facts only when they are REAL (no zero-filling)", () => {
    expect(FINANCE_PAGE).toMatch(/record\.invoiceNumber \?/);
    expect(FINANCE_PAGE).toMatch(/record\.vatAmountCents !== null \?/);
    expect(FINANCE_PAGE).toMatch(/record\.approvalStatus \?/);
    expect(FINANCE_PAGE).toMatch(/record\.orgDocumentId \?/);
    expect(FINANCE_PAGE).toMatch(/record\.tripId \?/);
  });
});

describe("11. copy exists in every locale and stays honest", () => {
  const resolve = (msgs: unknown, path: string): unknown =>
    path.split(".").reduce<unknown>(
      (node, k) =>
        node && typeof node === "object"
          ? (node as Record<string, unknown>)[k]
          : undefined,
      msgs,
    );

  const PROC_KEYS = [
    "procurement.title",
    "procurement.intro",
    "procurement.needsMigration",
    "procurement.readError",
    "procurement.empty",
    "procurement.noOffers",
    "procurement.offerSelected",
    "procurement.orderRefLabel",
    "procurement.invoiceLinked",
    "procurement.form.open",
    "procurement.form.orgLabel",
    "procurement.form.descriptionLabel",
    "procurement.form.descriptionPlaceholder",
    "procurement.form.quantityLabel",
    "procurement.form.quantityPlaceholder",
    "procurement.form.budgetLabel",
    "procurement.form.submit",
    "procurement.form.supplierLabel",
    "procurement.form.offerAmountLabel",
    "procurement.form.offerNoteLabel",
    "procurement.form.orderRefPlaceholder",
    "procurement.form.invoiceNone",
    "procurement.actions.selectOffer",
    "procurement.actions.addOffer",
    "procurement.actions.saveOffer",
    "procurement.actions.edit",
    "procurement.actions.save",
    "procurement.actions.submit",
    "procurement.actions.requestApproval",
    "procurement.actions.checkApproval",
    "procurement.actions.markOrdered",
    "procurement.actions.close",
    "procurement.actions.cancel",
    "procurement.actions.linkInvoice",
  ];

  const TRIP_KEYS = [
    "trips.title",
    "trips.intro",
    "trips.needsMigration",
    "trips.readError",
    "trips.empty",
    "trips.orgHeading",
    "trips.advanceLabel",
    "trips.expensesLabel",
    "trips.noTemplate",
    "trips.form.open",
    "trips.form.orgLabel",
    "trips.form.destinationLabel",
    "trips.form.destinationPlaceholder",
    "trips.form.fromLabel",
    "trips.form.toLabel",
    "trips.form.purposeLabel",
    "trips.form.purposePlaceholder",
    "trips.form.advanceLabel",
    "trips.form.advanceHint",
    "trips.form.submit",
    "trips.form.recordPick",
    "trips.actions.edit",
    "trips.actions.save",
    "trips.actions.submit",
    "trips.actions.checkDecision",
    "trips.actions.complete",
    "trips.actions.cancel",
    "trips.actions.linkExpense",
    "trips.actions.unlink",
    "trips.actions.createTemplate",
  ];

  const PROC_NOTICES = [
    "created",
    "updated",
    "submitted",
    "offer_added",
    "decided",
    "linked",
    "unlinked",
    "cancelled",
    "invalid",
    "needs_migration",
    "not_authorized",
    "not_found",
    "not_editable",
    "limit_reached",
    "approval_submitted",
    "approval_approved",
    "approval_rejected",
    "approval_pending",
    "approval_cleared",
    "approval_none",
    "no_template",
    "no_approvers",
    "error",
  ];

  const TRIP_NOTICES = [
    "created",
    "updated",
    "submitted",
    "approved",
    "rejected",
    "reopened",
    "completed",
    "cancelled",
    "linked",
    "unlinked",
    "invalid",
    "invalid_dates",
    "needs_migration",
    "not_authorized",
    "not_found",
    "not_editable",
    "limit_reached",
    "still_pending",
    "no_instance",
    "no_template",
    "no_approvers",
    "template_created",
    "error",
  ];

  // Structural parity is required in ALL 11 catalogs (the locale set is
  // binding); non-active locales may still carry translation debt, which
  // check:i18n-debt ratchets separately.
  for (const loc of locales) {
    it(`${loc}: the full procurement + trips catalogue resolves`, () => {
      const msgs = JSON.parse(read(`messages/${loc}.json`)) as unknown;
      const keys = [
        ...PROC_KEYS,
        ...TRIP_KEYS,
        ...PROCUREMENT_STATUSES.map((s) => `procurement.status.${s}`),
        ...PROCUREMENT_APPROVAL_STATUSES.map(
          (s) => `procurement.approval.${s}`,
        ),
        ...TRIP_STATUSES.map((s) => `trips.status.${s}`),
        ...PROC_NOTICES.map((n) => `procurement.notice.${n}`),
        ...TRIP_NOTICES.map((n) => `trips.notice.${n}`),
      ];
      for (const key of keys) {
        const v = resolve(msgs, key);
        expect(
          typeof v === "string" && v.trim().length > 0,
          `${loc}: ${key}`,
        ).toBe(true);
      }
    });
  }

  it("the ACTIVE locales carry real translations, not [EN] debt markers", () => {
    for (const loc of activeLocales) {
      const msgs = JSON.parse(read(`messages/${loc}.json`)) as Record<
        string,
        unknown
      >;
      for (const ns of ["procurement", "trips"]) {
        expect(
          JSON.stringify(msgs[ns]),
          `${loc}.${ns} must not carry [EN] debt`,
        ).not.toContain("[EN]");
      }
    }
  });

  it("copy claims nothing the code does not do", () => {
    const en = JSON.parse(read("messages/en.json"));
    // Procurement contacts nobody and orders nothing.
    expect(en.procurement.intro).toMatch(/contacts a supplier|orders anything/i);
    const proc = JSON.stringify(en.procurement).toLowerCase();
    expect(proc).not.toMatch(
      /order (was )?(sent|placed) to|supplier notified|email sent|we ordered/,
    );
    // Trips book nothing and pay nobody; the advance is a note.
    expect(en.trips.intro).toMatch(/books travel|pays money out/i);
    expect(en.trips.form.advanceHint).toMatch(/no money is moved/i);
    const trips = JSON.stringify(en.trips).toLowerCase();
    expect(trips).not.toMatch(
      /flight booked|hotel booked|advance paid|money sent|reimbursed automatically/,
    );
    // Neither claims accounting/tax/bookkeeping capability.
    for (const blob of [proc, trips]) {
      expect(blob).not.toMatch(/bookkeeping|tax return|accounting system|vat filing/);
    }
  });
});
