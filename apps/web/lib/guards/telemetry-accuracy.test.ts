import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Telemetry-accuracy guards (findings F-T4/F-T5/F-T6/F-T7 of the
 * full-project audit 2026-07-02).
 *
 * Contract:
 *   - SessionTelemetry is mounted on the onboarding page, not only the
 *     dashboard layout — new users onboard BEFORE any dashboard mounts, so
 *     login_succeeded must not invert with onboarding_started. The mount
 *     carries surface="onboarding": that is the ONE surface allowed to emit
 *     signup_completed from the pending marker (google-new-user honesty).
 *   - Failure branches fire success:false (a broken save path must be
 *     distinguishable from user disinterest).
 *   - Demand-draft failures go through errorTask (result='error'), never
 *     recordEvent("task_error", ...) which lands as result='info'.
 *   - The TelemetryView dedup key includes the surface, so two surfaces
 *     sharing one event name dedupe independently.
 */

const APP = join(process.cwd());
const read = (rel: string) => readFileSync(join(APP, rel), "utf-8");

describe("login_succeeded covers onboarding (F-T4)", () => {
  it("SessionTelemetry is mounted on the onboarding page", () => {
    const page = read("app/[locale]/onboarding/page.tsx");
    // The onboarding mount is also the ONE signup_completed-emitting surface
    // (see lib/guards/google-same-tab-redirect.test.ts), so the guard pins
    // the surface prop, not just the bare mount.
    expect(page).toMatch(/<SessionTelemetry surface="onboarding" \/>/);
  });
});

describe("failures fire success:false (F-T5)", () => {
  const CASES: Array<[string, string]> = [
    ["components/app/profile-text-first-flow.tsx", "profileSaved"],
    ["components/app/profile-avatar.tsx", "avatarUploadSucceeded"],
    ["components/app/market-map-capture.tsx", "preferredLocationSaved"],
    ["components/app/marketplace-loop-section.tsx", "serviceRequestSent"],
    ["components/app/demand-draft-form.tsx", "demandSaved"],
  ];
  for (const [file, event] of CASES) {
    it(`${file} fires ${event} with success:false on failure`, () => {
      const src = read(file);
      expect(src).toMatch(/success:\s*false/);
      expect(src).toContain(event);
    });
  }
});

describe("demand-draft failures land as result='error' (F-T6)", () => {
  it("uses errorTask, not recordEvent('task_error')", () => {
    const src = read("components/app/demand-draft-form.tsx");
    expect(src).toMatch(/errorTask\("demand_draft_save"/);
    expect(src).not.toMatch(/recordEvent\("task_error"/);
  });
});

describe("view dedup is per (event, surface) (F-T7)", () => {
  it("TelemetryView keys sessionStorage on event + surface", () => {
    const src = read("components/app/telemetry-view.tsx");
    expect(src).toMatch(/lm\.funnel\.\$\{event\}\$\{surface\}/);
    expect(src).toMatch(/metadata\?\.surface/);
  });
});

describe("W5 pilot measurement stays PII-free", () => {
  it("the onboarding step events carry only step/role_context metadata", () => {
    const wizard = read("components/app/onboarding-wizard.tsx");
    const calls = wizard
      .split("trackFunnel(")
      .slice(1)
      .map((s) => s.slice(0, s.indexOf(");") + 1));
    const stepCalls = calls.filter((c) =>
      /onboardingStep(Role|Profile)Completed/.test(c),
    );
    expect(stepCalls.length).toBe(2);
    for (const call of stepCalls) {
      // Only the two bounded, allowlisted keys — never a name / email /
      // country / free-text value.
      const metaKeys = [...call.matchAll(/(\w+):/g)].map((m) => m[1]);
      for (const key of metaKeys) {
        expect(["step", "role_context"]).toContain(key);
      }
    }
  });

  it("pilot_outcomes' only free text is the 500-char-bounded note", () => {
    const migration = readFileSync(
      join(APP, "..", "..", "supabase", "migrations",
        "20260716140000_pilots_cohort_v1.sql"),
      "utf-8",
    );
    expect(migration).toMatch(/char_length\(note\) <= 500/i);
  });
});
