import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { CONVERSATION_RESULTS, canRenderInline } from "@/lib/conversation/result-registry";

/**
 * "OPEN FULL SCREEN" EXPANDS — IT NEVER ESCAPES.
 *
 * Owner P0/P1 §17 (2026-09-23), verbatim: "Open full screen may expand a
 * contextual result when more space is useful. It must not be an escape hatch
 * into a second legacy application."
 *
 * Before: every result's "Atidaryti pilną ekraną" called ONE callback,
 * `openFullScreen = (route) => router.push(route)`. Full screen of the compact
 * work card meant unmounting the conversation for the 1,463-line profile page;
 * the engagements result's "full screen" opened the projects list — a
 * different object.
 *
 * After, and pinned here:
 *   1. the generic promise lives ONCE, in the Context Panel's header, and it
 *      keeps it: `?full=1` gives the SAME result the whole workspace, in
 *      place — only for a result with a real inline renderer;
 *   2. every control that DOES navigate names its station ("Open profile",
 *      "Open calendar"), from the registry's `stationLabelKey`;
 *   3. no result body says "open full screen" any more.
 */

const WEB = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(WEB, rel), "utf8");
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const HOOK = read("components/app/workspace/use-result-param.ts");
const PANEL = read("components/app/world-state/context-panel.tsx");
const CHAT = read("components/app/conversation/chat/conversation-chat.tsx");
const RESULTS = [
  "player-card-result.tsx",
  "calendar-result.tsx",
  "opportunities-result.tsx",
  "candidates-result.tsx",
  "project-result.tsx",
  "engagements-result.tsx",
  "result-body.tsx",
].map((f) => [f, read(`components/app/workspace/${f}`)] as const);

const ACTIVE = ["lt", "en", "ru", "nl", "de", "pl"] as const;
const ALL = [...ACTIVE, "da", "et", "lv", "no", "sv"] as const;

