import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Demand-visibility honesty guards (findings F-E1/F-E2/F-E3 of the
 * full-project audit 2026-07-02).
 *
 * Contract:
 *   - The demand read-back tells companies the truth that workers cannot
 *     see submitted needs yet (the worker board is closed until the
 *     approved-route migration is applied).
 *   - The marketplace discover empty state is not a dead end — it links to
 *     /dashboard/services.
 *   - The silent best-effort structured-fields UPDATE after demand submit
 *     emits a telemetry error event on failure (observable drift).
 */

const APP = join(process.cwd());
const read = (rel: string) => readFileSync(join(APP, rel), "utf-8");

describe("worker-visibility honesty note (F-E1)", () => {
  it("readback renders the note and the page passes it", () => {
    const readback = read("components/app/demand-requests-readback.tsx");
    expect(readback).toMatch(/workerVisibilityNote/);
    expect(readback).toMatch(/demand-readback-worker-visibility-note/);
    // The readback labels are resolved once, in the shared labels module.
    const page = read("lib/company/company-section-labels.ts");
    expect(page).toMatch(/workerVisibilityNote: tReadback\("workerVisibilityNote"\)/);
    expect(read("app/[locale]/dashboard/company/needs/page.tsx")).toMatch(/readDemandReadbackLabels/);
  });

  it("the key exists in en/lt/ru and states the verified-only visibility truth", () => {
    for (const locale of ["en", "lt", "ru"]) {
      const msgs = JSON.parse(read(`messages/${locale}.json`));
      expect(
        msgs.demandReadback.workerVisibilityNote,
        `workerVisibilityNote ${locale}`,
      ).toBeTruthy();
    }
    // Approved-route MODEL A (2026-07-02): the note now states that VERIFIED
    // companies' needs reach workers — no fake "full visibility" claim, no
    // stale "workers see nothing" claim.
    const en = JSON.parse(read("messages/en.json"));
    expect(en.demandReadback.workerVisibilityNote).toMatch(
      /verified companies are shown to workers/i,
    );
    expect(en.demandReadback.workerVisibilityNote).toMatch(/manual review/i);
  });
});

/**
 * Copy honesty, global-access closure (2026-09-22). MEASURED: the worker board
 * RPC `list_open_demand_for_workers` (migration 20260906140000, lines 179-182)
 * joins `companies ... and c.verification_status = 'verified'`, while the
 * company-setup explainer said the company is "fully usable" in every other
 * status. Both surfaces now state the one truth: needs reach workers only
 * after verification.
 */
describe("needs reach workers only after verification — the copy says so (2026-09-22)", () => {
  const ALL_LOCALES = ["da", "de", "en", "et", "lt", "lv", "nl", "no", "pl", "ru", "sv"] as const;
  const ACTIVE = ["en", "lt", "ru", "nl", "de", "pl"] as const;
  const EXPLAINER_KEYS = ["active_unverified", "needs_checks", "pending_verification", "unverified"] as const;

  it("the RPC still shows needs to workers for verified companies only (the fact the copy states)", () => {
    const sql = readFileSync(
      join(APP, "..", "..", "supabase", "migrations", "20260906140000_worker_board_excludes_supply_v1.sql"),
      "utf-8",
    );
    expect(sql).toMatch(/join public\.companies c\s+on c\.profile_id = cr\.profile_id\s+and c\.verification_status = 'verified'/);
  });

  it("the employer needs page renders one honest line whenever the status is not 'verified'", () => {
    const page = read("app/[locale]/dashboard/company/needs/page.tsx");
    expect(page).toMatch(/companyRow\.verificationStatus !== "verified" \? \(/);
    expect(page).toMatch(/data-testid="company-needs-not-verified-note"/);
    expect(page).toMatch(/tReadback\("notVerifiedYet"\)/);
  });

  it("demandReadback.notVerifiedYet exists in EVERY catalog, in that language (no [EN] placeholder)", () => {
    for (const locale of ALL_LOCALES) {
      const msgs = JSON.parse(read(`messages/${locale}.json`));
      const v = String(msgs.demandReadback?.notVerifiedYet ?? "");
      expect(v.length, `notVerifiedYet ${locale}`).toBeGreaterThan(20);
      expect(v, `notVerifiedYet ${locale} is a placeholder`).not.toMatch(/^\[EN\]/);
    }
    const en = JSON.parse(read("messages/en.json"));
    expect(en.demandReadback.notVerifiedYet).toMatch(/not verified yet/i);
    // "inquiries", never "needs": demandReadback.* is inside the inquiry
    // terminology chain (lib/guards/inquiry-terminology.test.ts).
    expect(en.demandReadback.notVerifiedYet).toMatch(/the inquiries you submit here are not shown to workers until verification/i);
  });

  it("every non-verified setup explainer (active locales) says needs reach workers only after verification", () => {
    // One word each locale's sentence must carry — the verification term.
    const TERM: Record<(typeof ACTIVE)[number], RegExp> = {
      en: /shown to workers only after your company is verified/i,
      lt: /darbuotojams rodomos tik po įmonės verifikacijos/i,
      ru: /показываются работникам только после верификации/i,
      nl: /pas na verificatie van je bedrijf aan werknemers getoond/i,
      de: /erst nach der Verifizierung Ihres Unternehmens angezeigt/i,
      pl: /pokazywane pracownikom dopiero po weryfikacji/i,
    };
    for (const locale of ACTIVE) {
      const msgs = JSON.parse(read(`messages/${locale}.json`));
      const explainer = msgs.roleDashboards?.company?.setup?.verificationExplainer ?? {};
      for (const key of EXPLAINER_KEYS) {
        expect(String(explainer[key] ?? ""), `${locale} verificationExplainer.${key}`).toMatch(TERM[locale]);
      }
      // The verified explainer needs no such caveat — it IS the visible state.
      expect(String(explainer.verified ?? "")).not.toMatch(TERM[locale]);
    }
  });
});

describe("marketplace discover empty state links out (F-E2)", () => {
  it("empty state carries the services CTA", () => {
    const section = read("components/app/marketplace-loop-section.tsx");
    expect(section).toMatch(/testId="marketplace-discover-empty"/); // EmptyState derives "-cta" (audit PR8)
    expect(section).toMatch(/\/dashboard\/services/);
    const page = read("app/[locale]/dashboard/service-requests/page.tsx");
    expect(page).toMatch(/discoverEmptyCta: t\("linkToServices"\)/);
  });
});

describe("structured-fields drift is observable (F-E3)", () => {
  it("demand-request fires a telemetry error on upErr", () => {
    const src = read("lib/demand/demand-request.ts");
    expect(src).toMatch(/recordTelemetryEvent/);
    expect(src).toMatch(/demand_structured_fields/);
    expect(src).toMatch(/result: "error"/);
  });
});
