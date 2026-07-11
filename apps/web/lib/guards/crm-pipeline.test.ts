import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  CUSTOMER_REQUEST_STAGE_MAP,
  CUSTOMER_REQUEST_STATUSES,
  LEAD_STAGE_MAP,
  LEAD_STATUSES,
  PIPELINE_SOURCE_HREFS,
  PIPELINE_SOURCE_TYPES,
  PIPELINE_STAGES,
  PUBLIC_INTAKE_STAGE_MAP,
  countItemsBySource,
  countItemsByStage,
  customerRequestToItem,
  filterPipelineItems,
  findPossibleDuplicateIds,
  leadStageFor,
  leadToItem,
  normalizeDedupKey,
  publicIntakeToItem,
  sortPipelineItems,
  waitlistToItem,
  type PipelineItem,
} from "../crm/pipeline-model";
import { COMPANY_NEED_INTAKE_STATUSES } from "../admin/company-need-intake-shared";
import { COMMAND_REGISTRY } from "../navigation/command-registry";

/**
 * CRM / DEMAND PIPELINE guards (control room PR F, gap map §5 — read
 * consolidation).
 *
 * The slice rule: ONE presentation queue over the demand sources that
 * ALREADY exist — no second funnel, no new table, no RLS change, no new
 * service-role call site, no mutation, no outbound anything. These pins
 * keep that true:
 *
 *   - STAGE MAPPING IS TOTAL: every stored status of every source maps to
 *     exactly one presentation stage (or the documented draft exclusion) —
 *     no status can fall through to a guessed stage.
 *   - STORED STATUS IS THE TRUTH: items carry the stored value verbatim and
 *     the page renders it — the mapped stage never replaces it.
 *   - COMPOSITION ONLY: lib/crm/pipeline.ts reads through the two EXISTING
 *     gated read services (lib/sales/lead-intake.ts,
 *     lib/admin/company-need-intakes.ts) and performs no data access of its
 *     own — no createAdminClient, no .from(), no .rpc().
 *   - READ-ONLY: no insert/update/delete/upsert anywhere in the layer; the
 *     page has no mutating action (status changes stay on the existing
 *     surfaces the rows link to).
 *   - NO OUTBOUND: no fetch, no mail/SMS/push provider import.
 *   - ADMIN-GATED: the page lives under the requireSuperadmin-gated
 *     /dashboard/admin subtree and re-checks per page; it is NOT a user
 *     dashboard module and the finder entry is audience:"admin".
 *   - DEDUP IS DISPLAY-ONLY: a pure normalized comparison; no merge action.
 *   - i18n: the crmPipeline namespace is complete in every ACTIVE locale.
 */

const APP = process.cwd();
const readWeb = (rel: string) => readFileSync(join(APP, rel), "utf8");

