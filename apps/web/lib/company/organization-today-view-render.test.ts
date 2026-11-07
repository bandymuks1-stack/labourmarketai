import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cloneElement, createElement, isValidElement, type ComponentProps, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider, createTranslator } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { OrganizationToday } from "@/lib/planning/organization-today";

/**
 * The organization's "today" view as a person receives it: the real component and the
 * real loader over the real catalogues, with only the reads below stubbed. It holds what
 * a unit test of the model cannot: the order on the screen, and that an approve control
 * is simply not in the markup for anyone who may not review.
 */
const WEB = join(__dirname, "..", "..");
const read = (file: string) => JSON.parse(readFileSync(join(WEB, "messages", file), "utf8"));
const catalog = (locale: string) => ({
  ...read(`${locale}.json`),
  journal: read(`${locale}/journal.json`),
  productivityUnits: read(`${locale}/productivity-units.json`),
  skillNames: read(`${locale}/skill-names.json`),
});

const ORG = "org-a";
const TODAY = new Date().toISOString().slice(0, 10);

const entry = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  workerId: "w1",
  workerName: "Tomas Kazlauskas",
  organizationId: ORG,
  createdAt: "2026-11-05T08:00:00Z",
  workDay: "2026-11-05",
  hours: { value: 8, unit: "hours", certain: true },
  originalText: "Stogo danga, 8 val.",
  recognizedSlugs: [],
  skillsToConfirm: [],
  confirmScope: "worker_declared",
  ...over,
});

const measured: OrganizationToday = {
  applied: true,
  todayIso: TODAY,
  roster: 12,
  absentToday: [{ workerId: "w9", name: "Rasa Petraitė" }],
  absentNext7: [],
  pendingAbsenceDecisions: 1,
  journalEntriesToday: 4,
  awaitingReview: 3,
  clientReviewToDecide: 0,
};

const reads = vi.hoisted(() => ({
  reviewable: null as number | null,
  queue: [] as unknown[] | Error,
  exceptions: new Map<string, string[]>(),
  facts: {} as Record<string, unknown>,
  today: {} as unknown,
  reviewOff: 0 as number | null,
  conflicts: 0 as number | null,
  invitations: { kind: "ok", rows: [] } as unknown,
  claims: [] as unknown[],
  locale: "lt",
  translator: (() => "") as unknown,
}));

vi.mock("@/lib/journal/reviewable-count", () => ({ countReviewablePendingEntries: async () => reads.reviewable }));
vi.mock("@/lib/journal/review-queue", () => ({
  fetchQuickReviewQueue: async () => {
    if (reads.queue instanceof Error) throw reads.queue;
    return reads.queue;
  },
}));
vi.mock("@/lib/journal/batch-review", () => ({ fetchBatchExceptions: async () => reads.exceptions }));
vi.mock("@/lib/journal/organization-approvals", () => ({ readOrganizationApprovalFacts: async () => reads.facts }));
vi.mock("@/lib/planning/organization-today", () => ({ getOrganizationToday: async () => reads.today }));
vi.mock("@/lib/operations/org-members", () => ({ countWorkersWithUnconfirmableWork: async () => reads.reviewOff }));
vi.mock("@/lib/planning/roster-conflicts", () => ({ countRosterConflicts: async () => reads.conflicts }));
vi.mock("@/lib/company/company-workers", () => ({ listCompanyWorkerInvitations: async () => reads.invitations }));
vi.mock("@/lib/company/claim-public-intake", () => ({ listClaimablePublicIntakes: async () => reads.claims }));
vi.mock("@/lib/time/viewer-day", () => ({ viewerWorkToday: async () => ({ todayIso: "2026-11-07" }) }));
vi.mock("@/lib/journal/quick-confirm-actions", () => ({ quickConfirmEntry: async () => null, batchQuickConfirm: async () => null }));
vi.mock("@/lib/journal/review-actions", () => ({ reviewJournalEntry: async () => null }));
vi.mock("@/components/app/organization/manager-scope-notice", () => ({ ManagerScopeNotice: () => null }));
vi.mock("@/components/app/telemetry-view", () => ({ TelemetryView: () => null }));
vi.mock("@/lib/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: ReactNode }) => createElement("a", { href, ...rest }, children),
}));
vi.mock("next-intl/server", () => ({
  getLocale: async () => reads.locale,
  getTranslations: async (namespace?: string) => (reads.translator as (n?: string) => unknown)(namespace),
}));

const { OrganizationTodayView } = await import("@/components/app/organization/organization-today-view");

