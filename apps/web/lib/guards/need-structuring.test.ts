import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { structureNeed } from "@/lib/structuring/structure-need";
import { ALL_WORK_TYPE_SLUGS, MARKET_COUNTRIES } from "@/lib/taxonomy/work-categories";

/**
 * Locks the need-structuring engine + its safe wiring:
 *  - new needs auto-suggest from the wizard;
 *  - the admin backfill is admin-gated, closed-set-validated, and writes only
 *    structured columns;
 *  - free text never reaches the worker board.
 */
const WEB = resolve(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(WEB, rel), "utf8");

describe("engine output is closed-set + deterministic", () => {
  it("only ever returns taxonomy slugs / market countries / enums", () => {
    const s = structureNeed({ description: "5 welders in Germany with accommodation next month" });
    expect(ALL_WORK_TYPE_SLUGS).toContain(s.workType);
    expect(MARKET_COUNTRIES).toContain(s.country as never);
    expect(["flexible", "this_week", "urgent", null]).toContain(s.startPeriod);
  });
  it("flags low-confidence text for review instead of guessing", () => {
    expect(structureNeed({ description: "??? unclear ???" }).needsReview).toBe(true);
  });
});

describe("new-need auto-suggest is wired into the wizard", () => {
  const wizard = read("components/app/demand-request-button.tsx");
  it("runs structureNeed and pre-fills the structured selects", () => {
    expect(wizard).toMatch(/structureNeed\(/);
    expect(wizard).toMatch(/setWorkType\(/);
    expect(wizard).toMatch(/autoSuggested/);
  });
});

describe("admin backfill is safe — admin-gated, closed-set, no free-text write", () => {
  const action = read("lib/admin/need-backfill-actions.ts");
  it("requires superadmin", () => {
    expect(action).toMatch(/isSuperadmin\(\)/);
  });
  it("validates against closed sets", () => {
    expect(action).toMatch(/isWorkTypeSlug/);
    expect(action).toMatch(/isMarketCountry/);
    expect(action).toMatch(/ACCOMMODATION/);
  });
  it("writes only the structured columns + whitelisted accommodation", () => {
    expect(action).toMatch(/role_or_work_type:/);
    // it must NOT write free text fields to the row
    expect(action).not.toMatch(/need_summary:\s/);
    expect(action).not.toMatch(/\brole:\s*raw\./);
  });

  it("the admin loader is server-only and the worker board does not read free text", () => {
    const loader = read("lib/admin/need-backfill.ts");
    expect(loader).toContain('"server-only"');
    // The worker board loader reads the RPC only — never customer_requests free text.
    const boardLoader = read("lib/opportunities/load-worker-opportunities.ts");
    expect(boardLoader).not.toMatch(/need_summary|payload ->> 'role'|payload\.role|\.notes/);
  });
});
