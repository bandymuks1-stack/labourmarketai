import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * Guard: the work-journal review chain must be REACHABLE from the logged-in
 * dashboard (slice sales-core-nonstop-v1 reachability fix). The chain surfaces
 * existed but were orphaned from /dashboard (primary nav only carries
 * Overview/Profile/Journal/Account). This pins the visible entry points so a
 * future edit cannot silently re-orphan them — no hidden route, no placeholder.
 */

const APP = resolve(__dirname, "..", "..");
function read(rel: string): string {
  return readFileSync(join(APP, rel), "utf8");
}

describe("dashboard surfaces the chain entry points", () => {
  it("the dashboard page mounts <DashboardChainActions />", () => {
    const page = read("app/[locale]/dashboard/page.tsx");
    expect(page).toMatch(/<DashboardChainActions\b/);
    expect(page).toMatch(
      /from\s+["']@\/components\/app\/dashboard-chain-actions["']/,
    );
  });

  it("the chain-actions card links to all real chain surfaces (real Links, no placeholder)", () => {
    const src = read("components/app/dashboard-chain-actions.tsx");
    for (const href of [
      "/dashboard/company",
      "/dashboard/agency",
      "/dashboard/inbox",
      "/dashboard/journal",
    ]) {
      expect(src.includes(`"${href}"`), `must link to ${href}`).toBe(true);
    }
    // Real navigation, not a disabled/placeholder affordance (strip comments —
    // the honest doc comment legitimately says "no disabled placeholders").
    expect(src).toMatch(/<Link\b/);
    const codeOnly = src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    expect(codeOnly).not.toMatch(/disabled|aria-disabled|coming\s*soon|cursor-not-allowed/i);
    // Role-aware: company/agency get invite + enable-review + review-inbox.
    expect(src).toMatch(/role === "company" \|\| role === "agency"/);
  });

  it("the accept-invitation surface is mounted on the dashboard too", () => {
    const page = read("app/[locale]/dashboard/page.tsx");
    expect(page).toMatch(/<WorkerInvitationsCard\b/);
  });
});

describe("chain-action copy exists (LT + EN) with the required next-action labels", () => {
  for (const locale of ["en", "lt"] as const) {
    it(`${locale}.json auth.dashboard.chainActions has the 4 next-action labels`, () => {
      const json = JSON.parse(read(`messages/${locale}.json`));
      const c = json.auth.dashboard.chainActions;
      for (const k of [
        "title",
        "subtitle",
        "inviteWorker",
        "enableReview",
        "reviewEntries",
        "workJournal",
      ]) {
        expect(c[k], `${locale}.chainActions.${k}`).toBeTruthy();
      }
    });
  }

  it("the LT labels match the owner-requested next actions", () => {
    const lt = JSON.parse(read("messages/lt.json")).auth.dashboard.chainActions;
    expect(lt.inviteWorker).toContain("Pakviesti darbuotoją");
    expect(lt.enableReview).toContain("Įjungti darbo žurnalo peržiūrą");
    expect(lt.reviewEntries).toContain("Peržiūrėti darbo įrašus");
  });
});

describe("the inbox review route is registered in the primary-route smoke", () => {
  it("primary-route-smoke lists /dashboard/inbox", () => {
    const smoke = read("lib/guards/primary-route-smoke.ts");
    expect(smoke).toMatch(/urlPattern:\s*["']\/dashboard\/inbox["']/);
  });
});
