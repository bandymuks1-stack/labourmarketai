import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  bestEvidencedProfession,
  computeAdjacentDirections,
} from "@/lib/opportunities/adjacent-directions";
import { skillsForProfession } from "@/lib/taxonomy/profession-skills";
import {
  computeOpportunityFit,
  type OpportunityNeed,
} from "@/lib/opportunities/opportunity-fit";

/**
 * A PERSON DOES NOT HAVE TO NAME A PROFESSION TO BE UNDERSTOOD.
 *
 * Matching already honoured this: `match-v1` treats `professionSlug` as a
 * weighted criterion that fires only when BOTH sides state it, never a gate.
 * One surface did not. The market panel on the opportunities board returned
 * `null` without a DECLARED profession — and that panel hosts the product's
 * only user-visible AI surface. In production 32 of 36 workers have no
 * `worker_professions` row, so for them the panel, and the AI with it, did not
 * exist. One of those workers holds 12 skills and 12 journal entries: the
 * plumber who never typed "plumber".
 *
 * These tests pin the principle, not the wording: evidence is enough, the
 * declaration always wins when present, and a derived reading must announce
 * itself.
 */

const web = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(web, rel), "utf8");

describe("evidence is enough — a declared profession is not required", () => {
  /** Real slugs from the canonical map, so this is not a synthetic fixture. */
  const plumbingSkills = skillsForProfession("plumber");
  const carpentrySkills = skillsForProfession("carpenter");

  it("the canonical map actually carries the professions this test reasons about", () => {
    // If the taxonomy is re-keyed, fail loudly here rather than silently
    // passing the assertions below against two empty arrays.
    expect(plumbingSkills.length).toBeGreaterThan(1);
    expect(carpentrySkills.length).toBeGreaterThan(1);
  });

  it("derives a profession from held skills when none was declared", () => {
    const got = bestEvidencedProfession({
      workerSkillSlugs: plumbingSkills,
      declaredProfessionSlug: null,
    });
    expect(got).toBe("plumber");
  });

  it("never overrides what the person actually said about themselves", () => {
    const got = bestEvidencedProfession({
      // Their skills say plumber; their profile says carpenter. The profile
      // wins, and this returns null so no surface can prefer the guess.
      workerSkillSlugs: plumbingSkills,
      declaredProfessionSlug: "carpenter",
    });
    expect(got).toBeNull();
  });

  it("returns null rather than guessing from thin evidence", () => {
    expect(
      bestEvidencedProfession({
        workerSkillSlugs: plumbingSkills.slice(0, 1),
        declaredProfessionSlug: null,
      }),
      "one stray skill must not produce an occupation",
    ).toBeNull();
    expect(
      bestEvidencedProfession({ workerSkillSlugs: [], declaredProfessionSlug: null }),
    ).toBeNull();
  });

  it("follows the strongest evidence when a worker spans several trades", () => {
    // The owner's stated requirement: multi-skill people are normal, and the
    // trade they evidence MOST should lead — without the others being erased
    // (adjacent directions still lists them; this only picks the head).
    const mixed = [...plumbingSkills, ...carpentrySkills.slice(0, 1)];
    expect(
      bestEvidencedProfession({
        workerSkillSlugs: mixed,
        declaredProfessionSlug: null,
      }),
    ).toBe("plumber");
  });

  it("is deterministic — the same evidence always yields the same reading", () => {
    const a = bestEvidencedProfession({
      workerSkillSlugs: [...plumbingSkills].reverse(),
      declaredProfessionSlug: null,
    });
    const b = bestEvidencedProfession({
      workerSkillSlugs: plumbingSkills,
      declaredProfessionSlug: null,
    });
    expect(a).toBe(b);
  });

  /**
   * THE ACTUAL PRODUCTION CASE, not a fixture. Worker 8af3e334 holds these 12
   * skills, has 12 journal entries and ZERO `worker_professions` rows — the
   * owner's "plumber who never typed plumber", except they are a plumber AND a
   * carpenter AND an excavator operator AND a painter.
   *
   * Recorded here because the outcome is a real limitation worth seeing: every
   * candidate direction ties at two shared skills, so the head is decided by
   * coverage, and `general_laborer` wins. That is defensible for somebody who
   * does a bit of every trade, and it is not a claim — the panel says the
   * occupation was read off their work and invites them to state a different
   * one. The multi-trade picture itself is NOT narrowed away: the other four
   * directions remain in `computeAdjacentDirections`.
   */
  it("reads a real multi-trade production worker without narrowing them to one trade", () => {
    const REAL_PROD_SKILLS = [
      "carpentry",
      "childcare",
      "concrete-pouring",
      "earthworks",
      "excavator-operator",
      "flooring",
      "general-labour",
      "heating-install",
      "painting",
      "pipefitting",
      "scaffolding",
      "wallpapering",
    ];
    const all = computeAdjacentDirections({
      workerSkillSlugs: REAL_PROD_SKILLS,
      primaryProfessionSlug: null,
    });
    expect(all.limitationState).toBe("ok");
    // Several real trades are surfaced — this is the behaviour the owner
    // called DESIRED, and it must not be "fixed" by collapsing to one.
    const ids = all.directions.map((d) => d.professionId);
    expect(ids.length).toBeGreaterThanOrEqual(4);
    expect(ids).toEqual(expect.arrayContaining(["plumber", "painter"]));
    // And the panel still gets exactly one occupation to be about.
    expect(
      bestEvidencedProfession({
        workerSkillSlugs: REAL_PROD_SKILLS,
        declaredProfessionSlug: null,
      }),
    ).toBe(ids[0]);
  });

  it("builds no second engine — it composes the canonical adjacency map", () => {
    const src = read("lib/opportunities/adjacent-directions.ts");
    const fn = src.slice(src.indexOf("export function bestEvidencedProfession"));
    expect(fn).toContain("computeAdjacentDirections");
    // No private map, no hand-rolled scoring inside the new function.
    expect(fn).not.toMatch(/PROFESSION_SKILLS\s*[:=]/);
  });
});

