import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * DOM proof for the tier-2 "Panašūs įgūdžiai / Similar skills" section
 * (journal-real-world-recognition-audit-p0, owner UI refinement). The journal
 * composer is behind Vercel SSO + Supabase auth and cannot be driven headless,
 * so we render the REAL `SimilarSkillsSection` to static markup with the REAL LT
 * copy — no fake route, no auth bypass, no production data.
 *
 * Proves: the candidate tier is its OWN labelled section ("Panašūs įgūdžiai" +
 * "Pasirinkite, jei tinka"), candidates are user-choice (a "Pasirinkti" button
 * that calls the self-declared-claim path), nothing reads as confirmed/verified,
 * and an empty candidate list renders nothing.
 */
const CWD = process.cwd();
const journalLT = JSON.parse(
  readFileSync(join(CWD, "messages/lt/journal.json"), "utf8"),
) as Record<string, string>;

vi.mock("next-intl", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require("node:fs");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = require("node:path");
  const j = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "messages/lt/journal.json"), "utf8"),
  );
  return {
    useTranslations: () => (key: string, vars?: Record<string, unknown>) => {
      let v: unknown = j[key];
      if (typeof v !== "string") return key;
      if (vars)
        for (const [k, val] of Object.entries(vars))
          v = (v as string).replace(new RegExp(`\\{${k}\\}`, "g"), String(val));
      return v as string;
    },
  };
});

const { SimilarSkillsSection } = await import(
  "@/components/app/similar-skills-section"
);

const CERT = /confirm|verif|patvirtin|tvirtin|approved|certified|trusted|proof|подтверж|верифиц/i;

function render(candidates: { slug: string; name: string; matchedText: string }[]) {
  return renderToStaticMarkup(
    createElement(SimilarSkillsSection, {
      candidates,
      statusBySlug: {},
      onAdd: () => {},
    }),
  );
}

describe("SimilarSkillsSection — distinct candidate tier (DOM proof)", () => {
  const html = render([
    { slug: "graphic-design", name: "Grafinis dizainas", matchedText: "logotip" },
    { slug: "qa-testing", name: "Programinės įrangos testavimas", matchedText: "testav" },
  ]);

  it("is its own labelled section with the exact owner copy", () => {
    expect(html).toContain('data-testid="similar-skills-section"');
    expect(html).toContain(journalLT.similarSkillsTitle); // "Panašūs įgūdžiai"
    expect(html).toContain(journalLT.similarSkillsChoose); // "Pasirinkite, jei tinka"
  });

  it("renders each candidate as a user CHOICE (not a fact)", () => {
    expect(html).toContain("Grafinis dizainas");
    expect(html).toContain('data-testid="similar-skill-graphic-design"');
    expect(html).toContain('data-testid="similar-skill-choose-graphic-design"');
    expect(html).toContain(journalLT.similarSkillChoose); // "Pasirinkti"
    // The WHY line is present (every suggestion explains itself).
    expect(html).toContain("logotip");
  });

  it("uses no certification / verification / trust wording", () => {
    expect(CERT.test(html), `cert wording leaked: ${html}`).toBe(false);
  });

  it("renders nothing when there are no candidates (no empty box)", () => {
    expect(render([])).toBe("");
  });
});
