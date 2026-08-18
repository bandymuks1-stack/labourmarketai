import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import {
  getDashboardModule,
  getModuleRoute,
} from "@/lib/dashboard/dashboard-module-registry";
import { COMMAND_REGISTRY } from "@/lib/navigation/command-registry";
import { SPINE_SIGNALS } from "@/lib/notifications/spine-signals";
import {
  FINANCE_APPROVAL_STATUSES,
  FINANCE_CREATE_STATUSES,
  FINANCE_CSV_HEADER,
  FINANCE_MAX_AMOUNT_CENTS,
  FINANCE_READ_LIMIT,
  FINANCE_RECORD_STATUSES,
  FINANCE_RECORD_TYPES,
  MIGRATION_MISSING_ERROR_CODES,
  UNPAID_FINANCE_STATUSES,
  buildFinanceCsv,
  buildFinanceCsvRow,
  deriveFinanceSummary,
  financeApprovalContext,
  formatCentsAsEur,
  isOverdueRecord,
  parseAmountInputToCents,
  type FinanceRecord,
} from "@/lib/finance/finance-model";
import { PRIMARY_ROUTES } from "./primary-route-smoke";
import { activeLocales } from "@/lib/i18n/config";

/**
 * OPERATIONAL FINANCE guards (control room PR I, capability gap map §9).
 *
 * This PR ships the complete REPO-SAFE layer over the `finance_records`
 * contract a SEPARATE, human-gated migration PR (I2) will propose. These
 * pins keep the layer honest:
 *
 *   - NO MIGRATION IN THIS PR: no repo migration defines finance_records or
 *     the three RPC names yet — I2 gets clean names to claim.
 *   - RPC-ONLY writes app-side: the ONLY write paths are
 *     create_finance_record_v1 / update_finance_record_v1 /
 *     set_finance_record_status_v1; no .insert/.update/.delete/.upsert
 *     anywhere in the finance layer, and no other module touches
 *     finance_records at all.
 *   - HONEST lifecycle: exactly draft/issued/partially_paid/paid/cancelled.
 *     'overdue' is NEVER stored — it is derived from due_date + an unpaid
 *     status, so it self-clears and needs no cron.
 *   - CENTS-ONLY MATH: every amount is integer cents; no parseFloat, no
 *     toFixed, no float rounding anywhere in the finance layer.
 *   - NO PAYMENT PROVIDER: this layer records, it never moves money — no
 *     stripe/mollie/paypal import, no outbound call of any kind.
 *   - HONEST degradation: missing-relation/RPC codes (42P01/42703/42883/
 *     PGRST202) map to the calm "needs-migration" state — never a crash,
 *     never fake rows, never fake sums.
 *   - HONEST copy: the page carries the prominent manual-records-only scope
 *     note (no bookkeeping / tax / payroll / bank sync / payment claims).
 *   - Registered everywhere a module must be: module registry, command
 *     registry, primary-route smoke, route truth map, i18n in every ACTIVE
 *     locale. Deliberately NO spine signal yet (recorded follow-up: a
 *     finance-overdue signal joins the spine only after I2 is applied).
 */

const ROOT = join(__dirname, "..", "..");
const REPO = join(ROOT, "..", "..");
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");

const MODEL = read("lib/finance/finance-model.ts");
const READS = read("lib/finance/finance.ts");
const ACTIONS = read("lib/finance/finance-actions.ts");
const PAGE_REL = "app/[locale]/dashboard/finance/page.tsx";
const PAGE = read(PAGE_REL);
const EXPORT_REL = "app/[locale]/dashboard/finance/export/route.ts";
const EXPORT_ROUTE = read(EXPORT_REL);

const FINANCE_LAYER = [MODEL, READS, ACTIONS, PAGE, EXPORT_ROUTE];

const RPC_NAMES = [
  "create_finance_record_v1",
  "update_finance_record_v1",
  "set_finance_record_status_v1",
] as const;

