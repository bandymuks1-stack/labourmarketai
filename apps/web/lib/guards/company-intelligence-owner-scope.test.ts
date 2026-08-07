import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, type Dirent } from "node:fs";
import { join, relative } from "node:path";

/**
 * A company surface must never show the platform's aggregate.
 *
 * W14 audit P0-3. `getCompanyDemandIntelligence` selected from
 * `customer_requests` with only a date filter and a limit — no owner
 * predicate — and leaned entirely on the RLS policy:
 *
 *     customer_requests_select: profile_id = auth.uid() OR public.is_admin()
 *
 * The `is_admin()` branch is the defect, because this function is rendered on
 * COMPANY surfaces (`/dashboard/company/planning`, `/dashboard/intelligence`),
 * not on a platform-admin screen. An operator with an admin role opening a
 * customer's workforce plan received EVERY tenant's demand for the window,
 * aggregated and labelled as that company's demand signal, with nothing in the
 * UI saying the scope had changed. A shortfall figure reported back to the
 * customer would have been built from their competitors' data.
 *
 * The function's own docblock asserted the opposite — "RLS keeps other
 * tenants' rows invisible" — which is exactly why a reviewer would not have
 * looked twice.
 *
 * This guard is static: the fix is a query predicate, and asserting on the
 * query is what catches its removal. A live cross-tenant proof needs two real
 * tenants and an admin session against a database, which this suite does not
 * have.
 */

const APP = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(APP, rel), "utf8");

const SOURCE = read("lib/intelligence/intelligence-read.ts");
const REPO = join(APP, "..", "..");

/**
 * The function AND its preceding docblock — assertions must not pass on a
 * neighbour's code, but the docblock is part of what this guard checks, and it
 * sits above the `export` keyword.
 */
function companyDemandBody(): string {
  const fn = SOURCE.indexOf("export async function getCompanyDemandIntelligence");
  expect(fn, "getCompanyDemandIntelligence disappeared").toBeGreaterThan(-1);
  const docStart = SOURCE.lastIndexOf("/**", fn);
  const start = docStart === -1 ? fn : docStart;
  const next = SOURCE.indexOf("\nexport ", fn + 10);
  return SOURCE.slice(start, next === -1 ? undefined : next);
}

describe("the company demand read is scoped to its organization", () => {
  const body = companyDemandBody();

  it("filters customer_requests by the RESOLVED organization (W8 Stage B)", () => {
    // Stage B (migration 20260806200000 gave customer_requests an
    // organization column): the predicate widened from `profile_id =
    // user.id` to the resolved organization — a co-manager sees their
    // organization's demand, and the admin RLS branch stays unreachable.
    expect(
      body,
      "no org predicate — an admin viewer cross-aggregates every tenant on a " +
        "company surface (W14 P0-3)",
    ).toMatch(/\.eq\(\s*"organization_id"\s*,\s*employer\.organizationId\s*\)/);
    // The old owner predicate must not silently return alongside it — the
    // two would intersect to the pre-Stage-B too-narrow read.
    expect(body).not.toMatch(/\.eq\(\s*"profile_id"/);
  });

  it("the scope comes from the server's own resolution, never client input", () => {
    // `employer` is resolved by the ONE canonical fail-closed resolver.
    expect(body).toMatch(/requireEmployerCompany\(\)/);
    expect(body).toMatch(/supabase\.auth\.getUser\(\)/);
    // No parameter is accepted at all, so there is nothing a caller could forge.
    expect(body).toMatch(/getCompanyDemandIntelligence\(\s*\)/);
  });

  it("takes no organization or profile id as an argument", () => {
    const signature = body.slice(0, body.indexOf(")") + 1);
    expect(signature).not.toMatch(/organizationId|organization_id|profileId|companyId/);
  });

  it("still bounds the window and the row count", () => {
    // The predicate must be ADDED, not swapped in for the existing bounds.
    expect(body).toMatch(/\.gte\(\s*"created_at"/);
    expect(body).toMatch(/\.limit\(COMPANY_DEMAND_READ_LIMIT\)/);
  });
});

describe("the docblock no longer claims a safety it does not have", () => {
  const body = companyDemandBody();

  it("does not assert that RLS alone isolates tenants here", () => {
    // The original wording — "RLS keeps other tenants' rows invisible" — was
    // false for an admin viewer, and it is the reason the gap survived review.
    expect(body).not.toMatch(/RLS keeps other tenants' rows invisible/);
  });

  it("names the admin branch as the reason the predicate exists", () => {
    expect(body).toMatch(/is_admin/);
    expect(body).toMatch(/W14/);
  });

  it("states the remaining too-narrow half honestly", () => {
    // The same predicate is also too narrow: a co-manager of the same
    // organization sees only their own requests, because the table has no
    // organization column. Consistently too narrow is honest; silently too
    // wide is not. If this note disappears, the limitation got forgotten.
    expect(body).toMatch(/organization column/);
  });
});

describe("the surfaces this renders on are company surfaces", () => {
  it("both callers are company/dashboard pages, not platform-admin screens", () => {
    for (const rel of [
      "app/[locale]/dashboard/company/planning/page.tsx",
      "app/[locale]/dashboard/intelligence/page.tsx",
    ]) {
      expect(read(rel)).toMatch(/getCompanyDemandIntelligence/);
    }
  });

  it("it is not rendered on an admin route (that would be a different product)", () => {
    // If a platform-admin analytics screen ever needs the cross-tenant view,
    // it must be its OWN function with its own name and its own admin check —
    // never this one silently widening again.
    const adminRoot = join(APP, "app", "[locale]", "dashboard", "admin");
    const offenders: string[] = [];
    // `withFileTypes` + try/catch on purpose: an `existsSync`/`statSync` check
    // followed by a read is a check-then-use pattern (CodeQL js/file-system-race,
    // flagged on the first draft of this file). The entry type comes from the
    // directory listing itself, and a missing directory is handled by failing
    // the read rather than by asking first.
    const walk = (dir: string): void => {
      let entries: Dirent[];
      try {
        entries = readdirSync(dir, { withFileTypes: true });
      } catch {
        return; // no admin route tree → nothing to check
      }
      for (const entry of entries) {
        const abs = join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(abs);
        } else if (/\.tsx?$/.test(entry.name)) {
          let src = "";
          try {
            src = readFileSync(abs, "utf8");
          } catch {
            continue;
          }
          if (src.includes("getCompanyDemandIntelligence")) {
            offenders.push(relative(APP, abs));
          }
        }
      }
    };
    walk(adminRoot);
    expect(offenders, offenders.join("\n")).toEqual([]);
  });
});

describe("the underlying policy is what it was assumed to be", () => {
  it("customer_requests_select really does carry an is_admin branch", () => {
    // Pinned so this guard cannot go stale in the quiet direction: if the
    // policy is ever narrowed, this fails and the predicate above can be
    // re-evaluated deliberately rather than left as cargo.
    const sql = readFileSync(
      join(REPO, "supabase", "migrations", "0028_customer_requests.sql"),
      "utf8",
    );
    expect(sql).toMatch(/customer_requests_select[\s\S]{0,200}is_admin\(\)/);
  });
});
