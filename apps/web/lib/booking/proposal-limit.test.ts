import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { activeLocales, locales } from "@/lib/i18n/config";

import { proposalLimitOf } from "./proposal-limit";

const repo = path.resolve(__dirname, "../../../..");
const web = path.resolve(__dirname, "../..");

describe("which booking-proposal limit a refusal names", () => {
  it("the open-proposals cap, as the database words it", () => {
    expect(proposalLimitOf("P0004", "Too many open booking proposals")).toBe("open");
  });

  it("the 24-hour cap, as the database words it", () => {
    expect(proposalLimitOf("P0004", "Booking proposal daily limit reached")).toBe("daily");
  });

  it("the text decides even when the code is lost on the way", () => {
    expect(proposalLimitOf(undefined, "ERROR: Too many open booking proposals")).toBe("open");
  });

  it("a P0004 with text it does not know is still a limit, never a generic error", () => {
    expect(proposalLimitOf("P0004", "something else")).toBe("unknown");
  });

  it("any other refusal is not a proposal limit", () => {
    expect(proposalLimitOf("42501", "not_owner")).toBeNull();
    expect(proposalLimitOf(undefined, undefined)).toBeNull();
  });

  it("reads the exact messages the database raises", () => {
    const sql = readFileSync(
      path.join(repo, "supabase/migrations/20260716121000_request_rate_limits_v3.sql"),
      "utf8",
    );
    const raised = [...sql.matchAll(/raise exception '([^']+)' using errcode = 'P0004'/g)].map((m) => m[1]!);
    expect(raised.length).toBeGreaterThanOrEqual(2);
    for (const message of raised) expect(proposalLimitOf("P0004", message)).not.toBe("unknown");
  });
});

describe("the employer's offer decision says which limit stopped it", () => {
  const action = readFileSync(path.join(web, "lib/agency/bridge-actions.ts"), "utf8");
  const respond = action.slice(action.indexOf("export async function respondCandidateOfferAction"));
  const respondBody = respond.slice(0, respond.indexOf("\nexport async function", 10));

  it("the accept path maps the limit before the generic error", () => {
    const limitAt = respondBody.indexOf("proposalLimitOf(");
    expect(limitAt, "the respond action reads the limit").toBeGreaterThan(-1);
    expect(limitAt).toBeLessThan(respondBody.indexOf("return mapErr("));
  });

  it("the buttons show the limit with a way to the bookings, never the generic line", () => {
    const buttons = readFileSync(path.join(web, "components/app/offer-decision-buttons.tsx"), "utf8");
    expect(buttons).toContain('state.status === "proposal-limit"');
    expect(buttons).toContain('href="/dashboard/bookings"');
    expect(buttons).toContain('data-testid="offer-decision-limit"');
  });
});

describe("the limit lines exist in every catalog (doctrine §2.4)", () => {
  const keys = ["limitOpen", "limitDaily", "limitUnknown", "openBookings"] as const;
  const decision = (locale: string): Record<string, string> => {
    const catalog = JSON.parse(readFileSync(path.join(web, "messages", `${locale}.json`), "utf8"));
    return catalog?.scoutingAgencyOffers?.decision ?? {};
  };
  const english = decision("en");

  for (const locale of locales) {
    it(`${locale} carries all four keys`, () => {
      const lines = decision(locale);
      for (const k of keys) expect(typeof lines[k], `${locale}.${k}`).toBe("string");
    });
  }

  for (const locale of activeLocales.filter((l) => l !== "en")) {
    it(`${locale} (active) says them in its own language`, () => {
      const lines = decision(locale);
      for (const k of keys) {
        expect(lines[k]!.startsWith("[EN]"), `${locale}.${k}`).toBe(false);
        expect(lines[k], `${locale}.${k}`).not.toBe(english[k]);
      }
    });
  }
});
