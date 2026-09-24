import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * THREE 375px DEFECTS ON THE PUBLIC LANDING — pinned so they cannot return
 * (owner directive 2026-09-24, "landing verified at 375px"; additive polish
 * under the live and proven 2026-09-23 landing directives, no redesign).
 *
 * Measured anonymously on production at 375×812 in all six active locales
 * before the change (the probe and screenshots travel with the PR):
 *
 *   1. the example chips under the sentence field were CUT with an ellipsis
 *      ("Reikia darbuo…", "Turime laisvų …", "Užrašyti atlikt…");
 *   2. the fixed LIVE/FOCUS control (144×54px) covered the counter line at
 *      the fold, a chip of the lower sample job card, and the footer;
 *   3. two sample job cards were pixel-identical for two different vacancies
 *      — pinned by fixtures in lib/market/live-market-landing.test.ts, and
 *      only its wiring is checked here.
 *
 * Every assertion below carries a negative control: the pre-change source,
 * as it was written, must fail it.
 */

const WEB = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(WEB, rel), "utf8");
/** Source with comments stripped — these pins are about CODE, not prose. */
const code = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const ACTIVE = ["lt", "en", "ru", "nl", "de", "pl"] as const;
const catalog = (loc: string) =>
  JSON.parse(read(`messages/${loc}.json`)) as {
    landing: { entry: { exampleLabels: Record<string, string> } };
  };

/** The className of the element carrying `data-testid="entry-example"`. */
function chipClassOf(source: string): string | undefined {
  const at = source.indexOf('data-testid="entry-example"');
  if (at < 0) return undefined;
  return /className="([^"]+)"/.exec(code(source.slice(at)))?.[1];
}

/** The `.modeSwitcher` declaration block inside the phone media query. */
function phoneRuleOf(css: string): string | null {
  const q = css.indexOf("@media (max-width: 640px)");
  if (q < 0) return null;
  const block = css.slice(q);
  const sel = block.indexOf(".modeSwitcher");
  if (sel < 0) return null;
  return block.slice(sel, block.indexOf("}", sel) + 1);
}

