import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PROFESSION_SLUGS, PROFESSION_SKILLS } from "@/lib/taxonomy/profession-skills";
import { AUTH_CLIENT_MESSAGE_ROOTS } from "@/lib/i18n/client-messages";

/**
 * ONBOARDING MUST ASK WHAT WORK THE PERSON DOES — AND MUST NOT DEMAND IT.
 *
 * This guard exists because of a measured production outcome, not a style
 * preference. On 2026-08-19: 36 workers, 26 with a country, 4 with a
 * profession. Onboarding asked for the country and did not ask for the work.
 *
 * That one field is not decorative. `worker-subject.ts` reads the primary
 * profession into the match engine's subject; `external-vacancies.ts` uses it
 * to build the profile-directed pool of imported ads; the CV renders it as the
 * work direction. With it null, the whole downstream chain has nothing to work
 * with — so 32 of 36 people could not be matched to anything no matter how
 * good the engine was.
 *
 * `complete_onboarding` has accepted `p_profession_id` since the M1 C-scope
 * migration and writes the primary `worker_professions` row from it. The write
 * path was applied in production the whole time; only the question was
 * missing. These pins keep it asked, keep the answer inside the platform's own
 * registry, and keep it from being silently defaulted on someone's behalf.
 *
 * ── WHAT THE OWNER DIRECTION OF 2026-09-27 CHANGED, AND WHY
 *
 * The question was right; asking it as ONE MANDATORY PICK was not. Walked on
 * production, it put three untrue things on a new person:
 *
 *   · that they are working right now. "Kokį darbą dirbi?" has no honest
 *     answer between jobs, and the form refused to continue without one.
 *   · that one name covers them. `worker_professions` has carried several
 *     directions per worker since 0008 (one primary, the rest equal members)
 *     and the profile's own panel lets a worker add more — onboarding was the
 *     single surface that insisted on exactly one.
 *   · that a profession missing from a 49-row registry does not exist.
 *
 * So the REQUIREMENT is gone and the field takes a LIST. Nothing else moved:
 * the answer still comes from the platform's registry, still resolves against
 * an ACTIVE row, and is still never defaulted on anyone's behalf. The pins
 * below now also keep the requirement from coming back — an empty field means
 * "not stated here", never "has no profession"
 * (`bestEvidencedProfession` + guard `no-mandatory-profession` read an
 * occupation off the person's real work when none was declared).
 *
 * A free-text profession the registry cannot name is NOT shippable here and
 * this guard says so out loud: `worker_professions.profession_id` is a foreign
 * key and the schema holds no person-scoped free-text occupation column, so a
 * field that accepted one would drop it. That is a schema question, and the
 * owner reserves schema decisions.
 */
const web = join(__dirname, "..", "..");
const WIZARD = join(web, "components", "app", "onboarding-wizard.tsx");
const ACTION = join(web, "lib", "auth", "actions.ts");
const MESSAGES = join(web, "messages");

// CRLF-normalised at the read. This repository ships no `.gitattributes`, so a
// Windows checkout materialises these sources with carriage returns while a
// Linux CI runner gets bare newlines. The source assertions below compare
// against multi-line literals, which a carriage return makes unmatchable — the
// result is a guard that passes on CI and fails on every Windows machine, which
// trains people to ignore a red guard. Same idiom as financial-ops.test.ts and
// secdef-local-reset-reproducibility.test.ts.
const read = (p: string) => readFileSync(p, "utf8").replace(/\r/g, "");

const onboardingCopy = (locale: string): Record<string, string> => {
  const messages = JSON.parse(read(join(MESSAGES, `${locale}.json`))) as {
    auth: { onboarding: Record<string, string> };
  };
  return messages.auth.onboarding;
};

