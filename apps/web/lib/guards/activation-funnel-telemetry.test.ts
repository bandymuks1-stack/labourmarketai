import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  FUNNEL_EVENTS,
  FUNNEL_EVENT_NAMES,
  type FunnelEventName,
} from "@/lib/telemetry/funnel-events";

/**
 * Pinning tests for the P0-A Activation Funnel Telemetry (see
 * runtime/audits/p0-activation-telemetry-repair-plan-2026-06-30.md).
 *
 * Guards:
 *   - all funnel event names exist in the registry;
 *   - the registry / metadata shape carries NO forbidden PII keys;
 *   - the funnel goes through the EXISTING RLS-safe pipe (no service_role,
 *     no profile_id passed from the client, no new DB/RLS dependency);
 *   - the key surfaces actually emit their funnel events;
 *   - no demo/pilot-product / preview copy and no legacy LABMA / old
 *     project-name terminology was introduced by the new telemetry files.
 */

const APP_ROOT = process.cwd();
function readApp(rel: string): string {
  return readFileSync(join(APP_ROOT, rel), "utf-8");
}

// The complete funnel contract (P0-A scope). Order-independent.
const EXPECTED_EVENTS = [
  "login_started",
  "login_succeeded",
  "onboarding_started",
  "onboarding_completed",
  "dashboard_viewed",
  "first_action_card_viewed",
  "first_action_card_clicked",
  "profile_viewed",
  "profile_edit_started",
  "profile_saved",
  "avatar_upload_started",
  "avatar_upload_succeeded",
  "preferred_location_viewed",
  "preferred_location_add_started",
  "preferred_location_saved",
  "journal_viewed",
  "journal_entry_started",
  "journal_entry_saved",
  "company_dashboard_viewed",
  "company_demand_action_clicked",
  "demand_form_viewed",
  "demand_saved",
  "marketplace_or_opportunities_viewed",
  "service_request_started",
  "service_request_sent",
  "return_visit_detected",
] as const;

describe("activation funnel — event registry", () => {
  it("defines every expected funnel event exactly once", () => {
    for (const e of EXPECTED_EVENTS) {
      expect(FUNNEL_EVENT_NAMES).toContain(e as FunnelEventName);
    }
    // No accidental extras / dupes: registry size matches the contract.
    expect(new Set(FUNNEL_EVENT_NAMES).size).toBe(FUNNEL_EVENT_NAMES.length);
    expect(FUNNEL_EVENT_NAMES.length).toBe(EXPECTED_EVENTS.length);
  });

  it("exposes stable string values via FUNNEL_EVENTS", () => {
    expect(FUNNEL_EVENTS.loginSucceeded).toBe("login_succeeded");
    expect(FUNNEL_EVENTS.returnVisitDetected).toBe("return_visit_detected");
    expect(FUNNEL_EVENTS.journalEntrySaved).toBe("journal_entry_saved");
  });
});

