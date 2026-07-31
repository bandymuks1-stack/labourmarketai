import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

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

/** Every product source file, POSIX-relative to apps/web. Tests are excluded:
 *  a guard naming the action is not a second write path. */
function sourceFiles(dir = APP): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === ".next" || e.name === "tests") continue;
    const abs = join(dir, e.name);
    if (e.isDirectory()) {
      out.push(...sourceFiles(abs));
    } else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) {
      out.push(relative(APP, abs).split("\\").join("/"));
    }
  }
  return out;
}

describe("dashboard surfaces the chain entry points", () => {
  it("the dashboard keeps the org chain entry points + a Next Action in both branches", () => {
    const page = read("app/[locale]/dashboard/advanced/page.tsx");
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
    // W3 row 1: the folded work editor is NOT on this page any more. It moved
    // with the person card into the `player-card` RESULT, so BOTH halves are
    // pinned — gone from here, and really rendered there. A guard that only
    // checked the first half would pass if the editor had been thrown away.
    expect(page).not.toMatch(/workEditor/);
    expect(read("components/app/workspace/player-card-result.tsx")).toMatch(
      /<WorkCardEditor/,
    );
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
      // Rebuild W5: the customer chain links the CANONICAL company workspace
      // — /dashboard/buyer is DUPLICATE_DRIFT and gets no live inbound links.
      "/dashboard/company",
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

  /**
   * W3 row 6 — the accept-invitation surface MOVED; it was not deleted.
   *
   * Both halves are pinned, and that is the whole point: a guard that only
   * checked the first half would pass just as happily if the capability had
   * been thrown away with the card.
   */
  it("the accept-invitation surface left /dashboard/advanced", () => {
    const page = read("app/[locale]/dashboard/advanced/page.tsx");
    expect(page).not.toMatch(/<WorkerInvitationsCard\b/);
    expect(page).not.toMatch(/worker-invitations-card/);
  });

  it("...and landed in the Context Panel's work context, mounted once", () => {
    const panel = read("components/app/world-state/context-panel.tsx");
    const mounts = panel.match(/<WorkerInvitations\b/g) ?? [];
    expect(mounts, "exactly one mount — two would be the old duplication").toHaveLength(1);
    expect(panel).toMatch(
      /import \{ WorkerInvitations \} from "@\/components\/app\/worker-invitations"/,
    );
    // The rows and the copy come from the work context the panel already
    // reads — no second read, no fetch of its own.
    expect(panel).toMatch(/work\.invitations\.rows/);
    expect(panel).toMatch(/work\.invitations\.labels/);
    // Attention before geography: on a phone the sheet is ~45dvh, and behind
    // the map the accept button is a scroll away from the notification that
    // sent the person here.
    expect(panel.indexOf("<WorkerInvitations")).toBeLessThan(
      panel.indexOf("<WorkspaceMap"),
    );

    const server = read("lib/world-state/work-context-server.ts");
    expect(server).toMatch(
      /import \{\s*listMyPendingWorkerInvitations,/,
    );
  });

  it("the accept action still has exactly ONE caller and ONE write path", () => {
    // The reason this row was cheap: unlike row 5 there was no second write
    // path to collapse. Moving the control must not have created one — so the
    // whole tree is scanned, not a hand-written file list.
    const callers = sourceFiles()
      .filter((rel) => rel !== "lib/worker/invitation-actions.ts")
      .filter((rel) => read(rel).includes("acceptWorkerInvitationAction"));
    expect(callers.sort()).toEqual(["components/app/worker-invitations.tsx"]);
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
