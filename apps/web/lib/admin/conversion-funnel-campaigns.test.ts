import { describe, expect, it } from "vitest";

import {
  CAMPAIGN_MAX_ROWS,
  FUNNEL_MAX_ROWS,
  FUNNEL_READ_EVENTS,
  summariseFunnel,
} from "@/lib/admin/conversion-funnel";
import { FUNNEL_EVENTS } from "@/lib/telemetry/funnel-events";

/**
 * PER-CAMPAIGN READ-OUT (2026-09-20).
 *
 * The owner's question was never "which utm_source converts" — it was "did
 * THAT post, in THAT group, in THAT language, carry anyone from the
 * advertisement to an opened job to an account". `sources` cannot answer it:
 * it averages every variant of a campaign into one row and only looks at two
 * conversion events.
 *
 * These tests pin the projection over the SAME rows and the SAME population
 * classification the counts above it use — and, just as importantly, pin the
 * honesty rules: untagged traffic is not a campaign, a missing variant is
 * labelled rather than silently merged, and preview / admin rows are excluded
 * from the campaign table exactly as they are from every other number.
 */

type Row = {
  event_name: string;
  metadata: Record<string, unknown> | null;
  profile_id?: string | null;
};

const row = (
  event_name: string,
  metadata: Record<string, unknown> | null = null,
  profile_id: string | null = null,
): Row => ({ event_name, metadata, profile_id });

const campaign = (name: string, content?: string) => ({
  utm_campaign: name,
  ...(content ? { utm_content: content } : {}),
});

const many = (n: number, make: (i: number) => Row): Row[] =>
  Array.from({ length: n }, (_, i) => make(i));

describe("the read fetches every event the campaign table reports", () => {
  it("includes signup_completed, which has no stage tile of its own", () => {
    // Without this the column would print a structural 0 for every row, and
    // a structural 0 is indistinguishable from a measured one.
    expect(FUNNEL_READ_EVENTS).toContain(FUNNEL_EVENTS.signupCompleted);
  });

  it("includes every other campaign column's event", () => {
    for (const e of [
      FUNNEL_EVENTS.landingViewed,
      FUNNEL_EVENTS.jobOpened,
      FUNNEL_EVENTS.ctaClicked,
      FUNNEL_EVENTS.registrationStarted,
      FUNNEL_EVENTS.jobReturnedAfterAuth,
      FUNNEL_EVENTS.jobCompared,
      FUNNEL_EVENTS.vacancyInterestExpressed,
    ]) {
      expect(FUNNEL_READ_EVENTS).toContain(e);
    }
  });

  it("names each event exactly once — a duplicate would hide a merged list", () => {
    expect(new Set(FUNNEL_READ_EVENTS).size).toBe(FUNNEL_READ_EVENTS.length);
  });
});

describe("one campaign variant reads as one row of the real handoff", () => {
  const rows: Row[] = [
    ...many(4, () => row(FUNNEL_EVENTS.landingViewed, campaign("welder-w1", "pl"))),
    ...many(3, () => row(FUNNEL_EVENTS.jobOpened, campaign("welder-w1", "pl"))),
    row(FUNNEL_EVENTS.ctaClicked, campaign("welder-w1", "pl")),
    row(FUNNEL_EVENTS.registrationStarted, campaign("welder-w1", "pl")),
    row(FUNNEL_EVENTS.signupCompleted, campaign("welder-w1", "pl")),
    row(FUNNEL_EVENTS.jobReturnedAfterAuth, campaign("welder-w1", "pl")),
    ...many(2, () => row(FUNNEL_EVENTS.jobCompared, campaign("welder-w1", "pl"))),
    row(FUNNEL_EVENTS.vacancyInterestExpressed, campaign("welder-w1", "pl")),
  ];

  it("counts every step of the handoff on the variant that produced it", () => {
    const [only] = summariseFunnel(rows).campaigns;
    expect(only).toEqual({
      campaign: "welder-w1",
      content: "pl",
      landing: 4,
      jobOpened: 3,
      ctaClicked: 1,
      registrationStarted: 1,
      signupCompleted: 1,
      returnedToJob: 1,
      compared: 2,
      interest: 1,
    });
  });

  it("keeps variants of the SAME campaign apart", () => {
    const out = summariseFunnel([
      ...rows,
      ...many(9, () => row(FUNNEL_EVENTS.landingViewed, campaign("welder-w1", "ru"))),
      row(FUNNEL_EVENTS.jobOpened, campaign("welder-w1", "ru")),
    ]).campaigns;
    expect(out).toHaveLength(2);
    // Sorted by landings desc — the ru variant drew more readers.
    expect(out[0]).toMatchObject({ content: "ru", landing: 9, jobOpened: 1 });
    expect(out[1]).toMatchObject({ content: "pl", landing: 4, jobOpened: 3 });
  });

  it("labels a campaign with no variant rather than merging it away", () => {
    const [only] = summariseFunnel([
      row(FUNNEL_EVENTS.landingViewed, campaign("welder-w1")),
    ]).campaigns;
    expect(only).toMatchObject({ campaign: "welder-w1", content: "(none)" });
  });
});