/**
 * Every RPC name the finance ACTIONS layer may call after financial-ops
 * train J. Three groups, all gated, none of them a direct table write:
 *   - the v1 status command (unchanged);
 *   - the v2 create/update commands (invoice number, VAT, receipt document
 *     link, duplicate warning) — v1 stays defined and untouched in the DB;
 *   - the approval SEAM: the module's own mirror commands plus the ENGINE's
 *     own start/withdraw commands (the engine is consumed, never forked —
 *     cross-pinned in lib/guards/workflow-engine.test.ts).
 */
const ACTION_RPC_NAMES = [
  "create_finance_record_v2",
  "update_finance_record_v2",
  "set_finance_record_status_v1",
  "submit_finance_record_approval_v1",
  "sync_finance_record_approval_v1",
  "start_workflow_instance_v1",
  "withdraw_workflow_instance_v1",
] as const;

/** Walk a source dir collecting ts/tsx files (skips tests). */
function walkSource(absDir: string, acc: string[] = []): string[] {
  if (!existsSync(absDir)) return acc;
  for (const entry of readdirSync(absDir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".next") continue;
    const p = join(absDir, entry.name);
    if (entry.isDirectory()) walkSource(p, acc);
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      acc.push(p);
    }
  }
  return acc;
}

describe("1. exactly one migration owns finance_records — the human-gated I2 pair", () => {
  // I1 shipped the consumer layer with NO migration; I2 added the single
  // human-gated draft (20260711230000_finance_records_v1.sql) plus its
  // rollback sibling. Nothing else in the repo may (re)define the table or
  // the RPCs.
  const I2 = "20260711230000_finance_records_v1";
  // Security train A (2026-08-17): 20260817123000_finance_org_authority_v1
  // legitimately re-issues fr_select + the three RPC bodies to extend the
  // company-link authority from legacy owns_company to org owner/admin via
  // membership_actor_role_v1. It is the ONLY other file allowed to name
  // them; its own invariants are pinned in security-train-a-v1.test.ts.
  const ORG_AUTHORITY = "20260817123000_finance_org_authority_v1";
  // Financial ops (train J, 2026-08-17) EXTENDS finance_records additively:
  // the invoice-upgrades pair adds four nullable columns + _v2 create/update
  // commands + the engine approval mirror; the business-trips pair adds the
  // nullable trip_id column + its single gated writer; the procurement pair
  // holds an FK to a finance record and re-checks finance authority when
  // linking. NONE of them recreates the three v1 RPCs (asserted below) —
  // a changed contract is a NEW _v2 name, the rollback-chain rule.
  const TRAIN_J = [
    "20260817220000_finance_invoice_upgrades_v1",
    "20260817221000_procurement_v1",
    "20260817222000_business_trips_v1",
  ];

  it("only the I2 pair, the org-authority fix and the train-J extensions mention finance_records — and none of them recreates a v1 RPC", () => {
    for (const dir of ["migrations", "rollbacks"]) {
      const abs = join(REPO, "supabase", dir);
      if (!existsSync(abs)) continue;
      for (const f of readdirSync(abs).filter((f) => f.endsWith(".sql"))) {
        if (f.startsWith(I2) || f.startsWith(ORG_AUTHORITY)) continue;
        const src = readFileSync(join(abs, f), "utf8");
        if (TRAIN_J.some((p) => f.startsWith(p))) {
          // An EXTENSION may name the table (alter/insert/select) but must
          // never create or drop it, and must never (re)define a v1 RPC.
          expect(
            src,
            `${dir}/${f} may extend but never create/drop finance_records`,
          ).not.toMatch(
            /(create table[^(]*\bfinance_records\b|drop table[^;]*\bfinance_records\b)/i,
          );
          for (const fn of RPC_NAMES) {
            expect(
              src,
              `${dir}/${f} must not (re)define the v1 RPC ${fn}`,
            ).not.toMatch(
              new RegExp(
                `(create (or replace )?function[^(]*\\b${fn}\\b|drop function[^(]*\\b${fn}\\b)`,
                "i",
              ),
            );
          }
          continue;
        }
        expect(src, `${dir}/${f} must not define finance_records`).not.toMatch(
          /\bfinance_records\b/,
        );
        for (const fn of RPC_NAMES) {
          expect(src, `${dir}/${f} must not define ${fn}`).not.toContain(fn);
        }
      }
    }
  });

  it("the I2 pair exists, stays human-gated, and defines the exact contract", () => {
    const up = readFileSync(
      join(REPO, "supabase", "migrations", `${I2}.sql`),
      "utf8",
    );
    const down = readFileSync(
      join(REPO, "supabase", "rollbacks", `${I2}.down.sql`),
      "utf8",
    );
    expect(up).toContain("needs-human-gate");
    expect(up).toContain("@human-gate-approved");
    expect(up).toMatch(/create table if not exists public\.finance_records/);
    for (const fn of RPC_NAMES) {
      expect(up).toContain(`create or replace function public.${fn}`);
      expect(down).toContain(`drop function if exists public.${fn}`);
    }
    expect(down).toMatch(/drop table if exists public\.finance_records/);
    expect(up).toMatch(
      /revoke insert, update, delete on public\.finance_records from authenticated/,
    );
    // The five honest stored statuses — 'overdue' is DERIVED app-side and
    // must never become a stored state.
    expect(up).toContain(
      "check (status in ('draft','issued','partially_paid','paid','cancelled'))",
    );
    expect(up).not.toMatch(/'overdue'/);
  });
});

describe("2. writes are RPC-only, and only the finance read service touches finance_records", () => {
  it("the actions call exactly the gated commands — module RPCs plus the engine's own", () => {
    const rpcCalls = [
      ...ACTIONS.matchAll(/\.rpc\(\s*\n?\s*"([a-z0-9_]+)"/g),
    ].map((m) => m[1]);
    expect(new Set(rpcCalls)).toEqual(new Set(ACTION_RPC_NAMES));
    // The v1 create/update commands are NOT called any more (v2 supersedes
    // them app-side) but they stay DEFINED in the database — the rollback
    // chain never recreates or drops a shipped contract.
    expect(ACTIONS).not.toMatch(/\.rpc\(\s*\n?\s*"create_finance_record_v1"/);
    expect(ACTIONS).not.toMatch(/\.rpc\(\s*\n?\s*"update_finance_record_v1"/);
  });

  it("no .insert/.update/.delete/.upsert anywhere in the finance layer", () => {
    for (const src of FINANCE_LAYER) {
      expect(src).not.toMatch(/\.insert\(/);
      expect(src).not.toMatch(/\.update\(/);
      expect(src).not.toMatch(/\.delete\(/);
      expect(src).not.toMatch(/\.upsert\(/);
    }
  });

  it("finance_records is read ONLY by lib/finance/finance.ts across the whole app", () => {
    const files = [
      ...walkSource(join(ROOT, "app")),
      ...walkSource(join(ROOT, "components")),
      ...walkSource(join(ROOT, "lib")),
    ];
    const offenders: string[] = [];
    for (const abs of files) {
      const src = readFileSync(abs, "utf8");
      if (/\.from\("finance_records"\)/.test(src)) offenders.push(abs);
    }
    expect(offenders.map((p) => p.split("\\").join("/"))).toEqual(
      expect.arrayContaining([
        expect.stringContaining("lib/finance/finance.ts"),
      ]),
    );
    expect(offenders).toHaveLength(1);
  });

  it("reads are bounded and RLS-scoped (server client, never the admin client)", () => {
    expect(READS).toMatch(/from "@\/lib\/supabase\/server"/);
    expect(READS).not.toMatch(/supabase\/admin|createAdminClient|service_role/);
    expect(READS).toMatch(/\.limit\(FINANCE_READ_LIMIT\)/);
    expect(FINANCE_READ_LIMIT).toBeLessThanOrEqual(500);
    // Deterministic order: due date first (nulls last), then created.
    expect(READS).toMatch(
      /\.order\("due_date", \{ ascending: true, nullsFirst: false \}\)/,
    );
    expect(READS).toMatch(/\.order\("created_at", \{ ascending: false \}\)/);
    // The CSV export reuses the SAME read service — no second query path.
    expect(EXPORT_ROUTE).toMatch(
      /import \{ listMyFinanceRecords \} from "@\/lib\/finance\/finance"/,
    );
    expect(EXPORT_ROUTE).not.toMatch(/\.from\(/);
  });
});

describe("3. honest lifecycle — overdue is DERIVED, never stored", () => {
  it("status and type enums are pinned; 'overdue' is not a stored status", () => {
    expect([...FINANCE_RECORD_STATUSES]).toEqual([
      "draft",
      "issued",
      "partially_paid",
      "paid",
      "cancelled",
    ]);
    expect([...UNPAID_FINANCE_STATUSES]).toEqual([
      "draft",
      "issued",
      "partially_paid",
    ]);
    expect([...FINANCE_RECORD_TYPES]).toEqual([
      "invoice_issued",
      "invoice_received",
      "expense",
    ]);
    expect(FINANCE_RECORD_STATUSES).not.toContain("overdue");
    expect([...FINANCE_CREATE_STATUSES]).toEqual(["draft", "issued", "paid"]);
  });

  it("overdue derivation is pure and honest: unpaid + due day passed", () => {
    const now = new Date("2026-07-11T10:00:00Z");
    expect(isOverdueRecord({ status: "issued", dueDate: "2026-07-10" }, now)).toBe(
      true,
    );
    // Due today is NOT overdue yet.
    expect(isOverdueRecord({ status: "issued", dueDate: "2026-07-11" }, now)).toBe(
      false,
    );
    expect(isOverdueRecord({ status: "draft", dueDate: null }, now)).toBe(false);
    // Paid and cancelled records are never overdue — the flag self-clears.
    expect(isOverdueRecord({ status: "paid", dueDate: "2020-01-01" }, now)).toBe(
      false,
    );
    expect(
      isOverdueRecord({ status: "cancelled", dueDate: "2020-01-01" }, now),
    ).toBe(false);
  });
});

describe("4. cents-only math — no floats, no parseFloat, no toFixed", () => {
  it("amount parsing is pure integer math with a two-decimal bound", () => {
    expect(parseAmountInputToCents("123.45")).toBe(12345);
    expect(parseAmountInputToCents("123,45")).toBe(12345);
    expect(parseAmountInputToCents("123,4")).toBe(12340);
    expect(parseAmountInputToCents("0")).toBe(0);
    expect(parseAmountInputToCents("0.5")).toBe(50);
    expect(parseAmountInputToCents(" 7 ")).toBe(700);
    // The classic float trap: 0.29 must be EXACTLY 29 cents.
    expect(parseAmountInputToCents("0.29")).toBe(29);
    expect(parseAmountInputToCents("1000000000.00")).toBe(
      FINANCE_MAX_AMOUNT_CENTS,
    );
    // Rejected: over-bound, >2 decimals, negatives, exponents, garbage.
    expect(parseAmountInputToCents("1000000000.01")).toBe(null);
    expect(parseAmountInputToCents("1.234")).toBe(null);
    expect(parseAmountInputToCents("-5")).toBe(null);
    expect(parseAmountInputToCents("1e3")).toBe(null);
    expect(parseAmountInputToCents("12 345")).toBe(null);
    expect(parseAmountInputToCents("")).toBe(null);
  });

  it("cents formatting is exact (modulo split, no division rounding)", () => {
    expect(formatCentsAsEur(12345)).toBe("123.45");
    expect(formatCentsAsEur(5)).toBe("0.05");
    expect(formatCentsAsEur(0)).toBe("0.00");
    expect(formatCentsAsEur(FINANCE_MAX_AMOUNT_CENTS)).toBe("1000000000.00");
  });

  it("no parseFloat / toFixed / Number float parsing on amounts in the finance layer", () => {
    for (const src of FINANCE_LAYER) {
      // Comments may legitimately SAY "no parseFloat" — strip them first;
      // what is pinned is the CODE.
      const code = src
        .replace(/\/\*[\s\S]*?\*\//g, " ")
        .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
      expect(code).not.toMatch(/parseFloat/);
      expect(code).not.toMatch(/\.toFixed\(/);
    }
  });

  it("summary totals are REAL cent sums (cancelled excluded from type totals)", () => {
    const now = new Date("2026-07-11T10:00:00Z");
    const summary = deriveFinanceSummary(
      [
        // overdue issued invoice, project-linked
        {
          recordType: "invoice_issued",
          status: "issued",
          amountCents: 10000,
          dueDate: "2026-07-01",
          projectId: "p1",
        },
        // paid issued invoice, same project
        {
          recordType: "invoice_issued",
          status: "paid",
          amountCents: 5000,
          dueDate: null,
          projectId: "p1",
        },
        // received invoice, not yet due
        {
          recordType: "invoice_received",
          status: "issued",
          amountCents: 2000,
          dueDate: "2026-08-01",
          projectId: null,
        },
        // overdue draft expense
        {
          recordType: "expense",
          status: "draft",
          amountCents: 300,
          dueDate: "2026-07-01",
          projectId: null,
        },
        // cancelled expense — excluded from type totals, never overdue
        {
          recordType: "expense",
          status: "cancelled",
          amountCents: 99999,
          dueDate: "2026-07-01",
          projectId: "p1",
        },
      ],
      now,
    );
    expect(summary.totalCount).toBe(5);
    expect(summary.issuedInvoiceCents).toBe(15000);
    expect(summary.receivedInvoiceCents).toBe(2000);
    expect(summary.expenseCents).toBe(300);
    expect(summary.paidCents).toBe(5000);
    expect(summary.overdueCents).toBe(10300);
    expect(summary.overdueCount).toBe(2);
    expect(summary.byStatus.issued).toEqual({ count: 2, amountCents: 12000 });
    expect(summary.byStatus.cancelled).toEqual({
      count: 1,
      amountCents: 99999,
    });
    expect(summary.byProject).toEqual([
      { projectId: "p1", count: 2, amountCents: 15000 },
    ]);
  });

  it("the CSV export derives the same overdue flag and never invents a row", () => {
    const now = new Date("2026-07-11T10:00:00Z");
    const record: FinanceRecord = {
      id: "r1",
      recordType: "invoice_issued",
      title: "Scaffolding, June",
      counterpartyName: "ACME",
      amountCents: 12345,
      currency: "EUR",
      status: "issued",
      dueDate: "2026-07-01",
      paidAt: null,
      projectId: null,
      companyId: null,
      note: null,
      invoiceNumber: null,
      vatAmountCents: null,
      orgDocumentId: null,
      approvalStatus: null,
      tripId: null,
      createdBy: "u1",
      createdAt: "2026-06-01T00:00:00Z",
    };
    const csv = buildFinanceCsv([record], now);
    const lines = csv.trimEnd().split("\r\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("record_type");
    expect(lines[1]).toContain("yes"); // derived overdue
    expect(lines[1]).toContain("123.45");
    expect(lines[1]).toContain('"Scaffolding, June"'); // comma escaped
    // Empty input → header only, nothing invented.
    expect(buildFinanceCsv([], now).trimEnd().split("\r\n")).toHaveLength(1);
  });

  it("the export carries the train-J columns HONESTLY (absent stays empty, the document column is an indicator)", () => {
    const now = new Date("2026-07-11T10:00:00Z");
    const base: FinanceRecord = {
      id: "r2",
      recordType: "invoice_received",
      title: "Cement delivery",
      counterpartyName: "Baltic Build",
      amountCents: 100_00,
      currency: "EUR",
      status: "issued",
      dueDate: null,
      paidAt: null,
      projectId: null,
      companyId: null,
      note: null,
      invoiceNumber: "INV-2026-014",
      vatAmountCents: 21_00,
      // The FILE is never exported — only the fact that one is registered
      // behind the document engine.
      orgDocumentId: "11111111-1111-4111-8111-111111111111",
      approvalStatus: "approved",
      tripId: null,
      createdBy: "u1",
      createdAt: "2026-06-01T00:00:00Z",
    };
    expect([...FINANCE_CSV_HEADER]).toEqual([
      "record_type",
      "status",
      "overdue",
      "title",
      "counterparty",
      "amount_eur",
      "currency",
      "invoice_number",
      "vat_eur",
      "approval_status",
      "has_document",
      "trip_id",
      "due_date",
      "paid_at",
      "project_id",
      "company_id",
      "note",
      "created_at",
    ]);
    const row = buildFinanceCsvRow(base, now);
    expect(row).toHaveLength(FINANCE_CSV_HEADER.length);
    expect(row[7]).toBe("INV-2026-014");
    expect(row[8]).toBe("21.00"); // cents → exact EUR, no float math
    expect(row[9]).toBe("approved");
    expect(row[10]).toBe("yes"); // indicator only — never a URL or a file
    expect(row[11]).toBe("");
    // Absent optional facts stay EMPTY — never a zero, never a "no".
    const bare = buildFinanceCsvRow(
      {
        ...base,
        invoiceNumber: null,
        vatAmountCents: null,
        orgDocumentId: null,
        approvalStatus: null,
      },
      now,
    );
    expect(bare[7]).toBe("");
    expect(bare[8]).toBe("");
    expect(bare[9]).toBe("");
    expect(bare[10]).toBe("");
    // The export never leaks a document path/URL, only the indicator.
    expect(buildFinanceCsv([base], now)).not.toMatch(/document-files|https?:/);
  });
});

describe("5. honest degradation while the I2 migration is unapplied", () => {
  it("all four missing-migration codes are handled in one shared place", () => {
    expect([...MIGRATION_MISSING_ERROR_CODES]).toEqual([
      "42P01",
      "42703",
      "42883",
      "PGRST202",
    ]);
    expect(READS).toMatch(/isMigrationMissingCode/);
    expect(READS).toMatch(/"needs-migration"/);
    expect(ACTIONS).toMatch(/isMigrationMissingCode/);
    expect(ACTIONS).toMatch(/needs_migration/);
  });

  it("the page renders the calm not-available state (no fake UI, no fake sums)", () => {
    expect(PAGE).toMatch(/"needs-migration"/);
    expect(PAGE).toMatch(/finance-unavailable/);
    expect(PAGE).toMatch(/t\("unavailable"\)/);
  });

  it("the CSV export answers 503 honestly instead of fabricating a file", () => {
    expect(EXPORT_ROUTE).toMatch(/"needs-migration"/);
    expect(EXPORT_ROUTE).toMatch(/status: 503/);
    expect(EXPORT_ROUTE).toMatch(/status: 401/);
  });
});

describe("6. no payment provider, no outbound — records only, money never moves", () => {
  it("no payment-provider import or reference in the finance layer", () => {
    for (const src of FINANCE_LAYER) {
      // The repo has TEST-mode Stripe plumbing elsewhere — the finance layer
      // must never touch it (or any other payment provider) at all.
      expect(src).not.toMatch(/stripe|mollie|paypal|adyen|braintree/i);
      expect(src).not.toMatch(/checkout\.session|paymentIntent|setupIntent/i);
    }
  });

  it("no outbound call and no transport-provider import in the finance layer", () => {
    for (const src of FINANCE_LAYER) {
      expect(src).not.toMatch(/\bfetch\s*\(/);
      expect(src).not.toMatch(
        /import[^;]*(nodemailer|twilio|sendgrid|mailgun|postmark|web-push|firebase|@sendgrid|telegram)/i,
      );
    }
  });
});

describe("7. registered everywhere a module must be", () => {
  it("module registry: finance → /dashboard/finance, grid+command, org-first roles + worker, coins icon", () => {
    const m = getDashboardModule("finance");
    expect(getModuleRoute("finance")).toBe("/dashboard/finance");
    expect(m.surfaces).toContain("grid");
    expect(m.surfaces).toContain("command");
    // Never a nav tab — the primary nav stays catalogue-derived.
    expect(m.surfaces).not.toContain("nav");
    // Role decision (PR I): org roles + workers (expenses); customers have
    // no operational-finance need.
    expect([...m.roles].sort()).toEqual(["agency", "company", "worker"]);
    expect(m.iconKey).toBe("coins");
  });

  it("deliberately NO spine signal in this PR (recorded follow-up after I2 applies)", () => {
    const m = getDashboardModule("finance");
    expect(m.attentionSignalIds).toBeUndefined();
    expect(SPINE_SIGNALS.some((s) => s.id.includes("finance"))).toBe(false);
  });

  it("primary-route smoke inventory carries /dashboard/finance", () => {
    const entry = PRIMARY_ROUTES.find(
      (r) => r.urlPattern === "/dashboard/finance",
    );
    expect(entry).toBeTruthy();
    expect(entry!.sourceFile).toBe(PAGE_REL);
    expect(entry!.requiresAuth).toBe(true);
    expect(existsSync(join(ROOT, PAGE_REL))).toBe(true);
    expect(existsSync(join(ROOT, EXPORT_REL))).toBe(true);
  });

  it("command registry: the finance entry resolves through getModuleRoute with 5-locale copy", () => {
    const entry = COMMAND_REGISTRY.find((e) => e.id === "finance");
    expect(entry).toBeTruthy();
    expect(entry!.route).toBe(getModuleRoute("finance"));
    expect(entry!.audience).toBe("public");
    for (const loc of activeLocales) {
      expect(entry!.labels[loc]?.trim().length, `label ${loc}`).toBeGreaterThan(
        0,
      );
      expect(
        entry!.synonyms[loc]?.length,
        `synonyms ${loc}`,
      ).toBeGreaterThan(0);
    }
  });
});

describe("8. accessible controls — real actions, native navigation", () => {
  it("status transitions, create and edit are NATIVE-NAV server-action forms", () => {
    expect(PAGE).toMatch(/action=\{setFinanceRecordStatusAction\}/);
    expect(PAGE).toMatch(/action=\{createFinanceRecordAction\}/);
    expect(PAGE).toMatch(/action=\{updateFinanceRecordAction\}/);
    const code = PAGE.replace(/\/\*[\s\S]*?\*\//g, " ").replace(
      /(^|[^:])\/\/[^\n]*/g,
      "$1",
    );
    expect(code).not.toMatch(/"use client"/);
    expect(code).not.toMatch(/useTransition|startTransition/);
    expect(code).not.toMatch(/draggable|onDragStart|onDrop/);
  });

  it("the CSV export is a plain anchor to the RLS-scoped route handler", () => {
    expect(PAGE).toMatch(/dashboard\/finance\/export/);
    expect(PAGE).toMatch(/finance-export-csv/);
  });

  it("no new money/invoice dependency entered the app for this slice", () => {
    // (The pre-existing TEST-mode `stripe` dependency belongs to the gated
    // billing plumbing, not this layer — section 6 pins that the finance
    // layer never imports it.)
    const pkg = read("package.json");
    expect(pkg).not.toMatch(/dinero|accounting|invoice|currency\.js/i);
  });
});

describe("9. copy resolves in every ACTIVE locale (frozen-subset convention)", () => {
  const resolve = (msgs: unknown, path: string): unknown =>
    path.split(".").reduce<unknown>(
      (node, k) =>
        node && typeof node === "object"
          ? (node as Record<string, unknown>)[k]
          : undefined,
      msgs,
    );

  const STATIC_KEYS = [
    "finance.eyebrow",
    "finance.title",
    "finance.intro",
    "finance.scopeNote",
    "finance.notAuthed",
    "finance.unavailable",
    "finance.loadError",
    "finance.empty",
    "finance.emptyFiltered",
    "finance.exportCsv",
    "finance.exportNote",
    "finance.dueLabel",
    "finance.paidLabel",
    "finance.projectLinked",
    "finance.companyLinked",
    "finance.flags.overdue",
    "finance.summary.issued",
    "finance.summary.received",
    "finance.summary.expenses",
    "finance.summary.paid",
    "finance.summary.overdue",
    "finance.filters.label",
    "finance.filters.statusLabel",
    "finance.filters.allTypes",
    "finance.filters.allStatuses",
    "finance.filters.overdue",
    "finance.form.title",
    "finance.form.typeLabel",
    "finance.form.statusLabel",
    "finance.form.titleLabel",
    "finance.form.titlePlaceholder",
    "finance.form.counterpartyLabel",
    "finance.form.counterpartyPlaceholder",
    "finance.form.amountLabel",
    "finance.form.amountHint",
    "finance.form.dueLabel",
    "finance.form.projectLabel",
    "finance.form.projectNone",
    "finance.form.companyLinkLabel",
    "finance.form.noteLabel",
    "finance.form.submit",
    // Financial ops train J — invoice metadata, receipt link, engine mirror.
    "finance.invoiceNoLabel",
    "finance.vatLabel",
    "finance.documentLinked",
    "finance.tripLinked",
    "finance.form.invoiceNoLabel",
    "finance.form.invoiceNoPlaceholder",
    "finance.form.vatLabel",
    "finance.form.invoiceHint",
  ];

  const ACTION_KEYS = [
    "issue",
    "markPartial",
    "markPaid",
    "markUnpaid",
    "cancel",
    "reopen",
    "details",
    "save",
    // Approval seam (train J) — the engine decides, these only route/read.
    "requestApproval",
    "checkApproval",
  ];

  const NOTICE_KEYS = [
    "created",
    "updated",
    "invalid",
    "needs_migration",
    "not_authorized",
    "not_found",
    "limit_reached",
    "error",
    // Train J outcomes — duplicate WARNING + the engine mirror states.
    "created_possible_duplicate",
    "approval_submitted",
    "approval_approved",
    "approval_rejected",
    "approval_pending",
    "approval_cleared",
    "approval_none",
    "no_template",
    "no_approvers",
  ];

  for (const loc of activeLocales) {
    it(`${loc}: full finance catalogue`, () => {
      const msgs = JSON.parse(read(`messages/${loc}.json`)) as unknown;
      const keys = [
        ...STATIC_KEYS,
        ...FINANCE_RECORD_STATUSES.map((s) => `finance.status.${s}`),
        ...FINANCE_RECORD_TYPES.map((t) => `finance.type.${t}`),
        ...FINANCE_APPROVAL_STATUSES.map((a) => `finance.approval.${a}`),
        ...ACTION_KEYS.map((a) => `finance.actions.${a}`),
        ...NOTICE_KEYS.map((n) => `finance.notice.${n}`),
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

  it("the page renders the prominent honest scope note", () => {
    expect(PAGE).toMatch(/finance-scope-note/);
    expect(PAGE).toMatch(/t\("scopeNote"\)/);
  });

  it("copy stays honest: manual-records-only scope, no money-movement claims", () => {
    const en = JSON.parse(read("messages/en.json")).finance;
    expect(en.scopeNote).toMatch(/not bookkeeping/i);
    expect(en.scopeNote).toMatch(/payment processing/i);
    expect(en.scopeNote).toMatch(/moves no money/i);
    const blob = JSON.stringify(en).toLowerCase();
    expect(blob).not.toMatch(
      /money sent|payment processed|we paid|paid automatically|synced with your bank/,
    );
  });
});
