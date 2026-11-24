import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const WEB = join(__dirname, "..", "..");
const read = (...p: string[]) => readFileSync(join(WEB, ...p), "utf8");

const page = read("app", "[locale]", "dashboard", "people", "[workerId]", "page.tsx");
const reader = read("lib", "player-card", "work-history.ts");

/** Executable source with comments removed, so documentation prose can never
 *  satisfy — or break — an assertion about what the code does. */
const codeOnly = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/**
 * THE PERSON PAGE COULD NOT SAY WHAT ANYONE HAD DONE.
 *
 * `/dashboard/people/[workerId]` is the only surface in the product where one
 * person looks at another. Audited 2026-09-08 it answered WHO IS THIS (name,
 * headline) and WHAT DO THEY CLAIM (skills, with honest tier chips) — and
 * carried nothing at all about work actually done, and nothing about where
 * the person can work.
 *
 * Neither was missing from the product. `engagement_contexts` is the
 * canonical person↔organization spine and already answers this for the
 * person's own card, CV and profile; `preferred_countries` sits on the very
 * row this page already reads, and is already inside
 * PROFILE_SAFE_PREVIEW_FIELDS. The data was authorised and unrendered.
 */

describe("the page answers WHAT HAVE THEY ACTUALLY DONE", () => {
  it("reads the shared work-history spine, not a second query of its own", () => {
    // A fourth history would drift from the card, the CV and the profile —
    // the exact defect a previous audit found when two of them disagreed.
    expect(page).toContain("readRecordedWorkFor");
    expect(page).toContain('from "@/lib/player-card/work-history"');
    expect(reader).toContain("PROFESSIONAL_HISTORY_RELATIONSHIPS");
    expect(reader).toContain("deriveWorkHistory");
  });

  it("employment and practice stay different claims", () => {
    // A placement is carried as practice, never relabelled as a job.
    expect(page).toContain("kindPractice");
    expect(page).toContain("kindEmployment");
  });

  it("renders where the person can work", () => {
    expect(page).toContain("preferred_countries");
    expect(page).toContain('data-testid="person-mobility"');
  });
});

describe("UNKNOWN is not ZERO", () => {
  it("the reader classifies a failed read as unavailable, never as empty", () => {
    // `getOwnWorkHistory` degrades to [] because the owner's card has other
    // signals around it. Here the section IS the signal, so a broken read must
    // never render as "this person has done nothing".
    expect(reader).toContain('status: "unavailable"');
    expect(reader).toMatch(/if \(res\.error\) return \{ status: "unavailable" \};/);
    const fn = reader.slice(reader.indexOf("export async function readRecordedWorkFor"));
    expect(fn).not.toMatch(/if \(res\.error\) return \[\]/);
  });

  it("the page renders the failure state separately from the empty state", () => {
    expect(page).toContain("workUnavailable");
    expect(page).toContain("workEmpty");
    expect(page).toContain('data-testid="person-work-error"');
    // The failure branch must be tested BEFORE the emptiness branch, or a
    // failed read would fall through and print "no recorded work".
    expect(page.indexOf('recordedWork.status === "unavailable"')).toBeLessThan(
      page.indexOf("recordedWork.entries.length === 0"),
    );
  });
});

describe("PERMISSION STAYS THE DATABASE'S", () => {
  it("the reader uses the caller's own client — never a service role", () => {
    // engagement_contexts select RLS is
    //   profile_id = auth.uid() OR manages_organization(organization_id) OR is_admin()
    // so the viewer sees only what they are entitled to. A service-role client
    // would silently bypass exactly that, and publish one person's whole
    // history to anyone who can open the page.
    const fn = reader.slice(reader.indexOf("export async function readRecordedWorkFor"));
    expect(fn).toContain("createClient()");
    expect(fn).not.toMatch(/service[_-]?role/i);
    expect(fn).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(reader).not.toContain("createAdminClient");
  });

  it("no policy, grant or membership truth is invented in this module", () => {
    // CODE ONLY. The prose above deliberately says "adds no policy, no grant"
    // — checking the raw file would fail on the sentence that documents the
    // very rule being enforced, which is how a guard ends up weakened to make
    // its own comment pass.
    expect(codeOnly(reader)).not.toMatch(/\bgrant\b/i);
    expect(codeOnly(reader)).not.toMatch(/create\s+policy/i);
    expect(codeOnly(reader)).not.toContain("company_memberships");
  });

  it("the page still selects no contact detail", () => {
    // The owner rule this page was built under: worker contact stays hidden,
    // and contact happens through the permission-gated message flow.
    const select = page.slice(page.indexOf('.from("workers")'), page.indexOf(".eq(\"id\", workerId)"));
    for (const forbidden of ["email", "phone", "address"]) {
      expect(select.toLowerCase()).not.toContain(forbidden);
    }
  });

  it("says plainly that it shows only what the viewer may see", () => {
    // The rows are the viewer's entitlement, which is not the same as a
    // complete history. Presenting a partial list as the whole would be a
    // quieter lie than showing nothing.
    expect(page).toContain("workScopeNote");
  });
});
