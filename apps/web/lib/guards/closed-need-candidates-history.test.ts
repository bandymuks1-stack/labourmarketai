import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * CANDIDATE LIFECYCLE (owner P0 2026-09-22 §12). A candidate on a CLOSED
 * need is a historical relationship, never an actionable one: the shortlist
 * rows stay for audit, but no new decision, contact or booking may be
 * started from a need that is not open — and that rule lives in the
 * business action, not only in the surface that hides the buttons.
 *
 * Production 2026-09-22: the ONE shortlist row sat on a closed need and the
 * scouting page still rendered live shortlist/contact/booking controls for it.
 */
const APP = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(APP, rel), "utf8");

describe("a closed need's candidates are history, not decisions", () => {
  it("setShortlist refuses a write on a closed need (server rule)", () => {
    const src = read("lib/scouting/scouting.ts");
    expect(src).toMatch(/\.select\("id, status"\)/);
    expect(src).toMatch(/if \(req\.status === "closed"\) return \{ kind: "closed" \};/);
    expect(src).toMatch(/\| \{ kind: "closed" \}/);
  });

  it("the scouting surface gates every candidate control on the need being open", () => {
    const page = read("app/[locale]/dashboard/company/scouting/page.tsx");
    expect(page).toMatch(/const needOpen = result\?\.kind === "ok" \? result\.demand\.status !== "closed" : true;/);
    // Contact / booking block and the shortlist buttons are both gated.
    expect(page).toMatch(/\{c\.canContact && needOpen \? \(/);
    expect(page).toMatch(/\{needOpen \? \(\s*<ScoutingShortlistButtons/);
    // …and the recorded decision is still shown, as a fact.
    expect(page).toMatch(/scout-shortlist-history-\$\{c\.workerId\}/);
    // The state is named to the person, in their language.
    expect(page).toMatch(/scouting-closed-history/);
    const lt = JSON.parse(read("messages/lt.json")) as { scouting: { lifecycle: Record<string, string> } };
    expect(lt.scouting.lifecycle.closedCandidatesHistory).toMatch(/uždarytas/i);
  });
});
