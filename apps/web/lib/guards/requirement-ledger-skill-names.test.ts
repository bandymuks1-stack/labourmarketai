import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { activeLocales } from "@/lib/i18n/config";

/**
 * A SKILL IS NAMED FROM THE CATALOGUE (owner P0 2026-11-23). The requirement
 * ledger ("what you already have and what is still missing" on the profile,
 * the opportunities and the instructions pages) looked a skill slug up in the
 * `skills` namespace — the skills section's UI copy, which holds no slug —
 * so every skill fell back to its slug with the dashes removed: a German
 * profile read "arc welding", "welding blueprint". The catalogue is
 * `skillNames` (`messages/<locale>/skill-names.json`).
 */
const web = join(__dirname, "..", "..");
const src = readFileSync(join(web, "lib/player-card/requirement-ledger-labels.ts"), "utf8");

describe("the requirement ledger names skills from the skill catalogue", () => {
  it("reads the skillNames namespace, never the skills section's copy", () => {
    expect(src).toContain('getTranslations("skillNames")');
    expect(src).not.toMatch(/getTranslations\("skills"\)/);
    expect(src).toMatch(/skill: \(slug\) => \(tSkills\.has\(slug\) \? tSkills\(slug\) :/);
  });

  it("the catalogue carries the welding skills in every active locale, and they are not the bare slug", () => {
    const slugs = ["arc-welding", "gas-cutting", "mig-mag-welding", "tig-welding", "structural-steel", "welding-blueprint"];
    for (const locale of activeLocales) {
      const file = JSON.parse(readFileSync(join(web, "messages", locale, "skill-names.json"), "utf8")) as Record<string, unknown>;
      const names = (file.skillNames ?? file) as Record<string, string>;
      for (const slug of slugs) {
        expect(typeof names[slug], `${locale} ${slug}`).toBe("string");
        if (locale !== "en") expect(names[slug].toLowerCase(), `${locale} ${slug}`).not.toBe(slug.replace(/-/g, " "));
      }
    }
  });

  it("the skills section's own namespace holds no skill slug (why the old lookup always missed)", () => {
    const root = JSON.parse(readFileSync(join(web, "messages", "de.json"), "utf8")) as { skills: Record<string, unknown> };
    expect(root.skills["arc-welding"]).toBeUndefined();
  });
});
