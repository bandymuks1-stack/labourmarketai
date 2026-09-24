import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { TODAY_COVERED_BRIEF_RUNGS } from "@/lib/today/today-route";

/**
 * A CALM HOME — the worker's `/dashboard` shows what matters now, once
 * (owner §20 + CASE 11, 2026-09-23).
 *
 * Decision 0017 put ŠIANDIEN into the conversation's opening slot but left
 * two older "what needs you now" compositions running beside it: the opening
 * brief said ŠIANDIEN's doors again, and the Context Panel mounted a map on
 * every load. ŠIANDIEN also stated its own empty lines ("a growth reading
 * needs two skills", "no postings for you"). Each rule below is one of those
 * repairs; each carries a negative control so a vacuous pattern cannot pass.
 */

const APP = join(__dirname, "..", "..");
const read = (rel: string): string =>
  readFileSync(join(APP, rel), "utf8").replace(/\r\n/g, "\n");

const CHAT = read("components/app/conversation/chat/conversation-chat.tsx");
const BRIEF = read("lib/conversation/opening-brief.ts");
const PANEL = read("components/app/world-state/context-panel.tsx");
const THREAD = read("components/app/conversation/chat/conversation-thread.tsx");

// ── 1 · ŠIANDIEN owns the attention it renders ──────────────────────────────

