import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { FUNNEL_EVENTS } from "@/lib/telemetry/funnel-events";
import { FUNNEL_STAGES } from "@/lib/admin/conversion-funnel";
import { notificationEventHref } from "@/lib/notifications/events";
import { getSafeReturnPath } from "@/lib/auth/redirect";

/**
 * PUBLIC JOB ACQUISITION LOOP (P0, 2026-09-20).
 *
 *   campaign click → ONE public job → register / sign in → the SAME job →
 *   requirement-by-requirement comparison → interest → alternatives → …
 *
 * Before this slice the public job page unlocked the advertisement and
 * stopped. This guard pins the connections the slice made, and the honesty
 * rules they must keep:
 *   - the comparison is the ONE engine, rendered categorically (no score);
 *   - the interest control is the existing one, not a second path;
 *   - the auth round trip returns to the exact job and is measurable;
 *   - a member whose ad closed is not told to create an account;
 *   - every funnel step the owner named has an emitter and a stage.
 */
const APP_ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(APP_ROOT, rel), "utf8");

const PAGE = "app/[locale]/(marketing)/jobs/[id]/page.tsx";
const BOARD = "app/[locale]/(marketing)/jobs/page.tsx";
const READING = "lib/opportunities/public-job-reading.ts";

describe("the public job page compares the job with the member's profile", () => {
  const page = read(PAGE);
  const reading = read(READING);
  // The 5-locale copy maps of the slice — what a person READS. Comments and
  // code around them may name the anti-patterns; the copy may not use them.
  const copy = page.slice(page.indexOf("const RETURNED_NOTE"), page.indexOf("function locationPrecision"));

  it("composes the member reading from the ONE engine — no second matcher", () => {
    expect(page).toContain("readPublicJobForMember");
    expect(reading).toContain("matchWorkerToNeed(");
    expect(reading).toContain("buildNeedFromVacancy(");
    expect(reading).toContain("deriveFitBand(");
    // The board's comparator ranks the alternatives — one ranking rule.
    expect(reading).toContain("compareMatches(");
  });

  it("renders the verdict categorically: band chip + tiers, never a number", () => {
    expect(page).toContain("<FitBandChip");
    expect(page).toContain("<MatchTierExplanation");
    expect(page).toContain("missingFacts={ready.match.missingFacts}");
    // No percentage, no stars, no "score" reaches the page copy.
    expect(copy).not.toMatch(/\d+\s*%/);
    expect(copy).not.toMatch(/\bscore\b/i);
    expect(copy).not.toMatch(/★|⭐/);
  });

  it("keeps UNKNOWN apart from FAILED in every band sentence", () => {
    // The missing-requirement sentence must say missing ≠ failed, in every locale.
    expect(page).toMatch(/Missing information is not a failed requirement/);
    expect(page).toMatch(/Trūkstama informacija nėra neatitikimas/);
    expect(page).toMatch(/Отсутствие информации — это не несоответствие/);
    // "not assessed" says it is not a verdict.
    expect(page).toMatch(/Nothing here is a verdict/);
    // No band sentence says "not suitable".
    expect(copy).not.toMatch(/not suitable/i);
    expect(copy).not.toMatch(/netinka/i);
  });

  it("offers the EXISTING interest control, gated on the store and a worker row", () => {
    expect(page).toContain("<VacancyInterestButton");
    expect(page).toMatch(/ready && ready\.interestAvailable && member\.storeId/);
    // No second write path: the page never imports its own interest action.
    expect(page).not.toMatch(/expressVacancyInterest\b/);
    expect(page).not.toMatch(/demand_interest_signals/);
  });

  it("surfaces same-profession alternatives beside a non-fit, as coverage not opinion", () => {
    expect(reading).toContain("readSameProfessionAlternatives");
    expect(reading).toContain("closerThanCurrent");
    // Bounded: one profession query with a hard cap, three shown.
    expect(reading).toMatch(/ALTERNATIVES_POOL = 12/);
    expect(reading).toMatch(/ALTERNATIVES_SHOWN = 3/);
    // The copy never calls another job "better for you".
    expect(copy).not.toMatch(/better for you/i);
    expect(page).toContain("ALT_CLOSER");
  });

  it("sends a non-matchable member to the profile, not into a fake comparison", () => {
    expect(page).toContain("NOT_MATCHABLE[active]");
    expect(page).toMatch(/!ready\?\.matchable/);
  });
});

