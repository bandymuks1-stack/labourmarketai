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
  it("the bridge path is live (provisioning RPC + per-row read shipped)", () => {
    expect(EMPLOYMENT_ENGAGEMENT_BRIDGE_LIVE).toBe(true);
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

describe("WorkerOperationsRoleForm renders an honest, context-gated toggle", () => {
  const src = read("components/app/worker-operations-role-form.tsx");

  it("drives the bridge from the REAL per-row read, never a hardcoded link=true", () => {
    expect(src).toMatch(/computeEngagementBridgeReadiness/);
    // The readiness call is fed by the per-relationship prop (object shorthand),
    // and the prop is destructured from props with a safe default — not a
    // constant or a literal.
    expect(src).toMatch(/engagementContextLinked\s*=\s*false/);
    expect(src).toMatch(/relationshipExists:\s*true,[\s\S]*?engagementContextLinked,/);
    expect(src).not.toMatch(/engagementContextLinked:\s*true\b/);
    // The blunt global flag is no longer used as a per-row substitute.
    expect(src).not.toMatch(/engagementContextLinked:\s*EMPLOYMENT_ENGAGEMENT_BRIDGE_LIVE/);
  });

  it("the review checkbox reflects the REAL state and is disabled until bridge-ready", () => {
    expect(src).toMatch(/type="checkbox"/);
    // Checked mirrors the real reviewActive verdict (never a fake active state).
    expect(src).toMatch(/checked=\{bridge\.reviewActive\}/);
    // Disabled unless the relationship is genuinely bridge-ready.
    expect(src).toMatch(/disabled=\{!bridge\.bridgeReady\}/);
    expect(src).toMatch(/data-review-active=/);
  });

  it("only offers the enable/disable toggle when bridge-ready, with a blocker otherwise", () => {
    // The interactive submit control is gated on bridge.bridgeReady.
    expect(src).toMatch(/bridge\.bridgeReady\s*\?/);
    expect(src).toMatch(/worker-ops-review-submit-/);
    // An explicit disabled-state blocker note is shown when not ready.
    expect(src).toMatch(/worker-ops-review-disabled-note-/);
    expect(src).toMatch(/blockerNotReady/);
    // Enabling only ever requests review for a real, ready relationship — the
    // RPC re-checks the engagement context; the UI never forces it on.
    expect(src).toMatch(/name="enabled"/);
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

describe("engagement-bridge readiness helper stays pure + migration scope is bounded", () => {
  it("the enable-review slice adds exactly migration 0033 (and nothing beyond yet)", () => {
    const dir = resolve(REPO, "supabase", "migrations");
    const files = readdirSync(dir).filter((f) => f.endsWith(".sql"));
    // The readiness classifier (PR #141) added no migration; provisioning RPCs
    // are 0032; THIS slice (journal-review-enable-toggle-v1) ships 0033 with the
    // context-gated set_*_journal_review + per-row read RPCs (own SQL guard:
    // journal-review-enable-rpc.test.ts). Nothing ≥ 0034 is expected here.
    expect(files.some((f) => /^0033_/.test(f))).toBe(true);
    expect(files.some((f) => /^003[4-9]/.test(f))).toBe(false);
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
