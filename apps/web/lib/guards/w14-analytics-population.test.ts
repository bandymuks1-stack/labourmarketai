import { describe, expect, it } from "vitest";

import {
  ANALYTICS_POPULATIONS,
  HISTORICAL_CONTAMINATION_UNKNOWN,
  RATE_AUTH_PROFILE,
  classifyEvent,
  countsForBusinessFunnel,
  isBusinessFunnelCountable,
} from "@/lib/analytics/population";
import { summariseFunnel } from "@/lib/admin/conversion-funnel";
import {
  isNonProductionHostname,
  isProductionHost,
} from "@/lib/telemetry/production-host";
import { FUNNEL_EVENTS } from "@/lib/telemetry/funnel-events";

/**
 * Guard for W14 item 5 — SYNTHETIC / QA EXCLUSION.
 *
 * THE STATE THIS REPLACES. Exclusion was decided per surface. The admin event
 * inbox had an opt-in "exclude admins" checkbox; the acquisition funnel had a
 * hardcoded `preview_host` filter and never saw that checkbox. So the owner's
 * own navigation counted as acquisition traffic on the one panel that exists
 * to judge whether to spend money on ads, while the table underneath it could
 * be told to hide exactly those rows. Two surfaces over one table, disagreeing
 * about who counts.
 *
 * Worse, `preview_host` was stamped only by the CLIENT emitter. Server-emitted
 * mid-funnel events (`match_preview_generated` … `engagement_created`) carried
 * no marker at all, so one localhost or preview session produced half-marked
 * telemetry: its client events excluded, its server events counted as real.
 * And `pnpm dev` loads `.env.local`, which points at the PRODUCTION Supabase
 * project — so ordinary local development was writing counted rows into the
 * owner's production funnel.
 *
 * THE RULES HELD HERE.
 *   - one boundary, applied uniformly to every event feeding every rate;
 *   - admin means PLATFORM admin (owner/staff), never an employer or worker
 *     who merely holds a privileged role inside their own organisation;
 *   - anonymous COUNTS — it is the normal state of a real prospect at the top
 *     of the funnel — and the internal browsing it therefore hides is stated,
 *     not silently claimed as clean;
 *   - a rate's two sides must share an authentication profile, or an
 *     actor-based filter would deflate it rather than clean it.
 */

const ADMINS = new Set(["admin-1", "admin-2"]);

const ev = (
  event: string,
  over: { profile_id?: string | null; metadata?: Record<string, unknown> | null } = {},
) => ({
  event_name: event,
  metadata: over.metadata ?? null,
  profile_id: over.profile_id ?? null,
});

const rows = (event: string, n: number, over = {}) =>
  Array.from({ length: n }, () => ev(event, over));

/* ------------------------------------------------------------------ */
/* One shared host rule — the client/server divergence                  */
/* ------------------------------------------------------------------ */

