import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { activeLocales } from "@/lib/i18n/config";

/**
 * PREMIUM ACTION CARD (owner design direction 2026-10-26) — one reusable card
 * where a person chooses what to do, first used on the Work (projects) page.
 * These pins keep what the owner asked for: subtle depth without heavy
 * effects, keyboard and 44 px reachability, reduced-motion support, no
 * sideways phone scroll, real functions behind every card and ONE primary.
 */
const WEB = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(WEB, rel), "utf8");
const CARD = read("components/ui/premium-action-card.tsx");
const CSS = read("app/globals.css");
const PAGE = read("app/[locale]/dashboard/projects/page.tsx");

describe("the card: depth without weight", () => {
  it("moves only transform and box-shadow (no 3D library, no filter, no WebGL)", () => {
    const block = CSS.slice(CSS.indexOf(".lm-card3d {"), CSS.indexOf(':root[data-theme="light"] .lm-card3d {'));
    expect(block).toMatch(/transform var\(--motion-fast\)/);
    expect(block).toMatch(/box-shadow var\(--motion-fast\)/);
    expect(block).not.toMatch(/filter|backdrop|will-change/);
    expect(CARD).not.toMatch(/from "(three|framer-motion|react-spring|@react-three\/[^"]*)"/);
  });

  it("the lean is hover-only on hover-capable pointers, and reduced motion removes it", () => {
    expect(CSS).toMatch(/@media \(hover: hover\) \{\s*\.lm-card3d:hover \{\s*transform: perspective\(900px\) rotateX\(3deg\) translateY\(-3px\);/);
    const reduced = CSS.slice(CSS.indexOf("@media (prefers-reduced-motion: reduce) {"), CSS.indexOf(".lm-card3d {"));
    expect(reduced).toMatch(/\.lm-card3d,\s*\.lm-card3d:hover,\s*\.lm-card3d:active \{\s*transition: none !important;\s*transform: none !important;/);
  });

  it("has a light-theme lighting of its own", () => {
    expect(CSS).toMatch(/:root\[data-theme="light"\] \.lm-card3d \{/);
  });

  it("depth is a physical object — bevel and layered shadow — never a glow", () => {
    const block = CSS.slice(CSS.indexOf(".lm-card3d {"), CSS.indexOf("/* ── A DISABLED BRAND CONTROL"));
    expect(block).toMatch(/inset 0 1px 0 rgb\(255 255 255/); // lit top edge
    expect(block).toMatch(/inset 0 -1px 0 rgb\(0 0 0/); // shaded bottom edge
    expect(block).not.toMatch(/rgb\(var\(--c-brand-blue\) \/ 0\.\d+\)\s*[,;]/); // no gold halo
    expect(CARD).not.toMatch(/shadow-cta-glow/);
  });
});

describe("the card: reachable and honest", () => {
  it("is a link with a visible focus ring and a tap area of at least 44 px", () => {
    expect(CARD).toMatch(/<Link\s+href=\{href as "\/dashboard"\}/);
    expect(CARD).toMatch(/focus-visible:ring-2 focus-visible:ring-brand-cyan/);
    // Phone: feature 68 px rows, compact 72 px tiles; from sm: 96 / 56 px.
    expect(CARD).toMatch(/min-h-\[4\.25rem\] flex-row/);
    expect(CARD).toMatch(/min-h-\[4\.5rem\] flex-col/);
    expect(CARD).toMatch(/sm:min-h-24/);
    expect(CARD).toMatch(/sm:min-h-14/);
  });

  it("marks where you are with aria-current, and a badge is spoken in words", () => {
    expect(CARD).toMatch(/aria-current=\{active \? "page" : undefined\}/);
    expect(CARD).toMatch(/<span className="sr-only">\{badge\.label\}<\/span>/);
  });

  it("two sizes — feature and compact — and the decks wrap, never a sideways strip", () => {
    expect(CARD).toMatch(/readonly size\?: "feature" \| "compact";/);
    expect(CARD).toMatch(/auto-rows-fr grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3/);
    expect(CARD).toMatch(/auto-rows-fr grid-cols-3 gap-2 sm:gap-3/);
    expect(CARD).not.toMatch(/overflow-x-auto|snap-x/);
  });
});

describe("the Work page: two tiers, navigation stays navigation", () => {
  const start = PAGE.indexOf("<PremiumActionDeck");
  const decks = PAGE.slice(start, PAGE.indexOf("<CompanyActionNextActions", start));
  const feature = decks.slice(0, decks.indexOf('size="compact"'));
  const tools = decks.slice(decks.indexOf('size="compact"'));

  it("three feature cards with exactly one primary, three compact tools", () => {
    expect((feature.match(/\{ key: "/g) ?? []).length).toBe(3);
    expect((feature.match(/emphasis: "primary"/g) ?? []).length).toBe(1);
    expect((tools.match(/\{ key: "/g) ?? []).length).toBe(3);
    expect(tools).not.toMatch(/emphasis: "primary"/);
  });

  it("every card leads to an existing route or to a section the page renders", () => {
    for (const href of ["/dashboard/company/projects/new", "/dashboard/communication"]) {
      expect(decks).toContain(`href: "${href}"`);
    }
    for (const anchor of ["assign-worker", "project-teams", "company-locations", "company-gallery"]) {
      expect(decks).toContain(`#${anchor}`);
    }
    expect(PAGE).toMatch(/<section id="project-teams"/);
    expect(PAGE).toMatch(/<div id="company-locations"/);
    expect(PAGE).toMatch(/<div id="company-gallery"/);
    expect(read("components/app/project-assignment-manager.tsx")).toMatch(/<form id="assign-worker"/);
  });

  it("names sections with their own titles", () => {
    expect(tools).toMatch(/label: tObjects\("title"\)/);
    expect(tools).toMatch(/label: tGallery\("title"\)/);
  });

  it("the active/finished switch is a segmented control, not a card", () => {
    expect(decks).not.toMatch(/projects-view-active|projects-view-archived/);
    const toggle = PAGE.slice(PAGE.indexOf('data-testid="projects-archive-toggle"') - 200);
    expect(toggle).toMatch(/rounded-full border border-ink-600/);
    expect(toggle).toMatch(/aria-current=\{!showArchived \? "page" : undefined\}[\s\S]*data-testid="projects-view-active"/);
    expect(toggle).toMatch(/aria-current=\{showArchived \? "page" : undefined\}[\s\S]*data-testid="projects-view-archived"/);
  });

  it("on a phone the intro steps aside so the main action is seen first", () => {
    expect(PAGE).toMatch(/<p className="hidden text-sm leading-relaxed text-text-secondary sm:block">\s*\{t\("intro"\)\}/);
  });

  it("the gradient button and the duplicate create link are gone; repeated form submits are outlined", () => {
    expect(PAGE).not.toMatch(/primaryHref="\/dashboard\/company\/projects\/new"/);
    expect(PAGE).not.toMatch(/data-testid="company-ops-projects-create"/);
    for (const f of ["components/app/project-team-assignments.tsx", "components/app/project-assignment-manager.tsx"]) {
      const primary = read(f).match(/const primary =\s*"([^"]+)"/)?.[1] ?? "";
      expect(primary, f).not.toMatch(/bg-gradient-cta/);
      expect(primary, f).toMatch(/border-brand-blue\/60/);
    }
  });

  it("the deck copy exists in every active locale", () => {
    for (const locale of activeLocales) {
      const m = JSON.parse(read(`messages/${locale}.json`)) as { projects: { deck: Record<string, string> } };
      for (const k of ["label", "toolsLabel", "new", "newHint", "assign", "assignHint", "teams", "teamsHint", "chat"]) {
        expect(m.projects.deck[k], `${locale} projects.deck.${k}`).toBeTruthy();
      }
    }
  });
});