/** Strip block + line comments so the source pins below test CODE, not the
 *  doctrine comments that (deliberately) name the forbidden patterns. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}
const readCode = (rel: string) => stripComments(readWeb(rel));

const MODEL = "lib/crm/pipeline-model.ts";
const LIB = "lib/crm/pipeline.ts";
const PAGE = "app/[locale]/dashboard/admin/pipeline/page.tsx";
const ACTIVE_LOCALES = ["lt", "en", "ru", "nl", "de"] as const;

// ── Stage mapping ────────────────────────────────────────────────────────────

describe("pipeline stage mapping — total, honest, never overwriting", () => {
  it("the presentation stage-set is the documented closed set", () => {
    expect([...PIPELINE_STAGES]).toEqual([
      "new",
      "contacted",
      "qualifying",
      "follow_up",
      "active",
      "closed",
    ]);
  });

  it("customer_requests: every stored status maps to exactly one stage or the documented draft exclusion", () => {
    expect(Object.keys(CUSTOMER_REQUEST_STAGE_MAP).sort()).toEqual(
      [...CUSTOMER_REQUEST_STATUSES].sort(),
    );
    for (const status of CUSTOMER_REQUEST_STATUSES) {
      const stage = CUSTOMER_REQUEST_STAGE_MAP[status];
      if (status === "draft") {
        expect(stage, "draft is excluded from the operator queue").toBeNull();
      } else {
        expect(PIPELINE_STAGES).toContain(stage);
      }
    }
    expect(CUSTOMER_REQUEST_STAGE_MAP.submitted).toBe("new");
    expect(CUSTOMER_REQUEST_STAGE_MAP.in_review).toBe("qualifying");
    expect(CUSTOMER_REQUEST_STAGE_MAP.needs_followup).toBe("follow_up");
    expect(CUSTOMER_REQUEST_STAGE_MAP.approved).toBe("active");
    expect(CUSTOMER_REQUEST_STAGE_MAP.closed).toBe("closed");
  });

  it("public intakes: every stored status maps to exactly one stage (qualified→qualifying, never a fake 'active')", () => {
    expect(Object.keys(PUBLIC_INTAKE_STAGE_MAP).sort()).toEqual(
      [...COMPANY_NEED_INTAKE_STATUSES].sort(),
    );
    for (const status of COMPANY_NEED_INTAKE_STATUSES) {
      expect(PIPELINE_STAGES).toContain(PUBLIC_INTAKE_STAGE_MAP[status]);
    }
    expect(PUBLIC_INTAKE_STAGE_MAP.new).toBe("new");
    expect(PUBLIC_INTAKE_STAGE_MAP.contacted).toBe("contacted");
    expect(PUBLIC_INTAKE_STAGE_MAP.qualified).toBe("qualifying");
    expect(PUBLIC_INTAKE_STAGE_MAP.rejected).toBe("closed");
  });

  it("leads: every stored status maps to exactly one stage; unknown/null sits at the entry stage", () => {
    expect(Object.keys(LEAD_STAGE_MAP).sort()).toEqual(
      [...LEAD_STATUSES].sort(),
    );
    for (const status of LEAD_STATUSES) {
      expect(PIPELINE_STAGES).toContain(LEAD_STAGE_MAP[status]);
    }
    expect(LEAD_STAGE_MAP.qualified).toBe("qualifying");
    expect(LEAD_STAGE_MAP.won).toBe("active");
    expect(LEAD_STAGE_MAP.lost).toBe("closed");
    expect(leadStageFor(null)).toBe("new");
    expect(leadStageFor("something_unmapped")).toBe("new");
  });

  it("item builders keep the stored status VERBATIM next to the mapped stage", () => {
    const request = customerRequestToItem({
      id: "r1",
      title: "Concrete crew",
      status: "needs_followup",
      country: "LT",
      createdAt: "2026-07-01T10:00:00Z",
    });
    expect(request?.storedStatus).toBe("needs_followup");
    expect(request?.stage).toBe("follow_up");

    const intake = publicIntakeToItem({
      id: "p1",
      status: "qualified",
      companyName: "Statyba UAB",
      contactEmail: null,
      country: "LT",
      createdAt: "2026-07-02T10:00:00Z",
    });
    expect(intake.storedStatus).toBe("qualified");
    expect(intake.stage).toBe("qualifying");

    const lead = leadToItem({
      id: "l1",
      status: "won",
      email: null,
      fullName: "J. P.",
      companyName: null,
      country: null,
      createdAt: "2026-07-03T10:00:00Z",
    });
    expect(lead.storedStatus).toBe("won");
    expect(lead.stage).toBe("active");
  });

  it("draft customer_requests are excluded, never shown under a guessed stage", () => {
    expect(
      customerRequestToItem({
        id: "r2",
        title: "Draft work",
        // The seed read never fetches drafts; the builder still guards.
        status: "draft" as never,
        country: null,
        createdAt: "2026-07-01T10:00:00Z",
      }),
    ).toBeNull();
  });

  it("waitlist rows carry NO fabricated lifecycle: storedStatus null, entry stage", () => {
    const row = waitlistToItem({
      id: "w1",
      email: "signup@site.example",
      createdAt: "2026-07-04T10:00:00Z",
    });
    expect(row.storedStatus).toBeNull();
    expect(row.stage).toBe("new");
  });

  it("every source links to its REAL existing surface (no new detail views)", () => {
    expect(PIPELINE_SOURCE_HREFS.public_intake).toBe(
      "/dashboard/admin/company-need-intakes",
    );
    for (const source of ["customer_request", "lead", "waitlist"] as const) {
      expect(PIPELINE_SOURCE_HREFS[source]).toBe("/dashboard/admin");
    }
  });
});

// ── Counts + filtering (real values only, pure) ─────────────────────────────

function item(partial: Partial<PipelineItem> & { id: string }): PipelineItem {
  return {
    sourceType: "lead",
    sourceLabelKey: "crmPipeline.sources.lead",
    storedStatus: "new",
    stage: "new",
    title: "t",
    country: null,
    createdAt: "2026-07-01T00:00:00Z",
    href: "/dashboard/admin",
    companyName: null,
    email: null,
    ...partial,
  };
}

describe("pipeline counts + filters — pure, real, diacritics-insensitive", () => {
  const items = [
    item({ id: "a", stage: "new", sourceType: "lead", title: "Mūrininkai" }),
    item({ id: "b", stage: "new", sourceType: "waitlist" }),
    item({ id: "c", stage: "closed", sourceType: "public_intake" }),
  ];

  it("counts per stage and per source are computed from the actual rows", () => {
    const byStage = countItemsByStage(items);
    expect(byStage.new).toBe(2);
    expect(byStage.closed).toBe(1);
    expect(byStage.active).toBe(0);
    const bySource = countItemsBySource(items);
    expect(bySource.lead).toBe(1);
    expect(bySource.waitlist).toBe(1);
    expect(bySource.public_intake).toBe(1);
    expect(bySource.customer_request).toBe(0);
  });

  it("filters by stage, source, and normalized text (diacritics-insensitive)", () => {
    expect(
      filterPipelineItems(items, { stage: "new", source: null, q: "" }).map(
        (i) => i.id,
      ),
    ).toEqual(["a", "b"]);
    expect(
      filterPipelineItems(items, {
        stage: null,
        source: "public_intake",
        q: "",
      }).map((i) => i.id),
    ).toEqual(["c"]);
    // "murininkai" (no diacritics) finds "Mūrininkai".
    expect(
      filterPipelineItems(items, { stage: null, source: null, q: "murinink" }).map(
        (i) => i.id,
      ),
    ).toEqual(["a"]);
    expect(
      filterPipelineItems(items, { stage: null, source: null, q: "zzz" }),
    ).toEqual([]);
  });

  it("merged queue sorts newest first without mutating its input", () => {
    const input = [
      item({ id: "old", createdAt: "2026-01-01T00:00:00Z" }),
      item({ id: "newer", createdAt: "2026-07-01T00:00:00Z" }),
    ];
    const snapshot = [...input];
    expect(sortPipelineItems(input).map((i) => i.id)).toEqual(["newer", "old"]);
    expect(input).toEqual(snapshot);
  });
});

// ── Duplicate detection (display-only) ──────────────────────────────────────

describe("dedup — pure normalization, display-only", () => {
  it("normalizes case, diacritics, punctuation and whitespace", () => {
    expect(normalizeDedupKey("  Statyba, UAB!  ")).toBe("statyba uab");
    expect(normalizeDedupKey("STATYBA UAB")).toBe("statyba uab");
    expect(normalizeDedupKey("Šiaulių Statyba")).toBe("siauliu statyba");
    expect(normalizeDedupKey(null)).toBe("");
    expect(normalizeDedupKey("   ")).toBe("");
    expect(normalizeDedupKey("!!!")).toBe("");
  });

  it("is pure: same input, same output, no side effects", () => {
    expect(normalizeDedupKey("Bau-Firma GmbH")).toBe(
      normalizeDedupKey("Bau-Firma GmbH"),
    );
  });

  it("flags rows sharing a normalized company name OR email — and only those", () => {
    const rows = [
      item({ id: "a", companyName: "Statyba, UAB" }),
      item({ id: "b", companyName: "statyba uab" }),
      item({ id: "c", companyName: "Kita Įmonė" }),
      item({ id: "d", email: "Ops@Site.example" }),
      item({ id: "e", email: "ops@site example" }),
      item({ id: "f", email: null, companyName: null }),
    ];
    const dup = findPossibleDuplicateIds(rows);
    expect(dup.has("a")).toBe(true);
    expect(dup.has("b")).toBe(true);
    expect(dup.has("c")).toBe(false);
    expect(dup.has("d")).toBe(true);
    expect(dup.has("e")).toBe(true);
    expect(dup.has("f")).toBe(false);
  });

  it("empty normalized values never match each other", () => {
    const rows = [
      item({ id: "x", companyName: "—" }),
      item({ id: "y", companyName: "!!!" }),
    ];
    expect(findPossibleDuplicateIds(rows).size).toBe(0);
  });

  it("no merge action exists anywhere in the layer", () => {
    for (const src of [readWeb(MODEL), readWeb(LIB), readWeb(PAGE)]) {
      expect(src.toLowerCase()).not.toMatch(/mergeaction|merge_duplicates/);
    }
    // The chip is display-only copy in every active locale.
    for (const locale of ACTIVE_LOCALES) {
      const ns = JSON.parse(readWeb(`messages/${locale}.json`)).crmPipeline;
      expect(String(ns.duplicateChip ?? "").length).toBeGreaterThan(0);
    }
  });
});

// ── Composition-only data access, read-only, no outbound ────────────────────

describe("pipeline server layer — composition over the two seed reads only", () => {
  const lib = readCode(LIB);
  const model = readCode(MODEL);
  const page = readCode(PAGE);

  it("reads ONLY via the two existing gated services — no own data access", () => {
    expect(lib).toMatch(
      /import\s*\{\s*getLeadIntakeOverview\s*\}\s*from\s*"@\/lib\/sales\/lead-intake"/,
    );
    expect(lib).toMatch(
      /import\s*\{\s*listCompanyNeedIntakes\s*\}\s*from\s*"@\/lib\/admin\/company-need-intakes"/,
    );
    for (const src of [lib, model, page]) {
      expect(src).not.toMatch(/createAdminClient|supabase\/admin/);
      expect(src).not.toMatch(/\.from\(/);
      expect(src).not.toMatch(/\.rpc\(/);
      expect(src).not.toMatch(/createClient/);
    }
  });

  it("performs NO write: no insert/update/delete/upsert, no server action", () => {
    for (const src of [lib, model, page]) {
      expect(src).not.toMatch(/\.insert\(/);
      expect(src).not.toMatch(/\.update\(/);
      expect(src).not.toMatch(/\.delete\(/);
      expect(src).not.toMatch(/\.upsert\(/);
      expect(src).not.toMatch(/"use server"/);
    }
    // The only form is the GET search form — no POST, no action prop.
    expect(page).toMatch(/method="get"/);
    expect(page).not.toMatch(/method="post"/i);
    expect(page).not.toMatch(/<form[^>]*action=/);
  });

  it("performs NO external transport anywhere in the layer", () => {
    for (const src of [lib, model, page]) {
      expect(src).not.toMatch(/\bfetch\s*\(/);
      expect(src).not.toMatch(
        /import[^;]*(nodemailer|twilio|sendgrid|mailgun|postmark|web-push|firebase|@sendgrid|telegram)/i,
      );
    }
  });

  it("the pure model imports no server code and no supabase client", () => {
    expect(model).not.toMatch(/from\s*"@\/lib\/supabase/);
    expect(model).not.toMatch(/import\s+"server-only"/);
    // Only type-level imports from the shared (non-server) modules.
    expect(model).toMatch(
      /import type \{ CompanyNeedIntakeStatus \} from "@\/lib\/admin\/company-need-intake-shared"/,
    );
  });

  it("degrades honestly — the seeds' own states are surfaced, never a false zero", () => {
    expect(lib).toMatch(/needs_admin_read/);
    expect(lib).toMatch(/service_key_missing/);
    expect(lib).toMatch(/needs_migration/);
    expect(page).toMatch(/pipeline-degraded/);
    for (const locale of ACTIVE_LOCALES) {
      const ns = JSON.parse(readWeb(`messages/${locale}.json`)).crmPipeline;
      for (const key of [
        "needs_admin_read",
        "service_key_missing",
        "needs_migration",
        "not_admin",
        "error",
      ]) {
        expect(
          String(ns.sourceStates?.[key] ?? "").length,
          `${locale} crmPipeline.sourceStates.${key}`,
        ).toBeGreaterThan(0);
      }
    }
  });
});

// ── Surface rules: admin-gated, stored status rendered, no second funnel ────

describe("pipeline surface — admin-only, stored statuses verbatim", () => {
  const page = readWeb(PAGE);

  it("lives under the requireSuperadmin-gated admin subtree and re-checks per page", () => {
    expect(
      existsSync(
        join(APP, "app", "[locale]", "dashboard", "admin", "pipeline", "page.tsx"),
      ),
    ).toBe(true);
    expect(page).toMatch(/await requireSuperadmin\(locale\)/);
    // The admin layout gates the whole subtree (structural guarantee).
    expect(
      readWeb("app/[locale]/dashboard/admin/layout.tsx"),
    ).toMatch(/requireSuperadmin/);
  });

  it("renders the STORED status verbatim on every row (never only the stage)", () => {
    expect(page).toMatch(/item\.storedStatus/);
    expect(page).toMatch(/storedStatusLabel/);
    expect(page).toMatch(/item\.stage/);
  });

  it("is NOT registered as a user dashboard module (admin surface only)", () => {
    const registry = readWeb("lib/dashboard/dashboard-module-registry.ts");
    expect(registry).not.toMatch(/admin\/pipeline/);
  });

  it("the finder entry is audience:'admin' and targets the admin route", () => {
    const entry = COMMAND_REGISTRY.find((e) => e.id === "admin_pipeline");
    expect(entry).toBeTruthy();
    expect(entry!.audience).toBe("admin");
    expect(entry!.route).toBe("/dashboard/admin/pipeline");
  });

  it("no second demand funnel: no new public/user demand route and no migration in this slice's layer", () => {
    // The pipeline adds no user-facing demand entry point — only the admin
    // read view. The public /company-need funnel and its deny-all RLS are
    // untouched (its lib is only imported for reads).
    for (const dir of ["pipeline", "crm"]) {
      expect(
        existsSync(join(APP, "app", "[locale]", "dashboard", dir)),
        `no user dashboard route: ${dir}`,
      ).toBe(false);
      expect(
        existsSync(join(APP, "app", "[locale]", "(marketing)", dir)),
        `no marketing route: ${dir}`,
      ).toBe(false);
    }
    const lib = readWeb(LIB);
    // No direct table access in the composition layer (see the .from() pin
    // above) and certainly no schema DDL.
    expect(lib).not.toMatch(/CREATE TABLE/i);
  });

  it("links each row to its real surface and keeps the honest read-only note", () => {
    expect(page).toMatch(/item\.href/);
    expect(page).toMatch(/t\("honestNote"\)/);
    const en = JSON.parse(readWeb("messages/en.json")).crmPipeline;
    expect(en.honestNote).toMatch(/read view|viewing/i);
    expect(en.honestNote.toLowerCase()).toContain("verbatim");
  });
});

// ── i18n completeness in every ACTIVE locale ────────────────────────────────

describe("i18n — crmPipeline namespace complete in lt/en/ru/nl/de", () => {
  for (const locale of ACTIVE_LOCALES) {
    it(`${locale} carries the full crmPipeline catalogue`, () => {
      const messages = JSON.parse(readWeb(`messages/${locale}.json`));
      const ns = messages.crmPipeline;
      expect(ns, `${locale} crmPipeline namespace`).toBeTruthy();
      for (const key of [
        "eyebrow",
        "title",
        "subtitle",
        "back",
        "honestNote",
        "summaryHeading",
        "windowNote",
        "duplicateChip",
        "storedStatusLabel",
        "createdLabel",
        "openSurface",
        "empty",
        "noMatches",
        "viewPipeline",
      ]) {
        expect(
          String(ns[key] ?? "").length,
          `${locale} crmPipeline.${key}`,
        ).toBeGreaterThan(0);
      }
      for (const stage of PIPELINE_STAGES) {
        expect(
          String(ns.stages?.[stage] ?? "").length,
          `${locale} crmPipeline.stages.${stage}`,
        ).toBeGreaterThan(0);
      }
      for (const source of PIPELINE_SOURCE_TYPES) {
        expect(
          String(ns.sources?.[source] ?? "").length,
          `${locale} crmPipeline.sources.${source}`,
        ).toBeGreaterThan(0);
      }
      for (const key of [
        "sourceLabel",
        "stageLabel",
        "all",
        "searchLabel",
        "searchPlaceholder",
        "searchSubmit",
        "reset",
      ]) {
        expect(
          String(ns.filters?.[key] ?? "").length,
          `${locale} crmPipeline.filters.${key}`,
        ).toBeGreaterThan(0);
      }
      // The seed panel's cross-link key ships in the same locales.
      expect(
        String(messages.salesIntake?.viewPipeline ?? "").length,
        `${locale} salesIntake.viewPipeline`,
      ).toBeGreaterThan(0);
    });
  }
});