describe("the market panel no longer requires a declared profession", () => {
  const panel = read("components/app/market-explanation-panel.tsx");

  it("falls back to the evidenced occupation", () => {
    expect(panel).toContain("evidencedProfessionSlug");
    expect(panel).toContain(
      "const slug = professionSlug ?? evidencedProfessionSlug ?? null",
    );
  });

  it("sends the RESOLVED occupation to the AI request, not the declared one", () => {
    // The bug this pins: passing `professionSlug` here would send `null` for
    // exactly the workers the fallback was added to serve, rendering a control
    // that cannot work.
    const req = panel.slice(panel.indexOf("<MarketExplanationRequest"));
    expect(req).toContain("professionSlug={slug}");
    expect(req).not.toContain("professionSlug={professionSlug}");
  });

  it("says out loud when the occupation was derived rather than stated", () => {
    expect(panel).toContain('data-testid="market-explanation-derived"');
    expect(panel).toContain('t("derivedFromWork")');
    // Only in the derived case — a declared profession gets no such note.
    expect(panel).toContain("const derived = !professionSlug &&");
  });

  it("still renders nothing when there is no occupation at all", () => {
    expect(panel).toContain("if (!slug) return null;");
  });

  it("carries the derived-provenance sentence in every active locale", () => {
    for (const loc of ["lt", "en", "ru", "nl", "de"]) {
      const messages = JSON.parse(read(`messages/${loc}.json`));
      const value = messages.marketExplanation?.derivedFromWork;
      expect(typeof value, `${loc} is missing marketExplanation.derivedFromWork`).toBe(
        "string",
      );
      expect(value.trim().length, `${loc} has an empty value`).toBeGreaterThan(0);
    }
  });
});