describe("1. the example chips wrap — the label is never cut", () => {
  const entry = read("components/marketing/public-entry.tsx");
  const chip = chipClassOf(entry);

  it("carries no truncation class", () => {
    expect(chip).toBeTypeOf("string");
    for (const cut of ["truncate", "text-ellipsis", "whitespace-nowrap", "overflow-hidden", "line-clamp-"]) {
      expect(chip, `chip class cuts the label: ${cut}`).not.toMatch(
        new RegExp(`(^|\\s)${cut.replace(/[-[\]]/g, "\\$&")}`),
      );
    }
  });

  it("keeps the two-up density below `sm` and lets the label wrap inside it", () => {
    // The 2026-09-09 owner correction (compact wrapping, not fewer chips) is
    // kept: half the row per chip below sm, natural width from sm up.
    expect(chip).toContain("max-w-[calc(50%-0.375rem)]");
    expect(chip).toContain("sm:max-w-none");
    // Vertical room for a second line, and a last resort for one word wider
    // than a 320px chip — the label is never allowed to escape the pill.
    expect(chip).toMatch(/(^|\s)py-\d/);
    expect(chip).toContain("[overflow-wrap:anywhere]");
  });

  it("NEGATIVE CONTROL — the pre-2026-09-24 chip class fails both checks", () => {
    const old =
      '<button data-testid="entry-example" className="min-h-11 max-w-[calc(50%-0.375rem)] truncate rounded-full border border-ink-500 px-3 text-support font-medium text-text-secondary sm:max-w-none">';
    const oldChip = chipClassOf(old);
    expect(oldChip).toMatch(/(^|\s)truncate/);
    expect(oldChip).not.toContain("[overflow-wrap:anywhere]");
  });

  /**
   * THE CATALOGUE HALF OF THE FIX. Wrapping only helps if every label fits
   * TWO lines of the 375px chip. A character count is not a proxy for that —
   * "Zapisz wykonaną pracę" (21 characters) needed three lines while
   * "Geleistete Arbeit erfassen" (26) needed two — so this test breaks lines
   * the way the browser does, with the chip's own glyph widths.
   *
   * MEASURED on the built app at 375×812 (2026-09-24): the capped chip is
   * 132.5px wide with a 106.5px text box, set in `500 14px Inter`
   * (`text-support` + `font-medium`; the type ladder is owner-ratified, so
   * this size does not drift casually). `GLYPH` holds the canvas advance of
   * every glyph the six catalogues use in these labels; whole-string widths
   * measured at the same time differed from the per-glyph sum by at most
   * 1.6px (kerning), which the 2px margin on the box absorbs. A glyph this
   * table does not know fails loudly instead of being guessed.
   */
  const TEXT_BOX_PX = 106.5 - 2;
  const GLYPH: Readonly<Record<string, number>> = {
    " ": 3.73, "A": 9.93, "B": 9.19, "G": 10.47, "I": 3.81, "K": 9.63, "L": 7.92, "M": 12.78,
    "O": 10.73, "P": 8.98, "R": 9.07, "S": 9.04, "T": 9.14, "U": 10.36, "W": 14.04, "Z": 8.97,
    "a": 7.95, "b": 8.65, "c": 8.08, "d": 8.65, "e": 8.22, "f": 5.31, "g": 8.67, "h": 8.42,
    "i": 3.53, "j": 3.53, "k": 7.83, "l": 3.53, "m": 12.43, "n": 8.42, "o": 8.46, "p": 8.65,
    "r": 5.41, "s": 7.54, "t": 4.76, "u": 8.42, "v": 8.05, "w": 11.61, "y": 8.05, "z": 7.83,
    "ą": 7.95, "ć": 8.08, "ę": 8.22, "į": 3.53, "ł": 3.53, "ó": 8.46, "š": 7.54, "ū": 8.42,
    "ų": 8.42, "ä": 7.95, "ž": 7.83, "ż": 7.83,
    "Г": 8.12, "З": 9.05, "И": 10.77, "К": 8.73, "Н": 10.83, "П": 10.77, "У": 9.52,
    "а": 8.34, "б": 8.59, "в": 7.96, "г": 5.47, "д": 8.75, "е": 8.34, "ж": 10.03, "и": 8.37,
    "й": 8.37, "к": 6.56, "л": 8.75, "м": 10.31, "н": 8.28, "о": 8.34, "п": 8.12, "р": 8.34,
    "с": 7.49, "т": 6.87, "у": 7.49, "ф": 12.33, "щ": 12.33, "ы": 10.77, "ь": 7.81, "ю": 11.24,
    "я": 8.12,
  };
  const widthOf = (s: string) =>
    [...s].reduce((sum, ch) => {
      const w = GLYPH[ch];
      if (w === undefined) throw new Error(`unmeasured glyph "${ch}" in "${s}" — measure it, do not guess`);
      return sum + w;
    }, 0);
  /** Greedy line breaking at spaces, exactly as the browser fills a line. */
  const linesOf = (label: string): string[] => {
    const lines: string[] = [];
    let current = "";
    for (const word of label.split(" ")) {
      const next = current ? `${current} ${word}` : word;
      if (!current || widthOf(next) <= TEXT_BOX_PX) current = next;
      else {
        lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
    return lines;
  };

  for (const loc of ACTIVE) {
    it(`[${loc}] every chip label fits two lines of the 375px chip, and no word needs breaking`, () => {
      const labels = catalog(loc).landing.entry.exampleLabels;
      expect(Object.keys(labels).length).toBeGreaterThanOrEqual(10);
      for (const [key, label] of Object.entries(labels)) {
        const lines = linesOf(label);
        expect(lines.length, `${loc}.${key} "${label}" breaks as ${JSON.stringify(lines)}`).toBeLessThanOrEqual(2);
        for (const word of label.split(" ")) {
          expect(widthOf(word), `${loc}.${key} word "${word}" is wider than a line`).toBeLessThanOrEqual(TEXT_BOX_PX);
        }
      }
    });
  }

  it("NEGATIVE CONTROL — the three labels shortened on 2026-09-24 needed three lines as they were", () => {
    expect(linesOf("Zapisz wykonaną pracę")).toEqual(["Zapisz", "wykonaną", "pracę"]);
    expect(linesOf("Wo ein Praktikum machen")).toHaveLength(3);
    expect(linesOf("Кто подтвердит опыт")).toHaveLength(3);
    // …and their replacements fit two.
    expect(linesOf("Zapisz swoją pracę")).toHaveLength(2);
    expect(linesOf("Praktikum finden")).toHaveLength(2);
    expect(linesOf("Кто подтвердит")).toHaveLength(2);
    // A word wider than the line is caught, not silently hyphenated.
    expect(widthOf("Softwareentwickler")).toBeGreaterThan(TEXT_BOX_PX);
    // The table refuses to guess an unmeasured glyph.
    expect(() => widthOf("Ω")).toThrow(/unmeasured glyph/);
  });
});

describe("2. on a phone the LIVE/FOCUS control is in the flow, never over the page", () => {
  const css = read("app/[locale]/focus-landing/landing-mode-switcher.module.css");
  const focus = code(read("app/[locale]/focus-landing/focus-landing.tsx"));

  it("below `sm` the control leaves the viewport corner and takes its place in the page", () => {
    const rule = phoneRuleOf(css);
    expect(rule, "no .modeSwitcher rule under @media (max-width: 640px)").toBeTypeOf("string");
    expect(rule).toMatch(/position:\s*static/);
    expect(rule).not.toMatch(/position:\s*fixed/);
    // Right-aligned in the flow, with room above it.
    expect(rule).toMatch(/margin:[^;]*\bauto\b/);
  });

  it("from `sm` up it is docked exactly as before, and clear of the device's safe area", () => {
    const base = css.slice(css.indexOf(".modeSwitcher {"));
    const docked = base.slice(0, base.indexOf("}"));
    expect(docked).toMatch(/position:\s*fixed/);
    expect(docked).toMatch(/z-index:\s*60/);
    expect(docked).toMatch(/bottom:\s*calc\([^;]*env\(safe-area-inset-bottom/);
  });

  it("NEGATIVE CONTROL — the pre-2026-09-24 phone rule (a 600px corner offset) fails", () => {
    const old = ".modeSwitcher { position: fixed; bottom: 10px; }\n@media (max-width: 600px) { .modeSwitcher { right: 10px; bottom: 10px; } }";
    expect(phoneRuleOf(old)).toBeNull();
    // …and a 640px rule that merely moves the offsets still fails.
    const offsetsOnly = "@media (max-width: 640px) { .modeSwitcher { right: 10px; bottom: 10px; } }";
    expect(phoneRuleOf(offsetsOnly)).not.toMatch(/position:\s*static/);
  });

  it("the page mounts the control at the END of the landing body — after the closing band, inside <main>, before the footer", () => {
    const mount = focus.indexOf("<LandingModeSwitcher />");
    expect(mount).toBeGreaterThan(0);
    expect(mount).toBeGreaterThan(focus.indexOf("<LandingClosingBand"));
    expect(mount).toBeLessThan(focus.indexOf("</main>"));
    expect(mount).toBeLessThan(focus.indexOf("<SiteFooter />"));
    // Once: the control is not duplicated for the phone.
    expect(focus.match(/<LandingModeSwitcher \/>/g)).toHaveLength(1);
  });

  it("NEGATIVE CONTROL — the pre-2026-09-24 mount (after the footer) fails the placement check", () => {
    const old = "<main>\n<LandingClosingBand locale={locale} />\n</main>\n<SiteFooter />\n<LandingModeSwitcher />";
    expect(old.indexOf("<LandingModeSwitcher />")).toBeGreaterThan(old.indexOf("</main>"));
  });

  it("its behaviour did not move: one explicit writer, a reload, the same name", () => {
    const switcher = read("app/[locale]/focus-landing/landing-mode-switcher.tsx");
    expect(switcher).toContain('if (next === "focus") return;');
    expect(switcher).toContain("persistLandingMode(next)");
    expect(switcher).toContain("window.location.reload()");
    expect(switcher).toContain('aria-label="LIVE / FOCUS"');
    expect(switcher).toContain('data-testid="landing-mode-switcher"');
  });
});

describe("3. the sample selector skips a look-alike (fixtures in lib/market/live-market-landing.test.ts)", () => {
  it("the ONE landing reader picks by the anonymous card's fingerprint, through the unchanged card", () => {
    const reader = code(read("lib/market/live-market-landing.ts"));
    expect(reader).toMatch(/export function landingVacancyFingerprint\(/);
    expect(reader).toMatch(/landingVacancyFingerprint\(candidate\)/);
    // The band and the card are untouched by this: still the board's card,
    // still no vacancy logic in the band.
    const band = code(read("components/marketing/landing-open-jobs-band.tsx"));
    expect(band).toMatch(/<PublicVacancyCard\b/);
    expect(band).not.toMatch(/landingVacancyFingerprint|pickLandingVacancySample/);
  });
});
