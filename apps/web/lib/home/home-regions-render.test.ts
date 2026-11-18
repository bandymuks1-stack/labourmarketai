/**
 * The four-region home — RENDER proof (D1). The real async server views,
 * rendered to static markup with the REAL message catalogs (every active
 * locale) and the loaders mocked, fed by the pure model's own outputs. No
 * database: every state a reader can produce is built with the model.
 *
 * Pinned here:
 *   - UNKNOWN is never ZERO: a failed read renders a named sentence, never a
 *     "0", never an empty region;
 *   - every test id the old ŠIANDIEN sections carried is still emitted;
 *   - ONE gold action, no coloured accent words, no raw key, no [EN] shell.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { activeLocales } from "@/lib/i18n/config";
import type { NotificationEventRow } from "@/lib/notifications/events";
import { deriveTodayModel, deriveTodayNext } from "@/lib/today/today-model";
import { deriveWorkCardState } from "@/lib/worker/work-card-state";

import { composeHomeState, deriveBecause, deriveOutside, deriveRunning, deriveWaiting } from "./home-state";

const state = vi.hoisted(() => ({ locale: "en" }));

const WEB = join(__dirname, "..", "..");
const json = (rel: string) => JSON.parse(readFileSync(join(WEB, "messages", rel), "utf8")) as Record<string, unknown>;
const catalogs: Record<string, Record<string, unknown>> = {};
const catalog = (loc: string) =>
  (catalogs[loc] ??= {
    ...json(`${loc}.json`),
    journal: json(`${loc}/journal.json`),
    skillNames: json(`${loc}/skill-names.json`),
    professions: json(`${loc}/professions.json`),
    productivityUnits: json(`${loc}/productivity-units.json`),
  });

const lookup = (loc: string, path: string): unknown =>
  path.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], catalog(loc));

/** A `getTranslations`-shaped translator over the REAL catalog subtree. A
 *  missing key renders a VISIBLE marker; ICU is reduced to its first branch
 *  with the number written in, which is enough to read the sentence. */
function scoped(loc: string, ns: string) {
  const t = (key: string, values: Record<string, unknown> = {}) => {
    const v = lookup(loc, `${ns}.${key}`);
    if (typeof v !== "string") return `MISSING:${ns}.${key}`;
    return v
      .replace(/\{(\w+), plural,[^{]*\{([^}]*)\}[\s\S]*?\}\s*\}/g, (_, name: string, branch: string) =>
        branch.replace(/#/g, String(values[name] ?? "")),
      )
      .replace(/\{(\w+)\}/g, (_, name: string) => String(values[name] ?? ""));
  };
  t.has = (key: string) => typeof lookup(loc, `${ns}.${key}`) === "string";
  return t;
}

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async (ns: string) => scoped(state.locale, ns)),
}));
vi.mock("@/lib/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: unknown }) =>
    createElement("a", { href, ...rest }, children as never),
}));
vi.mock("@/lib/home/home-server", () => ({
  loadHomeWaiting: vi.fn(),
  loadHomeRunning: vi.fn(),
  loadHomeRecord: vi.fn(),
  loadHomeBecause: vi.fn(),
  loadHomeOutside: vi.fn(),
}));

import {
  HomeBecauseView,
  HomeOutsideView,
  HomeRunningView,
  HomeWaitingView,
} from "@/components/app/home/home-regions";

const html = (el: ReactElement | null) => (el ? renderToStaticMarkup(el) : "");

const ALL_UNKNOWN = composeHomeState({
  today: deriveTodayModel({
    displayName: null,
    professionSlug: null,
    workCard: null,
    workIntelligence: null,
    growth: null,
    opportunities: null,
    attention: null,
  }),
  projects: null,
  events: null,
});

const NEXT = { kind: "action", dim: "location", href: "/dashboard?result=player-card", whyKey: "why.location", stale: true } as const;
const WORK = {
  kind: "known",
  today: { hours: 3.5, entries: 2, untimed: 1 },
  week: { hours: 20, entries: 9, untimed: 1 },
  truncated: false,
} as const;
const ev = (id: string, eventType: string, metadata: Record<string, unknown> = {}): NotificationEventRow =>
  ({
    id,
    eventType,
    entityType: "booking_request",
    entityId: `e-${id}`,
    createdAt: "2026-10-10T10:00:00Z",
    readAt: null,
    metadata,
  }) as unknown as NotificationEventRow;

