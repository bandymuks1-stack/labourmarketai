/**
 * "Kas pasikeitė" — RENDER proof of the consequence trace view (F1). The
 * real async server view rendered to static markup with the REAL message
 * catalogs through next-intl's own ICU translator (every active locale), fed
 * by the pure F0 model. No database.
 *
 * Pinned here:
 *   - UNKNOWN is never ZERO or empty: a failed read is a named sentence;
 *   - a pending step is drawn as pending, a self-approval never as a
 *     confirmation, and green appears ONLY on a second party's approval;
 *   - the Living CV and matching steps say "derived" by shape and legend;
 *   - no raw key, no score word, every active locale renders.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createTranslator } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { activeLocales } from "@/lib/i18n/config";
import type { NotificationEventRow } from "@/lib/notifications/events";

import { deriveConsequenceTrace, type ConsequenceTraceInput, type TraceEntryInput } from "./consequence-trace";

const state = vi.hoisted(() => ({ locale: "en" }));

const WEB = join(__dirname, "..", "..");
const json = (rel: string) => JSON.parse(readFileSync(join(WEB, "messages", rel), "utf8")) as Record<string, unknown>;
const catalogs: Record<string, Record<string, unknown>> = {};
const catalog = (loc: string) =>
  (catalogs[loc] ??= {
    ...json(`${loc}.json`),
    journal: json(`${loc}/journal.json`),
    skillNames: json(`${loc}/skill-names.json`),
  });

function scoped(loc: string, ns: string) {
  const tr = createTranslator({
    locale: loc,
    messages: catalog(loc) as never,
    namespace: ns as never,
    onError: () => {},
    getMessageFallback: ({ key }) => `MISSING:${ns}.${key}`,
  }) as unknown as ((key: string, values?: Record<string, unknown>) => string) & { has: (k: string) => boolean };
  const t = (key: string, values: Record<string, unknown> = {}) => tr(key, values);
  t.has = (key: string) => tr.has(key);
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
  loadHomeBecause: vi.fn(),
  loadHomeOutside: vi.fn(),
  loadHomeEvents: vi.fn(),
}));
vi.mock("@/lib/home/consequence-trace-server", () => ({ loadConsequenceTrace: vi.fn() }));

import { HomeTraceView } from "@/components/app/home/home-trace";

const html = (el: ReactElement | null) => (el ? renderToStaticMarkup(el) : "");

const ME = "me";
const BOSS = "boss";
const entry = (patch: Partial<TraceEntryInput> & { id: string }): TraceEntryInput => ({
  createdAt: "2026-10-13T08:00:00.000Z",
  originalText: "Panel P-1 wired and labelled",
  metrics: [{ metric_slug: "quantity", value_numeric: 8, value_text: null, unit_slug: "hours" }],
  confirmations: [],
  ...patch,
});
const approved = (by: string) => [
  { confirmation_scope: { decision: "approved" }, created_at: "2026-10-13T16:20:00.000Z", confirmer_role: "manager", confirmer_id: by },
];
const input = (patch: Partial<ConsequenceTraceInput>): ConsequenceTraceInput => ({
  entries: [],
  entriesTruncated: false,
  subjectProfileId: ME,
  skillLinks: new Map(),
  confirmedWork: new Map(),
  events: [],
  sinceIso: "2026-10-01T00:00:00.000Z",
  ...patch,
});
const ev = (id: string, eventType: string): NotificationEventRow =>
  ({ id, eventType, entityType: "booking_request", entityId: `b-${id}`, createdAt: "2026-10-12T10:00:00Z", readAt: null, metadata: {} }) as unknown as NotificationEventRow;

const FULL = deriveConsequenceTrace(
  input({
    entries: [
      entry({ id: "pending", createdAt: "2026-10-14T07:00:00.000Z" }),
      entry({ id: "confirmed", confirmations: approved(BOSS) }),
      entry({ id: "self", createdAt: "2026-10-11T08:00:00.000Z", confirmations: approved(ME) }),
    ],
    skillLinks: new Map([["confirmed", ["panel_installation"]]]),
    confirmedWork: new Map([["panel_installation", { confirmedWorkEntries: 5, confirmedDays: 4 }]]),
    events: [ev("1", "booking_accepted")],
  }),
);

beforeEach(() => {
  state.locale = "en";
});

describe("home trace — honest states", () => {
  it("UNKNOWN renders a named sentence with a retry, never an empty region", async () => {
    const h = html(await HomeTraceView({ locale: "en", trace: { kind: "unknown" } }));
    expect(h).toContain('data-testid="home-trace-unknown"');
    expect(h).toContain("Couldn&#x27;t read what changed");
    expect(h).not.toContain("home-trace-items");
  });

  it("a known empty window says so once, with the door to the journal", async () => {
    const h = html(await HomeTraceView({ locale: "en", trace: deriveConsequenceTrace(input({})) }));
    expect(h).toContain('data-testid="home-trace-empty"');
    expect(h).toContain('href="/dashboard/journal"');
  });

  it("a half-failed read is flagged next to what could be read", async () => {
    const h = html(await HomeTraceView({ locale: "en", trace: deriveConsequenceTrace(input({ events: null })) }));
    expect(h).toContain('data-testid="home-trace-partial"');
    expect(h).toContain("Couldn&#x27;t read notifications.");
  });
});

describe("home trace — the chain tells facts, pending and derived apart", () => {
  it("draws the full journal chain and the state chain", async () => {
    const h = html(await HomeTraceView({ locale: "en", trace: FULL }));
    expect(h).toContain("Waiting for confirmation");
    expect(h).toContain("Confirmed by: Manager");
    expect(h).toContain('data-testid="home-trace-cv"');
    expect(h).toContain("5 confirmed entries");
    expect(h).toContain('data-testid="home-trace-matching"');
    expect(h).toContain("Matching sees repeatedly confirmed work");
    expect(h).toContain('data-testid="home-trace-event"');
  });

  it("green (trust-accent) appears ONLY on the second party's approval", async () => {
    const h = html(await HomeTraceView({ locale: "en", trace: FULL }));
    const greens = h.match(/trust-accent/g) ?? [];
    // one node border + one check icon, on exactly one confirmed decision
    expect(greens.length).toBe(2);
    expect(h).toContain('data-self-only="true"');
    expect(h).toContain("Approved by you — not a second-party confirmation");
  });

  it("the celebration motion is used only on a chain that reached the Living CV", async () => {
    const h = html(await HomeTraceView({ locale: "en", trace: FULL }));
    expect((h.match(/ua-confirmed/g) ?? []).length).toBe(1);
    expect(h).toContain('data-reached-cv="true"');
  });

  it("every step names its basis and the legend explains the shapes", async () => {
    const h = html(await HomeTraceView({ locale: "en", trace: FULL }));
    expect(h).toContain('data-basis="pending"');
    expect(h).toContain('data-basis="derived"');
    expect(h).toContain('data-testid="home-trace-legend"');
    expect(h).toContain("Derived from facts");
  });
});

describe("home trace — every active locale renders without a raw key or a score word", () => {
  for (const loc of activeLocales) {
    it(loc, async () => {
      state.locale = loc;
      const h = html(await HomeTraceView({ locale: loc, trace: FULL }));
      expect(h).not.toContain("MISSING:");
      expect(h).not.toMatch(/\[EN\]/);
      expect(h.toLowerCase()).not.toMatch(/\bscore\b|\branking\b|\brating\b|reiting|балл/);
    });
  }
});
