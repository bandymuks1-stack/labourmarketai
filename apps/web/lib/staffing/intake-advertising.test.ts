import { describe, expect, it } from "vitest";

import { looksLikeAdvertising } from "./intake-advertising";

/** Paraphrased from the shapes seen in the queue. No real sender, address or link. */
const ADVERTS: readonly (readonly [string, string])[] = [
  [
    "a closing-down notice for a data seller",
    "Hello,\r\n\r\nWe are shutting down.\r\n\r\nOver 33 million companies in our database with phones and emails.\r\n\r\nDownload your data in the next 24 hours.\r\n\r\nhttps://someone.freeb2bdata.org\r\n\r\nRegards",
  ],
  [
    "a relaunch with a price",
    "Hi,\r\n\r\n900 million people, verified emails.\r\n\r\nUnlimited exports.\r\n\r\nLifetime access for just $50.\r\n\r\nClaim your lifetime seat here https://example.org",
  ],
  [
    "a long feature list with an affiliate offer",
    "Quick one: a B2B lead finder.\r\n\r\nPeople search, verified emails.\r\nUnlimited CSV exports.\r\nAffiliate program: earn 20% commission on every referral.\r\n\r\nClaim your seat: https://example.org",
  ],
  [
    "a short pitch with two links",
    "It's the easiest way to get B2B data in bulk.\r\n\r\nWalkthrough: https://example.com/share/x\r\n\r\nDownload it free: https://example.world",
  ],
  [
    "a soft pitch with a bare domain and no https",
    "I'll keep this short since you didn't ask for it.\r\n\r\nA desktop tool that finds businesses and exports them.\r\n\r\nfreeb2bdata.org\r\n\r\nIf you'd rather not hear from me, reply no.",
  ],
];

const GENUINE: readonly (readonly [string, string])[] = [
  ["a short need", "Reikia 5 plytelių klojėjų Vilniuje nuo kovo."],
  ["a need with the company's own site", "Ieškome 10 suvirintojų į Klaipėdą. Daugiau apie mus: https://www.firma.lt/apie"],
  ["a need with a bare domain", "We need two electricians in Riga. See firma.com for the site plan."],
  ["hiring for marketing, with a link", "Looking for a marketer to run email campaigns and cold calling. Details: https://firma.lt/job"],
  ["hiring someone to work on B2B sales", "Pardavimų vadybininkas B2B klientams, 1 žmogus, www.firma.lt"],
  ["a figure that is about money", "Project budget 2 million euros, 40 people, https://firma.lt"],
  ["one seller's word and no link", "We need a data clerk to clean up verified emails in our CRM."],
  ["a door's request with its operator line", "B2B bendradarbiavimo užklausa\nVieta: LT, Vilnius\nFasadai\n2000 m2\nkovas"],
  ["a German need", "Wir suchen 3 Elektriker für eine Baustelle in Hamburg. www.firma.de"],
];

describe("looksLikeAdvertising", () => {
  it.each(ADVERTS)("advert: %s", (_name, text) => {
    expect(looksLikeAdvertising(text)).toBe(true);
  });

  it.each(GENUINE)("genuine, so it stays alerted: %s", (_name, text) => {
    expect(looksLikeAdvertising(text)).toBe(false);
  });

  it("a pitch in the name field counts with a link in the text", () => {
    expect(looksLikeAdvertising("https://example.org", "FreeB2BData", null)).toBe(true);
  });

  it("nothing at all is not an advert", () => {
    expect(looksLikeAdvertising(null, undefined, "")).toBe(false);
  });
});