beforeEach(() => {
  state.locale = "en";
});

describe("UNKNOWN is never ZERO — every region names a failed read", () => {
  it("all four regions, every reader unreadable", async () => {
    const out = [
      html(await HomeWaitingView({ locale: "en", region: ALL_UNKNOWN.waiting, unknownDoors: ["offers", "invitations", "unread"] })),
      html(await HomeRunningView({ locale: "en", running: ALL_UNKNOWN.running })),
      html(await HomeBecauseView({ locale: "en", because: ALL_UNKNOWN.because })),
      html(await HomeOutsideView({ outside: ALL_UNKNOWN.outside })),
    ];
    const [waiting, running, because, outside] = out;
    expect(waiting).toContain('data-testid="today-next-unknown"');
    expect(waiting).toContain('data-state="unknown"');
    expect(running).toContain('data-testid="today-work-unknown"');
    expect(running).toContain('data-testid="today-work-open"');
    expect(because).toContain('data-testid="home-because-unknown"');
    expect(outside).toContain('data-testid="today-opportunity"');
    expect(outside).toContain('data-state="unknown"');
    for (const h of out) {
      expect(h).not.toContain("MISSING:");
      // No figure is invented: nothing renders a bare zero.
      expect(h.replace(/<[^>]+>/g, " ")).not.toMatch(/(^|\s)0(\s|$)/);
      // A failed read never offers the gold action.
      expect(h).not.toContain('data-testid="today-next-cta"');
    }
  });

  it("a failed projects read next to a readable journal is named, not hidden", async () => {
    const r = html(await HomeRunningView({ locale: "en", running: deriveRunning(WORK, null, { kind: "none" }) }));
    expect(r).toContain('data-testid="home-projects-unknown"');
    expect(r).toContain('data-testid="today-work-today"');
    expect(r).not.toContain('data-testid="today-projects"');
  });

  it("a failed open-items read next to a real next action is named", async () => {
    const w = html(
      await HomeWaitingView({ locale: "en", region: deriveWaiting(NEXT, { kind: "unknown" }), unknownDoors: [] }),
    );
    expect(w).toContain('data-testid="today-next-cta"');
    expect(w).toContain('data-testid="today-open-unknown"');
    expect(w).not.toContain('data-testid="home-waiting-clear"');
  });
});

describe("the old ŠIANDIEN test ids are all still emitted by the regions", () => {
  it("waiting · running · outside with real content", async () => {
    const waiting = html(
      await HomeWaitingView({
        locale: "en",
        region: deriveWaiting(NEXT, {
          kind: "known",
          items: [
            { kind: "offers", count: 2, href: "/dashboard/bookings" },
            { kind: "untimed", entries: 1 },
          ],
        }),
        unknownDoors: ["invitations"],
      }),
    );
    for (const id of ["today-next", "today-next-cta", "today-next-stale", "today-open", "today-open-offers", "today-open-untimed"]) {
      expect(waiting, id).toContain(`data-testid="${id}"`);
    }
    expect(waiting).toContain('data-attention-unknown="invitations"');
    expect(waiting).toContain('data-testid="today-open-unknown"');
    // ONE gold action.
    expect(waiting.match(/bg-gradient-cta/g)).toHaveLength(1);

    const running = html(
      await HomeRunningView({
        locale: "en",
        running: deriveRunning(
          { ...WORK, truncated: true },
          [
            { projectId: "p1", title: "Site", city: "Kaunas" },
            { projectId: "p2", title: null, city: null },
            { projectId: "p3", title: "C", city: null },
            { projectId: "p4", title: "D", city: null },
            { projectId: "p5", title: "E", city: null },
          ],
          { kind: "unknown" },
        ),
      }),
    );
    for (const id of [
      "today-work",
      "today-work-today",
      "today-work-untimed",
      "today-work-week",
      "today-work-truncated",
      "today-work-open",
      "today-projects",
      "today-project-p1",
      "today-projects-all",
      "today-growth",
      "today-growth-open",
    ]) {
      expect(running, id).toContain(`data-testid="${id}"`);
    }
    expect(running).toContain('data-testid="today-project-p4"');
    expect(running).not.toContain('data-testid="today-project-p5"');
    expect(running).not.toContain("bg-gradient-cta");

    const outside = html(
      await HomeOutsideView({
        outside: deriveOutside({
          kind: "bands",
          counts: { strong: 0, possible: 0, missing_requirement: 0, conflict: 0, not_assessed: 3 },
          more: 2,
          discoveryOnly: true,
        }),
      }),
    );
    for (const id of ["today-opportunity", "today-opportunity-line", "today-opportunity-open"]) {
      expect(outside, id).toContain(`data-testid="${id}"`);
    }
    expect(outside).toContain('data-discovery-only="true"');
    expect(outside).not.toContain("bg-gradient-cta");
  });

  it("empty answers are left out ('Tuščia = tvarkinga'); a clear waiting region says so once", async () => {
    expect(await HomeOutsideView({ outside: deriveOutside({ kind: "none" }) })).toBeNull();
    expect(await HomeBecauseView({ locale: "en", because: deriveBecause([]) })).toBeNull();
    const clear = html(
      await HomeWaitingView({ locale: "en", region: deriveWaiting({ kind: "unknown" }, { kind: "known", items: [] }), unknownDoors: [] }),
    );
    // The next action could not be read: named, NOT "nothing is waiting".
    expect(clear).toContain('data-testid="today-next-unknown"');
    expect(clear).not.toContain('data-testid="home-waiting-clear"');
  });
});

