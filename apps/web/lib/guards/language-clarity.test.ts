import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { resolveViewerText } from "@/lib/communication/translation";
import { activeLocales, tier1Locales } from "@/lib/i18n/config";

/**
 * WAGON 5 guard — language & communication clarity stays HONEST.
 *
 * Pins (train doc §WAGON 5 "Required guards"):
 *   1. No unsupported-language CLAIMS in user-facing copy: nothing in the
 *      active-locale catalogs claims automatic translation exists. The
 *      honesty line is allowed to SAY there is no automatic translation
 *      (negated forms pass; claim forms fail).
 *   2. The message language chip renders ONLY when original_language data
 *      exists — a missing/unknown language shows NOTHING (never a guess).
 *   3. The "write in your own language" helper text exists in en/lt/ru on
 *      the chat composer AND the instructions composer, and neither promises
 *      a future translation.
 *   4. Active-locale labels stay honest: lt/en/ru active, RU (non-Tier-1)
 *      keeps its preview tag; the account page has a UI-language line.
 */

const APP = resolve(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(APP, rel), "utf8");
const loadMessages = (locale: string): Record<string, unknown> =>
  JSON.parse(read(`messages/${locale}.json`)) as Record<string, unknown>;

/** Recursively collect every string value with its key path. */
function stringValues(
  obj: Record<string, unknown>,
  prefix = "",
  out: Array<{ path: string; value: string }> = [],
): Array<{ path: string; value: string }> {
  for (const k of Object.keys(obj)) {
    const p = prefix ? `${prefix}.${k}` : k;
    const v = obj[k];
    if (typeof v === "string") out.push({ path: p, value: v });
    else if (v && typeof v === "object" && !Array.isArray(v))
      stringValues(v as Record<string, unknown>, p, out);
  }
  return out;
}

function get(obj: Record<string, unknown>, path: string): string | undefined {
  let cur: unknown = obj;
  for (const part of path.split(".")) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return typeof cur === "string" ? cur : undefined;
}

// Claim-form patterns per active locale. Deliberately shaped so the HONEST
// negation ("there is no automatic translation" / "automatinio vertimo nėra"
// / "автоматического перевода нет") does NOT match:
//   - EN: negative lookbehind excludes "no automatic translation";
//     participle claims ("automatically translated") are banned outright.
//   - LT/RU: negation uses the GENITIVE case (automatinio vertimo /
//     автоматического перевода), so banning the NOMINATIVE claim phrase
//     (automatinis vertimas / автоматический перевод) cannot collide.
const CLAIM_PATTERNS: Record<string, RegExp[]> = {
  en: [
    /(?<!no )automatic translation/i,
    /automatically translated/i,
    /translated automatically/i,
    /we translate your/i,
  ],
  lt: [
    /automatinis vertimas/i,
    /automatiškai išvers/i,
    /verčiama automatiškai/i,
  ],
  ru: [
    /автоматический перевод/i,
    /автоматически переведен/i,
    /переводится автоматически/i,
  ],
};

describe("no unsupported-language claims in active-locale copy", () => {
  for (const locale of ["en", "lt", "ru"] as const) {
    it(`${locale}.json contains no automatic-translation CLAIM`, () => {
      const values = stringValues(loadMessages(locale));
      for (const { path, value } of values) {
        for (const pattern of CLAIM_PATTERNS[locale]) {
          expect(
            pattern.test(value),
            `${locale}.json ${path} claims automatic translation: "${value}" (pattern ${pattern})`,
          ).toBe(false);
        }
      }
    });
  }
});

describe("honesty helper text — write in your own language, no translation engine", () => {
  const NEGATION: Record<string, RegExp> = {
    en: /no automatic translation/i,
    lt: /automatinio vertimo nėra/i,
    ru: /автоматического перевода нет/i,
  };

  for (const locale of ["en", "lt", "ru"] as const) {
    it(`${locale}: chat composer helper exists and says there is NO auto translation`, () => {
      const hint = get(loadMessages(locale), "communication.composer.languageHint");
      expect(hint, `${locale} communication.composer.languageHint`).toBeTruthy();
      expect(hint).toMatch(NEGATION[locale]);
    });

    it(`${locale}: instructions language note is honest and promises nothing`, () => {
      const note = get(loadMessages(locale), "instructions.manager.languageNote");
      expect(note, `${locale} instructions.manager.languageNote`).toBeTruthy();
      expect(note).toMatch(NEGATION[locale]);
      // No forward-looking translation promise (the old copy said a
      // translation "will be added later" — no engine exists, so don't).
      expect(note).not.toMatch(/will be added|bus pridėt|будет добавлен/i);
    });
  }

  it("the chat composer renders the helper line", () => {
    const composer = read("components/app/communication-composer.tsx");
    expect(composer).toMatch(/data-testid="communication-language-hint"/);
    expect(composer).toMatch(/composer\.languageHint/);
  });

  it("the instructions composer still renders its language note", () => {
    const composer = read("components/app/manager-instruction-composer.tsx");
    expect(composer).toMatch(/labels\.languageNote/);
  });
});

