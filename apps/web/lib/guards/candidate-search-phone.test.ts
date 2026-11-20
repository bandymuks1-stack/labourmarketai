import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * GUARD — the employer's candidate search (company/scouting) works on a phone
 * (375–390 px), as #3496 did for the worker's CV and journal. Presentation only:
 * no copy, test id, condition or data read is pinned or changed here.
 *
 *  - The need picker and the filter chips are the toggle chip's link shape
 *    (ui/Chip `chipLinkClassName`: 44 px, check mark + aria-current on the
 *    chosen one), never a hand-typed 30 px pill.
 *  - On a phone the filter chips are ONE row that scrolls sideways inside
 *    itself (so a long facet list never pushes the candidates below the fold
 *    and the page never scrolls sideways); from sm up they wrap.
 *  - "Clear filters" sits beside the filters' title, outside that row.
 *  - Each matched candidate is a ui/Card.
 * Walk: tests/e2e/phone-journeys-isolated.spec.ts (E-3, M-6).
 */
const PAGE = join(__dirname, "..", "..", "app", "[locale]", "dashboard", "company", "scouting", "page.tsx");
const src = readFileSync(PAGE, "utf8");
const section = (from: string, to: string) => {
  const a = src.indexOf(from);
  const b = src.indexOf(to, a);
  expect(a, from).toBeGreaterThan(-1);
  expect(b, to).toBeGreaterThan(a);
  return src.slice(a, b);
};

describe("candidate search on a phone", () => {
  it("the need picker uses the shared chip link and marks the chosen need", () => {
    const nav = section('aria-label={t("pickDemand")}', "</nav>");
    expect(nav).toMatch(/chipLinkClassName\(selected === d\.id\)/);
    expect(nav).toMatch(/aria-current=\{selected === d\.id \? "page" : undefined\}/);
    expect(nav).not.toMatch(/px-3 py-1\.5 text-xs/);
  });

  it("every filter chip is the shared chip link; the row scrolls inside itself on a phone", () => {
    const filters = section('data-testid="scouting-filters"', "</section>");
    expect(filters.match(/chipLinkClassName\(/g) ?? []).toHaveLength(3);
    expect(filters.match(/aria-current=/g) ?? []).toHaveLength(3);
    expect(filters).not.toMatch(/px-3 py-1\.5 text-xs/);
    expect(filters).toMatch(/flex gap-2 overflow-x-auto[^"]*sm:flex-wrap sm:overflow-visible/);
    const clear = filters.indexOf('data-testid="scout-filter-clear"');
    const row = filters.indexOf("overflow-x-auto");
    expect(clear, "clear filters stays outside the sideways row").toBeGreaterThan(-1);
    expect(clear).toBeLessThan(row);
  });

  it("each matched candidate is a ui/Card and the ways onward reach 44 px", () => {
    const results = section('data-testid="scouting-results"', "</ul>");
    expect(results).toMatch(/<Card compact className="flex flex-col gap-3">/);
    expect(results).not.toMatch(/card-border flex flex-col gap-3 p-4/);
    for (const id of ["scout-pipeline-next-", "scouting-empty-edit-need", "scout-filter-clear"]) {
      const at = src.indexOf(id);
      const start = src.lastIndexOf("<Link", at);
      const tag = src.slice(start, src.indexOf(">\n", at));
      expect(tag, id).toMatch(/min-h-11/);
    }
  });
});

/**
 * Round 2 (phone pass 2026-11-19): the facts on the card and the section of
 * people an agency offered move onto the shared shapes, like for like.
 *  - Verdict, evidence confidence, skill count, readiness label and country,
 *    and the hand-raiser's stated facts are the shared status pill
 *    (components/app/status-chip), never a hand-typed `rounded-md border ...
 *    px-2 py-0.5` span. Test ids stay on the pill (its `testid` prop).
 *  - The agency-offered section and each offered person are ui/Card.
 * Criterion chips (met / blocking / reasons / gaps / negotiables) keep their
 * own spans: they carry `data-criterion` and a source `title` the shared pill
 * does not forward, so a swap would not be like for like.
 */
describe("candidate search on a phone, round 2", () => {
  it("the card's verdict and facts are the shared status pill", () => {
    const verdict = section("data-testid={`scout-verdict-${c.workerId}`}", "</div>");
    expect(verdict.match(/<StatusChip\b/g) ?? []).toHaveLength(4);
    expect(verdict).not.toMatch(/rounded-md border/);
    for (const re of [
      /<StatusChip\s+variant="neutral"\s+testid=\{`scout-skill-count-/,
      /<StatusChip variant="neutral" testid=\{`scout-verdict-unchecked-/,
      /<StatusChip variant="neutral" testid=\{`scout-evidence-confidence-/,
      /<StatusChip variant="neutral" testid=\{`scout-experience-\$\{h\.workerId\}`\}>/,
      /<StatusChip variant="neutral" testid="candidate-available-later">/,
    ]) {
      expect(src).toMatch(re);
    }
    const readiness = section("data-testid={`scout-readiness-${c.workerId}`}", "</div>");
    expect(readiness.match(/<StatusChip\b/g) ?? []).toHaveLength(2);
    expect(src).toMatch(/READINESS_TONE: Record<CompanyCandidateLabel, StatusChipVariant>/);
  });

  it("the people an agency offered sit on ui/Card", () => {
    const offers = section('data-testid="scouting-agency-offers"', "</section>");
    expect(offers.match(/<Card compact className="flex flex-col gap-3">/g) ?? []).toHaveLength(2);
    expect(offers).not.toMatch(/card-border/);
  });
});
