import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

/**
 * Guard: the work-journal review chain must be REACHABLE from the logged-in
 * product (slice sales-core-nonstop-v1 reachability fix). W3 Package 4
 * deleted the second dashboard and its chain-actions card, so the chain now
 * lives on its canonical surfaces: the work editor in the player-card
 * result, the invitations in the Context Panel's work context, and the
 * review inbox route. This pins those homes so a future edit cannot
 * silently re-orphan them — no hidden route, no placeholder.
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

describe("the chain capabilities live on their canonical surfaces", () => {
  it("the worker's folded work editor is really rendered in the player-card result", () => {
    // W3 row 1 moved the editor with the person card into the `player-card`
    // RESULT; W3 Package 4 then deleted the advanced page it came from. The
    // surviving half of that move stays pinned — this is where the editor
    // must actually render, or the capability was thrown away, not moved.
    expect(read("components/app/workspace/player-card-result.tsx")).toMatch(
      /<WorkCardEditor/,
    );
  });

  // W3 row 6 — the accept-invitation surface MOVED to the Context Panel; W3
  // Package 4 deleted the advanced page it left, so only the destination
  // half needs pinning now (absence is owned by the deletion ratchet).
  it("the accept-invitation surface lives in the Context Panel's work context, mounted once", () => {
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

// The chain-actions card and its auth.dashboard.chainActions copy were
// deleted with the second dashboard (W3 Package 4), so the copy checks left
// with them — there is no surviving surface that reads those keys.

describe("the inbox review route is registered in the primary-route smoke", () => {
  it("primary-route-smoke lists /dashboard/inbox", () => {
    const smoke = read("lib/guards/primary-route-smoke.ts");
    expect(smoke).toMatch(/urlPattern:\s*["']\/dashboard\/inbox["']/);
  });
});
