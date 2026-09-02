import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createTranslator } from "next-intl";

import { activeLocales } from "@/lib/i18n/config";

/**
 * "ADD A WORK ENTRY" IS THE WRONG THING TO SAY TO SOMEBODY WHO ALREADY DID.
 *
 * `hasSkills` still gates the fit, and rightly: with no skill evidence there
 * is genuinely nothing to compare against a need. But the board answered that
 * silence with one message — "add work entries to your Work Journal" — and
 * production has two workers whose journals are already full and who have
 * simply never confirmed what those entries evidence. They were being asked
 * to redo the thing they had done, card after card.
 *
 * The two silences need opposite next steps, so the board now tells them
 * apart. Nothing about the fit changed: no skill is invented, no match is
 * faked, and `hasRecordedWork` gates nothing (§34 — recognition drafts, the
 * person confirms).
 */

const WEB = join(__dirname, "..", "..");
const read = (...p: string[]) => readFileSync(join(WEB, ...p), "utf8");

describe("the board tells the two silences apart", () => {
  it("readiness carries whether work was actually recorded", () => {
    const loader = read("lib", "opportunities", "load-worker-opportunities.ts");
    expect(loader).toMatch(/hasRecordedWork: journalEntryCount > 0/);
  });

  it("the entry count costs no extra round trip", () => {
    const loader = read("lib", "opportunities", "load-worker-opportunities.ts");
    // It must ride with the documents read, not stack behind it.
    expect(loader).toMatch(
      /const \[\{ data: docs \}, entryCountRes\] =\s*await Promise\.all\(\[/,
    );
    // A head count — never a full row fetch just to learn "is there any".
    expect(loader).toMatch(/count: "exact", head: true/);
  });

  it("hasRecordedWork gates nothing", () => {
    // It may only choose WORDS. If it ever reached the fit computation it
    // would have become the very precondition this work removed.
    const fit = read("lib", "opportunities", "opportunity-fit.ts");
    const code = fit
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    // Declared on the interface (that is how the page reads it) but never
    // CONSUMED as a condition anywhere in this module's logic.
    expect(code).toMatch(/readonly hasRecordedWork\?: boolean;/);
    expect(code).not.toMatch(/profile\.hasRecordedWork/);
    // Exactly one occurrence — the declaration. A second would be a read.
    expect(code.match(/hasRecordedWork/g) ?? []).toHaveLength(1);
    // The real gate is unchanged.
    expect(code).toMatch(/!profile\.hasWorkType \|\| !profile\.hasSkills/);
  });

  it("the page branches the guidance on it", () => {
    const page = read(
      "app", "[locale]", "dashboard", "opportunities", "page.tsx",
    );
    expect(page).toMatch(/readiness\.hasRecordedWork[\s\S]{0,80}noSkills\.confirmTitle/);
    expect(page).toMatch(/noSkills\.confirmBody/);
    expect(page).toMatch(/noSkills\.confirmCta/);
    // Both arms must survive — the person who has NOT started still needs the
    // original invitation.
    expect(page).toMatch(/t\("noSkills\.title"\)/);
    expect(page).toMatch(/t\("noSkills\.body"\)/);
  });
});

describe("both guidance states resolve in every routable locale", () => {
  it.each([...activeLocales])("%s", (loc) => {
    const messages = JSON.parse(read("messages", `${loc}.json`));
    const t = createTranslator({ locale: loc, messages });
    for (const key of [
      "opportunities.noSkills.title",
      "opportunities.noSkills.body",
      "opportunities.noSkills.cta",
      "opportunities.noSkills.confirmTitle",
      "opportunities.noSkills.confirmBody",
      "opportunities.noSkills.confirmCta",
    ]) {
      const out = t(key as never);
      expect(typeof out, `${loc} ${key}`).toBe("string");
      expect(out.trim().length, `${loc} ${key} empty`).toBeGreaterThan(0);
      // A missing key renders as the echoed path.
      expect(out, `${loc} ${key} did not resolve`).not.toContain(key);
    }
  });

  it("the confirm copy does not simply repeat the start-here copy", () => {
    // The whole point is that they say different things; duplicating the
    // string would pass a presence check while restoring the defect.
    for (const loc of activeLocales) {
      const ns = JSON.parse(read("messages", `${loc}.json`)).opportunities
        .noSkills;
      expect(ns.confirmBody, `${loc}`).not.toBe(ns.body);
      expect(ns.confirmTitle, `${loc}`).not.toBe(ns.title);
      expect(ns.confirmCta, `${loc}`).not.toBe(ns.cta);
    }
  });
});
