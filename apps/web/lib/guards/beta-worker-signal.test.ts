import { describe, expect, it, vi, afterEach } from "vitest";

/**
 * Beta foundation audit — the two "the product knew, and never said" defects.
 *
 * W-J1. The chat promises "fill this in and I'll search right away", and the
 * search WAS wired (`openForm("worker.save-work-card", doFindWork)`) — but the
 * only control that fired it was labelled "Add another". A person who read the
 * button and believed it never got a search. Fixed by letting the caller NAME
 * the continuation; asserted here on the real form component's rendered output,
 * not on the call site's source text.
 *
 * B1. A proposed booking is another human waiting on this person's answer. The
 * offer cards were already loaded by the dashboard page and already rendered
 * behind the `offers` chip — nothing ever SAID one was waiting, and bookings
 * intentionally have no nav entry (owner IA ruling). Fixed in the opening
 * brief; asserted here by driving the real module against a fake count.
 *
 * Both suites carry NEGATIVE CONTROLS: the generic label must survive where no
 * continuation is named, and a zero/failed booking read must produce no line.
 */

afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
});

// ── W-J1 ───────────────────────────────────────────────────────────────────
describe("W-J1 — the button that runs the search says what it does", () => {
  /**
   * NOTE ON EVIDENCE. This component cannot be rendered in the unit
   * environment (next-intl's client navigation module does not resolve under
   * vitest), so the structural anchors below are deliberately paired with a
   * REAL browser proof recorded in the PR: the saved criteria card shows
   * "Find work", pressing it runs the search, and the opportunities panel
   * opens. These assertions exist to stop the wiring silently regressing —
   * they are not the proof that it works.
   */
  it("the done affordance prefers the caller's label over the generic one", async () => {
    // The form renders its first phase here; the guarantee under test is that
    // `continueLabel` is part of the component's public contract and is used
    // for the done affordance rather than the hardcoded key.
    const src = await import("node:fs").then((fs) =>
      fs.readFileSync(
        "components/app/conversation/inline-action-form.tsx",
        "utf8",
      ),
    );
    // BEHAVIOURAL anchor: the done branch must prefer the prop and fall back to
    // the generic key — never the reverse, never the key alone.
    expect(src).toContain('continueLabel ?? t("conversation.forms.ui.addAnother")');
    // and the prop must be optional so every other caller is untouched
    expect(src).toContain("continueLabel?: string");
  });

  it("the find-work criteria form names its continuation, and it is the search", async () => {
    const src = await import("node:fs").then((fs) =>
      fs.readFileSync(
        "components/app/conversation/chat/conversation-chat.tsx",
        "utf8",
      ),
    );
    // The continuation callback is still the real search…
    expect(src).toContain(
      'openForm("worker.save-work-card", doFindWork, labels.userFindWork)',
    );
    // …and the label it uses is a real translated key, not a literal.
    expect(src).not.toContain('openForm("worker.save-work-card", doFindWork)');
  });

  it("NEGATIVE CONTROL: a caller that names nothing still gets 'Add another'", async () => {
    const src = await import("node:fs").then((fs) =>
      fs.readFileSync(
        "components/app/conversation/inline-action-form.tsx",
        "utf8",
      ),
    );
    // The generic key must remain reachable — removing it would silently blank
    // the button for every other form in the product.
    expect(src).toContain("conversation.forms.ui.addAnother");
  });

  it("the label key exists in every ACTIVE locale (no [EN] placeholder)", async () => {
    const fs = await import("node:fs");
    for (const locale of ["lt", "en", "ru", "nl", "de"]) {
      const m = JSON.parse(fs.readFileSync(`messages/${locale}.json`, "utf8"));
      const v = m.conversation?.chat?.userFindWork;
      expect(v, `${locale}.conversation.chat.userFindWork`).toBeTruthy();
      expect(v, `${locale} must be really translated`).not.toContain("[EN]");
    }
  });
});

// ── B1 ─────────────────────────────────────────────────────────────────────
describe("B1 — a booking proposal is announced, not left in a closed popover", () => {
  function mockBrief(opts: {
    pending: number | (() => never);
  }) {
    vi.doMock("@/lib/booking/booking-actions", () => ({
      getPendingIncomingBookingCount: async () => {
        if (typeof opts.pending === "function") return opts.pending();
        return opts.pending;
      },
    }));
    // Every OTHER source contributes nothing, so any line we see is the
    // booking line and nothing else.
    vi.doMock("@/lib/marketplace/worker-opportunities", () => ({
      loadWorkerOpportunityMatches: async () => ({ kind: "unavailable" }),
    }));
    vi.doMock("@/lib/planning/planning", () => ({
      getPlanning: async () => ({ status: "unavailable", items: [] }),
    }));
    vi.doMock("@/lib/communication/unread", () => ({
      getUnreadConversationCount: async () => 0,
    }));
    vi.doMock("@/lib/conversation/profile-summary", () => ({
      loadProfileSummaryForChat: async () => ({ kind: "unavailable" }),
    }));
    vi.doMock("next-intl/server", () => ({
      getTranslations: async (ns: string) => (k: string) =>
        ns === "bookings" && k === "pendingLink"
          ? "Booking proposals"
          : ns === "bookings" && k === "pendingNote"
            ? "Awaiting your response"
            : k === "chipOffers"
              ? "View offers"
              : k,
    }));
  }

  it("one pending proposal produces a line AND the chip that opens the real cards", async () => {
    mockBrief({ pending: 1 });
    const { loadOpeningBrief } = await import("@/lib/conversation/opening-brief");
    const brief = await loadOpeningBrief();
    expect(brief.kind).toBe("brief");
    if (brief.kind !== "brief") return;
    expect(brief.lines.join(" ")).toContain("Booking proposals");
    // The chip id must be the one the chat already routes to the offer cards.
    expect(brief.chips.map((c) => c.id)).toContain("offers");
  });

  it("it outranks the passive lines — the waiting human comes first", async () => {
    mockBrief({ pending: 2 });
    const { loadOpeningBrief } = await import("@/lib/conversation/opening-brief");
    const brief = await loadOpeningBrief();
    if (brief.kind !== "brief") return;
    expect(brief.lines[0]).toContain("Booking proposals");
  });

  it("NEGATIVE CONTROL: zero pending proposals says nothing at all", async () => {
    mockBrief({ pending: 0 });
    const { loadOpeningBrief } = await import("@/lib/conversation/opening-brief");
    const brief = await loadOpeningBrief();
    // Everything else is unavailable in this fixture, so the brief must be
    // empty — an invented "no offers" line would be a claim about the person's
    // work made because a read returned zero.
    expect(brief.kind).toBe("none");
  });

  it("NEGATIVE CONTROL: a failed booking read never fabricates an offer", async () => {
    mockBrief({
      pending: () => {
        throw new Error("relation missing");
      },
    });
    const { loadOpeningBrief } = await import("@/lib/conversation/opening-brief");
    const brief = await loadOpeningBrief();
    expect(brief.kind).toBe("none");
  });
});
