import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * W7-S2 — `worker-availability-prefs-form` accessibility + touch ergonomics.
 *
 * Measured on `origin/main` 5d611300, in the browser, scoped to this component:
 *   • 0 unlabelled perceivable inputs and 0 unnamed controls in the ARIA tree
 *     — the audit's headline "34 unlabelled inputs" counted `input[type=hidden]`
 *     across the whole page and overstated the real debt (§4 of the doc);
 *   • 36 of 40 interactive controls under 44px (tri-state 32px, licence 30px);
 *   • TEN `role="radiogroup"`s each exposing THREE tabbable radios, and no
 *     arrow-key handling — the radiogroup contract was announced but not kept.
 *
 * This guard pins the fixes and the business shape. It deliberately asserts
 * SEMANTICS and the size utility, not markup structure, so ordinary styling
 * work does not trip it.
 */

const WEB = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(WEB, rel), "utf8");

const FORM_REL = "components/app/worker-availability-prefs-form.tsx";
const FORM = read(FORM_REL);
/** Comments stripped — the docstrings legitimately NAME the traps they avoid
 *  ("migration", "tab stop"), and prose must never fail a code assertion. */
const FORM_CODE = FORM.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
const MODEL = read("lib/worker/availability-prefs-model.ts");

describe("W7-S2 — the radiogroup contract is actually kept", () => {
  it("exactly one option per group is tabbable (roving tabindex)", () => {
    expect(FORM).toMatch(/tabIndex=\{selected \? 0 : -1\}/);
  });

  it("arrow keys, Home and End move the selection", () => {
    for (const key of ["ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown", "Home", "End"]) {
      expect(FORM, `${key} must be handled`).toContain(`"${key}"`);
    }
    // Moving the selection must also move focus, or the roving tabindex
    // strands the user on a now-untabbable control.
    expect(FORM).toMatch(/refs\.current\[next\]\?\.focus\(\)/);
  });

  it("the group is named by its VISIBLE label, not a duplicated string", () => {
    expect(FORM).toMatch(/aria-labelledby=\{labelId\}/);
    expect(FORM).toMatch(/<Label id=\{labelId\}>/);
    // A duplicated aria-label can drift away from the visible text.
    expect(FORM).not.toMatch(/role="radiogroup"[\s\S]{0,120}aria-label=/);
  });

  it("still exposes radiogroup/radio semantics with a checked state", () => {
    expect(FORM).toMatch(/role="radiogroup"/);
    expect(FORM).toMatch(/role="radio"/);
    expect(FORM).toMatch(/aria-checked=\{selected\}/);
  });
});

describe("W7-S2 — touch targets", () => {
  it("tri-state options, licence chips and save all carry the 44px floor", () => {
    // `min-h-11` = 2.75rem = 44px.
    expect((FORM.match(/min-h-11/g) ?? []).length).toBeGreaterThanOrEqual(3);
    // A chip is narrow as well as short, so it needs the width floor too.
    expect(FORM).toMatch(/min-h-11 min-w-11/);
  });

  it("the floor is applied at the call site, not by resizing the shared Button", () => {
    // Changing the shared `sm` size would resize every small button in the app.
    // Desktop stays pinned at 36px (px-4 py-2). The `max-md:py-2.5` suffix is
    // the window-6 mobile tap floor (40px on phones only) — see
    // lib/guards/mobile-tap-targets.test.ts; it is not a 44px call-site floor.
    const button = read("components/ui/Button.tsx");
    expect(button).toMatch(/sm:\s*"px-4 py-2 max-md:py-2\.5 text-sm"/);
  });
});

describe("W7-S2 — selection is never colour-only", () => {
  it("a selected control renders a non-colour mark", () => {
    expect((FORM.match(/data-selected-mark="true"/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(FORM).toMatch(/<Check\b/);
  });

  it("the mark is out of the text flow so labels cannot truncate", () => {
    // Inline, the mark stole ~14px from an 88px segment and rendered
    // "Nenuro…" inside the v2 fieldset at 375.
    expect(FORM).toMatch(/absolute left-1 top-1/);
    expect(FORM).not.toMatch(/<span className="truncate">\{options\[opt\]\}<\/span>/);
  });
});

describe("W7-S2 — every control keeps an accessible name", () => {
  it("licence chips name the category, not a bare letter", () => {
    // In a screen reader's button rotor the group name is not announced, so
    // five buttons called "B, BE, C, CE, D" would be meaningless there.
    expect(FORM).toMatch(/aria-label=\{`\$\{label\}: \$\{cat\}`\}/);
  });

  it("the two real text fields stay inside their <label>", () => {
    expect(FORM).toMatch(/<label className="flex flex-col gap-1\.5">[\s\S]{0,400}name="max_trip_days"/);
    expect(FORM).toMatch(/<label className="flex flex-col gap-1\.5">[\s\S]{0,400}name="availability_note"/);
  });
});

describe("W7-S2 — business semantics are untouched", () => {
  it("the three tri-state values and their order are unchanged", () => {
    expect(MODEL).toMatch(
      /TRI_STATE_VALUES[^=]*=\s*\[\s*"not_stated"\s*,\s*"yes"\s*,\s*"no"\s*\]/,
    );
  });

  it("the five driving-licence categories are unchanged", () => {
    expect(MODEL).toMatch(
      /DRIVING_LICENCE_CATEGORIES\s*=\s*\[\s*"B"\s*,\s*"BE"\s*,\s*"C"\s*,\s*"CE"\s*,\s*"D"\s*\]/,
    );
  });

  it("every field still submits through its hidden input, by the same name", () => {
    for (const name of [
      "willing_to_relocate",
      "needs_accommodation",
      "has_transport",
      "team_available",
      "solo_available",
      "max_trip_days",
      "preferred_contract_type",
      "availability_note",
      "driving_licence_categories",
    ]) {
      expect(FORM, `${name} must still be submitted`).toContain(`"${name}"`);
    }
  });

  it("the writer is unchanged — the same server action, no new write path", () => {
    expect(FORM).toMatch(/saveWorkerAvailabilityPrefsAction/);
    expect((FORM_CODE.match(/useActionState</g) ?? []).length).toBe(1);
    // No direct client write may appear in a presentation-only slice.
    expect(FORM_CODE).not.toMatch(/createClient|\.from\(|\.rpc\(/);
  });

  it("the honest not-stated / needs-migration / v2-gating states survive", () => {
    expect(FORM).toMatch(/needsMigration \?/);
    expect(FORM).toMatch(/v2Enabled \?/);
    expect(FORM).toMatch(/labels\.triState\.not_stated/);
  });

  it("no migration rides along with this slice", () => {
    // A presentation slice that needs schema is a different slice.
    expect(FORM_CODE).not.toMatch(/alter table|create table|supabase\.rpc/i);
  });
});
