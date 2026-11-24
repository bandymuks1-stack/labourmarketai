import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Source-level guard for Journal Evidence Clarity v1.
 *
 * The journal turns free text into *suggestions* that only become *facts*
 * after a human confirms them, and surfaces a confirmation layer only when
 * a real counterparty confirms. That honesty boundary is the whole point of
 * the evidence loop — it must not silently erode into "the system verified
 * it" / "AI confirmed it" / "automatically a fact" overclaim.
 *
 * Doctrine pinned here (PLATFORM_DOCTRINE §7 — no fake verification / no fake
 * AI; CLAUDE.md "no unlabeled fake data"):
 *   1. The four rendered clarity disclaimers exist + are non-empty in the two
 *      canonical launch locales (LT + EN stay aligned — both carry them).
 *   2. Each disclaimer still *says the honest thing* (suggestion→fact boundary,
 *      "not saved as facts", confirmation only when real, system does not
 *      guess) — pinned per-locale so a reword can't gut the meaning.
 *   3. No overclaim phrase (automatic / AI / system verification, guaranteed,
 *      "becomes a fact automatically") leaks into ANY journal copy — scanned
 *      across both the inline `journal` block in messages/<loc>.json and the
 *      split messages/<loc>/journal.json, for every locale.
 *   4. The components actually render those clarity keys, so the disclaimer
 *      cannot be quietly unmounted while leaving the copy in place.
 *
 * Real, human/counterparty confirmation language ("Confirm & verify",
 * "they become verified") is intentionally allowed — the product DOES support
 * a real manager/owner confirmation. Only *automatic / AI / system-driven*
 * verification is forbidden.
 */

const APP_ROOT = join(__dirname, "..", "..");

function read(rel: string): string {
  return readFileSync(join(APP_ROOT, rel), "utf8");
}

// Locales whose journal honesty layer is complete today and must stay aligned.
// (The other locales carry only a partial journal namespace; widening this set
// is a translation slice, not this guard's job.)
const CANONICAL_LOCALES = ["lt", "en"] as const;

// Keys that are actually rendered in the journal UI (composer / page / inbox).
// Top-level keys live in messages/<loc>/journal.json.
const RENDERED_TOP_KEYS = [
  "savedBody",
  "pilotBackboneNote",
] as const;
const RENDERED_INBOX_KEYS = [
  "clarifyHint",
  "clarifyHoursIntro",
  "suggestedFromEntry",
  "recognizedWorks",
] as const;

// Affirmative overclaim phrases. Phrased to NOT trip on the honest negating
// copy ("the system does not guess", "only becomes a fact once you confirm"):
// every pattern carries the automatic/AI/system qualifier that makes it a lie.
const FORBIDDEN: RegExp[] = [
  /\bautomatically\s+verified\b/i,
  /\bautomatic\s+verification\b/i,
  /\bauto-?confirmed\b/i,
  /\bautomatically\s+confirmed\b/i,
  /\bverified\s+by\s+the\s+system\b/i,
  /\bsystem\s+verifies\b/i,
  /\bAI[\s-]*(?:verifies|verified|confirms|confirmed)\b/i,
  /\bguaranteed\b/i,
  /\bbecomes?\s+a\s+fact\s+automatically\b/i,
  /\bautomatically\s+becomes?\s+a\s+fact\b/i,
  // LT: affirmative "automatically confirmed" (does not match the negating
  // "nespėlioja" / "tik tada, kai patvirtinsite" honest copy).
  /\bautomatiškai\s+patvirtin/i,
];

function journalCopyBlobs(locale: string): { label: string; text: string }[] {
  const blobs: { label: string; text: string }[] = [];
  // Inline journal block in the monolithic locale file.
  const inline = JSON.parse(read(`messages/${locale}.json`)) as Record<
    string,
    unknown
  >;
  if (inline.journal) {
    blobs.push({
      label: `messages/${locale}.json#journal`,
      text: JSON.stringify(inline.journal),
    });
  }
  // Split journal namespace.
  blobs.push({
    label: `messages/${locale}/journal.json`,
    text: read(`messages/${locale}/journal.json`),
  });
  return blobs;
}