describe("1. full screen is a STATE of the same result, not a route", () => {
  it("the hook reads `full=1` only beside a valid result", () => {
    expect(HOOK).toMatch(/const expanded = result !== null && readParam\("full"\) === "1";/);
  });

  it("the chat's openFullScreen EXPANDS — it does not push a route", () => {
    const body = code(CHAT);
    expect(body).toMatch(/const openFullScreen = expandResult;/);
    // Negative control: the old escape is gone from the full-screen verb…
    expect(body).not.toMatch(/const openFullScreen = useCallback\(\s*\(route: string\) => router\.push/);
    // …and survives only as the NAMED station door.
    expect(body).toMatch(/const openStation = useCallback\(\s*\(route: string\) => router\.push\(route\)/);
  });

  it("the panel is wired with two verbs: expand in place, open a named station", () => {
    const mount = CHAT.slice(CHAT.indexOf("<ContextPanel"), CHAT.indexOf("/>", CHAT.indexOf("<ContextPanel")));
    expect(mount).toMatch(/full=\{resultFull\}/);
    expect(mount).toMatch(/onExpand=\{openFullScreen\}/);
    expect(mount).toMatch(/onCollapse=\{collapseResult\}/);
    expect(mount).toMatch(/onOpenFull=\{openStation\}/);
  });

  it("the chat and the panel apply the SAME registry rule for 'can be full'", () => {
    expect(CHAT).toMatch(/resultExpanded && result !== null && canRenderInline\(result, resultContext\)/);
    expect(PANEL).toMatch(/canRenderInline\(result, resultContext\) &&\s*onExpand !== undefined/);
    expect(PANEL).toMatch(/const isFull = canExpand && full;/);
  });

  it("the panel's expand control is generic, labelled, and never a link", () => {
    expect(PANEL).toContain('data-testid="context-panel-expand"');
    expect(PANEL).toMatch(/aria-label=\{isFull \? tr\("collapseFull"\) : tr\("openFull"\)\}/);
    expect(PANEL).toMatch(/onClick=\{isFull \? onCollapse : onExpand\}/);
    // Still the one panel, still no routing, no result kind named.
    expect(PANEL).not.toMatch(/useRouter|router\.push|<Link\b|href=/);
    for (const r of CONVERSATION_RESULTS) {
      expect(PANEL, `the panel must not name "${r.kind}"`).not.toContain(`"${r.kind}"`);
    }
  });

  it("FULL is a third width of the SAME panel (desktop row, phone screen)", () => {
    expect(PANEL).toMatch(/isFull\s*\?\s*"lg:min-w-0 lg:flex-1"/);
    expect(PANEL).toMatch(/"fixed inset-0 z-50 bg-ink-900 pb-\[env\(safe-area-inset-bottom\)\]"/);
    expect(PANEL.match(/<aside/g) ?? []).toHaveLength(1);
    // The conversation docks beside it — mounted, never unmounted.
    expect(CHAT).toMatch(/resultFull \? "lg:w-\[22rem\] lg:flex-none xl:w-\[26rem\]" : ""/);
  });

  it("a fallback result cannot be 'expanded' (nothing to expand)", () => {
    const unverified = CONVERSATION_RESULTS.filter((r) => r.dataReadiness === "unverified");
    expect(unverified.length).toBeGreaterThan(0);
    for (const r of unverified) {
      for (const ctx of ["personal", "organization", "project"] as const) {
        expect(canRenderInline(r.kind, ctx)).toBe(false);
      }
    }
  });
});

describe("2. every door that navigates NAMES its station", () => {
  it("no result body offers the generic 'open full screen' any more", () => {
    for (const [file, src] of RESULTS) {
      expect(code(src), `${file} still says "open full screen"`).not.toMatch(/t\("openFull"\)/);
    }
  });

  it("each result's station door uses its registry station name", () => {
    const byFile: Record<string, string> = {
      "player-card-result.tsx": "player-card",
      "calendar-result.tsx": "calendar",
      "opportunities-result.tsx": "opportunities",
      "candidates-result.tsx": "candidates",
      "project-result.tsx": "project",
      "engagements-result.tsx": "engagements",
    };
    for (const [file, src] of RESULTS) {
      const kind = byFile[file];
      if (!kind) continue;
      const r = CONVERSATION_RESULTS.find((x) => x.kind === kind)!;
      const key = r.stationLabelKey.replace("conversation.results.", "");
      expect(src, `${file} names ${key}`).toContain(`t("${key}")`);
    }
  });

  it("the engagements result's door is the PROJECTS station, and says so", () => {
    const src = RESULTS.find(([f]) => f === "engagements-result.tsx")![1];
    expect(src).toMatch(/const FULL_ROUTE = "\/dashboard\/projects";/);
    expect(src).toMatch(/label=\{t\("station\.projects"\)\}/);
  });

  it("every station name exists in all 11 catalogs and is never the generic promise", () => {
    for (const locale of ALL) {
      const r = (JSON.parse(read(`messages/${locale}.json`)) as {
        conversation: { results: Record<string, unknown> };
      }).conversation.results;
      const station = r.station as Record<string, string>;
      expect(typeof r.collapseFull, `${locale}: collapseFull`).toBe("string");
      for (const d of CONVERSATION_RESULTS) {
        const leaf = d.stationLabelKey.split(".").pop()!;
        expect(typeof station?.[leaf], `${locale}: station.${leaf}`).toBe("string");
        expect(station[leaf].trim().length).toBeGreaterThan(0);
        expect(station[leaf]).not.toBe(r.openFull);
        expect(station[leaf]).not.toMatch(/^\[EN\]/);
      }
    }
  });

  it("the fallback copy is plain words — no engineering prose (anti-slop C)", () => {
    for (const locale of ACTIVE) {
      const r = (JSON.parse(read(`messages/${locale}.json`)) as {
        conversation: { results: Record<string, string> };
      }).conversation.results;
      expect(r.fallbackUnverified, locale).not.toMatch(
        /duomenų šaltin|data source|источник данных|databron|Datenquelle|źródło danych|verif|patikrint|провер/i,
      );
    }
  });
});
