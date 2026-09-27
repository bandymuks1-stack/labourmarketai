import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * ONE HUMAN-VISIBLE SURFACE, ONE NAME — and never another object's name.
 *
 * ── WHAT THE OWNER WALKED ON PRODUCTION, 2026-09-27 (§3/§4)
 *
 * "Production navigacijoje žmogus pasirenka 'Darbo kortelė', o atsidariusiame
 * puslapyje sistema tą patį dalyką vadina 'Profesinė kortelė'."
 *
 * Both names were real, and that was the problem: they belong to TWO DIFFERENT
 * OBJECTS that both exist in this product.
 *
 *   · THE PLAYER CARD — `lib/player-card/*`, `playerCard.title`
 *     ("Profesinė kortelė"): the readiness/status projection.
 *   · THE WORK CARD — `lib/worker/work-card*.ts` (7 modules, its own editor,
 *     plausibility checks and `workers.work_card_confirmed_at`),
 *     `playerCard.workCardLabel` and the `workCard` readiness pillar
 *     ("Darbo kortelė"): the work terms a person declares and confirms.
 *
 * `conversation.results.playerCard.title` was set to the WORK card's name while
 * rendering the PLAYER card, so the conversation offered a result under one
 * object's name and opened the other's. Two further drifts sat beside it: the
 * station that opens `/dashboard/profile` was labelled "Profesinis profilis"
 * while that page titles itself "Mano profilis", and the player card printed
 * "Mano profilis" — a PAGE name — in the slot where a person's NAME goes.
 *
 * This is the §3 duplication in its executable form and it is pure
 * presentation: no capability, route or stored fact was involved in the defect
 * or in the repair. Which is exactly why only a guard keeps it fixed — a label
 * is the easiest thing in the tree to "improve" back into a lie.
 *
 * ── SCOPE
 *
 * The six ROUTED locales. `da/et/lv/no/sv` are partial catalogues that do not
 * carry these namespaces at all, and asserting on absent keys would fabricate
 * coverage this product does not have.
 */

const MESSAGES = join(__dirname, "..", "..", "messages");
/** The locales that actually serve these namespaces. */
const ROUTED_LOCALES = ["lt", "en", "ru", "nl", "de", "pl"] as const;

type Json = Record<string, unknown>;
const load = (locale: string): Json =>
  JSON.parse(readFileSync(join(MESSAGES, `${locale}.json`), "utf8")) as Json;

function str(root: Json, path: string): string | null {
  let cur: unknown = root;
  for (const key of path.split(".")) {
    if (typeof cur !== "object" || cur === null) return null;
    cur = (cur as Json)[key];
  }
  return typeof cur === "string" ? cur : null;
}

/** Every pin below needs both sides present, or it is not a real assertion. */
function pair(root: Json, a: string, b: string): [string, string] {
  const left = str(root, a);
  const right = str(root, b);
  expect(left, `${a} must exist`).toBeTruthy();
  expect(right, `${b} must exist`).toBeTruthy();
  return [left as string, right as string];
}

