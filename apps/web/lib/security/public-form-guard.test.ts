import { beforeEach, describe, expect, it, vi } from "vitest";

import { __resetRateLimitsForTest } from "@/lib/security/rate-limit";
import {
  __resetPublicFormRefusalsForTest,
  emailRateKey,
  MIN_FILL_MS,
  PUBLIC_INTAKE_RATE,
  publicIntakeRateLimited,
  recordPublicFormRefusal,
  screenIntakeContent,
  screenPublicFormTiming,
} from "@/lib/security/public-form-guard";

/**
 * Spam guard for the no-signup commercial forms (owner order 2026-11-09).
 * Synthetic text only: the adverts are generic paraphrases, no real sender,
 * address or link.
 */

const NOW = 1_800_000_000_000;
const reader = (f: Record<string, string>) => (name: string) => f[name] ?? "";

describe("form layer: honeypot and fill time", () => {
  it("a person who took their time passes", () => {
    expect(screenPublicFormTiming(reader({ started: String(NOW - 10_000) }), NOW)).toBeNull();
  });

  it("the hidden field filled is a bot", () => {
    expect(screenPublicFormTiming(reader({ website: "x", started: String(NOW - 10_000) }), NOW)).toBe("honeypot");
  });

  it("faster than the minimum is a bot", () => {
    expect(screenPublicFormTiming(reader({ started: String(NOW - (MIN_FILL_MS - 1)) }), NOW)).toBe("too_fast");
    expect(screenPublicFormTiming(reader({ started: String(NOW - MIN_FILL_MS) }), NOW)).toBeNull();
  });

  it("no fill time at all (a send without JavaScript) is told apart from a forged one", () => {
    expect(screenPublicFormTiming(reader({}), NOW)).toBe("no_timestamp");
    expect(screenPublicFormTiming(reader({ started: "  " }), NOW)).toBe("no_timestamp");
  });

  it("the honeypot wins over a missing fill time", () => {
    expect(screenPublicFormTiming(reader({ website: "x" }), NOW)).toBe("honeypot");
  });

  it.each([
    ["not a number", "soon"],
    ["negative", "-5"],
    ["far in the future", String(NOW + 60 * 60 * 1000)],
  ])("a fill time that is %s is forged", (_n, started) => {
    expect(screenPublicFormTiming(reader({ started }), NOW)).toBe("bad_timestamp");
  });
});

describe("content layer: links, names, adverts", () => {
  const need = (description: string, names: string[] = ["UAB Statyba"]) =>
    screenIntakeContent({ freeText: [description, "tiler", "Vilnius"], names });

  it.each([
    "Reikia 5 plytelių klojėjų Vilniuje nuo kovo.",
    "Ieškome 10 suvirintojų į Klaipėdą. Daugiau apie mus: https://www.firma.lt/apie",
    "We need two electricians in Riga. Site plan: https://firma.lv/plan and https://firma.lv/map",
    "Looking for a marketer to run email campaigns. Details: https://firma.lt/job",
    "B2B bendradarbiavimo užklausa\nVieta: LT, Vilnius\nFasadai\n2000 m2\nkovas",
  ])("a real-looking need is accepted: %s", (text) => {
    expect(need(text)).toBeNull();
  });

  it("three or more links are refused", () => {
    expect(need("See https://a.example.com https://b.example.com www.c.example.org")).toBe("too_many_links");
  });

  it("a URL as a company or person name is refused", () => {
    expect(need("We need a tiler.", ["https://seller.example.com"])).toBe("link_in_name");
  });

  it.each([
    "Get free B2B data today: verified emails for every company. https://seller.example.org",
    "Our database of 30 million companies with phones. Download now: https://seller.example.com",
    "Buy a lead list for your sales team, verified emails included.",
    "Fresh contact lists every week. To opt out reply STOP. seller.example.com",
  ])("a known spam shape is refused: %s", (text) => {
    expect(need(text)).toBe("advert");
  });
});

describe("rate layer: per IP and per e-mail", () => {
  beforeEach(() => __resetRateLimitsForTest());

  it("N sends from one IP in the window pass, the next is refused, and after the window it passes again", () => {
    const { limit, windowMs } = PUBLIC_INTAKE_RATE.ip;
    for (let i = 0; i < limit; i++) {
      expect(publicIntakeRateLimited({ ipKey: "203.0.113.7", email: `p${i}@example.test`, nowMs: NOW + i })).toBeNull();
    }
    expect(publicIntakeRateLimited({ ipKey: "203.0.113.7", email: "other@example.test", nowMs: NOW + limit })).toBe("rate_ip");
    expect(publicIntakeRateLimited({ ipKey: "203.0.113.7", email: "later@example.test", nowMs: NOW + windowMs + limit })).toBeNull();
  });

  it("N sends with one e-mail from many IPs pass, the next is refused, after 24 h it passes", () => {
    const { limit, windowMs } = PUBLIC_INTAKE_RATE.email;
    for (let i = 0; i < limit; i++) {
      expect(publicIntakeRateLimited({ ipKey: `198.51.100.${i}`, email: "Same@Example.test", nowMs: NOW + i })).toBeNull();
    }
    expect(publicIntakeRateLimited({ ipKey: "198.51.100.99", email: " same@example.test ", nowMs: NOW + limit })).toBe("rate_email");
    expect(publicIntakeRateLimited({ ipKey: "198.51.100.98", email: "same@example.test", nowMs: NOW + windowMs + limit })).toBeNull();
  });

  it("the e-mail is keyed by a hash, never held as written", () => {
    const key = emailRateKey("Person@Example.test");
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(key).toBe(emailRateKey(" person@example.test"));
    expect(key).not.toContain("example");
  });
});

describe("the refusal log", () => {
  it("counts per surface and reason and carries nothing personal", () => {
    __resetPublicFormRefusalsForTest();
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    expect(recordPublicFormRefusal("company-need", "advert")).toBe(1);
    expect(recordPublicFormRefusal("company-need", "advert")).toBe(2);
    expect(recordPublicFormRefusal("request-door", "advert")).toBe(1);
    expect(info).toHaveBeenLastCalledWith("[public-form-guard] refused", { surface: "request-door", reason: "advert", count: 1 });
    info.mockRestore();
  });
});