describe("JOB A → REGISTER → JOB A is exact and measurable", () => {
  const page = read(PAGE);

  it("the page's own next carries the exact job path with the via=auth marker", () => {
    expect(page).toMatch(/encodeURIComponent\(`\/\$\{active\}\/jobs\/\$\{id\}\?via=auth`\)/);
  });

  it("the sanitiser keeps that marker end to end", () => {
    const id = "e3ec6c1e-51d9-47be-81d6-1dce0b5e61e5";
    expect(getSafeReturnPath(`/en/jobs/${id}?via=auth`, "en")).toBe(
      `/en/jobs/${id}?via=auth`,
    );
    // …and still refuses a hostile destination.
    expect(getSafeReturnPath("https://evil.example/en/jobs/x", "en")).toBe("/en/dashboard");
  });

  it("emits the returned-to-job step only for a member arriving via auth", () => {
    expect(page).toMatch(/user && viaAuth \? \(\s*<TelemetryView\s*event=\{FUNNEL_EVENTS\.jobReturnedAfterAuth\}/);
    expect(page).toContain("RETURNED_NOTE[active]");
  });

  it("the registration CTAs are tracked with stable ids and first-touch attribution", () => {
    expect(page).toContain('ctaId="public_job_signup"');
    expect(page).toContain('ctaId="public_job_login"');
    // The anonymous CTAs are still the signup/login doors with the return path.
    expect(page).toContain("/auth/signup?next=");
    expect(page).toContain("/auth/login?next=");
  });

  it("a member whose ad closed is told the ad changed — never to create an account", () => {
    expect(page).toContain("CLOSED_TITLE[active]");
    expect(page).toMatch(/\) : user \? \(/);
    // The closed branch offers the board, not the signup door.
    const closedBranch = page.slice(page.indexOf("CLOSED_TITLE[active]"), page.indexOf("LOCKED_TITLE[active]"));
    expect(closedBranch).toContain('href="/dashboard/opportunities"');
    expect(closedBranch).not.toContain("/auth/signup");
  });

  it("an unexpected member read error renders the anonymous half, not the error boundary", () => {
    expect(page).toMatch(/getPublicVacancyById\(supabase, id\)[\s\S]*?\.catch\(\(\) => null\)/);
  });
});

describe("the funnel the owner asked for has an emitter and a stage per step", () => {
  const page = read(PAGE);
  const board = read(BOARD);

  it("registers the six public-job events", () => {
    expect(FUNNEL_EVENTS.jobBoardViewed).toBe("job_board_viewed");
    expect(FUNNEL_EVENTS.jobOpened).toBe("job_opened");
    expect(FUNNEL_EVENTS.jobReturnedAfterAuth).toBe("job_returned_after_auth");
    expect(FUNNEL_EVENTS.jobCompared).toBe("job_compared");
    expect(FUNNEL_EVENTS.jobMissingInfoShown).toBe("job_missing_info_shown");
    expect(FUNNEL_EVENTS.jobAlternativesShown).toBe("job_alternatives_shown");
  });

  it("every one of them is emitted by the public surfaces", () => {
    expect(board).toContain("FUNNEL_EVENTS.jobBoardViewed");
    for (const key of [
      "jobOpened",
      "jobReturnedAfterAuth",
      "jobCompared",
      "jobMissingInfoShown",
      "jobAlternativesShown",
    ] as const) {
      expect(page, key).toContain(`FUNNEL_EVENTS.${key}`);
    }
  });

  it("job_opened fires once per PAGE VIEW, not once per tab session", () => {
    expect(page).toMatch(/event=\{FUNNEL_EVENTS\.jobOpened\}\s*once=\{false\}/);
  });

  it("an unavailable board is success:false, never zero jobs", () => {
    expect(board).toMatch(/success: result\.status !== "unavailable"/);
  });

  it("the admin funnel reads the same steps, interest included", () => {
    const keys = FUNNEL_STAGES.map((s) => s.key as string);
    for (const k of [
      "job_board_viewed",
      "job_opened",
      "job_returned_after_auth",
      "job_compared",
      "job_missing_info_shown",
      "vacancy_interest_expressed",
      "job_alternatives_shown",
    ]) {
      expect(keys, k).toContain(k);
    }
  });

  it("carries only the opaque vacancy id — no employer name, no title, no PII", () => {
    expect(page).toContain('ref_type: "public_vacancy"');
    expect(page).not.toMatch(/employer_name|titleRaw.*metadata|email/);
  });
});

describe("retention loop: the journal digest lands on the journal", () => {
  it("a journal-focused weekly digest links to /dashboard/journal", () => {
    expect(notificationEventHref("weekly_digest", { focus: "journal" })).toBe(
      "/dashboard/journal",
    );
    // The other two readings are unchanged.
    expect(notificationEventHref("weekly_digest", { focus: "profile_completion" })).toBe(
      "/dashboard/profile",
    );
    expect(notificationEventHref("weekly_digest")).toBe("/dashboard/opportunities");
  });

  it("the e-mail renders the SAME focused key and link as the bell, in the recipient's locale", () => {
    const email = read("lib/email/notification-email.ts");
    expect(email).toContain("notificationRenderedType(input.eventType, input.metadata)");
    expect(email).toContain("notificationEventHref(input.entityType, input.metadata)");
    const dispatch = read("lib/notifications/email-dispatch.ts");
    expect(dispatch).toContain('.select("email, locale")');
    expect(dispatch).toContain("metadata: input.metadata");
  });
});
