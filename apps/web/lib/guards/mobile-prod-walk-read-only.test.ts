/**
 * GUARD — the production walk of the new mobile screens stays READ ONLY.
 *
 * `apps/mobile/.maestro/new-screens-walk.yaml` runs against PRODUCTION as the
 * owner's synthetic review identity (J-2, owner approval). It may open forms
 * and must leave each with Cancel; it may never tap a control that writes.
 * The dispatch switch defaults to off, so a plain dispatch behaves as before.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const REPO = resolve(__dirname, "../../../..");
const read = (p: string) => readFileSync(resolve(REPO, p), "utf8");

/** Every id the walk TAPS (tapOn followed by its id selector). */
function tapped(flow: string): string[] {
  return [...flow.matchAll(/-\s*tapOn:\s*\n\s*id:\s*"([^"]+)"/g)].map((m) => m[1]!);
}

/** Controls that write: save, confirm, review (prepare), shortlist, close /
 *  reopen, booking, offer answers, invitations. `submit` is the sign-in
 *  button and is the one exception. */
const WRITES = /(-save|-confirm|-review|shortlist|not-fit|need-close|need-reopen|-book|-accept|-decline|-agree|invite|add-programme|add-cohort|assign|-express|-propose|-write|-send)/;

describe("production new-screens walk", () => {
  const flow = read("apps/mobile/.maestro/new-screens-walk.yaml");

  it("taps no control that writes", () => {
    const taps = tapped(flow);
    expect(taps.length).toBeGreaterThan(10);
    expect(taps.filter((id) => WRITES.test(id))).toEqual([]);
  });

  it("never opens a need's candidate list: candidate.search writes a funnel row (R on #3484)", () => {
    expect(tapped(flow).filter((id) => id.startsWith("candidates-need-"))).toEqual([]);
    expect(flow).not.toMatch(/id:\s*"candidates-list/);
  });

  it("taps by id only — no text tap but the iOS system sheet, no point tap", () => {
    const textTaps = [...flow.matchAll(/-\s*tapOn:\s*\n\s*text:\s*"([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(textTaps)).toEqual(new Set(["Not Now"]));
    expect(flow).not.toMatch(/-\s*tapOn:\s*\n\s*point:/);
    expect(flow).not.toMatch(/-\s*tapOn:\s*"/);
  });

  it("walks the newer screens too: offers, opportunities, availability, the agency station", () => {
    for (const station of ["today-open-offers", "today-open-opportunities", "today-open-availability", "today-open-agency"]) {
      expect(tapped(flow), station).toContain(station);
    }
    // A loaded view or a named refusal, never a spinner.
    expect(flow).toMatch(/notVisible:\s*\n\s*id:\s*"capability-loading"/);
  });

  it("leaves every form it opens with Cancel", () => {
    for (const form of ["work", "education", "language"]) {
      expect(tapped(flow), form).toContain(`cv-${form}-cancel`);
    }
  });

  it("runs only when the dispatch asks for it", () => {
    for (const wf of [".github/workflows/android.yml", ".github/workflows/ios-signed-in.yml"]) {
      const text = read(wf);
      expect(text, wf).toMatch(/new_screens_walk:\n(?:.*\n){0,3}\s*type: boolean\n\s*required: false\n\s*default: false/);
      expect(text, wf).toContain("NEW_SCREENS_WALK: ${{ inputs.new_screens_walk && '1' || '0' }}");
    }
    expect(read(".github/scripts/android-emulator-signed-in-journey.sh")).toContain('if [ "${NEW_SCREENS_WALK:-0}" = 1 ]; then');
  });
});
