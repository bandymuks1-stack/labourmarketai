import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Source-level guard for Form-Submit Feedback v1.
 *
 * A form that keeps the user on the page after submitting must never submit
 * silently: the submit control needs a pending/disabled signal, and there must
 * be a visible, screen-reader-announced feedback surface (role="alert" /
 * role="status"). This guard discovers every form-bearing file (a real
 * type="submit") under components/ + the dashboard app tree and enforces that.
 *
 * NATIVE-NAV forms — `<form action={serverAction|url}>` whose success
 * redirects / reloads (so feedback is the navigation itself) — are exempt and
 * listed explicitly. To stay exempt they must NOT be client-async
 * (no useTransition/startTransition); otherwise they'd keep the user on the
 * page and would owe inline feedback.
 *
 * Runs in CI via `pnpm -F web test`. Pure source assertions; invents nothing.
 */

const APP_ROOT = join(__dirname, "..", "..");

function walkTsx(absDir: string, acc: string[] = []): string[] {
  if (!existsSync(absDir)) return acc;
  for (const e of readdirSync(absDir, { withFileTypes: true })) {
    const p = join(absDir, e.name);
    if (e.isDirectory()) walkTsx(p, acc);
    else if (e.name.endsWith(".tsx")) acc.push(p);
  }
  return acc;
}

function rel(abs: string): string {
  return abs.slice(APP_ROOT.length + 1).split("\\").join("/");
}

