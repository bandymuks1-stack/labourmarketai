import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * S2 „Mano erdvė" copy guard for RU / NL / DE.
 *
 * SCOPE: the `personalWorkspace` namespace ONLY, plus the two pillar labels this
 * block renders from `playerCard.readinessSteps.pillar`. It deliberately does
 * NOT scan other namespaces, docs or audit text — a lexical ban that reached
 * the whole catalogue would fail legitimate historical copy (for example
 * `auth.dashboard.section.seek.title`, which shares a string with this block by
 * coincidence, and the labour-law term `Arbeitsbereitschaft` if it were ever
 * needed in a genuine working-time context elsewhere).
 *
 * What it pins is meaning, not taste:
 *   DE — `Arbeitsbereitschaft` denotes PAID ON-CALL/STANDBY working time in
 *        German labour-law usage. As the heading over "what is already set /
 *        what matters most now" it reads as a shift type, so it must not come
 *        back to this namespace.
 *   NL — `Werkgereedheid` is a bureaucratic coinage; `beloning` is HR-register
 *        where the catalogue's own term is `salaris` / `Salarisverwachting`.
 *   RU — the block must stay in Russian (no English leftovers) and use the
 *        catalogue's `зарплата`, not `оплата` (which means payment/price here).
 */

const MESSAGES = join(__dirname, "..", "..", "messages");

type Json = Record<string, unknown>;
const load = (loc: string): Json =>
  JSON.parse(readFileSync(join(MESSAGES, `${loc}.json`), "utf8")) as Json;

const ns = (loc: string): Json => load(loc).personalWorkspace as Json;

const at = (o: Json, path: string): string =>
  path.split(".").reduce<unknown>((a, k) => (a as Json)?.[k], o) as string;

/** Every leaf STRING of the namespace — values only, never the key names. */
const values = (o: unknown, out: string[] = []): string[] => {
  if (typeof o === "string") out.push(o);
  else if (o && typeof o === "object") {
    for (const v of Object.values(o as Json)) values(v, out);
  }
  return out;
};

/** The availability pillar label is rendered INSIDE this block, so its canonical
 *  wording is part of what the reader sees here. */
const availabilityPillar = (loc: string): string =>
  at(load(loc), "playerCard.readinessSteps.pillar.availability");

describe("DE personalWorkspace copy", () => {
  it("never calls profile state `Arbeitsbereitschaft` (that is paid standby time)", () => {
    for (const v of values(ns("de"))) {
      expect(v, `DE personalWorkspace string: ${v}`).not.toMatch(/Arbeitsbereitschaft/i);
    }
  });

  it("names the work profile in the readiness heading", () => {
    expect(at(ns("de"), "readiness.label")).toMatch(/Arbeitsprofils?/);
  });

  it("uses the canonical `Gehaltsvorstellung` for pay expectation", () => {
    expect(at(ns("de"), "dimension.whatPayIExpect")).toMatch(/Gehaltsvorstellung/);
    // `Bezahlung` was the non-canonical wording this guard replaced.
    for (const v of values(ns("de"))) expect(v).not.toMatch(/Bezahlung/);
  });

  it("keeps `Verfügbarkeit` canonical for the availability signal it renders", () => {
    expect(availabilityPillar("de")).toMatch(/Verfügbarkeit/);
  });

  it("uses the canonical `Nachweis` family for experience evidence", () => {
    expect(at(ns("de"), "action.addExperienceEvidence")).toMatch(/Nachweise/);
  });
});

describe("NL personalWorkspace copy", () => {
  it("never uses the bureaucratic `Werkgereedheid`", () => {
    for (const v of values(ns("nl"))) {
      expect(v, `NL personalWorkspace string: ${v}`).not.toMatch(/werkgereedheid/i);
    }
  });

  it("never uses `beloning` where salary expectation is meant", () => {
    for (const v of values(ns("nl"))) {
      expect(v, `NL personalWorkspace string: ${v}`).not.toMatch(/beloning/i);
    }
  });

  it("uses the catalogue's `salaris` wording for pay expectation", () => {
    expect(at(ns("nl"), "dimension.whatPayIExpect")).toMatch(/salaris/i);
  });

  it("names the work profile in the readiness heading", () => {
    expect(at(ns("nl"), "readiness.label")).toMatch(/werkprofiel/i);
  });

  it("keeps `Beschikbaarheid` canonical for the availability signal it renders", () => {
    expect(availabilityPillar("nl")).toMatch(/Beschikbaarheid/);
  });

  it("names WORK experience in the evidence CTA", () => {
    expect(at(ns("nl"), "action.addExperienceEvidence")).toMatch(/werkervaring/i);
  });
});