describe("the board reports the evidenced occupation without inventing one", () => {
  const loader = read("lib/opportunities/load-worker-opportunities.ts");

  it("derives it from the worker's OWN assembled skills", () => {
    expect(loader).toContain("bestEvidencedProfession({");
    expect(loader).toContain("ctx.subject.skills.map((s) => s.uri)");
  });

  it("keeps the declared field untouched and separate", () => {
    // Two distinct fields: nothing overwrites what the worker declared, and no
    // surface can confuse a reading for a statement. The derived one is
    // computed once above the readiness object and passed through by name.
    expect(loader).toContain("professionSlug: ctx.subject.professionSlug ?? null");
    expect(loader).toContain("const evidencedProfessionSlug = bestEvidencedProfession({");
    expect(loader).toContain("evidencedProfessionSlug,");
  });
});

/**
 * RANK IS A CLAIM, AND IT HAS TO BE TRUE.
 *
 * The board has always ordered by `compareMatches` (status -> skill coverage ->
 * confirmed-evidence share -> availability) and has always, correctly, refused
 * to show a percentage: no calibration exists behind one, so a "92%" would be
 * invented precision (doctrine 19). But the ordering said nothing about
 * itself, and once the cards moved into a two-column grid the sequence stopped
 * being self-evident at all.
 *
 * A position is the strongest honest statement available here: "this is the
 * best-evidenced fit we currently hold." It is only true under the RELEVANCE
 * sort — under "newest" the position means recency, and a "#1" there would be
 * a claim about fit the data does not support.
 */
