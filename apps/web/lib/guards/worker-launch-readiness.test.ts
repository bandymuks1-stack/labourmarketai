import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Worker Launch Readiness v1 — pinning guards for the limited worker-ad
 * launch. These lock the fixes that make the worker journey honest,
 * measurable and non-dead-end:
 *
 *   1. Manual work-experience entry exists (a worker with no CV can still
 *      record a job + month/year period) and writes through the SAME
 *      canonical RPC the CV import uses — no new table, no migration.
 *   2. Ambiguous profile fields carry cross-sector example placeholders
 *      (tester feedback: "fields lack examples", "too construction-heavy").
 *   3. Email signup can never become a silent dead-end if Supabase
 *      "Confirm email" is toggled ON (defensive `check_email` state).
 *   4. Google signup is counted in the acquisition funnel (registration
 *      context), so a paid worker-ad campaign is measurable.
 *   5. The /for-workers hero CTA signals that registration is free, and the
 *      cross-border claim is capability framing (not a hard country list
 *      that over-promises live demand).
 *
 * Pure source + message-catalog scan. No network, no DB.
 */

const APP_ROOT = process.cwd();
const read = (rel: string): string => readFileSync(join(APP_ROOT, rel), "utf-8");
const msg = (loc: string): Record<string, unknown> =>
  JSON.parse(read(join("messages", `${loc}.json`)));

const ACTIVE = ["lt", "en", "ru", "nl", "de"] as const;

function deep(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, k) => {
    if (acc && typeof acc === "object") return (acc as Record<string, unknown>)[k];
    return undefined;
  }, obj);
}

describe("worker launch — manual work-experience entry (no CV required)", () => {
  const src = read("components/app/capability-profile-section.tsx");
  it("wires the manual add-experience form to the canonical CV-import RPC action", () => {
    expect(src).toContain("confirmCvWorkHistoryAction");
    expect(src).toContain("addExperienceTitle");
    expect(src).toContain('data-testid="add-experience-form"');
    // Supports an ongoing/current role (no forced end date).
    expect(src).toContain("expCurrent");
  });
  it("every active locale defines the add-experience keys with parity", () => {
    const keys = [
      "addExperienceTitle",
      "expTitleLabel",
      "expTitlePlaceholder",
      "expStartLabel",
      "expEndLabel",
      "expOngoing",
      "expSave",
      "expInvalid",
      "expError",
    ];
    for (const loc of ACTIVE) {
      const cap = deep(msg(loc), "capabilityProfile") as Record<string, unknown>;
      for (const k of keys) {
        expect(typeof cap?.[k], `${loc}.capabilityProfile.${k}`).toBe("string");
        expect((cap[k] as string).trim().length).toBeGreaterThan(0);
      }
    }
  });
});

describe("worker launch — cross-sector example placeholders", () => {
  it("the job-title example is cross-sector, not construction-only (lt + en)", () => {
    // Must include a clearly non-construction occupation so the field does not
    // read as trades-only. LT 'slaugytoja' (nurse) / EN 'nurse'.
    const lt = deep(msg("lt"), "capabilityProfile.expTitlePlaceholder") as string;
    const en = deep(msg("en"), "capabilityProfile.expTitlePlaceholder") as string;
    expect(lt.toLowerCase()).toContain("slaugytoj");
    expect(en.toLowerCase()).toContain("nurse");
  });
  it("education inputs carry example placeholders in every active locale", () => {
    const eduSrc = read("components/app/worker-education-section.tsx");
    expect(eduSrc).toContain("institutionPlaceholder");
    expect(eduSrc).toContain("programPlaceholder");
    expect(eduSrc).toContain("yearPlaceholder");
    for (const loc of ACTIVE) {
      const edu = deep(msg(loc), "cvSections.education") as Record<string, unknown>;
      for (const k of ["institutionPlaceholder", "programPlaceholder", "yearPlaceholder"]) {
        expect(typeof edu?.[k], `${loc}.cvSections.education.${k}`).toBe("string");
      }
    }
  });
  it("salary inputs carry numeric example placeholders", () => {
    const src = read("components/app/work-card-editor.tsx");
    expect(src).toContain('placeholder="1500"');
    expect(src).toContain('placeholder="2500"');
  });
});

describe("worker launch — email signup is never a silent dead-end", () => {
  const src = read("components/app/signup-form.tsx");
  it("handles the confirm-email (no-session) branch instead of blindly redirecting", () => {
    expect(src).toContain("check_email");
    expect(src).toContain("data.session");
    expect(src).toContain('data-testid="signup-check-email"');
  });
  it("marks the signup pending so signup_completed fires on the next authed surface", () => {
    expect(src).toContain('markSignupPending("email")');
  });
  it("check_email copy exists in every active locale", () => {
    for (const loc of ACTIVE) {
      const s = deep(msg(loc), "auth.signup") as Record<string, unknown>;
      expect(typeof s?.check_email_title, `${loc} check_email_title`).toBe("string");
      expect(typeof s?.check_email_body, `${loc} check_email_body`).toBe("string");
    }
  });
});

describe("worker launch — Google signup is measurable", () => {
  it("the Google button counts a registration attempt in signup context", () => {
    const src = read("components/app/google-button.tsx");
    expect(src).toContain("registrationStarted");
    expect(src).toContain('context === "signup"');
    expect(src).toContain('markSignupPending("google")');
  });
  it("the signup form passes signup context to the Google button", () => {
    expect(read("components/app/signup-form.tsx")).toContain('context="signup"');
  });
});

describe("worker launch — honest, free-signalling landing copy", () => {
  it("the /for-workers hero CTA signals registration is free (lt + en)", () => {
    const lt = deep(msg("lt"), "pages.workers.cta") as string;
    const en = deep(msg("en"), "pages.workers.cta") as string;
    expect(lt.toLowerCase()).toContain("nemokam");
    expect(en.toLowerCase()).toContain("free");
  });
  it("the cross-border claim no longer hard-lists five specific countries", () => {
    for (const loc of ACTIVE) {
      const desc = deep(msg(loc), "workers.features.items.2.desc") as string;
      // The old over-promise listed "NL, DK, DE, SE, NO"; capability framing
      // must not reassert that exact hard list.
      expect(desc).not.toMatch(/NL,\s*DK,\s*DE,\s*SE,\s*NO/);
    }
  });
});