describe("ŠIANDIEN owns the attention it already renders", () => {
  it("the covered rungs are exactly what ŠIANDIEN states: its doors, its opportunity line, its next action", () => {
    // offers / invitations / unread → ŠIANDIEN's doors (TODAY_DOOR_HREFS);
    // matches → its opportunity line; profile-gap → its ONE next action.
    expect([...TODAY_COVERED_BRIEF_RUNGS]).toEqual([
      "bookings",
      "invitations",
      "matches",
      "unread",
      "profile-gap",
    ]);
  });

  it("the constant lives in the pure route module, never in the 'use server' brief", () => {
    // A "use server" file may only export async functions; a const exported
    // there breaks the build, and the client must import this value.
    expect(read("lib/today/today-route.ts")).toMatch(/export const TODAY_COVERED_BRIEF_RUNGS/);
    expect(BRIEF.startsWith('"use server";')).toBe(true);
    expect(BRIEF).not.toMatch(/^export const /m);
  });

  it("the chat passes the omit ONLY while an opening context is on screen; the employer brief takes none", () => {
    expect(CHAT).toMatch(/const todayOnScreen = Boolean\(openingContext\);/);
    expect(CHAT).toMatch(
      /const briefOptions = todayOnScreen \? \{ omit: TODAY_COVERED_BRIEF_RUNGS \} : undefined;/,
    );
    expect(CHAT).toMatch(/loadOpeningBrief\(briefOptions\) : loadEmployerOpeningBrief\(\)/);
    // Negative control: an unconditional omit would silence the brief for a
    // person who has no ŠIANDIEN above it.
    expect(CHAT).not.toMatch(/loadOpeningBrief\(\{\s*omit:/);
  });

  describe("driven through the real brief with fake readers", () => {
    afterEach(() => {
      vi.resetModules();
      vi.restoreAllMocks();
    });

    function mockReaders() {
      const spies = {
        bookings: vi.fn(async () => 1),
        invitations: vi.fn(async () => ({
          status: "ok" as const,
          total: 2,
          items: [{ organizationName: "Org", inviterName: null }],
        })),
        unread: vi.fn(async () => 3),
        profile: vi.fn(async () => ({ kind: "summary", missing: ["step"], missingKeys: [] })),
        matches: vi.fn(async () => ({
          kind: "ready",
          capabilities: { boardAvailable: true },
          interestStatusByRequestId: {},
          newCount: 0,
          totalRecommendable: 4,
        })),
      };
      vi.doMock("next-intl/server", () => ({
        getTranslations: async () => Object.assign((k: string) => k, { has: () => false }),
      }));
      vi.doMock("@/lib/booking/booking-actions", () => ({
        getPendingIncomingBookingCount: spies.bookings,
      }));
      vi.doMock("@/lib/invitations/attention", () => ({
        listInvitationsAddressedToMe: spies.invitations,
      }));
      vi.doMock("@/lib/communication/unread", () => ({
        getUnreadConversationCount: spies.unread,
      }));
      vi.doMock("@/lib/conversation/profile-summary", () => ({
        loadProfileSummaryForChat: spies.profile,
      }));
      vi.doMock("@/lib/marketplace/worker-opportunities", () => ({
        loadWorkerOpportunityMatches: spies.matches,
      }));
      // A rung ŠIANDIEN does NOT carry — it must still reach the worker.
      vi.doMock("@/lib/instructions/instructions", () => ({
        listAttentionInstructions: async () => [{ id: "i1" }],
      }));
      // Everything else contributes nothing.
      vi.doMock("@/lib/conversation/documents-gap-server", () => ({
        loadWorkerDocumentGap: async () => ({ kind: "unavailable" }),
      }));
      vi.doMock("@/lib/planning/planning", () => ({
        getPlanning: async () => ({ status: "unavailable", items: [] }),
      }));
      vi.doMock("@/lib/projects/worker-project-access", () => ({ getOwnWorkerId: async () => null }));
      vi.doMock("@/lib/journal/own-recent-confirmations", () => ({
        loadOwnRecentConfirmations: async () => null,
      }));
      vi.doMock("@/lib/invitations/network", () => ({ listMyEngagements: async () => [] }));
      return spies;
    }

    it("without an opening context the brief still states the doors (nothing is lost elsewhere)", async () => {
      mockReaders();
      const { loadOpeningBrief } = await import("@/lib/conversation/opening-brief");
      const brief = await loadOpeningBrief();
      expect(brief.kind).toBe("brief");
      if (brief.kind !== "brief") return;
      // The fake translator returns the key, so each line names its rung.
      expect(brief.lines).toEqual(["pendingLink — pendingNote", "briefInvitations", "briefMatches"]);
      expect(brief.chips.map((c) => c.id)).toEqual(["offers", "invitations", "jobs"]);
    });

    it("under ŠIANDIEN the covered rungs are left out — unread and read — and a unique rung comes through", async () => {
      const spies = mockReaders();
      const { loadOpeningBrief } = await import("@/lib/conversation/opening-brief");
      const brief = await loadOpeningBrief({ omit: TODAY_COVERED_BRIEF_RUNGS });
      expect(brief.kind).toBe("brief");
      if (brief.kind !== "brief") return;
      expect(brief.lines).toEqual(["briefInstructions"]);
      expect(brief.chips.map((c) => c.id)).toEqual(["link:/dashboard/instructions"]);
      // The readers ŠIANDIEN already ran are not run a second time.
      expect(spies.bookings).not.toHaveBeenCalled();
      expect(spies.invitations).not.toHaveBeenCalled();
      expect(spies.unread).not.toHaveBeenCalled();
      expect(spies.profile).not.toHaveBeenCalled();
      // The matches read still runs: its "a company answered your interest"
      // line is NOT something ŠIANDIEN states.
      expect(spies.matches).toHaveBeenCalled();
    });

    it("NEGATIVE CONTROL: an unknown rung name from the client omits nothing", async () => {
      mockReaders();
      const { loadOpeningBrief } = await import("@/lib/conversation/opening-brief");
      const brief = await loadOpeningBrief({
        omit: [...TODAY_COVERED_BRIEF_RUNGS, "instructions" as never],
      });
      expect(brief.kind === "brief" && brief.lines).toEqual(["briefInstructions"]);
      const junk = await loadOpeningBrief({ omit: "bookings" as never });
      expect(junk.kind === "brief" && junk.chips.map((c) => c.id)).toContain("offers");
    });
  });
});

// ── 2 · "Tuščia = tvarkinga" on ŠIANDIEN ────────────────────────────────────

describe("ŠIANDIEN leaves an empty line out instead of stating it", () => {
  const WORK = read("components/app/today/today-work-section.tsx");
  const OPP = read("components/app/today/today-opportunity-section.tsx");

  it("the growth section renders only behind the pure predicate", () => {
    expect(WORK).toMatch(/\{isTodayGrowthShown\(growthLine\) && \(\s*<section/);
  });

  it("the opportunity section returns nothing behind the pure predicate", () => {
    expect(OPP).toMatch(/if \(!isTodayOpportunityShown\(o\)\) return null;/);
  });

  it("NEGATIVE CONTROL: the empty-state sentences are no longer rendered anywhere on ŠIANDIEN", () => {
    for (const [rel, src] of [
      ["today-work-section.tsx", WORK],
      ["today-opportunity-section.tsx", OPP],
    ] as const) {
      expect(src, rel).not.toMatch(/t\("growth\.(insufficient|none)"\)/);
      expect(src, rel).not.toMatch(/t\("opportunity\.(none|noWorker)"\)/);
    }
    // …while a FAILED read is still named (SEP-7: UNKNOWN ≠ ZERO).
    expect(WORK).toMatch(/t\("growth\.unknown"\)/);
    expect(OPP).toMatch(/t\("opportunity\.unknown"\)/);
    expect(OPP).toMatch(/t\("opportunity\.unavailable"\)/);
  });

  it("the four empty-state sentences left no dead copy behind in any catalog (review P2 on #1856)", () => {
    for (const locale of ["lt", "en", "ru", "nl", "de", "pl", "da", "et", "lv", "no", "sv"]) {
      const home = (JSON.parse(read(`messages/${locale}.json`)) as {
        todayScreen?: { home?: Record<string, Record<string, unknown>> };
      }).todayScreen?.home;
      if (!home) continue;
      expect(Object.keys(home.growth ?? {}), locale).not.toContain("insufficient");
      expect(Object.keys(home.growth ?? {}), locale).not.toContain("none");
      expect(Object.keys(home.opportunity ?? {}), locale).not.toContain("none");
      expect(Object.keys(home.opportunity ?? {}), locale).not.toContain("noWorker");
      // …while the lines the sections DO render stay (negative control).
      expect(home.growth, locale).toHaveProperty("unknown");
      expect(home.opportunity, locale).toHaveProperty("unavailable");
    }
  });
});

// ── 3 · the map is contextual, not ambient ──────────────────────────────────

describe("the home's Context Panel shows no map at depth 0", () => {
  it("the one map mount is gated on a selection and on being visible", () => {
    expect(PANEL).toMatch(
      /const mapAsked = panel\.mode === "entity" && \(expanded \|\| wideScreen\);/,
    );
    const mounts = [...PANEL.matchAll(/<WorkspaceMap\b/g)];
    expect(mounts, "one map mount").toHaveLength(1);
    const before = PANEL.slice(Math.max(0, mounts[0].index! - 60), mounts[0].index!);
    expect(before, "the mount sits behind `mapAsked`").toMatch(/\{mapAsked \? \(\s*$/);
  });

  it("the map's own read and Leaflet live INSIDE WorkspaceMap — not mounting it loads nothing", () => {
    const map = read("components/app/world-state/workspace-map.tsx");
    expect(map).toMatch(/loadWorkspaceMap\(\)/);
    expect(map).toMatch(/mountLeafletMap\(/);
    expect(PANEL).not.toMatch(/loadWorkspaceMap|mountLeafletMap|from "leaflet"/);
  });

  it("the breakpoint is read on the client with a phone-first server snapshot", () => {
    expect(PANEL).toMatch(/const LG_QUERY = "\(min-width: 1024px\)";/);
    expect(PANEL).toMatch(/useSyncExternalStore\(\s*subscribeWide,[\s\S]*?\(\) => false,\s*\)/);
  });

  it("NEGATIVE CONTROL: the retired unconditional mount would fail the gate check", () => {
    const retired = `          <>
            {work?.invitations ? (
              <WorkerInvitations />
            ) : null}
            <WorkspaceMap className={work?.invitations ? "my-4" : "mb-4"} />
          </>`;
    const at = retired.indexOf("<WorkspaceMap");
    expect(retired.slice(Math.max(0, at - 60), at)).not.toMatch(/\{mapAsked \? \(\s*$/);
  });

  it("the browser spec pins the new contract, not the old one", () => {
    const spec = read("tests/e2e/w6-workspace-map.spec.ts");
    expect(spec).toMatch(/the home at depth 0 shows the work context and no map/);
    expect(spec).toMatch(/getByTestId\("workspace-map"\)\)\.toHaveCount\(0\)/);
    expect(spec).toMatch(/locator\("\.leaflet-container"\)\)\.toHaveCount\(0\)/);
    // The capability survives: selection → map, and map → selection.
    expect(spec).toMatch(/wsmap-pin-active/);
    expect(spec).toMatch(/opportunities-match-open/);
  });
});

// ── 4 · the opening reads top-down when the composer is not in it ──────────

describe("the opening composition is not scrolled past ŠIANDIEN", () => {
  it("the thread holds the top while opening without an inline composer", () => {
    expect(THREAD).toMatch(/const holdOpeningTop = isOpening && !composer;/);
    const effect = THREAD.slice(THREAD.indexOf("useEffect(() => {"));
    expect(effect).toMatch(/^useEffect\(\(\) => \{\s*if \(holdOpeningTop\) return;/);
    expect(effect).toMatch(/\}, \[items\.length, typing, holdOpeningTop\]\);/);
    // isOpening must exist BEFORE the effect reads it.
    expect(THREAD.indexOf("const isOpening")).toBeLessThan(THREAD.indexOf("useEffect(() => {"));
  });

  it("ŠIANDIEN hands the composer to the sticky bar, so holding the top never hides the composer", () => {
    expect(CHAT).toMatch(/composer=\{\s*openingContext \? undefined : \(/);
    expect(CHAT).toMatch(/\{opening && !openingContext \? null : \(/);
  });

  it("NEGATIVE CONTROL: the retired always-scroll effect would fail", () => {
    const retired = `useEffect(() => {
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    endRef.current?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "end" });
  }, [items.length, typing]);`;
    expect(retired).not.toMatch(/^useEffect\(\(\) => \{\s*if \(holdOpeningTop\) return;/);
  });

  it("the owner acceptance walk places ŠIANDIEN's header in the first viewport — viewport space, after the brief", () => {
    // The browser-level evidence for §4 (a script, not a spec — its header
    // says why). Two traps it must keep avoiding: a DOCUMENT-space rect
    // (`+ scrollY`) is always "in view", and a measurement taken before the
    // async brief lands passes a home that jumps a moment later.
    const walk = read("scripts/owner-acceptance-walk.mjs");
    expect(walk).toMatch(/querySelector\('\[data-testid="today-header"\]'\)/);
    expect(walk).toMatch(/inView: tb\.top >= 0 && tb\.bottom <= window\.innerHeight/);
    expect(walk).not.toMatch(/tb\.(top|bottom) \+ (window\.)?scrollY/);
    const phone = walk.slice(walk.indexOf("// 9. 375px"));
    expect(phone).toMatch(/waitForTimeout\(3000\);[\s\S]*?const m = await snap\(page\);/);
    expect(phone).toMatch(/ŠIANDIEN header in the first viewport/);
  });
});