/** Awaits the async server components, leaving client components to the renderer. */
async function resolve(node: unknown): Promise<ReactNode> {
  if (Array.isArray(node)) return Promise.all(node.map(resolve)) as Promise<ReactNode>;
  if (!isValidElement(node)) return node as ReactNode;
  const el = node as { type: unknown; props: { children?: unknown } };
  if (typeof el.type === "function" && el.type.constructor.name === "AsyncFunction") {
    return resolve(await (el.type as (p: unknown) => Promise<ReactNode>)(el.props));
  }
  if (el.props.children === undefined) return node;
  const children = await resolve(el.props.children);
  return Array.isArray(children) ? cloneElement(node, undefined, ...children) : cloneElement(node, undefined, children);
}

async function render(locale = "lt") {
  const messages = catalog(locale);
  reads.locale = locale;
  // A missing key or a broken message throws here instead of printing its name.
  reads.translator = (namespace?: string) =>
    createTranslator({ locale, messages, namespace: namespace as never, onError: (e) => { throw e; } });
  const tree = await resolve(
    createElement(OrganizationTodayView, {
      organizationId: ORG,
      company: { id: "co-a", displayName: "Pavyzdys UAB", legalName: null },
      context: { kind: "ok", role: "owner" } as never,
    }),
  );
  const props = {
    locale,
    messages,
    timeZone: "UTC",
    onError: (e: Error) => { throw e; },
    children: tree,
  } as unknown as ComponentProps<typeof NextIntlClientProvider>;
  return renderToStaticMarkup(createElement(NextIntlClientProvider, props));
}

const APPROVE_CONTROLS = /data-testid="quick-(confirm-tap|reject-open|batch-open)/;

beforeEach(() => {
  reads.reviewable = 0;
  reads.queue = [];
  reads.exceptions = new Map();
  reads.facts = { employees: { total: 3, reviewOff: 0 }, ownUnconfirmed: 0, otherReviewer: true, readerReviews: true };
  reads.today = measured;
  reads.reviewOff = 0;
  reads.conflicts = 0;
  reads.invitations = { kind: "ok", rows: [] };
  reads.claims = [];
});