describe("RU personalWorkspace copy", () => {
  it("carries no English leftovers and no untranslated marker", () => {
    for (const v of values(ns("ru"))) {
      expect(v, `RU personalWorkspace string: ${v}`).not.toContain("[EN]");
      // Values must be Russian — a Latin word here means an untranslated leftover.
      expect(v, `RU personalWorkspace string: ${v}`).not.toMatch(/[A-Za-z]{2,}/);
    }
  });

  it("uses the catalogue's `зарплата`, not `оплата`, for pay expectation", () => {
    expect(at(ns("ru"), "dimension.whatPayIExpect")).toMatch(/зарплат/i);
    expect(at(ns("ru"), "dimension.whatPayIExpect")).not.toMatch(/оплат/i);
  });

  it("names the profile in the readiness heading, not readiness for work", () => {
    const label = at(ns("ru"), "readiness.label");
    expect(label).toMatch(/профил/i);
    expect(label).not.toMatch(/к работе/i);
  });

  it("keeps the formal `вы` register of the surrounding conversation", () => {
    // The RU greeting and composer rendered in the same card are formal, so an
    // informal `ты` here would address the reader two ways in one screen.
    for (const v of values(ns("ru"))) {
      expect(v, `RU personalWorkspace string: ${v}`).not.toMatch(
        /(^|[^а-яё])(ты|тебя|тебе|твой|твоя|твоё|твои)([^а-яё]|$)/i,
      );
    }
  });
});

describe("LT personalWorkspace register", () => {
  /**
   * The whole „Mano erdvė" card speaks informal *tu* — the greeting rendered
   * beside it does too. `unverifiedNote` arrived from the legacy
   * `auth.dashboard.mySpace` namespace, which is written in formal *jūs*, and
   * shipped a card that addressed the reader both ways at once.
   *
   * Scoped to `personalWorkspace`: the legacy namespace keeps its own *jūs*
   * wording and is deliberately NOT covered here.
   */
  const FORMAL_JUS =
    /\b(jūs|jūsų|jums|jumis)\b|\b\w+(ate|ite|ote|kite|site)\b/i;

  it("addresses the reader as `tu` throughout — never a formal `jūs` form", () => {
    for (const v of values(ns("lt"))) {
      expect(v, `LT personalWorkspace string: ${v}`).not.toMatch(FORMAL_JUS);
    }
  });

  it("still says the note is self-declared and not human-reviewed", () => {
    // The register fix must not quietly drop the honesty claim itself.
    const note = at(ns("lt"), "unverifiedNote");
    expect(note).toMatch(/pasakoji/);
    expect(note).toMatch(/neperžiūrėta/);
  });
});

describe("the copy review changed WORDING only", () => {
  const LOCALES = ["en", "lt", "lv", "et", "nl", "de", "da", "no", "sv", "pl", "ru"] as const;

  const keyPaths = (o: unknown, p = "", out: string[] = []): string[] => {
    if (typeof o === "string") out.push(p);
    else if (o && typeof o === "object") {
      for (const [k, v] of Object.entries(o as Json)) keyPaths(v, p ? `${p}.${k}` : k, out);
    }
    return out;
  };

  it("every locale still declares the SAME personalWorkspace keys", () => {
    const base = keyPaths(ns("lt")).sort();
    expect(base.length).toBeGreaterThan(0);
    for (const loc of LOCALES) {
      expect(keyPaths(ns(loc)).sort(), `${loc}.json`).toEqual(base);
    }
  });

  it("no value is empty in any locale", () => {
    for (const loc of LOCALES) {
      for (const v of values(ns(loc))) expect(v.trim(), `${loc}.json`).not.toBe("");
    }
  });
});
