import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Owner 2026-09-29 — HISTORICAL ORGANIZATION IDENTITY READ. Ending a work
 * relationship must not anonymize the person's own professional history, and
 * must not restore access to the former organization. One names-only read,
 * scoped to organizations the caller has their OWN relationship row with.
 */
const root = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");
const MIG = readFileSync(
  join(root, "..", "..", "supabase", "migrations", "20260929090000_historical_organization_names_v1.sql"),
  "utf8",
);

describe("historical organization identity — names only, own history only", () => {
  it("returns only id + display/legal name, for orgs the caller has an engagement_contexts row with", () => {
    const fn = MIG.slice(MIG.indexOf("create or replace function"));
    expect(fn).toMatch(/returns table\(organization_id uuid, display_name text, legal_name text\)/);
    expect(fn).toMatch(/select o\.id, o\.display_name, o\.legal_name/);
    expect(fn).toMatch(/ec\.profile_id = auth\.uid\(\)/);
    const sql = MIG.split(/\r?\n/).filter((l) => !l.trim().startsWith("--")).join(" ");
    expect(sql).not.toMatch(/create policy|alter policy|organizations_select/i);
  });

  it("the person's own history readers fall back to it; nothing else does", () => {
    for (const rel of [
      "lib/player-card/work-history.ts",
      "lib/player-card/player-card.ts",
      "lib/cv-export/verified-cv.ts",
      "app/[locale]/dashboard/journal/page.tsx",
    ]) {
      expect(read(rel), rel).toMatch(/withHistoricalOrgNames\(/);
    }
    expect(read("lib/company/historical-org-names.ts")).toMatch(/rpc\("my_historical_organization_names_v1"/);
  });

  it("an ended relationship is labelled as ended, not as current", () => {
    const page = read("app/[locale]/dashboard/journal/page.tsx");
    expect(page).toMatch(/\.eq\("status", "ended"\)/);
    expect(page).toMatch(/t\("contextEnded"\)/);
  });
});

describe("a placement's current outcome is not the client's decision alone", () => {
  it("client scouting shows the worker's answer beside the client's decision", () => {
    const page = read("app/[locale]/dashboard/company/scouting/page.tsx");
    expect(page).toMatch(/readOfferBookingStatuses\(/);
    expect(page).toMatch(/scout-offer-worker-/);
  });
  it("the agency progress row shows the worker outcome where the booking did not go ahead", () => {
    expect(read("components/app/agency-bridge-section.tsx")).toMatch(/agency-bridge-worker-outcome/);
    expect(read("app/[locale]/dashboard/company/partners/page.tsx")).toMatch(/workerOutcomeByOffer=\{/);
  });
});
