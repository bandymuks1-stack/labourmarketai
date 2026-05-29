import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  computeEngagementBridgeReadiness,
  EMPLOYMENT_ENGAGEMENT_BRIDGE_LIVE,
} from "@/lib/operations/engagement-bridge";

/**
 * Guards for the engagement-context ops bridge v1
 * (slice engagement-context-ops-bridge-v1):
 *   - journal review can never be ready/enabled without a real context link;
 *   - foreman / project_manager are never reviewers from a label alone;
 *   - the UI never claims review is active unless the helper says so, and the
 *     review toggle stays disabled;
 *   - the bridge reason copy carries no fake review/approval/AI claims;
 *   - the slice adds NO migration and NO approve/reject control.
 */

const APP = resolve(__dirname, "..", "..");
const REPO = resolve(APP, "..", "..");
function read(rel: string): string {
  return readFileSync(join(APP, rel), "utf8");
}

// ── 1. journal_review cannot be enabled without bridge/context ──────────

describe("review readiness requires a real engagement-context link", () => {
  it("the production bridge flag is OFF (no relationship is linked yet)", () => {
    expect(EMPLOYMENT_ENGAGEMENT_BRIDGE_LIVE).toBe(false);
  });

  it("a reviewer role + review flag, but no context, never becomes ready", () => {
    const r = computeEngagementBridgeReadiness({
      relationshipExists: true,
      operationsRole: "company_admin",
      journalReviewEnabled: true,
      engagementContextLinked: false,
    });
    expect(r.state).toBe("missing_engagement_context");
    expect(r.bridgeReady).toBe(false);
    expect(r.reviewActive).toBe(false);
  });
});

// ── 2. foreman / PM are never reviewers from a label alone ──────────────

describe("foreman / project_manager never become reviewers from a label", () => {
  for (const role of ["foreman", "project_manager"]) {
    it(`${role} stays not_enabled even with review flag + a context link`, () => {
      const r = computeEngagementBridgeReadiness({
        relationshipExists: true,
        operationsRole: role,
        journalReviewEnabled: true,
        engagementContextLinked: true,
      });
      expect(r.state).toBe("not_enabled");
      expect(r.bridgeReady).toBe(false);
      expect(r.reviewActive).toBe(false);
    });
  }
});

// ── 3. The control UI is honest ─────────────────────────────────────────

describe("WorkerOperationsRoleForm renders an honest, never-active toggle", () => {
  const src = read("components/app/worker-operations-role-form.tsx");

  it("drives the bridge from the LIVE flag, never a hardcoded link=true", () => {
    expect(src).toMatch(/computeEngagementBridgeReadiness/);
    expect(src).toMatch(
      /engagementContextLinked:\s*EMPLOYMENT_ENGAGEMENT_BRIDGE_LIVE/,
    );
    expect(src).not.toMatch(/engagementContextLinked:\s*true/);
  });

  it("keeps the review checkbox disabled + unchecked (never active)", () => {
    expect(src).toMatch(/type="checkbox"/);
    expect(src).toMatch(/checked=\{false\}/);
    expect(src).toMatch(/\bdisabled\b/);
    // The affirmative "ready" styling is gated on bridge.bridgeReady only.
    expect(src).toMatch(/bridge\.bridgeReady\s*\?/);
    expect(src).toMatch(/data-review-active=/);
  });

  it("exposes no approve/reject control", () => {
    expect(src).not.toMatch(/data-testid="[^"]*(approve|reject)[^"]*"/i);
    expect(src).not.toMatch(/confirmEntry|rejectEntry/);
  });
});

// ── 4. Bridge reason copy is present + clean (LT + EN) ───────────────────

describe("bridge reason copy is present and carries no fake claims", () => {
  const FORBIDDEN = [
    "verified",
    "approved",
    "guaranteed",
    "patvirtinta",
    "ai ",
    "best match",
  ];
  for (const [locale, missing] of [
    ["lt", "Darbo žurnalo kontekstas dar nesujungtas."],
    ["en", "Work journal context is not connected yet."],
  ] as const) {
    it(`${locale}.json carries bridge reasons for company + agency, no fake claims`, () => {
      const json = JSON.parse(read(`messages/${locale}.json`));
      for (const ns of ["company", "agency"] as const) {
        const assign = json.roleDashboards[ns].workers.operations.assign;
        expect(assign.bridgeReasons.missing_engagement_context).toContain(
          missing,
        );
        expect(assign.readyForSetup).toBeTruthy();
        // All 7 bridge states have copy.
        for (const s of [
          "connected",
          "review_not_enabled",
          "missing_engagement_context",
          "role_not_assigned",
          "relationship_not_found",
          "not_allowed",
          "not_enabled",
        ]) {
          expect(assign.bridgeReasons[s], `${locale}.${ns}.${s}`).toBeTruthy();
        }
        const flat = JSON.stringify(assign).toLowerCase();
        for (const phrase of FORBIDDEN) {
          expect(flat.includes(phrase), `${locale}.${ns} "${phrase}"`).toBe(
            false,
          );
        }
      }
    });
  }
});

// ── 5. No migration added by this slice ─────────────────────────────────

describe("engagement-bridge v1 is app-only (no DB change)", () => {
  it("supabase/migrations has no 0032+ file from this slice", () => {
    const dir = resolve(REPO, "supabase", "migrations");
    const files = readdirSync(dir).filter((f) => f.endsWith(".sql"));
    // 0031 is the latest applied migration; this slice adds none.
    expect(files.some((f) => /^003[2-9]/.test(f))).toBe(false);
  });

  it("the engagement-bridge helper is pure (no server-only / external imports)", () => {
    const helper = read("lib/operations/engagement-bridge.ts");
    for (const re of [
      /import\s+["']server-only["']/,
      /from\s+["']openai["']/i,
      /from\s+["']@anthropic/i,
      /from\s+["']stripe["']/i,
      /navigator\.geolocation/i,
    ]) {
      expect(re.test(helper), `must not match ${re}`).toBe(false);
    }
  });
});