// A real submit control (the comment-only `<form>` mentions in primitives like
// DarkListbox are intentionally NOT matched — discovery keys on type="submit").
const SUBMIT = /type=\s*["']submit["']/;

// NATIVE-NAV: server-action / native POST forms whose success redirects or
// reloads. Feedback is the navigation; inline pending/error is optional.
const NATIVE_NAV = new Set([
  "components/app/account-menu.tsx", // logout POST → redirect
  "components/app/message-button.tsx", // open-conversation action → redirect
  // Accepted-booking message CTA (lifecycle v1) — openBookingConversationAction
  // form → redirect to the conversation; feedback is the navigation itself
  // (failure lands on the honest ?notice=cannot_open messages state).
  "app/[locale]/dashboard/bookings/page.tsx",
  // Work tasks (control room PR D) — create/status/edit forms are
  // NATIVE-NAV server actions that ALWAYS redirect back to the tasks page
  // with an honest ?notice= outcome (rendered as a role="status" banner);
  // feedback is the navigation itself, exactly like the bookings page.
  "app/[locale]/dashboard/tasks/page.tsx",
  // Operational finance records (control room PR I) — create/status/edit
  // forms are NATIVE-NAV server actions that ALWAYS redirect back to the
  // finance page with an honest ?notice= outcome (rendered as a
  // role="status" banner); feedback is the navigation itself, exactly like
  // the tasks page.
  "app/[locale]/dashboard/finance/page.tsx",
  "app/[locale]/dashboard/admin/matching/page.tsx", // start-conversation = same openDirectConversationAction → redirect; the review form on this page is the client MatchingWorkbenchReview (covered separately)
  // CRM / demand pipeline (control room PR F) — the ONLY form is a plain GET
  // search/filter form on a pure server component: submitting navigates to
  // the same page with new searchParams, so feedback IS the navigation
  // (filtered list re-render). No mutation, no client state.
  "app/[locale]/dashboard/admin/pipeline/page.tsx",
  // Canonical calendar (core-network area C) — the ONLY form is the plain
  // GET date-picker on a pure server component: submitting navigates to the
  // picked ?date; feedback IS the navigation. No mutation, no client state.
  "app/[locale]/dashboard/planning/page.tsx",
  // "Mano tinklas" (core-network area B) — the ONLY server-component form is
  // the plain GET people/company search: submitting navigates to ?q= and the
  // result list re-render IS the feedback. (The invite panel and invitation
  // lists are client components covered by the general client-async rule.)
  "app/[locale]/dashboard/network/page.tsx",
  // Approvals area of the network page (Workflow & Approval Engine v1) —
  // every form is a NATIVE-NAV server action over a gated engine command
  // that ALWAYS redirects back to /dashboard/network with an honest ?wf=
  // outcome (rendered as a role="status" banner by the section), exactly
  // the tasks/finance pattern. Pure server component — no client state.
  "app/[locale]/dashboard/network/approvals-section.tsx",
  // Requests area of the network page (typed employee requests v1) — every
  // form is a NATIVE-NAV server action over a gated command (module RPCs +
  // the engine's own template commands) that ALWAYS redirects back to
  // /dashboard/network with an honest ?req= outcome (rendered as a
  // role="status" banner by the section), exactly the approvals pattern.
  // Pure server component — no client state. The one GET filter form is
  // plain navigation.
  "app/[locale]/dashboard/network/requests-section.tsx",
  // Timesheets area of the planning page (functional completion train V2) —
  // every form is a NATIVE-NAV server action over a gated timesheet command
  // (or the engine's own start/create/publish commands) that ALWAYS
  // redirects back to /dashboard/planning with an honest ?ts= outcome
  // (rendered as a role="status" banner by the section), exactly the
  // approvals-section pattern above. Pure server component — no client state.
  "app/[locale]/dashboard/planning/timesheets-section.tsx",
  // Procurement + business-trip areas of the finance page (financial ops
  // train J) — every form is a NATIVE-NAV server action over a gated module
  // command (or the engine's own start/withdraw/create/publish commands)
  // that ALWAYS redirects back to /dashboard/finance with an honest
  // ?proc= / ?trip= outcome (rendered as a role="status" banner by each
  // section), exactly the timesheets/requests pattern above. Pure server
  // components — no client state.
  "app/[locale]/dashboard/finance/procurement-section.tsx",
  "app/[locale]/dashboard/finance/trips-section.tsx",
  // Invitation landing page (core-network area B) — accept/decline are
  // NATIVE-NAV server actions that ALWAYS redirect: success lands in the
  // exact accepted context; failure lands back here with an honest
  // ?notice= outcome banner.
  "app/[locale]/invite/[token]/page.tsx",
  "app/[locale]/dashboard/account/page.tsx", // logout POST
  // Project operations centre (train D) — the management strip's lifecycle /
  // responsible forms are NATIVE-NAV server actions that ALWAYS redirect
  // back with an honest ?notice= outcome (rendered as a role="status"
  // banner at the top of the page), exactly the tasks/finance pattern.
  // Pure server component — no client state.
  "app/[locale]/dashboard/projects/[id]/operations/page.tsx",
  // Admin privacy-request review verbs (V9 phase 1) — a NATIVE-NAV server
  // action that ALWAYS redirects back to the admin control room with an
  // honest ?privacyReviewNotice= outcome (rendered as a role="status"
  // banner by the section), exactly the tasks/finance pattern. Pure server
  // component — no client state.
  "components/admin/privacy-requests-section.tsx",
  // (The company page left this list with W3 rows 7/8/25: the demand wizard
  // now lives ON it as a client component, and no NATIVE-NAV form remains.)
  // Workforce planning zone (Labour Market OS P10) — the ONLY forms are the
  // openDemandIntakeAsCompanyAction pattern: the "create a work need" entry
  // points switch workspace then redirect to /dashboard/company#demand-intake;
  // feedback is the navigation itself. Pure server component — no client
  // state, no mutation on this page.
  "app/[locale]/dashboard/company/planning/page.tsx",
  // /dashboard/start/agency became a redirect stub (Direction A, 2026-07-05)
  // — no form remains there, so it left this allowlist.
  // company setup moved to the client <CompanySetupForm> (useActionState +
  // disabled pending + role="status" feedback) — it is now covered by the
  // general client-async rule like the buyer setup form, so it is no longer a
  // NATIVE-NAV exemption.
  // Document & Evidence Engine v1 — worker file upload, acknowledgement
  // inbox and the org document register are NATIVE-NAV server-action forms
  // that ALWAYS redirect back to /dashboard/documents with an honest
  // ?docNotice= outcome (rendered as the page's role="status" DocNoticeBanner),
  // exactly the tasks/finance pattern. Pure server components — no client
  // state, no useTransition.
  "components/app/worker-document-file-slot.tsx",
  "components/app/document-ack-inbox.tsx",
  "components/app/org-documents-register.tsx",
  // Agreement & Rights Engine v1 (train H) — the agreement register's
  // create/edit/status/submit/amend/attach forms are NATIVE-NAV server
  // actions that ALWAYS redirect back to /dashboard/commercial with an
  // honest ?agr= outcome (rendered as the section's role="status" notice
  // banner), exactly the org-documents-register pattern. Pure server
  // component — no client state, no useTransition. (The filter form is a
  // plain GET whose feedback is the filtered re-render.)
  "components/app/agreements-register.tsx",
  // Employee lifecycle v1 (train G) — the worker "my onboarding" confirm
  // forms are NATIVE-NAV server actions that ALWAYS redirect back to
  // /dashboard/start with an honest ?lc= outcome (rendered as the section's
  // role="status" banner), exactly the documents/tasks pattern. Pure server
  // component — no client state, no useTransition. (The employer-side
  // lifecycle-section satisfies pending+feedback directly and needs no
  // exemption.)
  "app/[locale]/dashboard/start/my-onboarding-section.tsx",
]);

const PENDING_SIGNAL =
  /disabled=\{|aria-busy|useTransition|startTransition|status\s*===\s*["']sending["']/;
const FEEDBACK_SURFACE = /role=\s*["'](?:alert|status)["']/;
const CLIENT_ASYNC = /useTransition|startTransition/;

const formFiles = [
  ...walkTsx(join(APP_ROOT, "components")),
  ...walkTsx(join(APP_ROOT, "app", "[locale]")),
]
  .filter((abs) => SUBMIT.test(readFileSync(abs, "utf8")))
  .map(rel)
  .sort();

const clientAsyncForms = formFiles.filter((f) => !NATIVE_NAV.has(f));

describe("Guard: no silent form submits (pending + feedback surface)", () => {
  it(`discovered a non-trivial set of form files (not a no-op): ${formFiles.length}`, () => {
    expect(clientAsyncForms.length).toBeGreaterThanOrEqual(15);
  });

  for (const f of clientAsyncForms) {
    it(`${f} shows a pending signal and a role-based feedback surface`, () => {
      const src = readFileSync(join(APP_ROOT, f), "utf8");
      expect(
        PENDING_SIGNAL.test(src),
        `${f}: submit has no pending/disabled signal (disabled={…}/aria-busy/useTransition).`,
      ).toBe(true);
      expect(
        FEEDBACK_SURFACE.test(src),
        `${f}: no role="alert"/role="status" feedback surface for the submit result.`,
      ).toBe(true);
    });
  }

  it("NATIVE-NAV exemptions are real and not secretly client-async", () => {
    for (const f of NATIVE_NAV) {
      const abs = join(APP_ROOT, f);
      expect(existsSync(abs), `NATIVE_NAV entry ${f} no longer exists — update the allowlist`).toBe(true);
      const src = readFileSync(abs, "utf8");
      expect(SUBMIT.test(src), `${f} no longer has a submit — remove from allowlist`).toBe(true);
      // A genuinely native-nav form redirects; it must not be client-async, or
      // it would keep the user on the page and owe inline feedback.
      expect(
        CLIENT_ASYNC.test(src),
        `${f} now uses useTransition — it is client-async; remove the NATIVE-NAV exemption and add pending+feedback.`,
      ).toBe(false);
    }
  });
});