describe("work waiting for approval", () => {
  beforeEach(() => {
    reads.reviewable = 4;
    reads.queue = [
      entry("e1"),
      entry("e2", { workerId: "w2", workerName: "Rasa Petraitė", hours: { value: 7.5, unit: "hours", certain: true } }),
      entry("e3", { workerId: "w2", workerName: "Rasa Petraitė", hours: null, createdAt: `${TODAY}T07:00:00Z` }),
      entry("other", { organizationId: "org-b", workerName: "Svetimas Žmogus" }),
    ];
    reads.exceptions = new Map([["e2", ["unusual_hours"]]]);
  });

  it("leads the screen, in the owner's order: approvals, facts, decisions, doors", async () => {
    reads.conflicts = 2;
    const html = await render();
    const order = [
      "organization-today-date",
      "organization-today-name",
      "organization-today-waiting",
      "organization-today-facts",
      "organization-today-decisions",
      "organization-today-doors",
    ].map((id) => html.indexOf(`data-testid="${id}"`));
    expect(order.every((at) => at >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("shows the count, the people and the hours before any approve control", async () => {
    const html = await render();
    expect(html).toContain("Laukia patvirtinimo:");
    expect(html).toMatch(/data-testid="organization-today-waiting"[^>]*>3</);
    expect(html).toContain("2 žmonės · 3 įrašai · 15,5 val.");
    const summary = html.indexOf('data-testid="organization-today-people"');
    const firstControl = html.search(APPROVE_CONTROLS);
    expect(html.indexOf("Tomas Kazlauskas", summary)).toBeGreaterThan(summary);
    expect(html.indexOf("Rasa Petraitė", summary)).toBeGreaterThan(summary);
    expect(firstControl).toBeGreaterThan(summary);
  });

  it("offers the existing queue's controls, and says what the batch review reported", async () => {
    const html = await render();
    expect(html).toContain('data-testid="quick-confirm-tap-e1"');
    expect(html).toContain('data-testid="quick-reject-open-e1"');
    expect(html).toContain('data-testid="organization-today-exceptions"');
    expect(html).toContain("Neįprastos valandos");
  });

  it("names a missing figure instead of counting it", async () => {
    const html = await render();
    expect(html).toContain("Be valandų: 1");
  });

  it("keeps another organization's work off this heading, and counts it", async () => {
    const html = await render();
    expect(html).not.toContain("Svetimas Žmogus");
    expect(html).not.toContain('data-testid="quick-confirm-tap-other"');
    expect(html).toContain("Kitur tavo patvirtinimo laukia dar: 1.");
  });
});

describe("who may not review sees no control", () => {
  it("a reader with no reviewer relationship, even if rows came back", async () => {
    reads.reviewable = 1;
    reads.queue = [entry("e1")];
    reads.facts = { ...reads.facts, readerReviews: false };
    const html = await render();
    expect(html).not.toMatch(APPROVE_CONTROLS);
    expect(html).not.toContain("Tomas Kazlauskas");
    expect(html).not.toContain('data-testid="organization-today-waiting"');
    expect(html).toContain('data-testid="organization-today-not-reviewer"');
  });

  it("an empty gated set", async () => {
    const html = await render();
    expect(html).not.toMatch(APPROVE_CONTROLS);
    expect(html).toContain('data-testid="organization-today-approvals-empty"');
    expect(html).toMatch(/data-testid="organization-today-waiting"[^>]*>0</);
  });
});

describe("unknown is not zero", () => {
  it("a failed count says it could not be read, never zero or nothing waiting", async () => {
    reads.reviewable = null;
    const html = await render();
    expect(html).not.toContain('data-testid="organization-today-waiting"');
    expect(html).not.toContain('data-testid="organization-today-approvals-empty"');
    expect(html).toContain('data-testid="organization-today-approvals-unread"');
    expect(html).not.toMatch(APPROVE_CONTROLS);
  });

  it("failed rows behind a known count offer nothing to approve", async () => {
    reads.reviewable = 2;
    reads.queue = new Error("review_queue_unavailable");
    const html = await render();
    expect(html).toContain('data-testid="organization-today-approvals-unread"');
    expect(html).not.toMatch(APPROVE_CONTROLS);
  });

  it("facts that cannot be read say so, a measured zero stays a zero", async () => {
    reads.today = { ...measured, roster: null, journalEntriesToday: 0, absentToday: null, absentNext7: null };
    const html = await render();
    expect(html).toMatch(/organization-today-fact-roster[\s\S]{0,300}Dabar nepavyksta perskaityti/);
    expect(html).toMatch(/organization-today-fact-journalToday[\s\S]{0,300}>0</);
    expect(html).toMatch(/organization-today-absent-today[\s\S]{0,300}Dabar nepavyksta perskaityti/);
  });

  it("when today's reads all failed, no empty day is implied", async () => {
    reads.today = { applied: false, reason: "error" };
    const html = await render();
    expect(html).not.toContain("Šiandien nėra užfiksuota");
    expect(html).toMatch(/organization-today-fact-roster[\s\S]{0,300}Dabar nepavyksta perskaityti/);
    expect(html).toContain('data-testid="organization-today-decisions-unread"');
    expect(html).not.toContain('data-testid="organization-today-decisions-clear"');
  });

  it("one failed decision read keeps the section from saying nothing waits", async () => {
    reads.conflicts = null;
    const html = await render();
    expect(html).toContain('data-testid="organization-today-decisions-unread"');
    expect(html).not.toContain('data-testid="organization-today-decisions-clear"');
  });
});

describe("what the screen never claims", () => {
  it("no attendance, no progress percentage, no score", async () => {
    reads.reviewable = 1;
    reads.queue = [entry("e1")];
    const html = await render("en");
    const text = html.replace(/<[^>]+>/g, " ");
    expect(text).not.toMatch(/working today|on site|present today|no-show/i);
    expect(text).not.toContain("%");
    expect(text).not.toMatch(/\bscore\b/i);
  });
});

describe.each(["lt", "en", "ru", "nl", "de", "pl"])("every key resolves in %s", (locale) => {
  it("in the waiting state, with every decision and failure line", async () => {
    reads.reviewable = 2;
    reads.queue = [entry("e1", { hours: { value: 8, unit: "hours", certain: false } }), entry("e2", { hours: null })];
    reads.exceptions = new Map([["e1", ["worker_first_entries", "unusual_hours", "new_skill"]]]);
    reads.today = { ...measured, clientReviewToDecide: 1 };
    reads.reviewOff = 2;
    reads.conflicts = null;
    reads.invitations = { kind: "ok", rows: [{ status: "pending" }] };
    reads.claims = [{}];
    reads.facts = { employees: { total: 3, reviewOff: 1 }, ownUnconfirmed: 1, otherReviewer: null, readerReviews: true };
    expect(await render(locale)).toContain('data-testid="organization-today-view"');
  });

  it("in the states with no rows", async () => {
    reads.facts = { employees: { total: 0, reviewOff: 0 }, ownUnconfirmed: 0, otherReviewer: false, readerReviews: true };
    expect(await render(locale)).toContain('data-testid="organization-today-approvals-empty"');
    reads.facts = { ...reads.facts, readerReviews: false };
    expect(await render(locale)).toContain('data-testid="organization-today-not-reviewer"');
  });
});
