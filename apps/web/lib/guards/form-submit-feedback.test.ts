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
  "app/[locale]/dashboard/admin/matching/page.tsx", // start-conversation = same openDirectConversationAction → redirect; the review form on this page is the client MatchingWorkbenchReview (covered separately)
  "app/[locale]/dashboard/account/page.tsx", // logout POST
  // "submit draft for real" + agency-mode "offer" (audit PR4) — the
  // openDemandIntakeAsCompanyAction forms switch workspace then redirect to
  // /dashboard#demand-intake; feedback is the navigation itself.
  "app/[locale]/dashboard/company/page.tsx",
  // /dashboard/start/agency became a redirect stub (Direction A, 2026-07-05)
  // — no form remains there, so it left this allowlist.
  // company setup moved to the client <CompanySetupForm> (useActionState +
  // disabled pending + role="status" feedback) — it is now covered by the
  // general client-async rule like the buyer setup form, so it is no longer a
  // NATIVE-NAV exemption.
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
