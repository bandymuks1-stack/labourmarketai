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

// The complete funnel contract (P0-A scope + Pre-Advertising Launch
// Readiness v1 public-acquisition events). Order-independent.
const EXPECTED_EVENTS = [
  // ── Public acquisition funnel (Pre-Advertising Launch Readiness v1).
  "landing_viewed",
  "cta_clicked",
  "role_selected",
  "registration_started",
  "company_need_started",
  "company_need_submitted",
  "login_started",
  "login_succeeded",
  "onboarding_started",
  // Per-step onboarding progress (Pilot Onboarding and Measurement v1).
  "onboarding_step_role_completed",
  "onboarding_step_profile_completed",
  "onboarding_completed",
  // Time-to-first-value (FIRST REAL ECOSYSTEM USE, 2026-09-03): the first
  // real state-changing action and its real result, per actor.
  "first_real_action",
  "first_real_result",
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
  // ── Worker signup-completion + CV + booking funnel (Worker Launch
  //    Readiness v1). Bounded scalars only; no PII, no schema change.
  "signup_completed",
  "cv_upload_started",
  "cv_upload_succeeded",
  "booking_viewed",
  "booking_accepted",
  "booking_declined",
  // ── Mid-funnel marketplace progression (W14 Pilot Analytics slice v1).
  //    Server-emitted at the real action points via
  //    lib/telemetry/server-funnel.ts (fire-and-forget, profile_id derived
  //    server-side, allowlisted bounded scalars only).
  //    `engagement_ended` joined once #1009 put the shared end path on
  //    main — it fires only on a real `ended` outcome.
  "match_preview_generated",
  "shortlist_added",
  "contact_requested",
  "contact_disclosed",
  "booking_proposed",
  "engagement_created",
  "engagement_ended",
  "project_assigned",
  "project_completed",
  "experience_submitted",
  "experience_published",
  "organization_created",
  // Sweden worker loop v1: the confirmed open of a public-source ad's
  // original advertisement — the click a worker campaign must prove.
  "external_ad_opened",
  // Readiness loop: the retention heartbeat — after a journal contribution
  // genuinely changed skills, the person opened the recomputed board.
  "journal_rematch_viewed",
  // Profession recovery (2026-08-21): onboarding began asking what work a
  // person does, but everyone who joined earlier is past that screen — 25 of
  // 29 onboarded workers held no profession, so their board could not be
  // directed at their trade. These measure whether one dismissible prompt
  // recovers them. `dismissed` is deliberately part of the set: without it
  // `opened` would look like consent, and the denominator would flatter the
  // funnel.
  "profession_recovery_prompt_seen",
  "profession_recovery_prompt_opened",
  "profession_recovery_prompt_dismissed",
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
    // Window widened for the preview_host enrichment (Pre-Advertising Launch
    // Readiness v1); still asserts trackFunnel delegates to fire().
    expect(trackFile).toMatch(/trackFunnel[\s\S]{0,400}fire\(/);
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
    expect(action).not.toMatch(
      /"(?:profile_text|journal_text|comment_body|raw_text)"/,
    );
  });

  it("allowlists the public-funnel + first-touch attribution keys (bounded scalars only)", () => {
    for (const key of [
      "audience",
      "cta_id",
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_content",
      "utm_term",
      "referrer_host",
      "landing_path",
    ]) {
      expect(action).toContain(`"${key}"`);
    }
    // Attribution must never widen the allowlist to a raw query string or a
    // full referrer URL.
    expect(action).not.toMatch(
      /"(?:query|query_string|referrer_url|full_url|search)"/,
    );
  });

  it("first-touch attribution never overwrites the original source and keeps referrer host-only", () => {
    const attribution = readApp("lib/telemetry/attribution.ts");
    // Idempotent first-touch: an existing record is returned unchanged.
    expect(attribution).toMatch(/if \(existing\) return existing/);
    // Referrer is reduced to a host, never the full URL.
    expect(attribution).toMatch(/referrerHost/);
    expect(attribution).not.toMatch(
      /document\.referrer\s*\)?\s*;?\s*\/\/\s*full/i,
    );
  });
});