describe("onboarding asks what work the person does", () => {
  it("the worker step renders the work-type field, and it takes SEVERAL", () => {
    const src = read(WIZARD);
    // A TEXT FIELD, not a closed list (owner direction 2026-09-27): the
    // classifier may suggest, it may never be the list of permitted answers.
    expect(src).toContain('data-testid="onboarding-profession-input"');
    expect(src).toContain('data-testid="onboarding-profession-field"');
    expect(src).toContain('data-testid="onboarding-profession-add"');
    // The registry still offers matches — as SUGGESTIONS beside the field.
    expect(src).toContain('data-testid="onboarding-profession-suggestions"');
    // Asked only of a worker — a company-only signup is not a person looking
    // for work, and asking them would be a question with no honest answer.
    expect(src).toContain('roles.has("worker") && (');
    // A list of entries, each removable; a registry pick and the person's own
    // words are different KINDS and are submitted in different fields, so
    // neither can be mistaken for the other.
    expect(src).toMatch(/useState<readonly ProfessionEntry\[\]>/);
    expect(src).toContain('form.set("profession_slug", registrySlugs[0])');
    expect(src).toContain('form.set("profession_slugs", registrySlugs.join(","))');
    expect(src).toContain('form.set("profession_labels", serializeSelfDeclaredProfessions(ownWords))');
    expect(src).toContain('data-testid="onboarding-profession-chosen"');
    expect(src).toContain("onboarding-profession-remove-");
  });

  it("the words are taken as written — nothing guesses, corrects or translates", () => {
    const src = read(WIZARD);
    // Enter adds what was typed; it never silently resolves to a suggestion.
    expect(src).toContain("addOwnWords()");
    expect(src).toContain("normalizeSelfDeclaredProfession(professionDraft)");
    // No catalogue lookup stands between the person and their own answer.
    expect(src).not.toMatch(/detectLanguage|guessProfession|professionsNamedInText/);

    const action = read(ACTION);
    // The language is the SESSION's locale, read from the raw form field —
    // never the action's own `locale` variable, which falls back to "lt" and
    // would put a fabricated language on somebody's words.
    expect(action).toContain('recordableInputLanguage(\n    formData.get("locale") as string | null,\n  )');
    expect(action).not.toMatch(/recordableInputLanguage\(locale\)/);
    // Stored verbatim into the canonical table; the generated dedupe key is
    // never written by hand.
    expect(action).toContain("parseSelfDeclaredProfessions(");
    expect(action).toContain("original_language: professionLanguage");
    expect(action).not.toMatch(/normalized_label:/);
  });

  it("it is NEVER a condition of entry (owner direction 2026-09-27)", () => {
    // The refusal is gone from the wizard, the requirement helper is gone from
    // the router, and the refusal copy is gone from every catalogue — so there
    // is nothing left for a later change to switch back on by accident.
    const src = read(WIZARD);
    expect(src).not.toMatch(/professionRequired/);
    expect(src).not.toContain("error_profession_required");
    expect(src).not.toMatch(/!professionSlug\b/);
    // Comments stripped: the router's docblock RECORDS the removed helper
    // and why, and that history must not read as the requirement returning.
    const router = read(join(web, "lib", "onboarding", "first-run-intent.ts"))
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/\/\/[^\n]*/g, " ");
    expect(router).not.toMatch(/professionRequired/);
    for (const file of readdirSync(MESSAGES).filter((f) => f.endsWith(".json"))) {
      const messages = JSON.parse(read(join(MESSAGES, file))) as {
        auth?: { onboarding?: Record<string, unknown> };
      };
      expect(
        messages.auth?.onboarding?.error_profession_required,
        `${file} still carries the removed refusal`,
      ).toBeUndefined();
    }
  });

  it("a registry-less profession is not silently accepted — the store does not exist yet", () => {
    // The honest boundary of this slice. `worker_professions.profession_id` is
    // a foreign key into the 49-row registry and no person-scoped free-text
    // occupation column exists, so the field offers registry values only. If a
    // free-text occupation is ever added, it needs a place to live FIRST —
    // this pin fails the moment a raw typed value is posted instead.
    const src = read(WIZARD);
    expect(src).toContain("PROFESSION_SLUGS.includes(defaultProfessionSlug)");
    const action = read(ACTION);
    expect(action).toContain("PROFESSION_SLUGS.includes(s)");
    const mig = read(
      join(web, "..", "..", "supabase", "migrations", "0008_professions.sql"),
    );
    expect(mig).toMatch(
      /profession_id uuid not null references public\.professions\(id\)/,
    );
  });

  it("nothing is pre-selected — a profession is never declared for someone", () => {
    // §7: the platform does not assert a fact about a person that the person
    // did not state. A defaulted first option would put a profession on 100%
    // of profiles and make the field worthless as evidence.
    const src = read(WIZARD);
    // The ONLY seed is the profession the person named in their own landing
    // sentence (lib/onboarding/landing-handoff — exactly one registry
    // profession, else null); with no sentence the field starts EMPTY.
    // That is the person's statement shown back in a field they still
    // submit — not a platform default (walk-real-person-join, 2026-09-06).
    expect(src).toMatch(
      /useState<readonly ProfessionEntry\[\]>\(\(\) =>\s*defaultProfessionSlug && PROFESSION_SLUGS\.includes\(defaultProfessionSlug\)\s*\? \[\{ slug: defaultProfessionSlug, label: null \}\]\s*: \[\],?\s*\)/,
    );
    expect(src).not.toMatch(/useState<readonly ProfessionEntry\[\]>\(\[\{ slug: professionOptions\[0\]/);
    // The draft field starts empty: nothing is typed on anyone's behalf.
    expect(src).toContain('useState("")');
    expect(src).toContain("profession_placeholder");
  });

  it("every answer must be a slug the platform's own registry holds", () => {
    // A hand-crafted POST cannot record a profession nothing else understands:
    // the action filters the posted list through the closed set, then resolves
    // it against ACTIVE registry rows. An unknown slug is dropped rather than
    // failing the signup, and the list is deduped so the write stays bounded
    // by the registry itself.
    const src = read(ACTION);
    expect(src).toContain("PROFESSION_SLUGS.includes(s)");
    expect(src).toContain("new Set(");
    expect(src).toContain('.from("professions")');
    expect(src).toContain('.in("slug", professionSlugList)');
    expect(src).toContain('.eq("is_active", true)');
    expect(src).toContain("p_profession_id: professionId");
  });

  it("only a worker's answer is sent", () => {
    const src = read(ACTION);
    expect(src).toContain('primary === "worker" && professionSlug');
  });

  it("the further professions go into the SAME canonical table, never a new one", () => {
    // `worker_professions` has carried a worker's additional directions since
    // 0008 and the profile writes them through `addWorkerDirection`. Onboarding
    // must use that table and that shape — a second store for "the other
    // professions" would split one truth in two.
    const src = read(ACTION);
    expect(src).toContain('.from("worker_professions")');
    expect(src).toContain("is_primary: false");
    expect(src).toContain('onConflict: "worker_id,profession_id"');
    expect(src).toContain("ignoreDuplicates: true");
  });

  it("the slug list is derived from the skill map, never re-typed", () => {
    // Drift between this list and the registry would offer a choice that
    // resolves to nothing. `matching-canonical.test.ts` already re-derives the
    // map from the seed migrations link by link, so deriving from it inherits
    // that proof instead of adding a second hand-maintained copy.
    const src = read(join(web, "lib", "taxonomy", "profession-skills.ts"));
    expect(src).toContain("Object.keys(\n  PROFESSION_SKILLS,\n).sort()");
    expect(PROFESSION_SLUGS.length).toBe(Object.keys(PROFESSION_SKILLS).length);
    // 49 = the row count in production `public.professions` (2026-08-19).
    expect(PROFESSION_SLUGS.length).toBe(49);
    expect([...PROFESSION_SLUGS]).toEqual([...PROFESSION_SLUGS].sort());
  });

  it("the labels actually reach the client on this route", () => {
    // The select runs in a client component, so the namespace must be in the
    // onboarding layout's message pick — otherwise every option renders as a
    // missing-key error. This was a real failure caught by
    // `client-messages-allowlist`; pinning it here says WHY it belongs.
    expect([...AUTH_CLIENT_MESSAGE_ROOTS]).toContain("professions");
  });

  it("every shipped locale can ask the question and refuse an empty answer", () => {
    const locales = readdirSync(MESSAGES).filter((f) => f.endsWith(".json"));
    expect(locales.length).toBeGreaterThanOrEqual(11);
    for (const file of locales) {
      const messages = JSON.parse(read(join(MESSAGES, file))) as {
        auth?: { onboarding?: Record<string, unknown> };
      };
      const onboarding = messages.auth?.onboarding ?? {};
      for (const key of [
        "profession_label",
        "profession_placeholder",
        "profession_hint",
        "profession_search_placeholder",
        "profession_search_empty",
        "profession_remove",
        "country_search_placeholder",
        "country_search_empty",
      ]) {
        const value = onboarding[key];
        expect(
          typeof value === "string" && value.trim().length > 0,
          `${file} is missing auth.onboarding.${key}`,
        ).toBe(true);
      }
    }
  });

  it("the hint does not promise that a profession alone produces a match", () => {
    // HONESTY, and the reason this pin exists rather than a style note.
    // `match-v1.ts` decides MatchStatus from skill coverage alone —
    //   if (skillFit.matchedTotal === 0)
    //     status = subject.skills.length === 0 ? "insufficient_data" : "weak"
    // — while the profession contributes a weighted REASON that can never lift
    // that status. So a hint reading "this is what job matching uses" would
    // send someone who just answered into a board that says insufficient data
    // on every card: the #1193 defect (a funnel that looked like it worked)
    // with a friendlier label. The copy must hand off to the skills step.
    // The copy used to hand off to the skills step ("atitikčiai reikia
    // abiejų"), which was honest about matching and wrong about the product:
    // it framed LabourMarket.ai as a job search at the first question a person
    // answers (owner direction 2026-09-27, reduction "a job board"). The rule
    // it enforced still holds and is now enforced directly — the hint promises
    // NOTHING about finding work — and what it says instead is the two true
    // things: several are allowed, and more can be added later.
    for (const loc of ["lt", "en"]) {
      const hint = onboardingCopy(loc).profession_hint.toLowerCase();
      expect(hint).not.toMatch(
        /ieškome|ieškoti|darbo paieška|atitikt|match|vacanc|job for you/,
      );
    }
    expect(onboardingCopy("lt").profession_hint).toMatch(/vieną ar kelias/i);
    expect(onboardingCopy("lt").profession_hint).toMatch(/vėliau/i);
    expect(onboardingCopy("en").profession_hint).toMatch(/one or several/i);
    expect(onboardingCopy("en").profession_hint).toMatch(/later/i);
  });

  it("the question no longer assumes the person holds one job right now", () => {
    // "Kokį darbą dirbi?" / "What work do you do?" has no honest answer
    // between jobs, and none at all for somebody who holds two.
    expect(onboardingCopy("lt").profession_label).not.toMatch(/kokį darbą dirbi/i);
    expect(onboardingCopy("en").profession_label).not.toMatch(/what work do you do/i);
    expect(onboardingCopy("lt").profession_label).toMatch(/profesija/i);
    expect(onboardingCopy("en").profession_label).toMatch(/profession/i);
  });

  it("every offered slug has a label in every locale", () => {
    // An option rendering as a raw slug ("heavy_equipment_operator") in one
    // language is the kind of half-shipped i18n the ratchet exists to stop.
    const localeDirs = readdirSync(MESSAGES, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
    expect(localeDirs.length).toBeGreaterThanOrEqual(11);
    for (const dir of localeDirs) {
      const labels = JSON.parse(
        read(join(MESSAGES, dir, "professions.json")),
      ) as Record<string, string>;
      const missing = PROFESSION_SLUGS.filter(
        (s) => typeof labels[s] !== "string" || labels[s].trim().length === 0,
      );
      expect(missing, `${dir}/professions.json missing labels`).toEqual([]);
    }
  });
});
