import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  buildAgenda,
  buildMonthGrid,
  buildWeekView,
  buildYearOverview,
  combineInvitationItems,
  invitationEventDay,
  itemsForDay,
  projectFinanceItem,
  projectIncomingInvitationItem,
  projectSentInvitationItem,
  type FinancePlanningInput,
  type IncomingInvitationPlanningInput,
  type SentInvitationPlanningInput,
} from "@/lib/planning/planning-model";

/**
 * Timeline Source Expansion v1 guard — finance_records + invitations join
 * the ONE canonical calendar as pure projections. Pins the owner-required
 * matrix: source integrity, deduplication, permissions (NO amounts on the
 * timeline), status/date semantics, and view coverage. The composition
 * contract (RLS-scoped services, read-only, no new tables) stays pinned by
 * planning.test.ts; this file owns the new-source semantics.
 */

const ROOT = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");
const COMPOSE = read("lib/planning/planning.ts");
const PAGE = read("app/[locale]/dashboard/planning/page.tsx");

const TODAY = "2026-07-17";

function financeRecord(
  over: Partial<FinancePlanningInput> = {},
): FinancePlanningInput {
  return {
    id: "f1",
    title: "Invoice for stage 2",
    status: "issued",
    dueDate: "2026-07-20",
    paidAt: null,
    ...over,
  };
}

function sentInvitation(
  over: Partial<SentInvitationPlanningInput> = {},
): SentInvitationPlanningInput {
  return {
    id: "i1",
    status: "pending",
    invitedName: "Jonas",
    invitedEmail: "jonas@example.com",
    expiresAt: "2026-07-25T10:00:00Z",
    acceptedAt: null,
    declinedAt: null,
    revokedAt: null,
    ...over,
  };
}

const incomingInvitation: IncomingInvitationPlanningInput = {
  id: "i2",
  expiresAt: "2026-07-22T09:00:00Z",
  organizationName: "Statybos UAB",
  projectTitle: null,
  inviterName: null,
};

/* ------------------------------------------------------------------ */
/* Source integrity                                                    */
/* ------------------------------------------------------------------ */

