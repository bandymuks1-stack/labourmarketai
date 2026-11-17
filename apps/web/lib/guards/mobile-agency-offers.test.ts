/**
 * GUARD — the native app answers agency and team offers through the web
 * chat's own capabilities (owner order 2026-11-16: one shared client, no
 * parallel backend), never shows a worker name, and words every line exactly
 * as the web chat does.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const REPO = resolve(__dirname, "../../../..");
const read = (p: string) => readFileSync(resolve(REPO, p), "utf8");

const LOCALES = ["en", "lt", "ru", "nl", "de", "pl", "sv"] as const;

/** Mobile key → the web `conversation.chat` key it mirrors. */
const SAME_WORDS: Record<string, string> = {
  "agencyOffers.title": "chipAgencyOffers",
  "agencyOffers.none": "clientOffersNone",
  "agencyOffers.candidatesIntro": "clientOffersIntro",
  "agencyOffers.teamsIntro": "teamOffersIntro",
  "agencyOffers.teamStatusAgreed": "teamOfferStatusAgreed",
  "agencyOffers.accept": "chipOfferAccept",
  "agencyOffers.decline": "chipOfferDecline",
  "agencyOffers.agree": "chipTeamOfferAgree",
  "agencyOffers.accepted": "offerAccepted",
  "agencyOffers.declined": "offerDeclined",
  "agencyOffers.failed": "offerDecisionFailed",
  "agencyOffers.teamAgreed": "teamOfferAgreed",
  "agencyOffers.teamDeclined": "teamOfferDeclined",
};

describe("mobile agency offers", () => {
  const screen = read("apps/mobile/src/screens/agency-offers.tsx");

  it("reads and answers through the canonical capabilities only", () => {
    expect(screen).toContain('useCapability<ClientOffersData>("client.agency_offers.get", NO_ARGS)');
    expect(screen).toContain('"company.respond-offer"');
    expect(screen).toContain('"company.respond-team-offer"');
    expect(screen).toContain("name: `${capabilityOf(answer)}.prepare`");
    expect(screen).toContain("name: `${capabilityOf(answer)}.confirm`");
    expect(screen).not.toMatch(/supabase\s*\.\s*from\(/);
  });

  it("confirms with the prepare's own input and token", () => {
    expect(screen).toMatch(/args: \{ input: prepared\.input, confirmationToken: prepared\.confirmationToken \}/);
  });

  it("only an open team offer can be answered", () => {
    expect(screen).toContain('offer.status === "offered"');
  });

  it("never shows a worker name or contact", () => {
    expect(screen).not.toMatch(/\.(workerName|fullName|full_name|email|phone|contact)\b/);
  });

  it("uses the web chat's own words in every locale", () => {
    const messages = read("apps/mobile/src/i18n/messages.ts");
    for (const locale of LOCALES) {
      const web = JSON.parse(read(`apps/web/messages/${locale}.json`)).conversation.chat as Record<string, string>;
      const start = messages.indexOf(locale === "en" ? "const en = {" : `const ${locale}: Catalogue = {`);
      const end = messages.indexOf(locale === "en" ? "\n} as const;" : "\n};", start);
      const block = messages.slice(start, end);
      for (const [mobileKey, webKey] of Object.entries(SAME_WORDS)) {
        expect(block, `${locale} ${mobileKey}`).toContain(`"${mobileKey}": ${JSON.stringify(web[webKey])}`);
      }
    }
  });
});
