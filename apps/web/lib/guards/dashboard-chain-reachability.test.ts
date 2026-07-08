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
  it("the dashboard keeps the org chain entry points + a Next Action in both branches", () => {
    const page = read("app/[locale]/dashboard/page.tsx");
    expect(page).toMatch(
      /from\s+["']@\/components\/app\/dashboard-chain-actions["']/,
    );
    // The dashboard has TWO return branches: company/agency/customer
    // (role !== "worker") and worker. The org branch keeps the chain-actions
    // grid so an owner always has the invite / enable-review / review-inbox
    // entry points (slice role-next-action-simplicity-v1 removed the worker's
    // lone "Work journal" chain card — it duplicated the Next Action + Proof
    // card; the journal stays reachable via primary nav + those surfaces).
    expect((page.match(/<DashboardChainActions\b/g) ?? []).length).toBeGreaterThanOrEqual(1);
    // Neither user lands without a clear next move + the accept-invitation card.
    // The ORG branch surfaces the role-based <DashboardNextAction>; the WORKER
    // branch surfaces its single best next action via the hub person block's
    // folded editor (workEditor) — the WorkCard was removed (dedup v1) and its
    // state-aware next action + inline editor moved into the hub Asmens kortelė.
    expect((page.match(/<DashboardNextAction\b/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect(page).toMatch(/workEditor=\{workEditor\}/);
    expect((page.match(/<WorkerInvitationsCard\b/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it("the chain-actions card links to all real chain surfaces (real Links, no placeholder)", () => {
    const src = read("components/app/dashboard-chain-actions.tsx");
    for (const href of [
      // Audit PR4: invite + enable-review deep-link the exact team control
      // (#company-team) instead of the top of the longest page in the app;
      // the agency room is a redirect stub that would drop the anchor.
      "/dashboard/company#company-team",
      "/dashboard/inbox",
      "/dashboard/journal",
      "/dashboard/buyer",
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
    // Role-aware: the customer/buyer overview reaches its requests workspace.
    expect(src).toMatch(/role === "customer"/);
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
