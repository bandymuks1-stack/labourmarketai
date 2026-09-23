import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PeriodMonthlyShare } from "@/components/app/period-monthly-share";
import { evidenceVariant, type EvidenceStanding } from "@/components/app/work-world/primitives";

/**
 * Guard: the work-world primitives carry the accepted "Living Work World"
 * grammar into the real product AND enforce the one semantic rule —
 * EVIDENCE (cyan) ≠ VERIFICATION (green) — so no surface can paint a
 * self-attestation as verified.
 */
const root = resolve(__dirname, "..", "..");
const read = (rel: string) => readFileSync(resolve(root, rel), "utf8");

describe("Guard: work-world primitives", () => {
  it("only INDEPENDENTLY_VERIFIED is the verification variant", () => {
    const cases: Array<[EvidenceStanding, string]> = [
      ["INDEPENDENTLY_VERIFIED", "verified"],
      ["SELF_ATTESTED", "evidence"],
      ["SELF_REPORTED", "evidence"],
      ["ORGANIZATION_ATTESTED", "attested"],
      ["THIRD_PARTY_ATTESTED", "attested"],
      ["ORGANIZATION_REPORTED", "reported"],
      ["DISPUTED", "contested"],
      ["CORRECTED", "contested"],
      ["WITHDRAWN", "unknown"],
      ["UNKNOWN", "unknown"],
    ];
    for (const [state, variant] of cases) {
      expect(evidenceVariant(state), state).toBe(variant);
    }
  });

  it("a self-attestation is NEVER the verified variant", () => {
    expect(evidenceVariant("SELF_ATTESTED")).not.toBe("verified");
    expect(evidenceVariant("SELF_REPORTED")).not.toBe("verified");
  });

  it("the primitives are token-only — no raw hex, cyan=evidence and trust-accent=verification", () => {
    const src = read("components/app/work-world/primitives.tsx");
    expect(src).not.toMatch(/#[0-9a-fA-F]{3,6}\b/); // no raw hex colours
    // evidence maps to brand-cyan, verification to trust-accent, and the two
    // colour roles are never swapped.
    expect(src).toMatch(/evidence:\s*"text-brand-cyan/);
    expect(src).toMatch(/verified:\s*"text-trust-accent/);
  });

  /**
   * DESIGN RULE #4 (owner-ratified 2026-09-22): employer-confirmed =
   * trust-accent GREEN; gold never means confirmation. `attested` — an
   * organisation or a third party standing behind the record — used to wear
   * champagne, a gold, so a manager's confirmation read as a brand accent.
   * It now wears the confirmation green in all three places a variant is
   * painted: the chip, the diamond and the spine node.
   */
  it("an attestation is painted in the trust-accent green, never a gold", () => {
    const src = read("components/app/work-world/primitives.tsx");
    const GOLD = /brand-champagne|brand-blue|metallic|gold/;
    const classOf = (table: string, variant: string) =>
      new RegExp(`const ${table}[^{]*\\{[\\s\\S]*?\\n\\s*${variant}:\\s*"([^"]+)"`).exec(src)?.[1] ?? "";

    for (const table of ["VARIANT_CLASS", "DOT_CLASS"]) {
      for (const variant of ["attested", "verified"]) {
        const cls = classOf(table, variant);
        expect(cls, `${table}.${variant} not found`).not.toBe("");
        expect(cls, `${table}.${variant}`).toMatch(/trust-accent/);
        expect(cls, `${table}.${variant} wears a gold`).not.toMatch(GOLD);
      }
    }
    // The spine node's border for an attestation is the same green.
    const node = src.slice(src.indexOf("export function WorkSpineNode"));
    expect(node).toMatch(/variant === "attested"[\s\S]{0,80}"border-trust-accent"/);
    expect(node).not.toMatch(GOLD);

    // Control: the champagne mapping this replaced is caught by the same check.
    expect('attested: "text-brand-champagne border-brand-champagne/40"').toMatch(GOLD);
    // …and the extractor is real: it finds the evidence row too.
    expect(classOf("VARIANT_CLASS", "evidence")).toMatch(/brand-cyan/);
  });

  it("attested and verified stay DISTINCT variants — same green, different standing", () => {
    // The colour is shared; the meaning is not. A guard or a screen reader
    // label can still tell an organisation's attestation from independent
    // verification through `data-variant`.
    expect(evidenceVariant("ORGANIZATION_ATTESTED")).toBe("attested");
    expect(evidenceVariant("INDEPENDENTLY_VERIFIED")).toBe("verified");
    expect(evidenceVariant("ORGANIZATION_ATTESTED")).not.toBe(
      evidenceVariant("INDEPENDENTLY_VERIFIED"),
    );
  });

  it("the subject evidence surface consumes the canonical primitive", () => {
    const page = read("components/app/organization-evidence-section.tsx");
    expect(page).toContain('from "@/components/app/work-world/primitives"');
    expect(page).toContain("<EvidenceState");
  });
});

describe("Guard: the 800 h period reads as a temporal shape, never a lump", () => {
  it("PeriodMonthlyShare renders the work-world PeriodBand time ribbon", () => {
    const src = read("components/app/period-monthly-share.tsx");
    expect(src).toContain('from "@/components/app/work-world/primitives"');
    expect(src).toContain("<PeriodBand");
    // The exact figures stay beside the ribbon (shape + numbers).
    expect(src).toMatch(/m\.hours\.toFixed\(2\)/);
  });

  it("PeriodBand shows the total AND per-month segments — no single lump", () => {
    const src = read("components/app/work-world/primitives.tsx");
    // one total marker + a per-month segment carrying its derived hours. The
    // ribbon is only ever handed a SOURCE period's projection (owner rule
    // 2026-09-23) — see the rendered proof below.
    expect(src).toContain('data-testid="ww-period-total"');
    expect(src).toContain('data-testid="ww-period-band"');
    expect(src).toMatch(/months\.map\(/);
    expect(src).toMatch(/data-hours=\{m\.hours\.toFixed\(2\)\}/);
    // the ribbon is cyan EVIDENCE, and it never claims verification
    expect(src).toMatch(/text-brand-cyan/);
    expect(src).not.toMatch(/period[\s\S]{0,80}trust-accent/);
  });

  it("the period ribbon is read through the ONE period reading — no manufactured days", () => {
    const share = read("components/app/period-monthly-share.tsx");
    expect(share).toContain("readPeriodEvidence");
    // the split exists ONLY behind the source-period branch
    expect(share).toMatch(/if \(r\.kind === "source_period"\) \{/);
    expect(share).not.toContain("projectPeriodAggregateByMonth");
    // it must not fabricate day-level rows to fill the ribbon
    expect(share).not.toMatch(/new Date\([^)]*\)\.getDate|per[- ]?day|dailyRows/i);
  });
});

/**
 * Rendered proof (owner rule 2026-09-23 — never manufacture precision): an
 * INTERPRETED period renders no monthly figure anywhere in its markup; a
 * SOURCE period with no stated rate still renders its derived share (the
 * negative control that keeps the first assertion from passing vacuously).
 */
describe("Guard: an interpreted period renders no monthly figure", () => {
  const labels = {
    monthlyShare: "MONTHLY_SHARE",
    noMonthlyFigure: "NO_MONTHLY_FIGURE",
    provenance: { human_choice: "SET_BY_A_PERSON", derived: "DERIVED_SPAN" },
    sourceStates: (w: string) => `STATES[${w}]`,
    sourceDiffers: "DIFFERS",
  };
  const humanChoice = {
    timeSemantics: {
      value: "period_aggregate", method: "human_choice", confidence: 1, sourceHours: 800, note: "month",
      remote: true, periodStart: "2025-06-01", periodEnd: "2025-11-30",
    },
  };
  const html = (props: Record<string, unknown>) =>
    renderToStaticMarkup(
      createElement(PeriodMonthlyShare, {
        hours: 800,
        periodStart: "2025-06-01",
        periodEnd: "2025-11-30",
        labels,
        ...props,
      } as Parameters<typeof PeriodMonthlyShare>[0]),
    );

  it("a span a person chose: month span, NO figure for any month, no ribbon, the source's own words and the disagreement shown", () => {
    const out = html({
      derived: humanChoice,
      factFields: ["personLabel", "workDate", "hours", "workText"],
      sourceText: "Human research and director for at least 16 month calculating each month only 50 hours",
    });
    expect(out).toContain('data-kind="interpreted_period"');
    expect(out).toContain('data-figures="none"');
    expect(out).not.toMatch(/data-hours=/);
    expect(out).not.toContain('data-testid="ww-period-band"');
    expect(out).not.toMatch(/133\.3[34]/);
    expect(out).not.toContain("MONTHLY_SHARE");
    expect(out).toContain("800 h");
    expect(out).not.toContain("800.00");
    expect(out).toContain("2025-06 → 2025-11");
    expect(out).toContain("NO_MONTHLY_FIGURE");
    expect(out).toContain("SET_BY_A_PERSON");
    expect(out).toContain("STATES[at least 16 month]");
    expect(out).toContain("STATES[each month only 50 hours]");
    expect(out).toContain("DIFFERS");
  });

  it("NEGATIVE CONTROL — a SOURCE period with no stated rate keeps its derived monthly share on the ribbon", () => {
    const out = html({ derived: {}, factFields: ["periodStart", "periodEnd", "hours"], sourceText: "Tiling on site" });
    expect(out).toContain('data-kind="source_period"');
    expect(out).toContain('data-testid="ww-period-band"');
    expect(out).toMatch(/data-hours="133\.34"/);
    expect(out).toContain("MONTHLY_SHARE");
    expect(out).toContain("800 h");
    expect(out).not.toContain("DIFFERS");
  });

  it("the ribbon primitive is reached ONLY from the source-period branch", () => {
    const share = read("components/app/period-monthly-share.tsx");
    const ribbons = share.match(/<PeriodBand\b/g) ?? [];
    expect(ribbons.length).toBe(1);
    expect(share.indexOf("<PeriodBand")).toBeGreaterThan(share.indexOf('if (r.kind === "source_period") {'));
    expect(share.indexOf("<PeriodBand")).toBeLessThan(share.indexOf("// A span with NO monthly figure"));
  });
});

describe("Guard: the Journal reads with the work-world grammar (JOURNAL_REACHABLE + EVIDENCE_NOT_VERIFICATION)", () => {
  const page = read("app/[locale]/dashboard/journal/page.tsx");
  const row = read("components/app/journal-entry-row.tsx");

  it("a day's entries are one WorkSpine, each entry a WorkSpineNode coloured by its standing", () => {
    expect(page).toContain('from "@/components/app/work-world/primitives"');
    expect(page).toContain("<WorkSpine>");
    expect(page).toMatch(/standing=\{evidenceStandingOfVerification\(/);
    expect(row).toContain("<WorkSpineNode state={standing}");
    // a soft-deleted entry is drawn as WITHDRAWN, never silently removed from the spine
    expect(row).toContain('<WorkSpineNode state="WITHDRAWN">');
  });

  it("every entry carries the canonical EvidenceState chip on its verification line", () => {
    expect(page).toMatch(/<EvidenceState[\s\S]{0,200}evidenceStandingOfVerification\(/);
    expect(page).toMatch(/tVerify\(\s*`standing\.\$\{verification\.state\}`/);
    // the line is no longer conditional on a next action: a confirmed record shows its standing too
    expect(page).not.toMatch(/verification\.nextAction !== "none" && \(\s*<p/);
  });

  it("the journal chip labels exist in every active locale that carries the verification namespace", () => {
    for (const loc of ["en", "lt", "ru", "de", "nl"]) {
      const j = JSON.parse(read(`messages/${loc}/journal.json`)) as {
        verification: { state: Record<string, string>; standing: Record<string, string> };
      };
      for (const k of Object.keys(j.verification.state)) {
        expect(j.verification.standing[k], `${loc} standing.${k}`).toBeTruthy();
        // a chip label is short — it is the LABEL; the sentence is the explanation
        expect(j.verification.standing[k].length, `${loc} standing.${k}`).toBeLessThanOrEqual(32);
      }
    }
  });

  it("the entry location is a PlaceTimeStamp (place is machine-precise mono, same words)", () => {
    expect(page).toMatch(/journal-entry-location-\$\{e\.id\}`\}\s*>\s*<PlaceTimeStamp>/);
  });
});