describe("the causal ledger renders only what the event states", () => {
  it("a supported event draws event → consequence → state; a review decision stays a plain event", async () => {
    const h = html(
      await HomeBecauseView({
        locale: "en",
        because: deriveBecause([ev("1", "booking_accepted"), ev("2", "journal_review_decided", { decision: "approved" })]),
      }),
    );
    expect(h).toContain('data-testid="home-cause-booking_accepted"');
    expect(h).toContain('data-testid="home-cause-state"');
    expect(h).toContain('data-testid="home-events"');
    expect(h).toContain('data-level="confirmed"');
    expect(h.match(/data-testid="home-cause-/g)?.length).toBe(3); // cause + consequence + state
    expect(h).not.toContain("MISSING:");
    // State is a word in a neutral shape, never green.
    expect(h).not.toMatch(/state-success/);
  });
});

describe("restraint: plain titles, real copy in every active locale", () => {
  it("no accent markers, no raw keys, no [EN] shells", async () => {
    for (const loc of activeLocales) {
      state.locale = loc;
      const out = [
        html(await HomeWaitingView({ locale: loc, region: deriveWaiting(NEXT, { kind: "known", items: [] }), unknownDoors: [] })),
        html(await HomeRunningView({ locale: loc, running: ALL_UNKNOWN.running })),
        html(await HomeBecauseView({ locale: loc, because: deriveBecause([ev("1", "engagement_created")]) })),
        html(await HomeOutsideView({ outside: ALL_UNKNOWN.outside })),
      ].join("\n");
      expect(out, loc).not.toContain("MISSING:");
      expect(out, loc).not.toContain("[EN]");
      expect(out, loc).not.toContain("*");
      expect(out, loc).not.toMatch(/\bitalic\b/);
      for (const id of ["waiting", "running", "because", "outside"] as const) {
        const title = lookup(loc, `homeRegions.${id}.title`) as string;
        expect(title, `${loc} ${id}`).toBeTruthy();
        if (loc !== "en") expect(title, `${loc} ${id}`).not.toBe(lookup("en", `homeRegions.${id}.title`));
      }
    }
  });
});

describe("one reading order on every screen", () => {
  it("opportunities are 03 and recent events 04 — the DOM order, so the phone needs no renumbering", async () => {
    const outside = html(await HomeOutsideView({ outside: ALL_UNKNOWN.outside }));
    const because = html(await HomeBecauseView({ locale: "en", because: ALL_UNKNOWN.because }));
    expect(outside).toMatch(/>04</);
    expect(because).toMatch(/>05</);
    // A failed read always offers a way to read again.
    expect(outside).toContain('data-testid="home-opportunity-unknown-retry"');
    expect(because).toContain('data-testid="home-because-unknown-retry"');
  });
});

describe("events region on the home lists only PLAIN events (the trace draws the chains)", () => {
  it("plainOnly drops the causal rows and keeps the plain ones", async () => {
    const because = deriveBecause([ev("1", "booking_accepted"), ev("2", "message_received")]);
    const h = html(await HomeBecauseView({ locale: "en", because, plainOnly: true }));
    expect(h).not.toContain('data-testid="home-cause-booking_accepted"');
    expect(h).toContain('data-testid="home-events"');
  });

  it("plainOnly with only causal events leaves the region out", async () => {
    const because = deriveBecause([ev("1", "booking_accepted")]);
    expect(await HomeBecauseView({ locale: "en", because, plainOnly: true })).toBeNull();
  });
});

describe("personal record line — self-only, quiet, never shown without a record", () => {
  const RUNNING = deriveRunning(
    { kind: "known", today: { hours: 2, entries: 1, untimed: 0 }, week: { hours: 30, entries: 6, untimed: 0, confirmedHours: 20 }, truncated: false } as never,
    [],
    { kind: "none" },
  );

  it("renders the record and says only the person sees it", async () => {
    const h = html(
      await HomeRunningView({
        locale: "en",
        running: RUNNING,
        record: { kind: "record", best: { month: "2026-08", confirmedHours: 150 }, current: { month: "2026-10", confirmedHours: 40 }, isRecordMonth: false },
      }),
    );
    expect(h).toContain('data-testid="home-personal-record"');
    expect(h).toContain("Only you see this");
    expect(h).not.toContain("MISSING:");
  });

  it("a record month is said as reaching the person's own record", async () => {
    const h = html(
      await HomeRunningView({
        locale: "en",
        running: RUNNING,
        record: { kind: "record", best: { month: "2026-10", confirmedHours: 160 }, current: { month: "2026-10", confirmedHours: 160 }, isRecordMonth: true },
      }),
    );
    expect(h).toContain('data-record-month="true"');
    expect(h).toContain("you reached your own record");
  });

  it("none / unknown / absent draw nothing", async () => {
    for (const record of [{ kind: "none" } as const, { kind: "unknown" } as const, undefined]) {
      const h = html(await HomeRunningView({ locale: "en", running: RUNNING, record }));
      expect(h).not.toContain("home-personal-record");
    }
  });
});

describe("evidence first — a new worker's ONE gold action is the first work entry (activation audit #4)", () => {
  // The onboarded worker as production has them: a profession, no skills,
  // no entries. Built with the REAL engine, not a literal.
  const FIRST = deriveTodayNext(
    deriveWorkCardState(
      {
        hasProfession: true,
        skillsCount: 0,
        availabilitySet: false,
        locationSet: false,
        paySet: false,
        evidenceCount: 0,
        confirmedAtMs: null,
      },
      0,
    ),
  );

  it("the gold action opens the journal; the profession stays reachable as a quiet link — every active locale", async () => {
    for (const loc of activeLocales) {
      state.locale = loc;
      const w = html(
        await HomeWaitingView({ locale: loc, region: deriveWaiting(FIRST, { kind: "known", items: [] }), unknownDoors: [] }),
      );
      expect(w, loc).not.toContain("MISSING:");
      // ONE gold action, and it leads to the journal.
      expect(w.match(/bg-gradient-cta/g), loc).toHaveLength(1);
      expect(w, loc).toMatch(/<a href="\/dashboard\/journal"[^>]*data-testid="today-next-cta"/);
      expect(w, loc).toContain(lookup(loc, "auth.dashboard.workCard.why.evidenceFirst") as string);
      // Nothing hidden: the profile step is a plain text link, not a button.
      expect(w, loc).toMatch(/<a href="\/dashboard\/profile#profile-edit"[^>]*data-testid="today-next-secondary"[^>]*data-dim="work"/);
      const secondary = w.match(/<a [^>]*data-testid="today-next-secondary"[^>]*>/)?.[0] ?? "";
      expect(secondary, loc).not.toMatch(/bg-gradient-cta|rounded-control|border-/);
      expect(w, loc).toContain(lookup(loc, "auth.dashboard.workCard.next.work") as string);
    }
  });

  it("after the first entry nothing is displaced — no secondary link", async () => {
    const after = deriveTodayNext(
      deriveWorkCardState(
        {
          hasProfession: true,
          skillsCount: 0,
          availabilitySet: false,
          locationSet: false,
          paySet: false,
          evidenceCount: 1,
          confirmedAtMs: null,
        },
        0,
      ),
    );
    const w = html(await HomeWaitingView({ locale: "en", region: deriveWaiting(after, { kind: "known", items: [] }), unknownDoors: [] }));
    expect(w).toContain('data-testid="today-next-cta"');
    expect(w).not.toContain('data-testid="today-next-secondary"');
  });
});