describe("source integrity — real records, real links, honest degradation", () => {
  it("finance items project from the finance surface's own read service", () => {
    expect(COMPOSE).toMatch(/listMyFinanceRecords\(\)/);
    // needs-migration degrades to the honest per-source note, never fake rows
    expect(COMPOSE).toMatch(
      /result\.status === "needs-migration"[\s\S]{0,120}status: "unavailable"/,
    );
  });

  it("invitation items project from the existing invitation reads (both directions)", () => {
    expect(COMPOSE).toMatch(/listMySentInvitations\(\)/);
    expect(COMPOSE).toMatch(/listInvitationsForMe\(\)/);
  });

  it("every projected item deep-links its canonical source surface", () => {
    expect(projectFinanceItem(financeRecord(), TODAY)?.href).toBe(
      "/dashboard/finance",
    );
    expect(projectSentInvitationItem(sentInvitation()).href).toBe(
      "/dashboard/network",
    );
    expect(projectIncomingInvitationItem(incomingInvitation).href).toBe(
      "/dashboard/network",
    );
  });

  it("record creation time is never projected as an event", () => {
    // The mapper input carries no createdAt at all — compile-level absence —
    // and the composition never reads created_at for the new sources.
    expect(COMPOSE).not.toMatch(/createdAt: record\.createdAt/);
    const dateless = projectFinanceItem(
      financeRecord({ dueDate: null, paidAt: null }),
      TODAY,
    );
    expect(dateless).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* Deduplication                                                       */
/* ------------------------------------------------------------------ */

describe("deduplication — one record, one item, stable IDs", () => {
  it("overlapping sent/incoming scopes collapse to ONE item (outgoing wins)", () => {
    const out = projectSentInvitationItem(sentInvitation({ id: "same" }));
    const inc = projectIncomingInvitationItem({
      ...incomingInvitation,
      id: "same",
    });
    const merged = combineInvitationItems([out], [inc]);
    expect(merged).toHaveLength(1);
    expect(merged[0].roleContext).toBe("outgoing");
  });

  it("IDs are stable and deterministic across repeated projection (retry-safe)", () => {
    const a = projectFinanceItem(financeRecord(), TODAY);
    const b = projectFinanceItem(financeRecord(), TODAY);
    expect(a).toEqual(b);
    expect(a?.id).toBe("finance:f1");
    expect(projectSentInvitationItem(sentInvitation()).id).toBe("invitation:i1");
  });

  it("one finance record yields at most ONE calendar item (no milestone fan-out in v1)", () => {
    const paidWithDue = projectFinanceItem(
      financeRecord({ status: "paid", paidAt: "2026-07-10T08:00:00Z" }),
      TODAY,
    );
    // a paid record with BOTH dates is one item at the paid day, never two
    expect(paidWithDue?.startDate).toBe("2026-07-10");
    expect(paidWithDue?.id).toBe("finance:f1");
  });

  it("source filtering never duplicates results", () => {
    const items = [
      projectFinanceItem(financeRecord(), TODAY)!,
      projectSentInvitationItem(sentInvitation()),
    ];
    const finance = items.filter((i) => i.sourceType === "finance");
    const invitation = items.filter((i) => i.sourceType === "invitation");
    expect(finance).toHaveLength(1);
    expect(invitation).toHaveLength(1);
    expect(finance[0].id).not.toBe(invitation[0].id);
  });
});

/* ------------------------------------------------------------------ */
/* Permissions & privacy                                               */
/* ------------------------------------------------------------------ */

describe("permissions — no amounts, no widened reads", () => {
  it("the finance projection input cannot carry money fields", () => {
    // Static pin: the planning layer never touches amount/currency/
    // counterparty — money detail stays on /dashboard/finance.
    for (const rel of ["lib/planning/planning.ts", "lib/planning/planning-model.ts"]) {
      const src = read(rel);
      expect(src, rel).not.toMatch(/amountCents|amount_cents|formatCentsAsEur/);
      expect(src, rel).not.toMatch(/counterparty/i);
      expect(src, rel).not.toMatch(/currency/i);
    }
  });

  it("a projected finance item exposes only safe operational fields", () => {
    const item = projectFinanceItem(financeRecord(), TODAY)!;
    const blob = JSON.stringify(item);
    expect(blob).not.toMatch(/\d+[.,]\d{2}/); // no money-looking value
    // The item carries the canonical PlanningItem shape — the base fields
    // plus the §7.1 context fields (owner visual acceptance). Nothing more:
    // an exact key set still forbids a money or third-party field sneaking in.
    expect(Object.keys(item).sort()).toEqual(
      [
        "detail",
        "endDate",
        "href",
        "id",
        "label",
        "roleContext",
        "sourceId",
        "sourceType",
        "startDate",
        "status",
        "statusKey",
        // §7.1 — present in the shape, ALL null for finance (asserted below).
        "startTime",
        "duration",
        "workspace",
        "project",
        "place",
        "counterpart",
        "organization",
      ].sort(),
    );
    // Finance stays operational-only: the calendar never learns a place, an
    // organization or another person's name from a money record.
    for (const key of [
      "startTime",
      "duration",
      "workspace",
      "project",
      "place",
      "counterpart",
      "organization",
    ] as const) {
      expect(item[key], `finance.${key} must be absent`).toBeNull();
    }
  });

  it("planning composes invitations ONLY through the existing scoped reads", () => {
    // no direct invitations table read and no new RPC appears in planning
    expect(COMPOSE).not.toMatch(/\.from\("invitations"\)/);
    expect(COMPOSE).not.toMatch(/\.rpc\(/);
  });
});

/* ------------------------------------------------------------------ */
/* Status & date semantics                                             */
/* ------------------------------------------------------------------ */

describe("finance status/date semantics", () => {
  it("future due unpaid record keeps its stored status at the due day", () => {
    const item = projectFinanceItem(financeRecord(), TODAY)!;
    expect(item.startDate).toBe("2026-07-20");
    expect(item.status).toBe("issued");
    expect(item.statusKey).toBe("finance.status.issued");
  });

  it("past-due unpaid record derives overdue (same rule as the finance page)", () => {
    const item = projectFinanceItem(
      financeRecord({ dueDate: "2026-07-01" }),
      TODAY,
    )!;
    expect(item.status).toBe("overdue");
    expect(item.statusKey).toBe("finance.summary.overdue");
  });

  it("paid record is a past FACT at its real paid day, never overdue", () => {
    const item = projectFinanceItem(
      financeRecord({
        status: "paid",
        dueDate: "2026-07-01",
        paidAt: "2026-07-15T14:00:00Z",
      }),
      TODAY,
    )!;
    expect(item.status).toBe("paid");
    expect(item.startDate).toBe("2026-07-15");
  });

  it("cancelled records never reach the calendar", () => {
    expect(
      projectFinanceItem(financeRecord({ status: "cancelled" }), TODAY),
    ).toBeNull();
  });

  it("invalid or missing dates degrade to null/skip — never NaN, never invented", () => {
    expect(
      projectFinanceItem(financeRecord({ dueDate: "not-a-date" }), TODAY),
    ).toBeNull();
    const paidNoTimestamp = projectFinanceItem(
      financeRecord({ status: "paid", paidAt: null, dueDate: "2026-07-05" }),
      TODAY,
    );
    expect(paidNoTimestamp?.startDate).toBe("2026-07-05"); // honest fallback to the only real date
  });

  it("timezone boundary: a UTC-evening timestamp buckets to its UTC day", () => {
    const item = projectFinanceItem(
      financeRecord({ status: "paid", paidAt: "2026-07-16T23:30:00Z" }),
      TODAY,
    )!;
    expect(item.startDate).toBe("2026-07-16");
  });
});

describe("invitation status/date semantics", () => {
  it("pending invitation is a deadline at its real expiry day", () => {
    const item = projectSentInvitationItem(sentInvitation());
    expect(item.status).toBe("pending");
    expect(item.startDate).toBe("2026-07-25");
    expect(item.statusKey).toBe("network.sent.status.pending");
  });

  it("accepted / declined / revoked land on their real decision days", () => {
    expect(
      projectSentInvitationItem(
        sentInvitation({ status: "accepted", acceptedAt: "2026-07-12T08:00:00Z" }),
      ).startDate,
    ).toBe("2026-07-12");
    expect(
      projectSentInvitationItem(
        sentInvitation({ status: "declined", declinedAt: "2026-07-13T08:00:00Z" }),
      ).startDate,
    ).toBe("2026-07-13");
    expect(
      projectSentInvitationItem(
        sentInvitation({ status: "revoked", revokedAt: "2026-07-14T08:00:00Z" }),
      ).startDate,
    ).toBe("2026-07-14");
  });

  it("expired invitation is a past fact at its expiry day", () => {
    const item = projectSentInvitationItem(
      sentInvitation({ status: "expired", expiresAt: "2026-07-01T10:00:00Z" }),
    );
    expect(item.status).toBe("expired");
    expect(item.startDate).toBe("2026-07-01");
  });

  it("a missing decision timestamp degrades to undated — no invented date", () => {
    const item = projectSentInvitationItem(
      sentInvitation({ status: "accepted", acceptedAt: null }),
    );
    expect(item.startDate).toBeNull();
    expect(invitationEventDay("unknown-status", sentInvitation())).toBeNull();
  });

  it("incoming pending invitation carries the incoming role context", () => {
    const item = projectIncomingInvitationItem(incomingInvitation);
    expect(item.roleContext).toBe("incoming");
    expect(item.label).toBe("Statybos UAB");
    expect(item.startDate).toBe("2026-07-22");
  });
});

/* ------------------------------------------------------------------ */
/* View coverage                                                       */
/* ------------------------------------------------------------------ */

describe("both new sources appear in every planning view", () => {
  const items = [
    projectFinanceItem(financeRecord({ dueDate: "2026-07-20" }), TODAY)!,
    projectSentInvitationItem(sentInvitation({ expiresAt: "2026-07-22T10:00:00Z" })),
  ];
  const ids = ["finance:f1", "invitation:i1"];

  it("agenda groups them on their real days", () => {
    const agenda = buildAgenda(items, new Date(`${TODAY}T00:00:00Z`));
    const listed = agenda.days.flatMap((d) => d.items.map((i) => i.id));
    expect(listed).toEqual(expect.arrayContaining(ids));
  });

  it("day view covers each item's exact day", () => {
    expect(itemsForDay(items, "2026-07-20").map((i) => i.id)).toEqual([
      "finance:f1",
    ]);
    expect(itemsForDay(items, "2026-07-22").map((i) => i.id)).toEqual([
      "invitation:i1",
    ]);
  });

  it("week view places both items inside their week", () => {
    const week = buildWeekView("2026-07-20", items, TODAY);
    const listed = week.flatMap((d) => d.items.map((i) => i.id));
    expect(listed).toEqual(expect.arrayContaining(ids));
  });

  it("month grid counts both items", () => {
    const grid = buildMonthGrid("2026-07-17", items, TODAY);
    const total = grid.weeks.flat().reduce(
      (sum, cell) => (cell.inMonth ? sum + cell.count : sum),
      0,
    );
    expect(total).toBe(2);
  });

  it("year overview counts both items in July", () => {
    const year = buildYearOverview(2026, items, TODAY);
    expect(year.find((m) => m.month === "2026-07")?.count).toBe(2);
  });

  it("the page renders filter chips and tones for every registered source", () => {
    // I2 (2026-09-02): the chips are filtered to the sources PRESENT in the
    // model before mapping — the registered set is still the source of truth.
    expect(PAGE).toMatch(/PLANNING_SOURCE_TYPES(?:\.filter\([\s\S]*?\))?\.map\(/);
    expect(PAGE).toMatch(/finance: "border-state-warning\/40 text-state-warning"/);
    expect(PAGE).toMatch(/invitation: "border-brand-purple\/40 text-brand-purple"/);
  });

  it("new-source failures surface as honest notes on the page", () => {
    for (const key of [
      "sourceNotes.financeUnavailable",
      "sourceNotes.financeError",
      "sourceNotes.invitationUnavailable",
      "sourceNotes.invitationError",
    ]) {
      expect(PAGE).toContain(key);
    }
  });
});
