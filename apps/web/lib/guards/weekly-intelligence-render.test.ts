import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import {
  deriveWeeklyPersonalIntelligence,
  type WeeklyJournalFacts,
  type WeeklyOpportunityFacts,
} from "@/lib/worker/weekly-intelligence-model";
import type { JobRecommendation } from "@/lib/opportunities/recommendations-model";

/**
 * WEEKLY INTELLIGENCE RENDERS WHAT THE MODEL DERIVED — AND NOTHING ELSE.
 *
 * The B1 model's honesty rules (unavailable ≠ zero, "new since last week"
 * omitted while the seen store is absent, §19 basis carried whole) are
 * tested at the model layer. This guard proves the render half keeps them:
 * given derived signals, exactly those lines reach the DOM with their real
 * numbers — and when neither read answered, NOTHING renders (the digest
 * emitter's own rule, mirrored: no signal, no surface).
 *
 * CI has no database, so this asserts the TRANSFORM over fixtures, the same
 * approach as focus-market-numbers-render.
 */

vi.mock("next-intl/server", () => ({
  getTranslations: async (ns: string) =>
    Object.assign(
      (k: string, values?: Record<string, unknown>) =>
        values ? `${ns}.${k}|${JSON.stringify(values)}` : `${ns}.${k}`,
      {
        has: () => false,
        raw: (k: string) => `${ns}.${k}`,
      },
    ),
}));

vi.mock("next/link", async () => {
  const React = (await import("react")).default;
  return {
    default: ({
      href,
      children,
    }: {
      href: string;
      children: unknown;
    }) => React.createElement("a", { href }, children as never),
  };
});

const { WeeklyIntelligenceSection } = await import(
  "@/components/app/weekly-intelligence-section"
);

const WINDOW = {
  key: "week" as const,
  startIso: "2026-08-17",
  endIso: "2026-08-23",
};

function journalFacts(p: Partial<WeeklyJournalFacts>): WeeklyJournalFacts {
  return {
    window: WINDOW,
    available: true,
    entryCount: 0,
    confirmedCount: 0,
    lastEntryAtIso: null,
    ...p,
  };
}

function rec(p: {
  requestId: string;
  roleSlug?: string | null;
  matched: number;
  total: number;
  confirmed: number;
  missing?: string[];
}): JobRecommendation {
  return {
    requestId: p.requestId,
    roleSlug: p.roleSlug ?? null,
    basis: {
      pct: 0,
      matchedTotal: p.matched,
      needTotal: p.total,
      matchedConfirmed: p.confirmed,
    },
    matchedSkillSlugs: [],
    missingSkillSlugs: p.missing ?? [],
    recentlyCreated: false,
  } as unknown as JobRecommendation;
}

function oppFacts(p: Partial<WeeklyOpportunityFacts>): WeeklyOpportunityFacts {
  return {
    available: true,
    totalRecommendable: 0,
    seenAvailable: false,
    newCount: 0,
    appearedThisWeekCount: 0,
    boardTruncated: false,
    top: [],
    ...p,
  };
}

async function render(
  journal: WeeklyJournalFacts,
  opportunities: WeeklyOpportunityFacts,
): Promise<string> {
  const intel = deriveWeeklyPersonalIntelligence(journal, opportunities);
  return renderToStaticMarkup(
    await WeeklyIntelligenceSection({ intel, locale: "en" }),
  );
}

/** renderToStaticMarkup escapes quotes — match what actually reaches the DOM. */
const esc = (s: string) => s.replace(/"/g, "&quot;");

describe("weekly intelligence render guard", () => {
  it("renders active journal + matching count with the whole §19 basis", async () => {
    const html = await render(
      journalFacts({ entryCount: 3, confirmedCount: 2 }),
      oppFacts({
        totalRecommendable: 4,
        top: [
          rec({
            requestId: "r1",
            roleSlug: null,
            matched: 5,
            total: 7,
            confirmed: 2,
            missing: ["welding_mig", "forklift"],
          }),
        ],
      }),
    );
    expect(html).toContain(
      esc('opportunities.weekly.journalActive|{"entries":3,"confirmed":2}'),
    );
    expect(html).toContain(esc('opportunities.weekly.matching|{"count":"4"}'));
    // §19: the exemplar carries matched/total/confirmed together, never bare.
    expect(html).toContain(esc('"matched":5'));
    expect(html).toContain(esc('"total":7'));
    expect(html).toContain(esc('"confirmed":2'));
    // Context-bound skill gaps of the current top matches.
    expect(html).toContain("welding_mig, forklift");
  });

  it("inactive journal renders the fact + the journal door — no loss claim, no fabricated zeros", async () => {
    const html = await render(
      journalFacts({ entryCount: 0 }),
      oppFacts({ available: true, totalRecommendable: 0 }),
    );
    expect(html).toContain("opportunities.weekly.journalInactive");
    expect(html).toContain('href="/en/dashboard/journal"');
    expect(html).toContain("opportunities.weekly.noMatching");
    // Zero matches is its own honest signal — never a count line with 0.
    expect(html).not.toContain('weekly.matching|');
  });

  it("OMITS new-opportunities while the seen store is absent, even with a positive count", async () => {
    const html = await render(
      journalFacts({ entryCount: 1 }),
      oppFacts({
        totalRecommendable: 2,
        seenAvailable: false,
        newCount: 2,
        top: [rec({ requestId: "r1", matched: 1, total: 2, confirmed: 0 })],
      }),
    );
    expect(html).not.toContain("newOpportunities");
  });

  it("renders the appeared-this-week market fact without the seen store", async () => {
    const html = await render(
      journalFacts({ entryCount: 1 }),
      oppFacts({
        totalRecommendable: 3,
        seenAvailable: false,
        appearedThisWeekCount: 2,
        top: [rec({ requestId: "r1", matched: 1, total: 2, confirmed: 0 })],
      }),
    );
    expect(html).toContain(
      esc('opportunities.weekly.appearedThisWeek|{"count":"2"}'),
    );
    expect(html).not.toContain("newOpportunities");
  });

  it("a full RPC page renders counts as lower bounds (N+), never unqualified", async () => {
    const html = await render(
      journalFacts({ entryCount: 1 }),
      oppFacts({
        totalRecommendable: 100,
        appearedThisWeekCount: 12,
        boardTruncated: true,
        top: [rec({ requestId: "r1", matched: 1, total: 2, confirmed: 0 })],
      }),
    );
    expect(html).toContain(esc('opportunities.weekly.matching|{"count":"100+"}'));
    expect(html).toContain(
      esc('opportunities.weekly.appearedThisWeek|{"count":"12+"}'),
    );
  });

  it("unavailable reads degrade to their honest lines — never zeros", async () => {
    const html = await render(
      journalFacts({ available: false }),
      oppFacts({ available: true, totalRecommendable: 1, top: [rec({ requestId: "r", matched: 1, total: 1, confirmed: 1 })] }),
    );
    expect(html).toContain("opportunities.weekly.journalUnavailable");
    expect(html).not.toContain("journalActive");
  });

  it("renders NOTHING when neither read answered (emitter rule mirrored)", async () => {
    const html = await render(
      journalFacts({ available: false }),
      oppFacts({ available: false }),
    );
    expect(html).toBe("");
  });
});
