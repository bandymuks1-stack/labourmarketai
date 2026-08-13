import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createTranslator } from "next-intl";

import { activeLocales } from "@/lib/i18n/config";
import { INVITATION_TYPES } from "@/lib/invitations/model";
import {
  buildInvitationBody,
  buildInvitationSubject,
  resolveRecipientLocale,
  type InvitationEmailTranslator,
} from "./email-content";

/**
 * Recipient-oriented invitation emails (V8 W4-B item 6).
 *
 * The subject/body used to be LT/EN ternaries keyed on the SENDER'S UI
 * locale. These tests prove the catalog-backed builders resolve for EVERY
 * active locale and EVERY invitation type against the REAL message files
 * (createTranslator over messages/{locale}.json — the same catalogs
 * getTranslations serves in production), and that an invalid requested
 * locale falls back to the sender's locale.
 */

const APP = join(__dirname, "..", "..");

function translatorFor(locale: string): InvitationEmailTranslator {
  const catalog = JSON.parse(
    readFileSync(join(APP, "messages", `${locale}.json`), "utf8"),
  ) as { invitations: { email: Record<string, unknown> } };
  return createTranslator({
    locale,
    messages: { invitations: catalog.invitations },
    namespace: "invitations.email",
  }) as unknown as InvitationEmailTranslator;
}

describe("subject and body resolve for all 5 active locales", () => {
  for (const locale of activeLocales) {
    it(`${locale}: every invitation type gets a real subject`, () => {
      const t = translatorFor(locale);
      for (const type of INVITATION_TYPES) {
        const subject = buildInvitationSubject(t, type);
        expect(subject.trim().length, `${locale} ${type}`).toBeGreaterThan(0);
        expect(subject, `${locale} ${type}`).toContain("LabourMarket.ai");
        // A missing key would come back as the raw dotted key.
        expect(subject).not.toContain("invitations.email");
      }
    });

    it(`${locale}: the body carries intro, link and validity note`, () => {
      const t = translatorFor(locale);
      const body = buildInvitationBody(t, {
        link: "https://labourmarket.ai/xx/invite/tok123",
        personalMessage: null,
      });
      expect(body).toContain("https://labourmarket.ai/xx/invite/tok123");
      expect(body).not.toContain("invitations.email");
      expect(body.split("\n").length).toBeGreaterThanOrEqual(5);
    });
  }

  it("a personal message rides quoted; none means no quote line", () => {
    const t = translatorFor("en");
    const withMsg = buildInvitationBody(t, {
      link: "https://x.example/l",
      personalMessage: "  welcome aboard  ",
    });
    expect(withMsg).toContain('"welcome aboard"');
    const without = buildInvitationBody(t, {
      link: "https://x.example/l",
      personalMessage: null,
    });
    expect(without).not.toContain('"');
  });

  it("distinct languages produce distinct copy (not five copies of EN)", () => {
    const en = buildInvitationSubject(translatorFor("en"), "join_project");
    const lt = buildInvitationSubject(translatorFor("lt"), "join_project");
    const ru = buildInvitationSubject(translatorFor("ru"), "join_project");
    expect(new Set([en, lt, ru]).size).toBe(3);
  });
});

describe("resolveRecipientLocale — validated server-side", () => {
  it("a valid active requested locale wins", () => {
    expect(resolveRecipientLocale("ru", "lt")).toBe("ru");
  });

  it("an invalid or inactive requested locale falls back to the sender's", () => {
    for (const bad of ["sv", "xx", "", null, undefined, "LT"]) {
      expect(resolveRecipientLocale(bad, "de"), String(bad)).toBe("de");
    }
  });

  it("an invalid sender locale falls back to the default locale", () => {
    expect(resolveRecipientLocale("xx", "zz")).toBe("lt");
  });
});
