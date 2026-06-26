import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * DOM-ORDER PROOF for the journal entry card (owner round 3 review gap).
 *
 * The logged-in journal page is behind Vercel SSO + Supabase auth and cannot be
 * driven autonomously, so this renders the REAL `JournalEntryRow` (+ the real
 * `JournalEntrySkillLinks` it contains) to static markup and asserts the actual
 * final DOM order and the collapsed earlier-links state — no fake routes, no
 * auth bypass, no production data. The text + "Sistema suprato" sections are the
 * exact JSX the server page passes as children (mirrored here so the whole card
 * order is proven in one rendered string).
 *
 * Proven order: 1 Įrašo tekstas → 2 Sistema suprato → 3 Susieti įgūdžiai →
 * 4 Ankstesni ryšiai (collapsed) → 5 status + actions (quiet, bottom).
 */

const CWD = process.cwd(); // apps/web when vitest runs
const journalLT = JSON.parse(
  readFileSync(join(CWD, "messages/lt/journal.json"), "utf8"),
) as { entry: Record<string, string> };
const baseLT = JSON.parse(
  readFileSync(join(CWD, "messages/lt.json"), "utf8"),
) as { journalSkillLinks: Record<string, string> };

// Minimal next-intl + navigation stubs: real LT copy, no routing/auth infra.
vi.mock("next-intl", () => {
  // require() inside a hoisted mock factory: top-level imports are not yet
  // available when the factory is hoisted, so Node's require is the only way in.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require("node:fs");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = require("node:path");
  const cwd = process.cwd();
  const j = JSON.parse(
    fs.readFileSync(path.join(cwd, "messages/lt/journal.json"), "utf8"),
  );
  const b = JSON.parse(fs.readFileSync(path.join(cwd, "messages/lt.json"), "utf8"));
  const lookup = (obj: Record<string, unknown>) =>
    (key: string, vars?: Record<string, unknown>) => {
      let v: unknown = key
        .split(".")
        .reduce<unknown>((a, k) => (a as Record<string, unknown>)?.[k], obj);
      if (typeof v !== "string") return key;
      if (vars)
        for (const [k, val] of Object.entries(vars))
          v = (v as string).replace(new RegExp(`\\{${k}\\}`, "g"), String(val));
      return v as string;
    };
  return {
    useTranslations: (ns: string) =>
      ns === "journalSkillLinks" ? lookup(b.journalSkillLinks) : lookup(j),
    useLocale: () => "lt",
  };
});
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: unknown }) =>
    createElement("a", { href }, children as never),
}));
vi.mock("@/lib/i18n/navigation", () => ({
  Link: ({ href, children }: { href: string; children: unknown }) =>
    createElement("a", { href }, children as never),
}));
vi.mock("@/lib/journal/journal-entry-skills-actions", () => ({
  setJournalEntrySkillLinks: async () => ({ ok: true, linked: 0 }),
}));
vi.mock("@/lib/journal/actions", () => ({
  softDeleteJournalEntry: async () => ({ ok: true }),
}));
vi.mock("@/lib/telemetry/task", () => ({ recordEvent: () => {} }));

// Import AFTER mocks so the component picks up the stubs.
const { JournalEntryRow } = await import(
  "@/components/app/journal-entry-row"
);

function renderCard() {
  return renderToStaticMarkup(
    // children-as-prop keeps TS happy (children is a required prop on the row);
    // the rule preferring variadic args does not apply to this proof harness.
    // eslint-disable-next-line react/no-children-prop
    createElement(JournalEntryRow, {
      entryId: "e1",
      canDelete: true,
      skillLinks: {
        // s1 = clean (recognized) → shown; s2 = stale → collapsed under
        // "Ankstesni ryšiai"; s3 = unlinked → surfaces the manual link action.
        availableSkills: [
          { id: "s1", name: "Mūrijimas" },
          { id: "s2", name: "Tinkavimas" },
          { id: "s3", name: "Dažymas" },
        ],
        linkedSkillIds: ["s1", "s2"],
        skillSources: {
          s1: "recognized_from_text" as const,
          s2: "stale_needs_review" as const,
        },
      },
      statusSlot: createElement("div", {}, "STATUS_TIMELINE_MARKER"),
      // children = the page's text + "Sistema suprato" sections.
      children: [
        createElement(
          "div",
          { key: "text" },
          createElement("p", {}, journalLT.entry.textLabel),
          createElement("p", {}, "Klojau pamatus objekte"),
        ),
        createElement(
          "div",
          { key: "understood" },
          createElement("p", {}, journalLT.entry.understoodLabel),
          createElement("span", {}, "Mūrininkas"),
        ),
      ],
    }),
  );
}

describe("Journal entry card — rendered DOM order proof", () => {
  const html = renderCard();
  const idx = (s: string) => html.indexOf(s);

  it("renders all five sections in order, status + actions last", () => {
    const order = [
      journalLT.entry.textLabel, // 1 Įrašo tekstas
      journalLT.entry.understoodLabel, // 2 Sistema suprato
      baseLT.journalSkillLinks.signalsHeading, // 3 Susieti įgūdžiai
      baseLT.journalSkillLinks.reviewHeading, // 4 Ankstesni ryšiai
      "STATUS_TIMELINE_MARKER", // 5a status (quiet, bottom)
      journalLT.entry.edit, // 5b actions (Redaguoti)
    ];
    const positions = order.map(idx);
    for (const p of positions) expect(p).toBeGreaterThan(-1);
    for (let i = 1; i < positions.length; i++) {
      expect(
        positions[i],
        `"${order[i]}" must come after "${order[i - 1]}"`,
      ).toBeGreaterThan(positions[i - 1]);
    }
  });

  it("entry text is the first visible content block", () => {
    expect(idx(journalLT.entry.textLabel)).toBeGreaterThan(-1);
    expect(idx("Klojau pamatus objekte")).toBeGreaterThan(idx(journalLT.entry.textLabel));
    // text appears before any skill chip.
    expect(idx("Klojau pamatus objekte")).toBeLessThan(idx("Mūrijimas"));
  });

  it("earlier links are COLLAPSED — stale chip not in the DOM, summary is", () => {
    // Clean skill chip is shown.
    expect(html).toContain("Mūrijimas");
    // Earlier-links heading + summary are present...
    expect(html).toContain(baseLT.journalSkillLinks.reviewHeading);
    expect(html).toContain("1 ankstesni ryšiai"); // reviewSummary, count=1
    // ...but the stale skill's NAME is NOT rendered (chips collapsed by default).
    expect(html).not.toContain("Tinkavimas");
  });

  it("manual link fallback stays visible (Susieti įgūdį), unlinked skill hidden", () => {
    expect(html).toContain(baseLT.journalSkillLinks.linkMore); // "Susieti įgūdį"
    expect(html).not.toContain("Dažymas"); // unlinked + picker closed → hidden
  });

  it("no raw English slug leaks into the rendered card", () => {
    for (const slug of ["bricklaying", "plastering", "recognized_from_text", "stale_needs_review"]) {
      // data-source attribute is allowed to carry the source token; assert no
      // BARE slug text node (surrounded by tag boundaries) leaks as a label.
      expect(html).not.toMatch(new RegExp(`>\\s*${slug}\\s*<`));
    }
  });
});
