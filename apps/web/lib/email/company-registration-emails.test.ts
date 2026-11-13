import { describe, expect, it } from "vitest";

import {
  WELCOME_LOCALES,
  companyRegistrationNotice,
  companyWelcomeEmail,
  intakeAlertEmail,
  utcDateTime,
  welcomeLocaleFor,
} from "./company-registration-emails";

const SITE = "https://labourmarket.ai";

/**
 * THE OWNER'S TEXT, AS APPROVED 2026-11-13. This literal is the reference: the
 * e-mail's text part must equal it byte for byte. Do not edit it to make a test
 * pass — a difference means the e-mail changed, and the wording is the owner's.
 */
const OWNER_LT_SUBJECT = "Sveiki prisijungę prie LabourMarket.ai – esame pasiruošę padėti";
const OWNER_LT_TEXT = `Sveiki,

Dėkojame, kad užregistravote savo įmonę LabourMarket.ai platformoje.

Čia galite nemokamai skelbti darbuotojų paieškos ir kitus verslo poreikius, ieškoti specialistų bei bendradarbiavimo galimybių įvairiose profesinėse srityse.

Jeigu registruojantis, pildant įmonės profilį, skelbiant poreikį ar naudojantis bet kuria platformos funkcija iškiltų klausimų arba techninių sunkumų, prašome nedelsiant susisiekti su mumis el. paštu info@labourmarket.ai.

Mums svarbu, kad galėtumėte sklandžiai pradėti naudotis platforma. Jūsų pastabos taip pat padeda mums ją tobulinti.

Pagarbiai,
LabourMarket.ai komanda
info@labourmarket.ai`;