describe("activation funnel — key surfaces emit their events", () => {
  const cases: Array<{ file: string; mustContain: string[] }> = [
    {
      file: "components/app/session-telemetry.tsx",
      mustContain: ["loginSucceeded", "returnVisitDetected", "signupCompleted"],
    },
    {
      file: "components/app/login-form.tsx",
      mustContain: ["loginStarted"],
    },
    {
      file: "components/app/google-button.tsx",
      mustContain: ["loginStarted", "registrationStarted"],
    },
    // ── Worker signup-completion + CV + booking funnel (Worker Launch
    //    Readiness v1). Bounded scalars only; no PII, no schema change.
    {
      file: "components/app/cv-import-upload.tsx",
      mustContain: ["cvUploadStarted", "cvUploadSucceeded"],
    },
    {
      file: "components/app/booking-respond-buttons.tsx",
      mustContain: ["bookingAccepted", "bookingDeclined"],
    },
    {
      file: "components/app/mark-bookings-seen.tsx",
      mustContain: ["bookingViewed"],
    },
    {
      file: "components/app/onboarding-wizard.tsx",
      mustContain: [
        "onboardingStarted",
        "onboardingStepRoleCompleted",
        "onboardingStepProfileCompleted",
        "onboardingCompleted",
      ],
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
      // CORRECTED 2026-08-08. This entry used to name
      // `lib/conversation/action-registry.ts` and call it "the surviving
      // dashboard_viewed emitter". That was FALSE, and this check is why it
      // survived: the registry does contain the string `dashboardViewed`, as
      // `telemetryEvent: E.dashboardViewed` — but NOTHING READS THAT FIELD.
      // It is declared on the entry type, assigned on 13 entries, asserted by
      // action-registry.test.ts to be a valid event NAME, and never passed to
      // any emitter. So `dashboard_viewed` was never sent at all, and a guard
      // grepping for an identifier certified coverage that did not exist.
      //
      // The real emitter is now the workspace root itself (W3 Package 4
      // deleted /dashboard/advanced, so /dashboard is the one root).
      // `w14-dashboard-viewed-emitter.test.ts` pins EMISSION rather than the
      // presence of a string.
      file: "app/[locale]/dashboard/page.tsx",
      mustContain: ["dashboardViewed"],
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
    // ── Public acquisition funnel (Pre-Advertising Launch Readiness v1).
    {
      file: "components/app/marketing-funnel-beacon.tsx",
      mustContain: ["landingViewed"],
    },
    {
      file: "components/app/tracked-cta.tsx",
      mustContain: ["ctaClicked"],
    },
    {
      file: "components/app/onboarding-wizard.tsx",
      mustContain: ["roleSelected"],
    },
    {
      file: "components/app/signup-form.tsx",
      mustContain: ["registrationStarted"],
    },
    {
      file: "components/app/company-need-form.tsx",
      mustContain: ["companyNeedStarted", "companyNeedSubmitted"],
    },
    // ── Mid-funnel marketplace events (W14 Pilot Analytics slice v1) —
    //    SERVER-SIDE emitters through lib/telemetry/server-funnel.ts.
    {
      file: "lib/scouting/scouting.ts",
      mustContain: [
        "matchPreviewGenerated",
        "shortlistAdded",
        "candidate_count",
      ],
    },
    {
      file: "lib/communication/request-worker-conversation.ts",
      mustContain: ["contactRequested"],
    },
    {
      file: "lib/communication/contact-interested-worker.ts",
      mustContain: ["contactDisclosed"],
    },
    {
      file: "lib/booking/booking-actions.ts",
      mustContain: ["bookingProposed", "engagementCreated"],
    },
    {
      file: "lib/projects/actions.ts",
      mustContain: ["projectAssigned"],
    },
    {
      file: "lib/projects/project-workspace.ts",
      mustContain: ["projectCompleted"],
    },
    {
      file: "lib/trust/experience-actions.ts",
      mustContain: ["experienceSubmitted", "experiencePublished"],
    },
    {
      file: "lib/company/company-setup.ts",
      mustContain: ["organizationCreated"],
    },
    {
      file: "lib/company/team-brigade-actions.ts",
      mustContain: ["organizationCreated"],
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