describe.each(ROUTED_LOCALES)("%s — one surface, one name", (locale) => {
  const m = load(locale);

  it("the result a person opens carries the name of the thing it shows", () => {
    // The conversation result renders the PLAYER card, so it must be offered
    // under the player card's own name — never the work card's.
    const [resultTitle, cardTitle] = pair(
      m,
      "conversation.results.playerCard.title",
      "playerCard.title",
    );
    expect(resultTitle).toBe(cardTitle);
  });

  it("the station that opens the profile page is named like that page", () => {
    // `todayScreen.home.stations.profile` → /dashboard/profile, whose heading
    // is `skills.pageTitle`. Tapping "X" must not land on a page titled "Y".
    const [station, pageTitle] = pair(
      m,
      "todayScreen.home.stations.profile",
      "skills.pageTitle",
    );
    expect(station).toBe(pageTitle);
  });

  it("the player card and the work card are never given the same name", () => {
    // Two real objects with two separate data paths. If these ever collapse,
    // the defect above is back in a new place.
    const cardTitle = str(m, "playerCard.title");
    for (const other of [
      "playerCard.workCardLabel",
      "playerCard.readiness.pillars.workCard",
    ]) {
      const otherName = str(m, other);
      expect(otherName, `${other} must exist`).toBeTruthy();
      expect(cardTitle, `${other} must not be the player card's name`).not.toBe(
        otherName,
      );
    }
  });

  it("the setup step asks for the FACT it records — profession, not the job sought", () => {
    /*
     * §5. The step keyed `goal` is completed by `pillarMet("profession")`
     * (profile-hub-overview.tsx), so what it records is the person's
     * PROFESSION. Its copy asked "Kokio darbo ieškai?" / "Pasirink savo
     * profesiją" — two different facts in two lines, and both wrong about the
     * third:
     *
     *   · WHAT JOB SOMEBODY IS LOOKING FOR is a demand-side wish. It is not
     *     their professional identity, and a person may seek work that is not
     *     the only thing they do.
     *   · "PASIRINK savo profesiją" said pick ONE, from a list. A person may
     *     hold 0, 1 or N professions, may work several jobs at once, and — since
     *     #1879/#1880 — may name one the 49-row registry does not carry.
     *
     * So the step now asks onboarding's OWN question, verbatim per locale:
     * `auth.onboarding.profession_label` / `_hint`, which already say
     * "one or several professions or work areas" and "you can add more later".
     * One fact, one question, asked the same way wherever it is asked — and no
     * new copy was written for any locale.
     *
     * The KEY stays `goal`: it is internal, it is wired into `StepKey` and the
     * `PILLAR_HREF` map, and renaming it would be churn with no human effect.
     * This assertion is what keeps the key from drifting the copy back.
     */
    const [title, professionLabel] = pair(
      m,
      "setupJourney.steps.goal.title",
      "auth.onboarding.profession_label",
    );
    expect(title).toBe(professionLabel);

    /*
     * THE HINT IS PINNED BY MEANING, NOT BY STRING EQUALITY — and that is a
     * finding, not a softening. Copying onboarding's hint verbatim into the hub
     * broke `profile-summary-first.test.ts`: the hub is deliberately in the
     * INFORMAL register ("tu") and onboarding's hint is formal ("Galite …
     * galėsite"). Two true constraints, so the hub says the same thing in its
     * own register instead of quoting a sentence written for another surface.
     * (The TITLE needs no such treatment — "Kokia tavo profesija …" is already
     * informal, which is why it is pinned exactly above.)
     */
    const hint = str(m, "setupJourney.steps.goal.hint");
    expect(hint?.trim().length, `${locale} goal.hint`).toBeGreaterThan(0);
    if (locale === "lt") {
      // It must keep saying SEVERAL ARE ALLOWED — the half of §5 that stops
      // this step becoming "pick your one true profession" again.
      expect(hint!.toLowerCase()).toMatch(/vien[ąa] ar kelias/);
      // And it must stay in the hub's register, so the fix cannot be undone by
      // re-copying the formal sentence back over it.
      expect(hint!).not.toMatch(/\b(galite|nurodykite|pasirinkite|jūs|jums)\b/i);
    }
  });

  it("a missing name is named honestly, not filled with a page title", () => {
    // `identity.displayName ?? labels.namePlaceholder` in
    // worker-player-card.tsx. The fallback occupies the person's NAME slot, so
    // it has to say that the name is missing (SEP-7: UNKNOWN is not a value) —
    // it must not be the profile page's name, and it must not be the card's.
    const [placeholder, honest] = pair(
      m,
      "playerCard.namePlaceholder",
      "cvExport.nameNotProvided",
    );
    expect(placeholder).toBe(honest);
    expect(placeholder).not.toBe(str(m, "skills.pageTitle"));
    expect(placeholder).not.toBe(str(m, "playerCard.title"));
  });
});
