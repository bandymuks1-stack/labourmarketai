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
  // Owner contract §4D (2026-09-05): an invitation addressed to the person
  // accepted from the chat's attention item — emitted server-side by the
  // conversation executor on a real accepted / linked outcome only.
  "invitation_accepted",
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
  // Chat-first execution funnel (real recruiter pilot, 2026-09-04).
  "chat_intent_recognized",
  "chat_intent_unrecognized",
  "chat_missing_data_asked",
  "chat_action_attempted",
  "chat_action_persisted",
  // Public entry (frozen design contract 2026-09-05, P1): the anonymous
  // visitor's sentence read by the deterministic router before any account.
  "landing_intent",
  // Universal invitation / referral network v1 (2026-09-17): the referral
  // funnel's observable stages beside the existing `invitation_accepted`.
  "invitation_created",
  "invitation_opened",
  "invitation_declined",
  "external_referral_received",
  // Worker → real vacancy → interest → Nonstop commercial handoff (2026-09-17).
  "recognition_suggested",
  "recognition_confirmed",
  "recognition_corrected",
  "recognition_rejected",
  "profile_matchable",
  "real_opportunities_loaded",
  "vacancy_interest_expressed",
  "commercial_handoff_created",
  // Public job acquisition loop (P0, 2026-09-20): one public advertisement →
  // registration → the SAME advertisement → compared → acted on.
  "job_board_viewed",
  "job_opened",
  "job_returned_after_auth",
  "job_compared",
  "job_missing_info_shown",
  "job_alternatives_shown",
  // Employer funnel closure (owner §23 canonical chain, 2026-09-22): the
  // logged-in requirement write, the worker's interest in it, the message.
  "requirement_activated",
  "demand_interest_expressed",
  "conversation_message_sent",
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

/**
 * ── THE ATTRIBUTION HOLE, PINNED (2026-09-20) ───────────────────────────────
 *
 * First-touch attribution was merged into `landing_viewed`, `cta_clicked`,
 * `registration_started` and `company_need_submitted` — and into nothing
 * else. Every step of the public job acquisition loop (`job_opened`,
 * `job_board_viewed`, `job_returned_after_auth`, `job_compared`, …) goes
 * through ONE component, `TelemetryView`, which did not merge it; neither did
 * `signup_completed` or `onboarding_completed`. A production probe on
 * 2026-09-20 12:52Z caught the consequence in a single session:
 * `landing_viewed` carried `utm_content`, `job_opened` did not. The campaign →
 * job → registration handoff was therefore not measurable at all — not
 * "measured as zero", NOT MEASURED.
 *
 * These assertions pin the emission sites, and specifically the SPREAD ORDER:
 * attribution goes UNDER the caller's explicit metadata, so a stored campaign
 * value can never overwrite what a surface deliberately said about itself.
 * The runtime behaviour of the helper itself (never throws, original campaign
 * wins) is proven in lib/telemetry/attribution.test.ts.
 */
