import { readFileSync } from "node:fs";
import { join } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { describe, expect, it } from "vitest";

import { PremiumLivingCv } from "@/components/app/cv/premium-living-cv";
import { CV_BLOCKS, parseCvBlock } from "@/components/app/cv/cv-block-tabs";

/**
 * WORKER LIVING CV, SLICE 1 (owner P0 2026-11-24; reference
 * docs/design/living-cv-reference-2026-11-24/, decision 0034).
 * The identity card, the header with its actions, the fact strip, and one
 * screen per block. Every value from real data, or not drawn.
 */

const WEB = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(WEB, rel), "utf8");
const page = read("app/[locale]/cv/page.tsx");
const hero = read("components/app/cv/premium-living-cv.tsx");

const render = (props: Partial<Parameters<typeof PremiumLivingCv>[0]> = {}) =>
  renderToStaticMarkup(
    createElement(PremiumLivingCv, {
      name: "Darbuotojas Nr. 1",
      eyebrow: "Plytelių klojėjas",
      summary: null,
      facts: [],
      ...props,
    }),
  );

describe("1 · the identity card and header", () => {
  it("a consented photo when there is one, else the monogram — never a placeholder face", () => {
    expect(render({ portraitUrl: "https://x/p.jpg", initials: "D1" })).toContain('data-testid="premium-cv-photo"');
    const noPhoto = render({ portraitUrl: null, initials: "D1" });
    expect(noPhoto).toContain('data-testid="premium-cv-monogram"');
    expect(noPhoto).not.toContain("<img");
  });

  it("name, profession, flag from the stated country, and the stated languages", () => {
    const html = render({ countryCode: "LT", countryName: "Lietuva", languages: ["LT", "EN"] });
    expect(html).toContain('data-testid="premium-cv-card-name"');
    expect(html).toContain('data-testid="premium-cv-professions"');
    expect(html).toContain('aria-label="Lietuva"');
    expect(html).toContain(">EN<");
    expect(render({ countryCode: null })).not.toContain("premium-cv-card-flag");
  });

  it("the page's own actions sit in the header; Download CV is the existing print action", () => {
    expect(render({ actions: createElement("button", null, "Download") })).toContain('data-testid="premium-cv-actions"');
    expect(page).toMatch(/actions=\{[\s\S]{0,900}<PrintButton label=\{t\("print"\)\}/);
  });

  it("no invented rating, attribute score, percentage or stars on the hero", () => {
    // Every visible word is one the page passed in: nothing of its own.
    const html = render({
      countryCode: "LT",
      countryName: "Lietuva",
      languages: ["LT"],
      facts: [{ value: "3", label: "projects" }],
    });
    const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    expect(text).not.toMatch(/%|★|☆|\b\d{2}\b(?!\s*projects)/);
    expect(hero).not.toMatch(/\b(rating|score|stars)\s*[:=]/i);
  });
});

describe("2 · the fact strip: years, projects, hours from the ONE experience reading", () => {
  it("each fact comes from cv.professionalExperience (decision 0025)", () => {
    expect(page).toMatch(/const experience = cv\.professionalExperience;/);
    expect(page).toMatch(/experience\.projects\.length > 0/);
    expect(page).toMatch(/experience\.hours !== null && experience\.hours\.total > 0/);
    expect(page).toMatch(/years >= 1/);
  });

  it("a fact that is not known is not drawn — UNKNOWN is never 0", () => {
    expect(render({ facts: [] })).not.toContain('data-testid="premium-cv-facts"');
    const html = render({ facts: [{ value: "24", label: "projects", testid: "premium-cv-fact-projects" }] });
    expect(html).toContain('data-testid="premium-cv-fact-projects"');
    expect(html).not.toContain(">0<");
  });
});

describe("3 · one screen per block (decision 0034)", () => {
  it("six blocks, each with its own address; anything else opens the Overview", () => {
    expect([...CV_BLOCKS]).toEqual(["overview", "experience", "projects", "photos", "documents", "reviews"]);
    expect(parseCvBlock("projects")).toBe("projects");
    expect(parseCvBlock(["reviews"])).toBe("reviews");
    expect(parseCvBlock("nonsense")).toBe("overview");
    expect(parseCvBlock(undefined)).toBe("overview");
  });

  it("the Overview carries only the hero and the tabs: no section is outside a block", () => {
    const start = page.indexOf("<CvBlockTabs");
    const end = page.indexOf('{/* Footer — generation date only');
    const body = page.slice(start, end);
    // Every top-level section after the tabs lives inside a block panel.
    const outside = body
      .split(/<CvTabPanel block="[a-z]+" active=\{activeBlock\}>[\s\S]*?<\/CvTabPanel>/)
      .join("")
      .match(/<section\b|data-testid="cv-[a-z-]+"/g);
    expect(outside ?? []).toEqual([]);
  });

  it("no helper text on the hero (decision 0032): it renders only the strings the page passes", () => {
    const html = render({ facts: [{ value: "3", label: "projects" }] });
    const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    // name ×2 (card + heading), profession ×2, the fact — and nothing else.
    expect(text).toBe("Darbuotojas Nr. 1 Plytelių klojėjas Darbuotojas Nr. 1 Plytelių klojėjas 3 projects");
  });
});

describe("4 · links into a section still land on it", () => {
  it("the product's own section links name the block", () => {
    expect(read("components/app/worker-player-card.tsx")).toContain('"/cv?tab=experience#cv-work-history"');
    expect(read("lib/player-card/work-context.ts")).toContain('"/cv?tab=experience#cv-work-history"');
  });

  it("an older anchor-only link opens the block that holds its section", () => {
    const handler = read("components/app/cv/cv-hash-to-block.tsx");
    expect(handler).toMatch(/closest<HTMLElement>\("\[data-cv-block\]"\)/);
    expect(handler).toMatch(/searchParams\.set\("tab", block\)/);
    expect(page).toMatch(/<CvHashToBlock active=\{activeBlock\} \/>/);
  });
});

describe("Codex on #3782: honest totals and in-page anchors", () => {
  it("the hours total keeps its evidence qualifier, with the confirmed part beside it", () => {
    expect(page).toContain('label: tPremium("facts.experienceTotal"), testid: "premium-cv-fact-hours"');
    expect(page).toContain('label: tPremium("facts.confirmed"), testid: "premium-cv-fact-confirmed-hours"');
    expect(page).not.toContain('tPremium("facts.hours")');
  });
  it("an anchor clicked after load opens the block that holds it", () => {
    const hash = read("components/app/cv/cv-hash-to-block.tsx");
    expect(hash).toContain('window.addEventListener("hashchange", open)');
    expect(hash).toContain('window.removeEventListener("hashchange", open)');
  });
});

describe("the journal is one tap from the CV's Overview (journal-reach R-1)", () => {
  it("the own CV's header carries Record work, linking the journal", () => {
    expect(page).toMatch(/href="\/dashboard\/journal"[\s\S]{0,400}data-testid="cv-record-work"/);
    expect(page).toContain('tMyZone("recordWork.title")');
  });
});
