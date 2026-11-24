import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * THE FIRST LAYER ANSWERS A PERSON'S QUESTIONS — NOT A PIPELINE'S.
 *
 * ── WHAT THE OWNER WALKED, 2026-09-27 (§7)
 *
 * "Opportunities negali atrodyti kaip sistemos debug puslapis." The second line
 * of `/dashboard/opportunities`, directly under the title, read:
 *
 *   "platformos užklausos: rodoma 0 iš 0 · vieši skelbimai: rodoma 3 iš 111187
 *    · 12 atidėta pagal jūsų filtrus"
 *
 * Three sentences joined by a separator, and they are NOT the same kind of
 * thing. That is the whole finding, and it is why this was fixable without
 * removing anything.
 *
 * TELEMETRY (moved to the "Kaip veikia atitikimas" disclosure): the shown/
 * retrieved pairs. They name internal sources and report pipeline performance.
 * They answer none of the five questions the surface owes a person — what do you
 * know about me, what did you find, where is it, why am I seeing it, what can I
 * do now.
 *
 * HONEST DEGRADATION (stays in the first layer): why a person is seeing LESS
 * than they expect. Moving these would have been a lie by omission, and each has
 * already been a real defect class in this repo:
 *   · a capability that is not switched on;
 *   · a read that FAILED — SEP-7, FAILED ≠ ZERO. Rendering a failed read as an
 *     empty result is the "swallowed read error" sweep;
 *   · rows the PERSON'S OWN filters held back — "filtered out is not empty"
 *     (#1710). Without that line the board looks bare for no visible reason.
 *
 * ── WHY A GUARD, AND WHY THIS SHAPE
 *
 * Nothing pinned the strip before, which is how two incompatible kinds of
 * sentence ended up in one `join(" · ")`. The risk now runs BOTH ways: somebody
 * tidying the header could sweep the degradation signals into the drawer with
 * the telemetry, and somebody restoring "transparency" could pull the counts
 * back to the top. Both are pinned below.
 */

const WEB = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(WEB, rel), "utf8");
const PAGE = "app/[locale]/dashboard/opportunities/page.tsx";

describe("opportunities: the first layer is not a debug readout", () => {
  const page = read(PAGE);

  /** The header block, which is what a person sees before scrolling. */
  const header = page.slice(page.indexOf("<header"), page.indexOf("</header>"));

  it("the retrieval pairs are NOT in the header", () => {
    expect(header).not.toMatch(/countsPlatform"/);
    expect(header).not.toMatch(/countsExternal"/);
    // They must not sneak back in via the old combined variable either.
    expect(page).not.toMatch(/\bcountParts\b/);
  });

  it("the retrieval pairs ARE still rendered — inside the provenance disclosure", () => {
    // Capability preserved: the numbers remain auditable, one tap away.
    expect(page).toMatch(/retrievalParts/);
    expect(page).toContain('data-testid="opportunities-retrieval-counts"');
    const how = page.indexOf('data-testid="opportunities-how-matching"');
    const counts = page.indexOf('data-testid="opportunities-retrieval-counts"');
    expect(how, "the how-matching disclosure exists").toBeGreaterThan(-1);
    expect(counts, "retrieval counts exist").toBeGreaterThan(-1);
    expect(counts, "counts sit inside the disclosure").toBeGreaterThan(how);
    // And the strings themselves are still used somewhere on the page.
    expect(page).toMatch(/world\.countsPlatform"/);
    expect(page).toMatch(/world\.countsExternal"/);
  });

  it("degradation is communicated as a CONSEQUENCE, in human words", () => {
    /*
     * The first layer must still say "you may be seeing less", because hiding
     * that turns a failed read or a disabled capability into a silently empty
     * board (SEP-7: FAILED ≠ ZERO; and "filtered out is not empty", #1710).
     *
     * But it must say it as a CONSEQUENCE. The old strings named
     * implementations at a person looking for work — "platformos užklausos: dar
     * neįjungta" — which tells them nothing about what it means for them. So the
     * header carries ONE human sentence ("this list may be incomplete") plus the
     * filter line, which was already consequence-shaped; the per-source
     * precision moved to the provenance disclosure, where "which source, and
     * what exactly happened" is a reasonable question to be asking.
     */
    const statusList = page.slice(
      page.indexOf("const statusParts: string[]"),
      page.indexOf("const retrievalParts: string[]"),
    );
    expect(statusList.length, "statusParts precedes retrievalParts").toBeGreaterThan(0);
    // The consequence sentence, and the person's own filters.
    expect(statusList).toContain("world.sourcesIncomplete");
    expect(statusList).toContain("countsFiltered");
    // Degradation must be DERIVED from both sources, so neither can fail
    // silently just because the other is healthy.
    expect(page).toMatch(/!result\.capabilities\.boardAvailable \|\|/);
    expect(page).toMatch(/!result\.externalVacancies\.available/);
    // Implementation names must not be in the first layer any more…
    for (const key of ["countsPlatformUnavailable", "countsExternalUnreadable"]) {
      expect(statusList, `${key} is implementation naming`).not.toContain(key);
    }
    // …but must still be RENDERED somewhere, or the precision is simply gone.
    const retrievalList = page.slice(page.indexOf("const retrievalParts: string[]"));
    for (const key of ["countsPlatformUnavailable", "countsExternalUnreadable"]) {
      expect(retrievalList, `${key} must survive as provenance`).toContain(key);
    }
    expect(header, "the header renders the status signals").toContain("statusParts");
    expect(header, "the header does not render the telemetry").not.toContain(
      "retrievalParts",
    );
  });

  it("the retrieval pool size is never presented as a count of the market", () => {
    /*
     * THE CONTRADICTION THAT MADE THIS URGENT (owner, 2026-09-27). Public /lt
     * says 53 392 active opportunities and 8 884 employers. Both are correct and
     * come from ONE canonical population —
     * `is_active AND (expires_at IS NULL OR expires_at > now())`
     * (`MARKET_FACTS_PREDICATE`) over `public_vacancies`, provider
     * `arbetsformedlingen`, country SE. Verified on production 2026-09-27:
     * 53 392 rows, and `count(distinct employer_name)` over exactly that
     * population = 8 884.
     *
     * `retrieved` in this strip is NEITHER that number NOR the 111 306 rows the
     * table holds in total (which includes ~57 900 EXPIRED ads and is an
     * internal figure that must never be shown as available work). It is the
     * BOUNDED CANDIDATE POOL — `PROFILE_POOL_LIMIT` = 30 / `BOARD_LIMIT` = 20.
     * A person reading "rodoma 3 iš 20" concludes the market holds 20 jobs.
     *
     * So this is pinned as a semantics rule, not a layout preference: a pool
     * size may not sit in the first layer where it will be read as market size.
     */
    expect(page).toMatch(/retrievalParts/);
    expect(header).not.toMatch(/retrieved/);
  });

  it("a healthy board shows no strip at all, rather than a line of zeroes", () => {
    // The strip renders only when it has something to say — the reason the old
    // version always showed "rodoma 0 iš 0" to a brand-new person.
    expect(page).toMatch(/statusParts\.length > 0 \?/);
  });

  it("the degradation signals and the telemetry stay in SEPARATE lists", () => {
    // The defect was one `join(" · ")` over both kinds. Two named lists is what
    // keeps the distinction reviewable instead of implicit.
    expect(page).toMatch(/const statusParts: string\[\]/);
    expect(page).toMatch(/const retrievalParts: string\[\]/);
  });
});
