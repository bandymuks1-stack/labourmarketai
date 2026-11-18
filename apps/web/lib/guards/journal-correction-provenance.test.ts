import { readFileSync } from "node:fs";
import { join } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { activeLocales } from "@/lib/i18n/config";

/**
 * A CORRECTION'S CARD SAYS WHAT IT ANSWERED (walk work-verification
 * 2026-10-25, PR #2786; decision 0025: every work hour once, provenance and
 * confirmation visible).
 *
 * The defect: after the worker answered a returned / rejected entry, the
 * decided original left the diary (counted once — `countedOnce`, #1689) and
 * with it every trace of the manager's decision and note. These checks pin
 * the repair: the journal page hands the list core's `correctionProvenance`
 * to the correction's card (a kicker line in view + a "corrected-from" step
 * in the timeline), and never lists `correctedOriginals` as cards.
 */

const APP = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(APP, rel), "utf8");
const catalogue = (locale: string) =>
  JSON.parse(read(`messages/${locale}/journal.json`)) as {
    entry: { timeline: Record<string, unknown> };
  };

/** next-intl's server `t` over a real catalogue (dotted keys, `{arg}` values). */
function translatorFor(locale: string) {
  const journal = catalogue(locale) as unknown as Record<string, unknown>;
  return (key: string, values?: Record<string, string>) => {
    const raw = key.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], journal);
    if (typeof raw !== "string") throw new Error(`missing ${locale} journal.${key}`);
    return raw.replace(/\{(\w+)\}/g, (_, k: string) => values?.[k] ?? `{${k}}`);
  };
}

let currentLocale = "lt";
vi.mock("next-intl/server", () => ({
  getTranslations: async (ns: string) =>
    ns === "journal" ? translatorFor(currentLocale) : (k: string) => k,
}));

const { CorrectionProvenanceLine, EvidenceDecisionTimeline } = await import(
  "@/components/app/evidence-decision-timeline"
);

const RETURNED = {
  originalId: "orig",
  result: "changes_requested" as const,
  role: "owner",
  at: "2026-10-25T10:00:00Z",
  note: "nurodyk, kiek kvadratinių metrų nutinkavai.",
  automatic: false,
};

describe("the journal page renders the provenance of a corrected chain", () => {
  const page = read("app/[locale]/dashboard/journal/page.tsx");
  const row = read("components/app/journal-entry-row.tsx");

  it("reads `correctionProvenance` from the ONE list read and passes it to the card and the timeline", () => {
    expect(page).toMatch(/entriesRead\.correctionProvenance/);
    expect(page).toMatch(/provenanceSlot=\{[\s\S]{0,200}<CorrectionProvenanceLine[\s\S]{0,300}steps=\{correctionProvenance\[e\.id\]\}/);
    expect(page).toMatch(/correctedFrom=\{correctionProvenance\[e\.id\]\}/);
    expect(row).toMatch(/\{provenanceSlot\}/);
  });

  it("never renders a corrected original as a card (the chain counts once)", () => {
    // The diary is built from `entriesRead.entries` only; the originals are
    // read for provenance, never mapped to cards.
    expect(page).not.toMatch(/correctedOriginals\s*\.\s*(map|forEach|flatMap)/);
    expect(page).not.toMatch(/entriesRead\.correctedOriginals/);
  });
});

describe("what the worker reads (rendered over the real catalogues)", () => {
  it("LT: the kicker names the return, the date and the manager's note", async () => {
    currentLocale = "lt";
    const html = renderToStaticMarkup(await CorrectionProvenanceLine({ entryId: "fix", steps: [RETURNED] }));
    expect(html).toContain('data-testid="journal-entry-corrected-from-fix"');
    expect(html).toContain('data-result="changes_requested"');
    expect(html).toContain("Pataisyta po grąžinimo");
    expect(html).toContain("2026-10-25");
    expect(html).toContain("„nurodyk, kiek kvadratinių metrų nutinkavai.“");
  });

  it("a rejection reads as one; a long note is shortened on the face and kept whole in the timeline", async () => {
    currentLocale = "lt";
    const long = "x".repeat(300);
    const step = { ...RETURNED, result: "rejected" as const, note: long };
    const face = renderToStaticMarkup(await CorrectionProvenanceLine({ entryId: "fix", steps: [step] }));
    expect(face).toContain("Pataisyta po atmetimo");
    expect(face).not.toContain(long);
    expect(face).toContain("…");
    const timeline = renderToStaticMarkup(
      await EvidenceDecisionTimeline({ createdAt: "2026-10-25T12:00:00Z", events: [], correctedFrom: [step] }),
    );
    expect(timeline).toContain('data-step="corrected-from"');
    expect(timeline).toContain(long);
    // Provenance comes BEFORE the correction's own "created" step and is no
    // state of its own: the correction still reads "waiting".
    expect(timeline.indexOf('data-step="corrected-from"')).toBeLessThan(timeline.indexOf('data-step="created"'));
    expect(timeline).toContain('data-step="waiting"');
  });

  it("an automatic approval carries the auto-confirm qualifier on the face and in the timeline", async () => {
    currentLocale = "lt";
    const auto = { ...RETURNED, result: "approved" as const, role: null, note: null, automatic: true };
    const face = renderToStaticMarkup(await CorrectionProvenanceLine({ entryId: "fix", steps: [auto] }));
    expect(face).toContain('data-automatic="true"');
    expect(face).toContain('data-testid="corrected-from-auto-confirm-qualifier"');
    const timeline = renderToStaticMarkup(
      await EvidenceDecisionTimeline({ createdAt: "2026-10-25T12:00:00Z", events: [], correctedFrom: [auto] }),
    );
    expect(timeline).toContain('data-testid="timeline-auto-confirm-qualifier"');
    // A hand decision carries no qualifier.
    const hand = renderToStaticMarkup(await CorrectionProvenanceLine({ entryId: "fix", steps: [RETURNED] }));
    expect(hand).not.toContain("auto-confirm-qualifier");
  });

  it("no provenance → nothing rendered", async () => {
    expect(await CorrectionProvenanceLine({ entryId: "plain", steps: undefined })).toBeNull();
    expect(await CorrectionProvenanceLine({ entryId: "plain", steps: [] })).toBeNull();
  });

  it.each(activeLocales)("%s: every provenance key exists, is non-empty and carries {note}", (locale) => {
    const tl = catalogue(locale).entry.timeline as {
      correctedFrom?: Record<string, string>;
      quotedNote?: string;
    };
    for (const k of ["changes_requested", "rejected", "approved", "earlierVersion"]) {
      expect(tl.correctedFrom?.[k], `${locale} correctedFrom.${k}`).toMatch(/\S/);
      expect(tl.correctedFrom?.[k]).not.toMatch(/demo/i);
    }
    expect(tl.quotedNote).toContain("{note}");
    if (locale !== "en") {
      const en = catalogue("en").entry.timeline as { correctedFrom: Record<string, string> };
      for (const k of ["changes_requested", "rejected", "approved", "earlierVersion"]) {
        expect(tl.correctedFrom?.[k], `${locale} correctedFrom.${k} is untranslated`).not.toBe(en.correctedFrom[k]);
      }
    }
  });
});