describe("untagged traffic is not a campaign", () => {
  it("excludes rows with no utm_campaign entirely", () => {
    const out = summariseFunnel([
      ...many(50, () => row(FUNNEL_EVENTS.landingViewed, { landing_path: "/lt" })),
      ...many(20, () => row(FUNNEL_EVENTS.landingViewed, null)),
      row(FUNNEL_EVENTS.landingViewed, campaign("welder-w1", "pl")),
    ]).campaigns;
    // 70 organic landings must not appear as the top-performing "(none)" row.
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ campaign: "welder-w1", landing: 1 });
  });

  it("treats a blank / whitespace campaign as untagged, not as a campaign named ' '", () => {
    expect(
      summariseFunnel([
        row(FUNNEL_EVENTS.landingViewed, { utm_campaign: "   " }),
        row(FUNNEL_EVENTS.landingViewed, { utm_campaign: 42 }),
      ]).campaigns,
    ).toHaveLength(0);
  });

  it("leaves the campaign table empty when nothing was tagged", () => {
    expect(summariseFunnel([row(FUNNEL_EVENTS.landingViewed)]).campaigns).toEqual(
      [],
    );
  });
});

describe("the campaign table describes the SAME population as the counts", () => {
  it("excludes preview / localhost events", () => {
    const out = summariseFunnel([
      row(FUNNEL_EVENTS.landingViewed, {
        ...campaign("welder-w1", "pl"),
        preview_host: true,
      }),
      row(FUNNEL_EVENTS.landingViewed, campaign("welder-w1", "pl")),
    ]);
    expect(out.excludedPreview).toBe(1);
    expect(out.campaigns[0]).toMatchObject({ landing: 1 });
  });

  it("excludes platform-admin events", () => {
    const admin = "admin-profile-id";
    const out = summariseFunnel(
      [
        row(FUNNEL_EVENTS.jobOpened, campaign("welder-w1", "pl"), admin),
        row(FUNNEL_EVENTS.jobOpened, campaign("welder-w1", "pl")),
      ],
      new Set([admin]),
    );
    expect(out.excludedAdmin).toBe(1);
    expect(out.campaigns[0]).toMatchObject({ jobOpened: 1 });
  });

  it("is a lower bound when the window read was truncated, like every other count", () => {
    const out = summariseFunnel(
      many(FUNNEL_MAX_ROWS, () =>
        row(FUNNEL_EVENTS.landingViewed, campaign("welder-w1", "pl")),
      ),
    );
    expect(out.truncated).toBe(true);
    expect(out.countsAreLowerBound).toBe(true);
    expect(out.campaigns[0]!.landing).toBe(FUNNEL_MAX_ROWS);
  });
});

describe("the table stays bounded and deterministic", () => {
  it(`keeps at most ${CAMPAIGN_MAX_ROWS} rows, the widest first`, () => {
    // 40 variants, variant i with (i + 1) landings.
    const rows = Array.from({ length: 40 }, (_, i) =>
      many(i + 1, () =>
        row(FUNNEL_EVENTS.landingViewed, campaign("c", `v${String(i).padStart(2, "0")}`)),
      ),
    ).flat();
    const out = summariseFunnel(rows).campaigns;
    expect(out).toHaveLength(CAMPAIGN_MAX_ROWS);
    expect(out[0]).toMatchObject({ content: "v39", landing: 40 });
    expect(out.at(-1)).toMatchObject({ content: "v15", landing: 16 });
    // Strictly non-increasing — the cap keeps the TOP rows, not a slice.
    for (let i = 1; i < out.length; i += 1) {
      expect(out[i]!.landing).toBeLessThanOrEqual(out[i - 1]!.landing);
    }
  });

  it("breaks a tie deterministically instead of shuffling between reads", () => {
    const rows = [
      row(FUNNEL_EVENTS.landingViewed, campaign("beta", "x")),
      row(FUNNEL_EVENTS.landingViewed, campaign("alpha", "z")),
      row(FUNNEL_EVENTS.landingViewed, campaign("alpha", "a")),
    ];
    const order = (rs: Row[]) =>
      summariseFunnel(rs).campaigns.map((c) => `${c.campaign}/${c.content}`);
    expect(order(rows)).toEqual(["alpha/a", "alpha/z", "beta/x"]);
    expect(order([...rows].reverse())).toEqual(order(rows));
  });

  it("caps a campaign label instead of carrying an unbounded string", () => {
    const [only] = summariseFunnel([
      row(FUNNEL_EVENTS.landingViewed, { utm_campaign: "x".repeat(500) }),
    ]).campaigns;
    expect(only!.campaign.length).toBeLessThanOrEqual(60);
  });
});