describe("W14 item 5 — one host rule for both emitters", () => {
  it("recognises the real product hosts", () => {
    for (const h of [
      "labourmarket.ai",
      "www.labourmarket.ai",
      "LABOURMARKET.AI",
      "labourmarket-ai.vercel.app",
      "labourmarket.ai:443",
    ]) {
      expect(isProductionHost(h), h).toBe(true);
    }
  });

  it("treats development and preview origins as non-production", () => {
    for (const h of [
      "localhost",
      "localhost:3000",
      "127.0.0.1:3000",
      "lmai-git-feature-x.vercel.app",
      "192.168.1.10:3000",
      "",
      null,
      undefined,
    ]) {
      expect(isNonProductionHostname(h), String(h)).toBe(true);
    }
  });

  it("is not fooled by a lookalike suffix", () => {
    // `labourmarket.ai.evil.test` must not pass as production.
    expect(isProductionHost("labourmarket.ai.evil.test")).toBe(false);
    expect(isProductionHost("notlabourmarket.ai")).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* Classification                                                       */
/* ------------------------------------------------------------------ */

describe("W14 item 5 — populations are classified from real fields only", () => {
  it("classifies each population deterministically", () => {
    expect(classifyEvent({ profileId: "user-9", metadata: null }, ADMINS)).toBe(
      "identified_user",
    );
    expect(classifyEvent({ profileId: "admin-1", metadata: null }, ADMINS)).toBe(
      "admin",
    );
    expect(classifyEvent({ profileId: null, metadata: null }, ADMINS)).toBe(
      "anonymous",
    );
    expect(
      classifyEvent({ profileId: "user-9", metadata: { preview_host: true } }, ADMINS),
    ).toBe("preview");
  });

  it("lets a preview origin outrank the identity behind it", () => {
    // A real user testing on a preview deploy is still not production traffic.
    expect(
      classifyEvent(
        { profileId: "admin-1", metadata: { preview_host: true } },
        ADMINS,
      ),
    ).toBe("preview");
  });

  it("covers every declared population", () => {
    const seen = new Set([
      classifyEvent({ profileId: "u", metadata: null }, ADMINS),
      classifyEvent({ profileId: "admin-1", metadata: null }, ADMINS),
      classifyEvent({ profileId: null, metadata: null }, ADMINS),
      classifyEvent({ profileId: null, metadata: { preview_host: true } }, ADMINS),
    ]);
    expect([...seen].sort()).toEqual([...ANALYTICS_POPULATIONS].sort());
  });

  it("uses no heuristics — route, locale and event name are ignored", () => {
    const a = classifyEvent(
      { profileId: "u", metadata: { utm_source: "google", locale: "lt" } },
      ADMINS,
    );
    const b = classifyEvent({ profileId: "u", metadata: null }, ADMINS);
    expect(a).toBe(b);
  });
});

describe("W14 item 5 — who belongs in a business conversion metric", () => {
  it("includes a real external user", () => {
    expect(countsForBusinessFunnel({ profileId: "user-9", metadata: null }, ADMINS)).toBe(true);
  });

  it("includes an anonymous visitor — the normal top-of-funnel state", () => {
    expect(countsForBusinessFunnel({ profileId: null, metadata: null }, ADMINS)).toBe(true);
  });

  it("excludes platform-admin navigation", () => {
    expect(countsForBusinessFunnel({ profileId: "admin-1", metadata: null }, ADMINS)).toBe(false);
  });

  it("excludes preview / localhost events", () => {
    expect(
      countsForBusinessFunnel({ profileId: null, metadata: { preview_host: true } }, ADMINS),
    ).toBe(false);
  });

  it("does NOT exclude an employer or worker for being privileged elsewhere", () => {
    // A company owner is privileged inside their own organisation and is still
    // a real customer. Only the PLATFORM admin set is internal.
    const employer = { profileId: "company-owner-42", metadata: null };
    expect(countsForBusinessFunnel(employer, ADMINS)).toBe(true);
    expect(classifyEvent(employer, ADMINS)).toBe("identified_user");
  });
});

/* ------------------------------------------------------------------ */
/* The funnel applies the boundary                                      */
/* ------------------------------------------------------------------ */

describe("W14 item 5 — the funnel counts the business population", () => {
  it("removes admin events from both sides of a rate", () => {
    const all = [
      ...rows(FUNNEL_EVENTS.landingViewed, 100),
      ...rows(FUNNEL_EVENTS.landingViewed, 100, { profile_id: "admin-1" }),
      ...rows(FUNNEL_EVENTS.ctaClicked, 25),
      ...rows(FUNNEL_EVENTS.ctaClicked, 25, { profile_id: "admin-1" }),
    ];
    const out = summariseFunnel(all, ADMINS);
    expect(out.excludedAdmin).toBe(125);
    // 25/100 — the admin half is gone from numerator AND denominator, so the
    // real rate is unchanged rather than doubled or halved.
    expect(out.rates.find((r) => r.label === "Landing → CTA click")!.pct).toBe(25);
  });

  it("counts admin and preview exclusions separately", () => {
    const out = summariseFunnel(
      [
        ...rows(FUNNEL_EVENTS.landingViewed, 10),
        ...rows(FUNNEL_EVENTS.landingViewed, 3, { profile_id: "admin-2" }),
        ...rows(FUNNEL_EVENTS.landingViewed, 4, { metadata: { preview_host: true } }),
      ],
      ADMINS,
    );
    expect(out.excludedAdmin).toBe(3);
    expect(out.excludedPreview).toBe(4);
    expect(out.totalEvents).toBe(10);
  });

  it("with no admin set supplied, excludes nobody by identity", () => {
    // Fail-open on identity: a failed admin read must not delete real traffic.
    const out = summariseFunnel([
      ...rows(FUNNEL_EVENTS.landingViewed, 10, { profile_id: "admin-1" }),
    ]);
    expect(out.excludedAdmin).toBe(0);
    expect(out.totalEvents).toBe(10);
  });

  it("carries the contamination caveat verbatim", () => {
    const out = summariseFunnel(rows(FUNNEL_EVENTS.landingViewed, 1), ADMINS);
    expect(out.historicalContaminationUnknown).toBe(HISTORICAL_CONTAMINATION_UNKNOWN);
    expect(out.historicalContaminationUnknown.length).toBeGreaterThan(30);
  });
});

/* ------------------------------------------------------------------ */
/* Symmetry — the property that makes an actor filter safe              */
/* ------------------------------------------------------------------ */

describe("W14 item 5 — every rate compares like with like", () => {
  const PAIRS: [string, string][] = [
    [FUNNEL_EVENTS.ctaClicked, FUNNEL_EVENTS.landingViewed],
    [FUNNEL_EVENTS.registrationStarted, FUNNEL_EVENTS.landingViewed],
    [FUNNEL_EVENTS.onboardingCompleted, FUNNEL_EVENTS.onboardingStarted],
    [FUNNEL_EVENTS.companyNeedSubmitted, FUNNEL_EVENTS.companyNeedStarted],
    [FUNNEL_EVENTS.shortlistAdded, FUNNEL_EVENTS.matchPreviewGenerated],
    [FUNNEL_EVENTS.bookingProposed, FUNNEL_EVENTS.contactRequested],
    [FUNNEL_EVENTS.engagementCreated, FUNNEL_EVENTS.bookingProposed],
  ];

  it("numerator and denominator share an authentication profile", () => {
    // WHY THIS MATTERS: an identity-based filter can only remove AUTHENTICATED
    // internal activity. Applied to a rate whose numerator is authenticated and
    // whose denominator is anonymous, it would shrink the top and leave the
    // bottom — deflating the rate instead of cleaning it. Every current rate
    // compares two events of the same profile, which is what makes one uniform
    // rule safe here.
    for (const [num, den] of PAIRS) {
      const a = RATE_AUTH_PROFILE[num];
      const b = RATE_AUTH_PROFILE[den];
      expect(a, `${num} unclassified`).toBeTruthy();
      expect(b, `${den} unclassified`).toBeTruthy();
      expect(a, `${num} / ${den} mix authentication profiles`).toBe(b);
    }
  });

  it("an authenticated rate is unchanged in value by admin exclusion", () => {
    const clean = summariseFunnel(
      [
        ...rows(FUNNEL_EVENTS.onboardingStarted, 40),
        ...rows(FUNNEL_EVENTS.onboardingCompleted, 10),
      ],
      ADMINS,
    );
    const withAdminNoise = summariseFunnel(
      [
        ...rows(FUNNEL_EVENTS.onboardingStarted, 40),
        ...rows(FUNNEL_EVENTS.onboardingCompleted, 10),
        ...rows(FUNNEL_EVENTS.onboardingStarted, 17, { profile_id: "admin-1" }),
        ...rows(FUNNEL_EVENTS.onboardingCompleted, 17, { profile_id: "admin-1" }),
      ],
      ADMINS,
    );
    const label = "Onboarding completion";
    expect(withAdminNoise.rates.find((r) => r.label === label)!.pct).toBe(
      clean.rates.find((r) => r.label === label)!.pct,
    );
    expect(clean.rates.find((r) => r.label === label)!.pct).toBe(25);
  });
});

/* ------------------------------------------------------------------ */
/* Negative controls — each is a violation the guard must reject        */
/* ------------------------------------------------------------------ */

describe("W14 item 5 — negative controls", () => {
  it("REJECTS admin counted as external traffic", () => {
    const wrong = (p: string) => p === "identified_user" || p === "anonymous" || p === "admin";
    expect(wrong("admin")).toBe(true); // the injected rule…
    expect(isBusinessFunnelCountable("admin")).toBe(false); // …is not the real one
  });

  it("REJECTS synthetic/preview counted as real", () => {
    expect(isBusinessFunnelCountable("preview")).toBe(false);
  });

  it("REJECTS a legitimate user being excluded", () => {
    expect(isBusinessFunnelCountable("identified_user")).toBe(true);
    expect(isBusinessFunnelCountable("anonymous")).toBe(true);
  });

  it("REJECTS treating history as certified clean", () => {
    // The caveat must be a real sentence naming BOTH reasons — an empty or
    // vague string would let a surface imply the numbers are clean.
    expect(HISTORICAL_CONTAMINATION_UNKNOWN).toMatch(/logged out|internal/i);
    expect(HISTORICAL_CONTAMINATION_UNKNOWN).toMatch(/server-emitted|preview/i);
  });

  it("REJECTS a silent 0 when nothing countable survives", () => {
    // All events excluded → the denominator is unknown, not zero.
    const out = summariseFunnel(
      rows(FUNNEL_EVENTS.landingViewed, 20, { profile_id: "admin-1" }),
      ADMINS,
    );
    expect(out.totalEvents).toBe(0);
    for (const r of out.rates) expect(r.pct).toBeNull();
  });
});