describe("activation funnel — privacy (no PII keys)", () => {
  const registry = readApp("lib/telemetry/funnel-events.ts");

  it("carries no identifying / free-text metadata keys", () => {
    for (const forbidden of [
      "email",
      "phone",
      "full_name",
      "fullname",
      "address",
      "profile_text",
      "journal_text",
      "cv_text",
      "message_body",
      "comment_body",
      "raw_text",
      "display_name",
    ]) {
      // None of these may appear as a metadata key in the funnel contract.
      expect(registry.toLowerCase()).not.toContain(`"${forbidden}"`);
      expect(registry.toLowerCase()).not.toContain(`${forbidden}?:`);
      expect(registry.toLowerCase()).not.toContain(`${forbidden}:`);
    }
  });

  it("the registry is a PURE module — it never imports the telemetry pipe or server action", () => {
    expect(registry).not.toMatch(/from\s+["']@\/lib\/telemetry\/task["']/);
    expect(registry).not.toMatch(/from\s+["']@\/lib\/telemetry\/actions["']/);
    expect(registry).not.toMatch(/server-only/);
  });
});

describe("activation funnel — uses the existing RLS-safe pipe (no DB/RLS change)", () => {
  const trackFile = readApp("lib/telemetry/task.ts");
  const action = readApp("lib/telemetry/actions.ts");

  it("trackFunnel is a thin wrapper over the existing fire-and-forget helper", () => {
    expect(trackFile).toMatch(/export function trackFunnel\(/);
    // It routes through the same private `fire(...)` path (fire-and-forget).
    expect(trackFile).toMatch(/trackFunnel[\s\S]{0,160}fire\(/);
  });

  it("server action still derives profile_id server-side and uses no service_role", () => {
    expect(action).toMatch(/supabase\.auth\.getUser\(\)/);
    expect(action).not.toMatch(/service[_-]?role/i);
    // Client still never declares who it is.
    expect(action).not.toMatch(/profileId\??:\s*string/);
  });

  it("new metadata keys are allowlisted but no free-text body keys were added", () => {
    expect(action).toContain('"surface"');
    expect(action).toContain('"step"');
    expect(action).toContain('"role_context"');
    expect(action).toContain('"entity_type"');
    expect(action).toContain('"success"');
    // The free-text guard from migration 0020 still holds.
    expect(action).not.toMatch(/"(?:profile_text|journal_text|comment_body|raw_text)"/);
  });
});

describe("activation funnel — key surfaces emit their events", () => {
  const cases: Array<{ file: string; mustContain: string[] }> = [
    {
      file: "components/app/session-telemetry.tsx",
      mustContain: ["loginSucceeded", "returnVisitDetected"],
    },
    {
      file: "components/app/login-form.tsx",
      mustContain: ["loginStarted"],
    },
    {
      file: "components/app/google-button.tsx",
      mustContain: ["loginStarted"],
    },
    {
      file: "components/app/onboarding-wizard.tsx",
      mustContain: ["onboardingStarted", "onboardingCompleted"],
    },
    {
      file: "components/app/profile-text-first-flow.tsx",
      mustContain: ["profileEditStarted", "profileSaved"],
    },
    {
      file: "components/app/profile-avatar.tsx",
      mustContain: ["avatarUploadStarted", "avatarUploadSucceeded"],
    },
    {
      file: "components/app/market-map-capture.tsx",
      mustContain: ["preferredLocationAddStarted", "preferredLocationSaved"],
    },
    {
      file: "components/app/journal-entry-composer.tsx",
      mustContain: ["journalEntryStarted", "journalEntrySaved"],
    },
    {
      file: "components/app/demand-draft-form.tsx",
      mustContain: ["demandFormViewed", "demandSaved"],
    },
    {
      file: "components/app/marketplace-loop-section.tsx",
      mustContain: ["serviceRequestStarted", "serviceRequestSent"],
    },
    {
      file: "components/app/work-card-editor.tsx",
      mustContain: ["firstActionCardClicked"],
    },
    {
      file: "components/app/company-next-actions.tsx",
      mustContain: ["companyDemandActionClicked"],
    },
    {
      file: "app/[locale]/dashboard/page.tsx",
      mustContain: ["dashboardViewed", "firstActionCardViewed"],
    },
    {
      file: "app/[locale]/dashboard/profile/page.tsx",
      mustContain: ["profileViewed"],
    },
    {
      file: "app/[locale]/dashboard/market-map/page.tsx",
      mustContain: ["preferredLocationViewed"],
    },
    {
      file: "app/[locale]/dashboard/journal/page.tsx",
      mustContain: ["journalViewed"],
    },
    {
      file: "app/[locale]/dashboard/company/page.tsx",
      mustContain: ["companyDashboardViewed"],
    },
    {
      file: "app/[locale]/dashboard/opportunities/page.tsx",
      mustContain: ["marketplaceOrOpportunitiesViewed"],
    },
    {
      file: "app/[locale]/dashboard/service-requests/page.tsx",
      mustContain: ["marketplaceOrOpportunitiesViewed"],
    },
  ];

  for (const c of cases) {
    it(`${c.file} references ${c.mustContain.join(" + ")}`, () => {
      const src = readApp(c.file);
      expect(src).toMatch(/FUNNEL_EVENTS/);
      for (const token of c.mustContain) {
        expect(src).toContain(token);
      }
    });
  }
});

describe("activation funnel — no demo/preview/LABMA terminology in new files", () => {
  const newFiles = [
    "lib/telemetry/funnel-events.ts",
    "components/app/telemetry-view.tsx",
    "components/app/session-telemetry.tsx",
    "components/app/tracked-link.tsx",
  ];

  it("introduces no banned product-copy / legacy terms", () => {
    // "pilot" is allowed only as the EXISTING table/event name reference; the
    // new files must not introduce demo/preview product framing or the old
    // LABMA / dotted project name.
    const banned = [/\bdemo\b/i, /\blabma\b/i, /labourmarket\.ai/i];
    for (const rel of newFiles) {
      const src = readApp(rel);
      for (const re of banned) {
        expect(src).not.toMatch(re);
      }
    }
  });
});