describe("Guard: journal clarity disclaimers present + honest (LT + EN)", () => {
  for (const locale of CANONICAL_LOCALES) {
    it(`${locale}/journal.json carries every rendered clarity key`, () => {
      const j = JSON.parse(read(`messages/${locale}/journal.json`)) as Record<
        string,
        unknown
      >;
      for (const k of RENDERED_TOP_KEYS) {
        expect(
          typeof j[k] === "string" && (j[k] as string).trim().length > 0,
          `${locale} journal.${k} must be a non-empty string`,
        ).toBe(true);
      }
      const inbox = j.inbox as Record<string, unknown> | undefined;
      expect(inbox, `${locale} journal.inbox missing`).toBeTruthy();
      for (const k of RENDERED_INBOX_KEYS) {
        expect(
          typeof inbox?.[k] === "string" &&
            (inbox[k] as string).trim().length > 0,
          `${locale} journal.inbox.${k} must be a non-empty string`,
        ).toBe(true);
      }
    });

    it(`${locale} remaining honest notes still say the honest thing`, () => {
      // The composer suggestion→fact disclaimer paragraphs (suggestionReviewIntro,
      // classifyLater) were REMOVED from normal user UI per the owner (quiet UI).
      // The manager-review clarify hint + the confirmation-backbone note remain
      // honest where they are still shown.
      const j = JSON.parse(read(`messages/${locale}/journal.json`)) as Record<
        string,
        unknown
      >;
      const backbone = (j.pilotBackboneNote as string).toLowerCase();
      const clarify = (
        (j.inbox as Record<string, string>).clarifyHint
      ).toLowerCase();

      if (locale === "en") {
        // Silent-trust rule: the backbone note shows the review layer only on a
        // real review (was "real confirmation").
        expect(backbone).toMatch(/real\s+review/);
        expect(clarify).toMatch(/does\s+not\s+guess/);
      } else {
        expect(backbone).toMatch(/reali\s+peržiūra/);
        expect(clarify).toMatch(/nespėlioja/);
      }
    });
  }
});

describe("Guard: no automatic/AI verification overclaim in journal copy", () => {
  for (const locale of CANONICAL_LOCALES) {
    it(`${locale} journal copy carries no forbidden overclaim phrase`, () => {
      for (const { label, text } of journalCopyBlobs(locale)) {
        for (const rx of FORBIDDEN) {
          expect(
            rx.test(text),
            `${label} must not contain overclaim matching ${rx}`,
          ).toBe(false);
        }
      }
    });
  }
});

describe("Guard: components render the journal clarity keys", () => {
  it("composer renders the saved-state copy (disclaimer paragraphs removed)", () => {
    const src = read("components/app/journal-entry-composer.tsx");
    // suggestionReviewIntro / classifyLater were removed from normal user UI.
    expect(src).not.toMatch(/t\("suggestionReviewIntro"\)/);
    expect(src).not.toMatch(/t\("classifyLater"\)/);
    expect(src).toMatch(/t\("savedBody"\)/);
  });

  it("journal page renders the real-confirmation-only note", () => {
    const src = read("app/[locale]/dashboard/journal/page.tsx");
    expect(src).toMatch(/t\("pilotBackboneNote"\)/);
  });

  it("inbox renders the 'system does not guess' clarify disclaimers", () => {
    const src = read("components/app/journal-inbox-entry.tsx");
    expect(src).toMatch(/t\("inbox\.clarifyHint"\)/);
    expect(src).toMatch(/t\("inbox\.clarifyHoursIntro"\)/);
    expect(src).toMatch(/t\("inbox\.suggestedFromEntry"\)/);
  });
});