describe("the board states rank, never a fabricated score", () => {
  const page = read("app/[locale]/dashboard/opportunities/page.tsx");

  it("orders by the canonical comparator, not by anything invented here", () => {
    const loader = read("lib/opportunities/load-worker-opportunities.ts");
    expect(loader).toContain("compareMatches");
  });

  it("shows the position only when the list is actually ordered by strength", () => {
    expect(page).toContain('sort === "relevance" ? (');
    expect(page).toContain("opportunity-rank-");
  });

  it("still exposes no percentage anywhere on the card", () => {
    // The board must not acquire a score the moment it acquired a rank.
    const list = page.slice(page.indexOf('data-testid="opportunities-list"'));
    expect(list).not.toMatch(/\bpct\b/);
    expect(list).not.toMatch(/toFixed\(/);
    expect(list).not.toMatch(/%\s*</);
  });

  it("uses the width it already has instead of one narrow column", () => {
    // The owner audit's "tiny cards in a narrow central column extending
    // vertically through a huge mostly-empty desktop page".
    const ul = page.slice(page.indexOf('data-testid="opportunities-list"') - 400);
    expect(ul).toContain("xl:grid-cols-2");
    // Mobile keeps one column — a phone has no spare width to give.
    expect(ul).toContain("grid-cols-1");
  });
});

/**
 * THE HARD GATE ITSELF.
 *
 * `computeOpportunityFit` opens with
 *   `if (!profile.hasWorkType || !profile.hasSkills) -> "missing_profile_info"`
 * and `hasWorkType` was literally `Boolean(subject.professionSlug)`. So a
 * worker who never filled in the profession field saw EVERY card on the board
 * reported as "missing profile information", however much evidence they held:
 * production worker 8af3e334 has twelve skills and twelve journal entries and
 * was told, card after card, that we did not know enough about them.
 *
 * This is the "INCORRECT HARD GATE" classification from the audit, and it is
 * the one that actually changed what a person saw.
 */
describe("a declared profession is not a precondition for being understood", () => {
  const loader = read("lib/opportunities/load-worker-opportunities.ts");

  it("satisfies the work-type signal from evidence, not only from the field", () => {
    expect(loader).toContain(
      "hasWorkType: Boolean(ctx.subject.professionSlug || evidencedProfessionSlug)",
    );
    // The old form must not come back.
    expect(loader).not.toContain("hasWorkType: Boolean(ctx.subject.professionSlug),");
  });

  it("still refuses to compare when there is no skill evidence at all", () => {
    // hasSkills is a REAL gate and stays one: with nothing recorded there is
    // genuinely nothing to match on, and the board says so rather than
    // inventing a fit.
    expect(loader).toContain("hasSkills: ctx.skillRowCount > 0");
    const fit = read("lib/opportunities/opportunity-fit.ts");
    expect(fit).toContain("if (!profile.hasWorkType || !profile.hasSkills)");
  });

  it("derives the occupation once and reuses it, so no two surfaces disagree", () => {
    const derivations = loader.match(/bestEvidencedProfession\(\{/g) ?? [];
    expect(
      derivations.length,
      "compute it once — a second call could drift from the readiness gate",
    ).toBe(1);
    expect(loader).toContain("evidencedProfessionSlug,");
  });
});

/**
 * THE WHOLE CHAIN, RUN — not asserted from source text.
 *
 * Evidence -> evidenced occupation -> `hasWorkType` -> the fit status a real
 * worker sees on a real card. Each link is checked by running it, because the
 * defect this fixes was invisible in every text-shaped test: the code was
 * correct-looking and the person still got "missing profile information" on
 * every opportunity.
 */
describe("end to end: evidence alone gets a real fit status", () => {
  const REAL_PROD_SKILLS = [
    "carpentry",
    "childcare",
    "concrete-pouring",
    "earthworks",
    "excavator-operator",
    "flooring",
    "general-labour",
    "heating-install",
    "painting",
    "pipefitting",
    "scaffolding",
    "wallpapering",
  ];

  /** Exactly what the loader now computes for a worker with no profession. */
  const evidenced = bestEvidencedProfession({
    workerSkillSlugs: REAL_PROD_SKILLS,
    declaredProfessionSlug: null,
  });
  // The loader computes `Boolean(declaredProfessionSlug || evidenced)`; this
  // worker's declared slug is null, so the evidenced reading is the whole
  // answer. Written without the `null ||` because TypeScript rightly points
  // out that a literal null can never contribute.
  const hasWorkType = Boolean(evidenced);

  const need: OpportunityNeed = {
    id: "need-1",
    roleText: "Pagalbinis darbininkas",
    country: "LT",
    locationLabel: null,
    startPeriod: null,
    status: "open",
    companyName: null,
    languages: null,
  } as unknown as OpportunityNeed;

  const profile = {
    hasWorkType,
    hasSkills: true,
    countries: ["LT"],
    availabilitySet: true,
    documentsCount: 1,
  } as unknown as Parameters<typeof computeOpportunityFit>[0];

  it("the evidence produces an occupation at all", () => {
    expect(evidenced).not.toBeNull();
    expect(hasWorkType).toBe(true);
  });

  it("the card is no longer reported as missing profile information", () => {
    const fit = computeOpportunityFit(profile, need);
    expect(
      fit.status,
      "a worker with twelve real skills was told his profile was incomplete on every card",
    ).not.toBe("missing_profile_info");
    expect(fit.gaps).not.toContain("incomplete_profile");
  });

  it("and the OLD behaviour is what this replaced — proof the gate was real", () => {
    // Same worker, same need, `hasWorkType` derived the old way
    // (Boolean(declared profession) === false).
    const oldProfile = { ...profile, hasWorkType: false };
    const fit = computeOpportunityFit(
      oldProfile as unknown as Parameters<typeof computeOpportunityFit>[0],
      need,
    );
    expect(fit.status).toBe("missing_profile_info");
  });

  it("no skills at all still degrades honestly — this widened evidence, not truth", () => {
    const noEvidence = { ...profile, hasWorkType: false, hasSkills: false };
    const fit = computeOpportunityFit(
      noEvidence as unknown as Parameters<typeof computeOpportunityFit>[0],
      need,
    );
    expect(fit.status).toBe("missing_profile_info");
  });
});
