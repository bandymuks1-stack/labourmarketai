import { describe, expect, it } from "vitest";

import { isConversionRow, summariseFunnel } from "@/lib/admin/conversion-funnel";
import {
  FUNNEL_EVENTS,
  REGISTRATION_CONVERSION_STEP,
} from "@/lib/telemetry/funnel-events";

/**
 * registration_started FROM THE LOGIN PAGE IS NOT A CONVERSION (2026-09-22).
 *
 * Measured: both auth pages render the OAuth buttons with `context="signup"`
 * (a new Google identity creates an account from either page), so a
 * returning user pressing "Continue with Google" on /auth/login emitted
 * `registration_started` and the first-touch `sources` breakdown counted it
 * as a registration conversion. These tests pin the additive fix: the row's
 * bounded `step` decides, only `signup_page` converts, and the RAW count
 * (stage tile + campaign column) still includes every press.
 */

type Row = {
  event_name: string;
  metadata: Record<string, unknown> | null;
  profile_id?: string | null;
};

const row = (event_name: string, metadata: Record<string, unknown> | null = null): Row => ({
  event_name,
  metadata,
  profile_id: null,
});

const reg = (step: string | undefined, source = "facebook"): Row =>
  row(FUNNEL_EVENTS.registrationStarted, {
    utm_source: source,
    utm_campaign: "welder-w1",
    utm_content: "pl",
    ...(step ? { step } : {}),
  });

describe("isConversionRow", () => {
  it("registration_started converts on signup_page only", () => {
    expect(isConversionRow(FUNNEL_EVENTS.registrationStarted, { step: "signup_page" })).toBe(true);
    expect(isConversionRow(FUNNEL_EVENTS.registrationStarted, { step: "login_page" })).toBe(false);
    // A row from before the step existed says nothing about its page.
    expect(isConversionRow(FUNNEL_EVENTS.registrationStarted, {})).toBe(false);
    expect(isConversionRow(FUNNEL_EVENTS.registrationStarted, null)).toBe(false);
    // A free string is not the bounded step.
    expect(isConversionRow(FUNNEL_EVENTS.registrationStarted, { step: "Signup_Page" })).toBe(false);
  });

  it("company_need_submitted converts regardless of step; nothing else converts", () => {
    expect(isConversionRow(FUNNEL_EVENTS.companyNeedSubmitted, null)).toBe(true);
    expect(isConversionRow(FUNNEL_EVENTS.landingViewed, { step: "signup_page" })).toBe(false);
    expect(isConversionRow(FUNNEL_EVENTS.loginStarted, { step: "signup_page" })).toBe(false);
  });

  it("the conversion step is the signup page", () => {
    expect(REGISTRATION_CONVERSION_STEP).toBe("signup_page");
  });
});

describe("summariseFunnel — sources vs raw counts", () => {
  const rows: Row[] = [
    row(FUNNEL_EVENTS.landingViewed, { utm_source: "facebook" }),
    reg("login_page"), // a returning user on /auth/login
    reg("login_page"),
    reg("signup_page"), // one real registration attempt
    reg(undefined, "google"), // a pre-step row: raw-counted, never converted
    row(FUNNEL_EVENTS.companyNeedSubmitted, { utm_source: "linkedin" }),
  ];
  const out = summariseFunnel(rows);

  it("the sources breakdown counts only the signup-page registration and the need", () => {
    expect(out.sources).toEqual([
      { source: "facebook", count: 1 },
      { source: "linkedin", count: 1 },
    ]);
    // The pre-step google row is NOT bucketed under "(direct / none)" either —
    // it is simply not a conversion.
    expect(out.sources.find((s) => s.source === "google")).toBeUndefined();
    expect(out.sources.find((s) => s.source === "(direct / none)")).toBeUndefined();
  });

  it("the stage tile keeps the RAW registration_started count for both pages", () => {
    const tile = out.counts.find((c) => c.key === FUNNEL_EVENTS.registrationStarted);
    expect(tile?.count).toBe(4);
  });

  it("the campaign column keeps the raw count too", () => {
    const [campaign] = out.campaigns;
    expect(campaign).toMatchObject({ campaign: "welder-w1", content: "pl", registrationStarted: 4 });
  });

  it("the landing → registration rate is unchanged: a raw ratio, stated as such", () => {
    const rate = out.rates.find((r) => r.label === "Landing → registration started");
    expect(rate?.pct).toBe(400);
    expect(rate?.state).toBe("ok");
  });
});

describe("summariseFunnel — the three employer-chain stages are tiles", () => {
  it("counts requirement_activated, demand_interest_expressed and conversation_message_sent", () => {
    const out = summariseFunnel([
      row(FUNNEL_EVENTS.requirementActivated, { status: "submitted" }),
      row(FUNNEL_EVENTS.requirementActivated, { status: "submitted" }),
      row(FUNNEL_EVENTS.demandInterestExpressed, { ref_type: "customer_request" }),
      row(FUNNEL_EVENTS.conversationMessageSent, { ref_type: "conversation" }),
    ]);
    const count = (key: string) => out.counts.find((c) => c.key === key)?.count;
    expect(count(FUNNEL_EVENTS.requirementActivated)).toBe(2);
    expect(count(FUNNEL_EVENTS.demandInterestExpressed)).toBe(1);
    expect(count(FUNNEL_EVENTS.conversationMessageSent)).toBe(1);
  });
});