describe("message language chip — data-backed only, never guessed", () => {
  it("no original_language data → NO badge (missing column / legacy rows)", () => {
    const vt = resolveViewerText({
      body: "Sveiki",
      originalLanguage: null,
      viewerLocale: "en",
    });
    expect(vt.languageBadge).toBeNull();
    expect(vt.kind).toBe("original");
    expect(vt.text).toBe("Sveiki");
  });

  it("blank original_language → NO badge (never a guessed code)", () => {
    expect(
      resolveViewerText({ body: "x", originalLanguage: "  ", viewerLocale: "lt" })
        .languageBadge,
    ).toBeNull();
  });

  it("same language as viewer → NO badge (nothing to flag)", () => {
    expect(
      resolveViewerText({ body: "x", originalLanguage: "lt", viewerLocale: "lt" })
        .languageBadge,
    ).toBeNull();
  });

  it("known different language → badge with the REAL stored code", () => {
    const vt = resolveViewerText({
      body: "Привет",
      originalLanguage: "ru",
      viewerLocale: "lt",
    });
    expect(vt.languageBadge).toBe("ru");
    // The text stays the ORIGINAL — the stub never fabricates a translation.
    expect(vt.kind).toBe("original");
    expect(vt.text).toBe("Привет");
  });

  it("the send path stamps 'ru' too (11-locale set of applied 20260612130000)", () => {
    const actions = read("lib/communication/actions.ts");
    expect(actions).toMatch(/KNOWN_LOCALES = \[[^\]]*"ru"[^\]]*\]/);
    // Unknown locale stamps null (honest unknown) and the legacy-shape
    // degrade on 42703 stays — the draft column migration is owner-gated.
    expect(actions).toMatch(
      /KNOWN_LOCALES\.includes\(input\.locale\) \? input\.locale : null/,
    );
    expect(actions).toMatch(/42703/);
  });

  it("the thread page derives the chip from resolveViewerText only", () => {
    const page = read(
      "app/[locale]/dashboard/communication/[conversationId]/page.tsx",
    );
    expect(page).toMatch(/resolveViewerText\(/);
    expect(page).toMatch(/original_language/);
    // select("*") read: tolerates the column being absent pre-apply.
    expect(page).toMatch(/\.select\("\*"\)/);
  });
});

describe("UI language status stays honest and discoverable", () => {
  it("active locales are exactly lt/en/ru/nl/de; RU/NL/DE stay non-Tier-1 (preview)", () => {
    // NL + DE activated 2026-07-11 (launch repair Scope D) with full-parity
    // AI-seeded catalogs pending §7.4 human review — preview-tagged like RU.
    expect([...activeLocales]).toEqual(["lt", "en", "ru", "nl", "de"]);
    expect([...tier1Locales]).toEqual(["en", "lt"]);
  });

  it("the locale switcher tags non-Tier-1 locales as preview", () => {
    const switcher = read("components/marketing/locale-switcher.tsx");
    expect(switcher).toMatch(/tier1Locales/);
    expect(switcher).toMatch(/localePreview/);
  });

  it("the account page shows the UI language line on all viewports", () => {
    const account = read("app/[locale]/dashboard/account/page.tsx");
    expect(account).toMatch(/data-testid="account-ui-language"/);
    expect(account).toMatch(/<LocaleSwitcher\s*\/>/);
    // The section must not be hidden away from desktop users again.
    const section = account.slice(account.indexOf('data-testid="account-ui-language"') - 200);
    expect(section.slice(0, 400)).not.toMatch(/md:hidden/);
  });
});