describe("T2 — the welcome e-mail", () => {
  it("the Lithuanian text and subject are the owner's, byte for byte", () => {
    const e = companyWelcomeEmail({ locale: "lt", siteUrl: SITE });
    expect(e.subject).toBe(OWNER_LT_SUBJECT);
    expect(Buffer.from(e.text, "utf8").equals(Buffer.from(OWNER_LT_TEXT, "utf8"))).toBe(true);
  });

  it("is written in exactly the six languages the owner named", () => {
    expect([...WELCOME_LOCALES].sort()).toEqual(["de", "en", "lt", "nl", "pl", "ru"]);
    const subjects = new Set<string>();
    const bodies = new Set<string>();
    for (const locale of WELCOME_LOCALES) {
      const e = companyWelcomeEmail({ locale, siteUrl: SITE });
      expect(e.locale).toBe(locale);
      subjects.add(e.subject);
      bodies.add(e.text);
      // Same structure as the approved text: six paragraphs, the same two facts.
      expect(e.text.split("\n\n")).toHaveLength(6);
      expect(e.subject).toContain("LabourMarket.ai");
      expect(e.text.match(/info@labourmarket\.ai/g)).toHaveLength(2);
      expect(e.html).toContain(`<html lang="${locale}">`);
    }
    expect(subjects.size).toBe(6);
    expect(bodies.size).toBe(6);
  });

  it("a translation addresses the company politely", () => {
    expect(companyWelcomeEmail({ locale: "ru", siteUrl: SITE }).text).toMatch(/ Вы /);
    expect(companyWelcomeEmail({ locale: "pl", siteUrl: SITE }).text).toMatch(/Państw/);
    expect(companyWelcomeEmail({ locale: "de", siteUrl: SITE }).text).toMatch(/\bSie\b/);
    expect(companyWelcomeEmail({ locale: "nl", siteUrl: SITE }).text).toMatch(/\bu\b/);
    // British English: "e-mail" as the owner's house style, no "Hi"/"Hey".
    expect(companyWelcomeEmail({ locale: "en", siteUrl: SITE }).text).toMatch(/^Hello,/);
  });

  it("any other interface language gets English, never a missing e-mail", () => {
    expect(welcomeLocaleFor("sv")).toBe("en");
    expect(welcomeLocaleFor(null)).toBe("en");
    expect(welcomeLocaleFor("DE-de")).toBe("de");
  });

  it("promises no price, payment or response time and carries no advertising", () => {
    for (const locale of WELCOME_LOCALES) {
      const e = companyWelcomeEmail({ locale, siteUrl: SITE });
      const all = `${e.subject}\n${e.text}`;
      expect(all).not.toMatch(/€|EUR|\$|%|\bper \d+ (val|h|hours)\b|24 ?(val|h)\b|utm_|unsubscribe|akcij|nuolaid|discount|rabat/i);
      // The only links: the support address. No tracking pixel, no campaign link.
      const hrefs = [...e.html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
      expect(new Set(hrefs)).toEqual(new Set(["mailto:info@labourmarket.ai"]));
    }
  });

  it("shows only the original LabourMarket.ai mark, from our own site", () => {
    const { html } = companyWelcomeEmail({ locale: "lt", siteUrl: `${SITE}/` });
    const images = [...html.matchAll(/<img[^>]+src="([^"]+)"/g)].map((m) => m[1]);
    expect(images).toEqual(["https://labourmarket.ai/icon-192.png"]);
    expect(html).toContain('alt="LabourMarket.ai"');
    expect(html).not.toMatch(/<script|<link|<style|javascript:/i);
  });

  it("reads on a phone: fluid width, viewport set, no fixed wide table", () => {
    const { html } = companyWelcomeEmail({ locale: "lt", siteUrl: SITE });
    expect(html).toContain('name="viewport"');
    expect(html).toContain("max-width:600px");
    expect(html).not.toMatch(/width="(6|7|8)\d\d"/);
  });
});

describe("T1 — the notice to the owner about a new company", () => {
  const notice = companyRegistrationNotice({
    organizationName: "QA-SYNTHETIC Statyba UAB",
    countryCode: "LT",
    registeredAtIso: "2026-11-13T19:40:00.000Z",
    contactName: "QA-SYNTHETIC Vardenis",
    contactEmail: "qa.synthetic@example.test",
    adminUrl: "https://labourmarket.ai/lt/dashboard/admin/company-verification#company-00000000-0000-4000-8000-000000000001",
    publishedNeeds: 0,
    siteUrl: SITE,
  });

  it("has the subject the owner worded, with the company's name", () => {
    expect(notice.subject).toBe("LabourMarket.ai – užsiregistravo nauja įmonė: QA-SYNTHETIC Statyba UAB");
  });

  it("states name, country, date and time, contact, admin link and whether a need is published", () => {
    for (const part of [
      "Įmonės pavadinimas: QA-SYNTHETIC Statyba UAB",
      "Šalis: Lietuva (LT)",
      "Registracijos data ir laikas: 2026-11-13 19:40 UTC",
      "Kontaktinis asmuo: QA-SYNTHETIC Vardenis",
      "Darbo el. paštas: qa.synthetic@example.test",
      "Ar įmonė jau paskelbė poreikį: Dar ne",
      "Organizacijos profilis administratoriui: https://labourmarket.ai/lt/dashboard/admin/company-verification#company-",
    ]) {
      expect(notice.text).toContain(part);
    }
    expect(notice.html).toContain('href="https://labourmarket.ai/lt/dashboard/admin/company-verification#company-');
  });

  it("says so when a fact is not available instead of guessing", () => {
    const bare = companyRegistrationNotice({
      organizationName: "QA-SYNTHETIC",
      countryCode: null,
      registeredAtIso: "not a date",
      contactName: null,
      contactEmail: null,
      adminUrl: "https://labourmarket.ai/lt/dashboard/admin/company-verification",
      publishedNeeds: null,
      siteUrl: SITE,
    });
    expect(bare.text).toContain("Šalis: nenurodyta");
    expect(bare.text).toContain("Kontaktinis asmuo: nepateikta");
    expect(bare.text).toContain("Darbo el. paštas: nepateikta");
    expect(bare.text).toContain("Ar įmonė jau paskelbė poreikį: nepavyko nustatyti");
    expect(bare.text).toContain("Registracijos data ir laikas: nežinoma");
    expect(companyRegistrationNotice({ organizationName: "X", countryCode: "LT", registeredAtIso: "2026-11-13T19:40:00Z", contactName: null, contactEmail: null, adminUrl: "u", publishedNeeds: 3, siteUrl: SITE }).text).toContain("Taip (3)");
  });

  it("a name cannot inject markup or a second subject line", () => {
    const hostile = companyRegistrationNotice({
      organizationName: '<img src=x onerror=alert(1)>\r\nBcc: someone@example.test',
      countryCode: "LT",
      registeredAtIso: "2026-11-13T19:40:00Z",
      contactName: "<b>x</b>",
      contactEmail: null,
      adminUrl: "https://labourmarket.ai/x",
      publishedNeeds: 0,
      siteUrl: SITE,
    });
    expect(hostile.subject).not.toMatch(/[\r\n]/);
    expect(hostile.html).not.toContain("<img src=x");
    expect(hostile.html).not.toContain("<b>x</b>");
    expect(hostile.html).toContain("&lt;img src=x");
  });

  it("is plainly a system notice, not a customer's e-mail", () => {
    expect(notice.text).toContain("Tai ne kliento laiškas.");
  });

  it("the time is UTC and says so, whatever the season", () => {
    expect(utcDateTime("2026-07-01T10:00:00Z")).toBe("2026-07-01 10:00 UTC");
    expect(utcDateTime("2026-12-01T10:00:00+02:00")).toBe("2026-12-01 08:00 UTC");
  });
});

describe("T3/T4 — the request alert", () => {
  const alert = intakeAlertEmail({
    title: "B2B bendradarbiavimo užklausa",
    queueUrl: "https://labourmarket.ai/lt/dashboard/admin/company-need-intakes#00000000-0000-4000-8000-000000000002",
    siteUrl: SITE,
  });

  it("names the request type and links to the queue", () => {
    expect(alert.subject).toBe("LabourMarket.ai – nauja užklausa: B2B bendradarbiavimo užklausa");
    expect(alert.text).toContain("https://labourmarket.ai/lt/dashboard/admin/company-need-intakes#");
  });

  it("promises no response time", () => {
    // The text part and the visible HTML carry the same words; the text is checked.
    expect(`${alert.subject}\n${alert.text}`).not.toMatch(/\d+ ?(val|h)\b|per \d|valand|darbo dien|within|atsakysime|susisieksime/i);
    expect(alert.html).toContain("laukia peržiūros");
  });
});