describe("first-touch attribution rides on EVERY client conversion step", () => {
  const SURFACES = [
    // One component covers the whole public job loop.
    "components/app/telemetry-view.tsx",
    "components/app/session-telemetry.tsx",
    "components/app/onboarding-wizard.tsx",
    // The four that already carried it — pinned so a refactor cannot
    // quietly drop them while the new ones pass.
    "components/app/marketing-funnel-beacon.tsx",
    "components/app/tracked-cta.tsx",
    "components/app/google-button.tsx",
    "components/app/company-need-form.tsx",
  ];

  for (const rel of SURFACES) {
    it(`${rel} merges getFirstTouchAttribution() into its emission`, () => {
      const src = readApp(rel);
      expect(src).toMatch(
        /from "@\/lib\/telemetry\/attribution"/,
      );
      expect(src).toMatch(/\.\.\.getFirstTouchAttribution\(\)/);
    });
  }

  it("TelemetryView merges attribution UNDER the caller's metadata", () => {
    const src = readApp("components/app/telemetry-view.tsx");
    // The spread must precede `...metadata` in the same object literal, or an
    // explicit key a surface set (e.g. `landing_path`) would be overwritten
    // by a stored one.
    expect(src).toMatch(
      /trackFunnel\(\s*event,\s*\{\s*\.\.\.getFirstTouchAttribution\(\),\s*\.\.\.metadata\s*\}\s*\)/,
    );
    // The once/sessionStorage dedupe is untouched by the merge.
    expect(src).toMatch(/lm\.funnel\.\$\{event\}\$\{surface\}/);
    expect(src).toMatch(/window\.sessionStorage\.setItem\(key, "1"\)/);
  });

  it("signup_completed carries attribution beneath its explicit surface", () => {
    const src = readApp("components/app/session-telemetry.tsx");
    expect(src).toMatch(
      /FUNNEL_EVENTS\.signupCompleted,\s*\{\s*\.\.\.getFirstTouchAttribution\(\),\s*surface: signupSurface,/,
    );
  });

  it("BOTH onboarding_completed call sites carry it — the redirect path too", () => {
    const src = readApp("components/app/onboarding-wizard.tsx");
    const sites = src.match(
      /FUNNEL_EVENTS\.onboardingCompleted,\s*\{\s*\.\.\.getFirstTouchAttribution\(\),/g,
    );
    // A successful onboarding normally ends in NEXT_REDIRECT, so the catch
    // branch is the one that actually fires in production. Missing it would
    // leave the completion unattributed in exactly the common case.
    expect(sites, "both success paths must merge attribution").toHaveLength(2);
    expect(
      src.match(/FUNNEL_EVENTS\.onboardingCompleted/g),
    ).toHaveLength(2);
  });

  it("vacancy_interest_expressed stays SERVER-emitted with no client-supplied attribution", () => {
    // Not an oversight: first-touch lives in the visitor's localStorage and
    // the server cannot read it. Shipping it up from the client on a product
    // action would create a trusted-input surface for one funnel column.
    // Re-pinned 2026-09-22: the attribution now reaches server events by the
    // reviewed route below (the user's OWN auth user_metadata, read inside
    // the shared emitter) — this call site still passes nothing.
    const src = readApp("lib/opportunities/vacancy-interest.ts");
    expect(src).toMatch(/^import "server-only";/m);
    expect(src).toMatch(
      /emitServerFunnelEvent\(FUNNEL_EVENTS\.vacancyInterestExpressed/,
    );
    expect(src).not.toMatch(/getFirstTouchAttribution/);
  });

  /**
   * ── SERVER EVENTS CARRY THE USER'S OWN FIRST-TOUCH (2026-09-22) ──────────
   *
   * The signup form has stored the bounded first-touch keys in
   * `auth.users.raw_user_meta_data` since social-acquisition readiness v1;
   * the shared server emitter now reads them back from `getUser()` through
   * ONE pure, allowlisted, length-capped reader. No migration, no trigger, no
   * value taken from a product-action call site. The runtime bound is proven
   * in lib/telemetry/first-touch-user-metadata.test.ts and the merge in
   * lib/telemetry/analytics-attribution.test.ts; these pin the wiring.
   */
  it("the server attribution seam reads first-touch from the user's own metadata only", () => {
    const attr = readApp("lib/telemetry/analytics-attribution.ts");
    expect(attr).toMatch(/firstTouchFromUserMetadata\(user\.user_metadata\)/);
    expect(attr).toMatch(/resolveFirstTouchAttribution\(\)/);
    // Never from a request body, a header the module parses itself, or a
    // call-site argument.
    expect(attr).not.toMatch(/formData|searchParams|request\.json|headers\(\)/i);
    // The reader is pure and allowlisted — exactly the six keys, no utm_term
    // (a search campaign can put the visitor's own typed query there).
    const reader = readApp("lib/telemetry/first-touch-user-metadata.ts");
    // Two separate assertions: one anchored import line, one substring. A single
    // alternation would anchor only the first branch (CodeQL js/regex/missing-regexp-anchor).
    expect(reader).not.toMatch(/^import "server-only"/m);
    expect(reader).not.toMatch(/from "@\/lib\/supabase/);
    expect(reader).toMatch(
      /USER_METADATA_FIRST_TOUCH_KEYS = \[\s*"utm_source",\s*"utm_medium",\s*"utm_campaign",\s*"utm_content",\s*"referrer_host",\s*"landing_path",\s*\] as const/,
    );
    expect(reader).not.toMatch(/"utm_term"/);
  });

  it("the signup form still stores the same bounded first-touch on the account", () => {
    const src = readApp("components/app/signup-form.tsx");
    expect(src).toMatch(/data: \{ locale, \.\.\.getFirstTouchAttribution\(\) \}/);
  });
});

/**
 * ── registration_started FROM THE LOGIN PAGE IS NOT A CONVERSION (2026-09-22) ─
 *
 * Both auth pages pass `context="signup"` to the OAuth buttons because a new
 * Google identity creates an account from either page (pinned by
 * google-same-tab-redirect.test.ts). The consequence, measured: every
 * returning user's login-page press emitted `registration_started`, which
 * `lib/admin/conversion-funnel.ts` counted as a registration CONVERSION in the
 * first-touch `sources` breakdown. The fix is additive: the page names itself
 * through the bounded `step`, and only `signup_page` converts. The raw count
 * stays visible on both pages.
 */
describe("registration_started carries the bounded page step", () => {
  it("the login page passes login_page to EVERY OAuth button it renders", () => {
    const form = readApp("components/app/login-form.tsx");
    const buttons = form.match(/<(Google|LinkedIn|Facebook)Button[\s\S]*?\/>/g) ?? [];
    expect(buttons.length).toBe(3);
    for (const b of buttons) {
      expect(b).toMatch(/registrationStep="login_page"/);
      expect(b).toMatch(/context="signup"/);
    }
  });

  it("the signup page passes signup_page to EVERY OAuth button and the e-mail path", () => {
    const form = readApp("components/app/signup-form.tsx");
    const buttons = form.match(/<(Google|LinkedIn|Facebook)Button[\s\S]*?\/>/g) ?? [];
    expect(buttons.length).toBe(3);
    for (const b of buttons) {
      expect(b).toMatch(/registrationStep="signup_page"/);
    }
    expect(form).toMatch(
      /FUNNEL_EVENTS\.registrationStarted,\s*\{\s*surface: "email",[\s\S]{0,400}?step: "signup_page",\s*\.\.\.getFirstTouchAttribution\(\)/,
    );
  });

  it("the OAuth button forwards the step as the allowlisted `step` key, never a free string", () => {
    const button = readApp("components/app/google-button.tsx");
    expect(button).toMatch(/registrationStep\?: RegistrationStep/);
    expect(button).toMatch(
      /\.\.\.\(registrationStep \? \{ step: registrationStep \} : \{\}\)/,
    );
    // The bounded set lives in the pure registry, not in the component.
    const registry = readApp("lib/telemetry/funnel-events.ts");
    expect(registry).toMatch(
      /REGISTRATION_STEPS = \["login_page", "signup_page"\] as const/,
    );
    expect(registry).toMatch(/REGISTRATION_CONVERSION_STEP: RegistrationStep = "signup_page"/);
  });

  it("the admin funnel converts on signup_page only and keeps the raw count", () => {
    const funnel = readApp("lib/admin/conversion-funnel.ts");
    expect(funnel).toMatch(/isConversionRow\(r\.event_name, r\.metadata\)/);
    expect(funnel).toMatch(/metadata\?\.\["step"\] === REGISTRATION_CONVERSION_STEP/);
    // The stage tile still counts every registration_started row.
    expect(funnel).toMatch(/key: FUNNEL_EVENTS\.registrationStarted, label: "Registration started"/);
  });
});

/**
 * ── THE EMPLOYER CHAIN EMITS (owner §23 canonical chain, 2026-09-22) ─────────
 *
 * Measured before this: the logged-in employer requirement write emitted NO
 * pilot_event; a worker's interest in an employer's own requirement emitted
 * none; a sent message emitted none. Each now emits SERVER-SIDE at the real
 * write point through the shared emitter, with entity ids only.
 */
describe("employer funnel closure — server emitters at the real write points", () => {
  it("the requirement write emits after the RPC succeeded, from the ONE pure mapping", () => {
    const src = readApp("lib/demand/demand-request.ts");
    expect(src).toMatch(/requirementFunnelEvents\(status\)/);
    // Emission sits AFTER the RPC error return and the id derivation.
    const rpcErr = src.indexOf("return { ok: false, code: classifyDbError(error.code) };");
    const emit = src.indexOf("requirementFunnelEvents(status)");
    expect(rpcErr).toBeGreaterThan(-1);
    expect(emit).toBeGreaterThan(rpcErr);
    expect(src).toMatch(/ref_type: "customer_request",\s*ref_id: requestId,\s*status,/);
    // Never the title, the summary or the payload.
    const block = src.slice(emit, src.indexOf("// Populate the structured"));
    expect(block).not.toMatch(/p_title|p_need_summary|description|payload|title:/);
  });

  it("interest in an employer requirement emits at the stored-interest write, before the notification", () => {
    const src = readApp("lib/opportunities/interest.ts");
    const core = src.slice(
      src.indexOf("export async function expressInterestCore"),
      src.indexOf("export async function withdrawInterest"),
    );
    const upsert = core.indexOf('.from("demand_interest_signals")');
    const emit = core.indexOf("FUNNEL_EVENTS.demandInterestExpressed");
    const notify = core.indexOf("emitDemandInterestNotification(");
    expect(upsert).toBeGreaterThan(-1);
    expect(emit).toBeGreaterThan(upsert);
    expect(notify).toBeGreaterThan(emit);
    expect(core).toMatch(/ref_type: "customer_request",\s*ref_id: input\.requestId,/);
    expect(core.slice(emit, notify)).not.toMatch(/note|snapshot|companyName/);
  });

  it("a sent message emits once, after the insert returned an id, with the conversation id only", () => {
    const src = readApp("lib/communication/actions.ts");
    const send = src.slice(
      src.indexOf("export async function sendMessage"),
      src.indexOf("export async function joinConversationAsAdmin"),
    );
    const insertFail = send.indexOf("if (result.error || !result.data?.id)");
    const emit = send.indexOf("FUNNEL_EVENTS.conversationMessageSent");
    expect(insertFail).toBeGreaterThan(-1);
    expect(emit).toBeGreaterThan(insertFail);
    expect(send.match(/FUNNEL_EVENTS\.conversationMessageSent/g)).toHaveLength(1);
    expect(send).toMatch(/ref_type: "conversation",\s*ref_id: input\.conversationId,/);
    const block = send.slice(emit, send.indexOf("// Bump conversation.updated_at"));
    expect(block).not.toMatch(/\bbody\b|attachments|author_id|user\.id/);
  });

  it("the admin funnel reads the three new stages", () => {
    const funnel = readApp("lib/admin/conversion-funnel.ts");
    for (const k of ["requirementActivated", "demandInterestExpressed", "conversationMessageSent"]) {
      expect(funnel).toMatch(new RegExp(`key: FUNNEL_EVENTS\\.${k},`));
    }
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
    // Time-to-first-value (real recruiter pilot, 2026-09-04): the agency
    // bridge is the first chain that emits the dedicated events. Actions
    // are server-side (both subjects); each side's RESULT is emitted where
    // the other side's response becomes visible to it.
    {
      file: "lib/agency/bridge-actions.ts",
      mustContain: ["firstRealAction"],
    },
    {
      file: "components/app/agency-bridge-section.tsx",
      mustContain: ["firstRealResult"],
    },
    {
      file: "app/[locale]/dashboard/company/scouting/page.tsx",
      mustContain: ["firstRealResult"],
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
