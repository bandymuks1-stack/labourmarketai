import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { AUTH_INPUT_CLASS } from "@/components/app/auth-field-class";

/**
 * AUTHENTICATION FIELDS MEET THE PRODUCT'S TOUCH FLOOR — IN ONE PLACE.
 *
 * Production measurement (2026-08-08, 320px and 412px) found the email and
 * password inputs rendering 42px: two pixels under the 44px floor the rest of
 * the product keeps, on the first screen a new user touches and the one they
 * return to when something has gone wrong.
 *
 * The cause was not one bad number — it was FOUR. The identical class string
 * was copy-pasted into login, signup, forgot-password and reset-password, each
 * declaring its own local `inputCls`. A fix could land in one and silently miss
 * the other three.
 *
 * So this guard pins two things, and the second is the one that lasts:
 *   1. the shared class carries the floor;
 *   2. no auth form re-declares its own field class.
 *
 * Read from the real exported constant and the real form sources — not from a
 * comment mentioning a utility name.
 */

const REPO_ROOT = resolve(__dirname, "../..");
const AUTH_FORMS = [
  "login-form",
  "signup-form",
  "forgot-password-form",
  "reset-password-form",
] as const;

function readForm(name: string): string {
  return readFileSync(
    resolve(REPO_ROOT, `components/app/${name}.tsx`),
    "utf8",
  );
}

describe("auth field touch floor", () => {
  it("the shared auth field class carries the 44px minimum", () => {
    expect(AUTH_INPUT_CLASS).toContain("min-h-[2.75rem]");
  });

  it("keeps the existing visual design — padding and colours unchanged", () => {
    // The minimum only takes effect where the box was already too short; this
    // guard exists so a future "fix" cannot quietly restyle the auth surface
    // under cover of an accessibility change.
    expect(AUTH_INPUT_CLASS).toContain("px-3");
    expect(AUTH_INPUT_CLASS).toContain("py-2.5");
    expect(AUTH_INPUT_CLASS).toContain("bg-ink-800");
  });

  it.each(AUTH_FORMS)("%s uses the shared class", (name) => {
    expect(readForm(name)).toContain("AUTH_INPUT_CLASS");
  });

  it.each(AUTH_FORMS)("%s does NOT re-declare a local field class", (name) => {
    // THE ACTUAL REGRESSION SHAPE: four independent copies of one string. A
    // local `inputCls` here is how the drift starts again.
    expect(readForm(name)).not.toMatch(/const\s+inputCls\s*=/);
  });

  it("no auth form hard-codes the old 42px geometry", () => {
    // `py-2.5` alone is fine — it is in the shared class. What must never
    // reappear is a field class WITHOUT the minimum beside it.
    for (const name of AUTH_FORMS) {
      const src = readForm(name);
      const fieldClasses = src.match(/"w-full[^"]*px-3 py-2\.5[^"]*"/g) ?? [];
      for (const c of fieldClasses) {
        expect(c, `${name} declares a field class without the touch floor`).toContain(
          "min-h-[2.75rem]",
        );
      }
    }
  });
});
