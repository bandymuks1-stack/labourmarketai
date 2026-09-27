import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { deriveWorkerReadiness } from "@/lib/player-card/readiness";
import type { WorkerPlayerCard } from "@/lib/player-card/player-card";
import { professionDisplayName } from "@/lib/worker/self-declared-profession";

/**
 * "HAS A PROFESSION" MEANS THE PERSON NAMED ONE — NOT THAT THE CATALOGUE
 * CARRIES IT.
 *
 * ── THE MEASURED PRODUCTION OUTCOME THIS GUARD IS WRITTEN AGAINST
 *
 * The owner's own test user typed `LLM programuotojas` during onboarding. The
 * 49-row profession registry does not carry it, so after #1879/#1880 their
 * answer is stored as the person's OWN WORDS — `worker_professions.label`,
 * with `profession_id` NULL. That is the whole point of those two PRs: a
 * classifier may not be the list of permitted human answers.
 *
 * #1880 taught ŠIANDIEN, the profile block and the Living CV to read the
 * words. It left two surfaces deriving the SAME fact from the registry slug
 * alone, and both then contradicted the screens around them:
 *
 *   1. `deriveWorkerReadiness` scored the `profession` pillar as
 *      `Boolean(card.professionSlug)`. Null for own words — so the readiness
 *      counter scored the person down for an answer the catalogue cannot hold,
 *      and `profile-hub-overview` (whose `goal` step is `pillarMet("profession")`)
 *      kept telling them "Kokio darbo ieškai? Pasirink savo profesiją" about a
 *      profession they had already given us.
 *   2. `resolveWorkEditor` built the work card's profession name from the slug
 *      alone, so the "Darbo kortelė" showed no profession at all.
 *
 * This is the SEP-8 class — DATA EXISTS ≠ REACHABLE ≠ VISIBLE ≠ CORRECTLY
 * INTERPRETED — and it recurs every time a new surface needs the fact, because
 * `professionSlug` is the older, more obvious field. So it is pinned here
 * rather than left as prose.
 *
 * ── WHAT MUST STAY TRUE, AND WHAT MUST NOT CHANGE WITH IT
 *
 * The two fields may never collapse. `professionSlug` is the only thing the
 * match engine and the market map can use, and widening THOSE reads would
 * quietly change what matching is given — a person's own words are not a
 * catalogue slug and cannot be matched as one. So this guard pins presence and
 * display to "registry OR own words", and simultaneously pins matching to
 * registry-only.
 */

const REPO_WEB = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(REPO_WEB, rel), "utf8");

/** A card naming nothing at all — presence must stay honestly false. */
const NEITHER: WorkerPlayerCard = {
  displayName: null,
  skillsDeclared: 0,
  journalSupportedSkills: 0,
  candidateSkills: 0,
  evidenceEntries: 0,
  attentionInstructions: 0,
  workCardConfirmed: false,
  verifiedSkills: [],
  managerConfirmations: 0,
  availabilityStatus: null,
  availableFrom: null,
  professionSlug: null,
  professionOwnWords: null,
  latestEvidenceAt: null,
  workHistory: [],
  unavailable: [],
  locationCountry: null,
  documents: null,
  evidenceTimeline: [],
  skillEvidence: [],
  provenance: { class: "SELF_DECLARED" },
};

/** A card holding ONLY the person's own words — the production case. */
const OWN_WORDS_ONLY: WorkerPlayerCard = {
  ...NEITHER,
  professionOwnWords: "LLM programuotojas",
};

describe("profession presence is not bound to the registry", () => {
  it("own words alone MEET the profession pillar", () => {
    const r = deriveWorkerReadiness(OWN_WORDS_ONLY);
    const pillar = r.pillars.find((p) => p.key === "profession");
    expect(pillar?.met).toBe(true);
  });

  it("a registry slug alone still meets it", () => {
    const r = deriveWorkerReadiness({
      ...NEITHER,
      professionSlug: "plumber",
    });
    expect(r.pillars.find((p) => p.key === "profession")?.met).toBe(true);
  });

  it("naming nothing does NOT meet it — presence stays honest", () => {
    const r = deriveWorkerReadiness(NEITHER);
    expect(r.pillars.find((p) => p.key === "profession")?.met).toBe(false);
  });

  it("own words raise the readiness count, so the counter stops scoring the person down", () => {
    const withWords = deriveWorkerReadiness(OWN_WORDS_ONLY);
    const without = deriveWorkerReadiness(NEITHER);
    expect(withWords.met).toBe(without.met + 1);
  });

  it("the pillar is NOT derived from the registry slug alone", () => {
    const src = read("lib/player-card/readiness.ts");
    // The exact shape of the defect. If a refactor reintroduces it, fail here
    // rather than on a person's screen.
    expect(src).not.toMatch(
      /key:\s*"profession",\s*met:\s*Boolean\(\s*card\.professionSlug\s*\)\s*[,}]/,
    );
    expect(src).toContain("professionOwnWords");
  });
});

describe("the work card names a profession the registry does not carry", () => {
  it("falls back to the person's own words", () => {
    expect(
      professionDisplayName(
        { slug: null, label: "LLM programuotojas" },
        () => null,
      ),
    ).toBe("LLM programuotojas");
  });

  it("prefers the localized registry name when there is one", () => {
    expect(
      professionDisplayName(
        { slug: "welder", label: null },
        (s) => (s === "welder" ? "Suvirintojas" : null),
      ),
    ).toBe("Suvirintojas");
  });

  it("the work-card name goes through the ONE display module, not its own slug lookup", () => {
    const src = read("lib/player-card/player-card-result.ts");
    expect(src).toContain("professionDisplayName");
    // The old private reimplementation, which could not see own words.
    expect(src).not.toMatch(
      /professionName\s*=\s*\n?\s*professionSlug\s*&&\s*tProf\.has/,
    );
  });
});

describe("matching still receives a catalogue slug only", () => {
  // The other half of the fix: presence widened, matching did NOT. A person's
  // own words are not a slug and must never be handed to the match engine or
  // the market map as one.
  for (const rel of [
    "lib/opportunities/worker-subject.ts",
    "lib/market-map/vacancy-volume.ts",
  ]) {
    it(`${rel} reads getPrimaryProfessionSlug, never the own words`, () => {
      const src = read(rel);
      expect(src).toContain("getPrimaryProfessionSlug");
      expect(src).not.toContain("professionOwnWords");
      expect(src).not.toContain("getProfessionEntries");
    });
  }

  it("getPrimaryProfessionSlug still answers with a registry slug only", () => {
    const src = read("lib/data/worker-core.ts");
    // It must resolve through `professions(slug)`, never through `label`.
    expect(src).toMatch(
      /getPrimaryProfessionSlug[\s\S]{0,400}professions\?\.slug/,
    );
  });
});
