import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * "Actual cost" on a project is VIEWER-SCOPED, and has to say so.
 *
 * W11 audit P1-1. `economics.ts` computes the project's actual from
 * `listMyFinanceRecords()`, which is bounded by the `fr_select` policy:
 *
 *     created_by = auth.uid() OR is_admin() OR owns_company(company_id)
 *
 * `project_id` is NOT in that policy. So the figure is not "what this project
 * cost" — it is "the cost rows I personally can see that happen to point at
 * this project". Two managers of the same project see different actuals and
 * different variance, and the panel presented both as project truth.
 *
 * Failure scenario from the audit: the site manager enters €80k of
 * subcontractor invoices; the company owner opens the panel, sees actual €0
 * and variance +€120k, and reports the project as massively under budget. Both
 * numbers are computed from real rows. Neither is the project's cost.
 *
 * The real fix is a policy change (`or (project_id is not null and
 * can_manage_project(project_id))`) — a migration, and therefore owner-gated.
 * Until that lands, the honest move is to stop calling a per-viewer number the
 * project's number. This guard pins that the copy keeps saying so, in every
 * locale that ships the panel, so the qualifier cannot be quietly dropped while
 * the underlying scope is still per-viewer.
 *
 * WHEN THE MIGRATION LANDS: this guard should be deleted in the same PR that
 * makes the read project-scoped — not before, and not to make an unrelated
 * change pass.
 */

const WEB = join(__dirname, "..", "..");

/** Locales that ship the economics panel. Derived, not hard-coded. */
function panelLocales(): Array<[string, Record<string, string>]> {
  const out: Array<[string, Record<string, string>]> = [];
  for (const loc of ["en", "lt", "ru", "nl", "de"]) {
    const json = JSON.parse(
      readFileSync(join(WEB, "messages", `${loc}.json`), "utf8"),
    ) as Record<string, Record<string, string> | undefined>;
    const block = json.projectEconomics;
    if (block && typeof block === "object") out.push([loc, block]);
  }
  return out;
}

/**
 * "you / your" in each locale — including the second-person VERB forms, since
 * Lithuanian and Russian carry the addressee in the verb ("matote", "видите")
 * as naturally as English carries it in a pronoun.
 *
 * NOTE the Unicode-aware boundaries. JS `\b` is defined over `[A-Za-z0-9_]`,
 * so `/\bвам\b/` and `/\bjūsų/` do NOT mean what they look like — they were
 * silently failing to match correct Russian copy when this guard was written.
 * `(?<!\p{L})…(?!\p{L})` with the `u` flag is the real word boundary here.
 */
const b = (alts: string) => new RegExp(`(?<!\\p{L})(?:${alts})(?!\\p{L})`, "iu");
const VIEWER_WORD: Record<string, RegExp> = {
  en: b("you|your"),
  lt: b("jūs|jums|jūsų|matote|matomos|matomus|matomų"),
  ru: b("вы|вам|ваш\\w*|видите|видимые|видимых"),
  nl: b("u|uw"),
  de: b("sie|ihnen|ihre\\w*"),
};

describe("the project actual/variance copy admits it is viewer-scoped", () => {
  const locales = panelLocales();

  it("found the panel copy in every shipping locale", () => {
    expect(locales.map(([l]) => l).sort()).toEqual(
      ["de", "en", "lt", "nl", "ru"].sort(),
    );
  });

  it("the actual-cost note names the viewer as the scope", () => {
    const weak: string[] = [];
    for (const [loc, b] of locales) {
      const note = b.actualNote ?? "";
      if (!VIEWER_WORD[loc].test(note)) {
        weak.push(`${loc}: projectEconomics.actualNote does not scope the figure to the viewer`);
      }
    }
    expect(weak, weak.join("\n")).toEqual([]);
  });

  it("the actual-cost note does not claim to be the project's total", () => {
    // The exact shape of the old copy: "Actual cost IS the sum of … linked to
    // this project", stated flatly, with no viewer qualifier anywhere.
    const hits: string[] = [];
    for (const [loc, b] of locales) {
      const note = b.actualNote ?? "";
      const qualified = VIEWER_WORD[loc].test(note);
      if (!qualified && /project|projekt|проект/i.test(note)) {
        hits.push(`${loc}: unqualified project-total claim: "${note}"`);
      }
    }
    expect(hits, hits.join("\n")).toEqual([]);
  });

  it("the actual and variance labels are not bare project-truth labels", () => {
    // A note nobody reads cannot carry the whole qualifier: the two figures
    // themselves are labelled, and the label is what a person scanning the
    // panel actually sees.
    const bare: string[] = [];
    for (const [loc, b] of locales) {
      for (const key of ["actual", "variance"] as const) {
        const label = b[key] ?? "";
        if (!VIEWER_WORD[loc].test(label)) {
          bare.push(`${loc}: projectEconomics.${key} = "${label}" reads as project truth`);
        }
      }
    }
    expect(bare, bare.join("\n")).toEqual([]);
  });

  it("the panel still renders both figures and the note", () => {
    const panel = readFileSync(
      join(WEB, "components", "app", "project-economics-panel.tsx"),
      "utf8",
    );
    expect(panel).toContain('data-testid="economics-actual"');
    expect(panel).toContain('data-testid="economics-variance"');
    expect(panel).toContain('t("actualNote")');
  });

  it("the read really is still viewer-scoped (guard is not stale)", () => {
    // If this stops being true, the copy above is now UNDER-claiming and this
    // guard is the thing to delete. Pinned so the two cannot drift apart
    // silently in either direction.
    const econ = readFileSync(join(WEB, "lib", "economics", "economics.ts"), "utf8");
    expect(
      econ,
      "economics.ts no longer reads listMyFinanceRecords — re-check whether the " +
        "actual is still viewer-scoped, and delete this guard if it is not",
    ).toContain("listMyFinanceRecords");
  });
});
